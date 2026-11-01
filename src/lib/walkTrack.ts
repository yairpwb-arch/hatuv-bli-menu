/**
 * The maths of a tracked walk: which GPS points to keep, distance, pace,
 * per-km splits, calories, and the encoded route that's saved.
 */

export interface TrackPoint {
  lat: number;
  lng: number;
  /** ms since epoch */
  t: number;
  /** metres */
  accuracy: number;
  heading?: number | null;
}

/** Points worse than this are dropped. */
export const MAX_ACCURACY_M = 20;
/** Faster than this between two points isn't walking — a GPS jump. */
const MAX_WALK_SPEED_MS = 15 / 3.6;
/** Auto-pause after this long without moving. */
export const AUTO_PAUSE_MS = 30_000;

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Keeps a new fix only if it's accurate enough and not an impossible jump from the last kept one. */
export function accept(prev: TrackPoint | undefined, next: TrackPoint): boolean {
  if (next.accuracy > MAX_ACCURACY_M) return false;
  if (!prev) return true;
  const dt = (next.t - prev.t) / 1000;
  if (dt <= 0) return false;
  return haversine(prev, next) / dt <= MAX_WALK_SPEED_MS;
}

/** A light moving average over the last three kept points, so GPS jitter doesn't add distance. */
export function smoothed(points: TrackPoint[]): { lat: number; lng: number } {
  const last = points.slice(-3);
  return {
    lat: last.reduce((s, p) => s + p.lat, 0) / last.length,
    lng: last.reduce((s, p) => s + p.lng, 0) / last.length,
  };
}

/** "11:42" for seconds per km; "—" when there's nothing to show. */
export function paceLabel(secPerKm: number | null): string {
  if (!secPerKm || !Number.isFinite(secPerKm) || secPerKm > 60 * 60) return '—';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** "1:05:09" / "12:30" */
export function clockLabel(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Walking ~3.5 MET: kcal ≈ MET × kg × hours. Shown with "~". */
export const estimateCalories = (weightKg: number | null, movingSec: number) =>
  Math.round(3.5 * (weightKg || 70) * (movingSec / 3600));

export interface Split {
  km: number;
  /** seconds this km took */
  sec: number;
}

/** Google's encoded polyline (precision 5) — compact for storing the route. */
export function encodePath(points: { lat: number; lng: number }[]): string {
  let out = '';
  let pLat = 0;
  let pLng = 0;
  const enc = (v: number) => {
    let x = v < 0 ? ~(v << 1) : v << 1;
    while (x >= 0x20) {
      out += String.fromCharCode((0x20 | (x & 0x1f)) + 63);
      x >>= 5;
    }
    out += String.fromCharCode(x + 63);
  };
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    enc(lat - pLat);
    enc(lng - pLng);
    pLat = lat;
    pLng = lng;
  }
  return out;
}

export function decodePath(str: string): { lat: number; lng: number }[] {
  const out: { lat: number; lng: number }[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let shift = 0;
    let result = 0;
    let b: number;
    do {
      b = str.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < str.length) {
    lat += next();
    lng += next();
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}

export function boundsOf(points: { lat: number; lng: number }[]) {
  return {
    minLat: Math.min(...points.map((p) => p.lat)),
    minLng: Math.min(...points.map((p) => p.lng)),
    maxLat: Math.max(...points.map((p) => p.lat)),
    maxLng: Math.max(...points.map((p) => p.lng)),
  };
}

/** The route without its first and last `metres` (so a shared image doesn't show where you live). */
export function trimEnds<T extends { lat: number; lng: number }>(points: T[], metres = 200): T[] {
  const cut = (list: T[]) => {
    let d = 0;
    for (let i = 1; i < list.length; i++) {
      d += haversine(list[i - 1], list[i]);
      if (d >= metres) return list.slice(i);
    }
    return [];
  };
  const head = cut(points);
  return cut([...head].reverse()).reverse();
}
