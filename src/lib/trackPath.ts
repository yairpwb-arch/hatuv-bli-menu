import trackPathData from './trackPath.json';

// Extracted once (see scratchpad script) from the dashed gray centerline in
// track-tile.webp: pixels matching the dash's low-saturation, mid-brightness
// color were chained in order (nearest-neighbor, since a horizontal stretch
// of track has several pixels at the same y), smoothed, and resampled to 80
// arc-length-even points, normalized to the source image's own width/height.
export const TRACK_IMAGE_ASPECT = trackPathData.height / trackPathData.width;

const POINTS = trackPathData.points as [number, number][]; // [xFraction, yFraction], yFraction 0→1, monotonic

/**
 * x-fraction (0–1, of tile width) of the track's centerline at a given
 * y-fraction (0–1, of tile height) within ONE tile. The source art is
 * designed so this same curve repeats identically tile after tile — only y
 * accumulates across tiles, the x pattern doesn't shift.
 */
export function xFractionAtY(yFrac: number): number {
  const clamped = Math.max(0, Math.min(1, yFrac));
  let lo = 0;
  let hi = POINTS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (POINTS[mid][1] < clamped) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(1, lo);
  const a = POINTS[i - 1];
  const b = POINTS[i];
  const span = b[1] - a[1] || 1;
  const t = (clamped - a[1]) / span;
  return a[0] + (b[0] - a[0]) * t;
}
