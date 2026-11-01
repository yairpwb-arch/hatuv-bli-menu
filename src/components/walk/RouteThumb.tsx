/**
 * A small static drawing of a route (no map tiles) — for the history list and
 * as the map's stand-in when there's no map key.
 */
export function RouteThumb({ route, className }: { route: { lat: number; lng: number }[]; className?: string }) {
  if (route.length < 2) return <div className={className} aria-hidden />;
  const lats = route.map((p) => p.lat);
  const lngs = route.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  // Longitude degrees shrink with latitude; keep the shape true.
  const k = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  const w = Math.max((maxLng - minLng) * k, 1e-6);
  const h = Math.max(maxLat - minLat, 1e-6);
  const size = Math.max(w, h);
  const pad = size * 0.12;
  const view = `${-pad} ${-pad} ${size + 2 * pad} ${size + 2 * pad}`;
  const x = (lng: number) => (lng - minLng) * k + (size - w) / 2;
  const y = (lat: number) => maxLat - lat + (size - h) / 2;
  const d = route.map((p, i) => `${i ? 'L' : 'M'}${x(p.lng)} ${y(p.lat)}`).join(' ');
  const end = route[route.length - 1];
  return (
    <svg viewBox={view} className={className} preserveAspectRatio="xMidYMid meet" role="img" aria-label="מפת המסלול">
      <path d={d} fill="none" stroke="#FF8A2A" strokeWidth={size * 0.035} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(route[0].lng)} cy={y(route[0].lat)} r={size * 0.035} fill="#22C55E" />
      <circle cx={x(end.lng)} cy={y(end.lat)} r={size * 0.035} fill="#FF8A2A" />
    </svg>
  );
}
