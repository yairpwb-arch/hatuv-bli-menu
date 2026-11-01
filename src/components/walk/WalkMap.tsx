import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { RouteThumb } from './RouteThumb';

// MapLibre finds its worker next to its own file, and only on http(s) pages:
// in the app (capacitor://, and in the bundled build) it found none, so the
// map stayed blank (style background only). The worker is copied to public/
// as a plain .js file at dev / build time (scripts/copy-maplibre-worker.mjs) —
// .js, since the native web views don't reliably serve .mjs as JavaScript.
maplibregl.setWorkerUrl(`${import.meta.env.BASE_URL}maplibre-gl-worker.js`);

const KEY = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
const STYLE = KEY ? `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${KEY}` : null;
const ORANGE = '#FF8A2A';

type LngLat = { lat: number; lng: number };

/**
 * The walk map: dark tiles, the route as a thick orange line. Live: a blue
 * dot with a heading arrow that the map follows (until the trainee pans it).
 * Summary: the whole route fitted, green at the start, orange at the end.
 * Without a map key it falls back to the route drawing alone.
 */
export function WalkMap({
  route, current, heading, follow, onUserPan, summary, className,
}: {
  route: LngLat[];
  current?: LngLat | null;
  heading?: number | null;
  follow?: boolean;
  onUserPan?: () => void;
  summary?: boolean;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const me = useRef<maplibregl.Marker | null>(null);
  const arrow = useRef<HTMLDivElement | null>(null);
  const loaded = useRef(false);
  const onLoad = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!STYLE || !box.current) return;
    const created = createMap(box.current);
    return () => {
      created.remove();
      map.current = null;
      loaded.current = false;
    };
    // The map is created once; data changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function createMap(container: HTMLDivElement) {
    const m = new maplibregl.Map({
      container,
      style: STYLE,
      center: current ? [current.lng, current.lat] : route[0] ? [route[0].lng, route[0].lat] : [34.78, 32.08],
      zoom: 16,
      attributionControl: { compact: true },
      interactive: true,
    });
    map.current = m;
    m.on('load', () => {
      loaded.current = true;
      m.addSource('route', { type: 'geojson', data: line([]) });
      m.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ORANGE, 'line-width': 6 } });
      onLoad.current?.();
      onLoad.current = null;
    });
    m.on('dragstart', () => onUserPan?.());
    return m;
  }

  // Route line (and, on the summary, start / end markers and fit).
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      (m.getSource('route') as maplibregl.GeoJSONSource | undefined)?.setData(line(route));
      if (summary && route.length > 1) {
        const lngs = route.map((p) => p.lng);
        const lats = route.map((p) => p.lat);
        m.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 40, duration: 0 });
        new maplibregl.Marker({ element: dot('#22C55E') }).setLngLat([route[0].lng, route[0].lat]).addTo(m);
        new maplibregl.Marker({ element: dot(ORANGE) }).setLngLat([route[route.length - 1].lng, route[route.length - 1].lat]).addTo(m);
      }
    };
    if (loaded.current) apply();
    else onLoad.current = apply; // runs once the style has loaded
  }, [route, summary]);

  // Live position: blue dot + heading, followed while `follow` is on.
  useEffect(() => {
    const m = map.current;
    if (!m || !current || summary) return;
    if (!me.current) {
      const el = document.createElement('div');
      el.style.cssText = 'width:22px;height:22px;position:relative';
      el.innerHTML =
        '<div style="position:absolute;inset:3px;border-radius:50%;background:#3B82F6;border:3px solid #fff"></div>';
      const a = document.createElement('div');
      a.style.cssText = 'position:absolute;left:50%;top:-9px;width:0;height:0;margin-left:-6px;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:9px solid #3B82F6;transform-origin:6px 20px';
      el.appendChild(a);
      arrow.current = a;
      me.current = new maplibregl.Marker({ element: el }).setLngLat([current.lng, current.lat]).addTo(m);
    } else {
      me.current.setLngLat([current.lng, current.lat]);
    }
    if (arrow.current) {
      arrow.current.style.display = heading != null ? 'block' : 'none';
      arrow.current.style.transform = `rotate(${heading ?? 0}deg)`;
    }
    if (follow) m.easeTo({ center: [current.lng, current.lat], duration: 600 });
  }, [current, heading, follow, summary]);

  if (!STYLE) {
    return (
      <div className={className ?? 'h-full w-full'}>
        <RouteThumb route={route} className="h-full w-full bg-[#141418]" />
      </div>
    );
  }
  return <div ref={box} className={className ?? 'h-full w-full'} />;
}

const line = (route: LngLat[]) => ({
  type: 'Feature' as const,
  properties: {},
  geometry: { type: 'LineString' as const, coordinates: route.map((p) => [p.lng, p.lat]) },
});

function dot(color: string) {
  const el = document.createElement('div');
  el.style.cssText = `width:16px;height:16px;border-radius:50%;background:${color};border:3px solid #fff`;
  return el;
}
