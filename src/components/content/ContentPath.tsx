import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Lock, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import PathNode from './PathNode';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { xFractionAtY, TRACK_IMAGE_ASPECT } from '@/lib/trackPath';
import {
  TRACK_TILE_SRC_1X,
  TRACK_TILE_SRC_2X,
  TILE_SAMPLE_STEPS,
  MARKER_DIAMETER_PX,
  MARKER_COLOR,
  MARKER_DOT_COLOR,
  TRACK_COLORS,
  MILESTONE_DAY,
  MILESTONE_ID,
  type ContentKind,
} from '@/lib/contentPathStyle';

export interface ContentItem {
  id: string;
  part_number: number;
  week_range: string;
  unlock_day: number;
  title: string;
  description: string | null;
  video_url: string | null;
  resource_link: string | null;
  is_bonus: boolean;
  content_type?: ContentKind | null;
  dateUnlocked: boolean;
  isUnlocked: boolean;
  isCompleted: boolean;
  daysUntilUnlock: number;
}

type StationEntry = { kind: 'node'; item: ContentItem } | { kind: 'milestone' };

interface PositionedStation {
  id: string;
  entry: StationEntry;
  top: number;
  left: number;
  labelShiftX: number;
  arcLen: number;
}

interface PartTitleLayout {
  partNumber: number;
  top: number;
  left: number;
  mode: 'inline' | 'overlay';
  locked: boolean;
  daysUntilUnlock: number;
  subtitle: string | null;
}

interface Sample {
  x: number;
  y: number;
  len: number;
}

interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface ContentPathProps {
  allContent: ContentItem[];
  currentDay: number;
  milestoneUnlocked: boolean;
  partNames: Record<number, string>;
  /** the station (content id, or MILESTONE_ID) the marker should be at / move to */
  boatStationId: string;
  /** fires once the marker finishes moving to boatStationId */
  onBoatArrived?: () => void;
  onSelect: (item: ContentItem) => void;
}

const MARKER_SPEED_PX_PER_SEC = 250;
const PING_MS = 200;
const WAKE_LIFETIME_MS = 600;

// ── Layout constants ─────────────────────────────────────────────────────────
const STATION_RADIUS = 28; // 56px circle
const MILESTONE_RADIUS = 40; // 80px circle
const STATION_WIDTH = 180;
const LABEL_MAX_WIDTH = 170;
const LABEL_EDGE_MARGIN = 12; // station box clamp — shifts only the label
const CIRCLE_DANGER_X = 40; // circle unusable this close to the track if under this
const CIRCLE_SAFE_X = 60; // relocate along the arc until x is at least this far in
const MIN_STATION_ARC_SPACING = 220;
const TITLE_RESERVED_GAP = 220;
const TITLE_TRACK_MARGIN = 24;
const TITLE_SCREEN_MARGIN = 16;
const TITLE_MIN_WIDTH = 170;
const TITLE_WIDTH_MAX = 220;
const TITLE_HEIGHT_EST = 160; // used to sample the track across the title's whole vertical span, not just its center
const TOP_PADDING = 10;
const BOTTOM_PADDING = 140;
const CORRECTION_STEP = 20;
const CORRECTION_MAX = 200;
const MAX_CORRECTION_PASSES = 14;

function rectsOverlap(a: Rect, b: Rect, pad: number): boolean {
  return !(a.right + pad < b.left || a.left - pad > b.right || a.bottom + pad < b.top || a.top - pad > b.bottom);
}

function easeEdges(t: number): number {
  const edge = 0.18;
  if (t < edge) {
    const u = t / edge;
    return u * u * edge;
  }
  if (t > 1 - edge) {
    const u = (1 - t) / edge;
    return 1 - u * u * edge;
  }
  return t;
}

// ── Part title: fades/rises in once it scrolls into view ───────────────────
function PartTitle({
  top,
  left,
  mode,
  bigTitle,
  locked,
  daysUntilUnlock,
  subtitle,
  widthForMode,
  rootRef,
}: PartTitleLayout & { bigTitle: string; widthForMode: number; rootRef: (el: HTMLDivElement | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setRevealed(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={rootRef}
      className="absolute"
      style={{
        top,
        left,
        transform: 'translate(-50%, -50%)',
        width: mode === 'overlay' ? widthForMode : TITLE_WIDTH_MAX,
        zIndex: mode === 'overlay' ? 5 : undefined,
      }}
    >
      <div
        ref={ref}
        className={cn('flex flex-col items-center text-center', revealed && 'animate-part-reveal')}
        style={{
          ...(!revealed ? { opacity: 0, transform: 'translateY(20px)' } : undefined),
          ...(mode === 'overlay'
            ? { backgroundColor: '#0B0B0F', borderRadius: 16, padding: '16px 20px' }
            : undefined),
        }}
      >
        <span
          className="font-extrabold leading-tight flex items-center gap-2 transition-transform duration-500"
          style={{
            fontSize: 44,
            color: locked ? 'rgba(255,255,255,0.35)' : TRACK_COLORS.accent,
            transform: revealed ? 'scale(1)' : 'scale(0.8)',
          }}
        >
          {locked && <Lock className="h-7 w-7 flex-shrink-0" />}
          {bigTitle}
        </span>
        <span className="mt-2.5 h-[3px] w-10 rounded-full" style={{ backgroundColor: TRACK_COLORS.accent }} />
        {(locked || subtitle) && (
          <span className="mt-2.5 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {locked ? (daysUntilUnlock > 0 ? `נפתח בעוד ${daysUntilUnlock} ימים` : 'נפתח בקרוב') : subtitle}
          </span>
        )}
      </div>
    </div>
  );
}

export default function ContentPath({
  allContent,
  currentDay,
  milestoneUnlocked,
  partNames,
  boatStationId,
  onBoatArrived,
  onSelect,
}: ContentPathProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());
  const circleRefs = useRef(new Map<string, HTMLDivElement>());
  const labelRefs = useRef(new Map<string, HTMLDivElement>());
  const titleRefs = useRef(new Map<number, HTMLDivElement>());
  const debugPath = useMemo(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debugPath') === '1',
    []
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Rounded to a whole pixel so adjacent absolutely-positioned tiles always
  // land on the same pixel grid (fractional heights can show a hairline seam).
  const tileHeight = Math.round(width * TRACK_IMAGE_ASPECT);
  // Tiles are rendered with a tiny cumulative overlap to hide that seam (see
  // the <img> loop below), and the whole map is nudged down by TOP_PADDING so
  // the first part title never renders under the sticky header buttons —
  // every other vertical position derived from tile index must use this same
  // formula, or it drifts away from the art by a few px per tile.
  const tileBaseY = (ti: number) => ti * tileHeight - ti * 2 + TOP_PADDING;

  // ── One tile's centerline, finely sampled once (every tile is identical) ──
  const { tileSamples, tileArcLength } = useMemo(() => {
    const s: Sample[] = [];
    let len = 0;
    for (let step = 0; step <= TILE_SAMPLE_STEPS; step++) {
      const yFrac = step / TILE_SAMPLE_STEPS;
      const y = yFrac * tileHeight;
      const x = xFractionAtY(yFrac) * width;
      if (s.length > 0) {
        const prev = s[s.length - 1];
        len += Math.hypot(x - prev.x, y - prev.y);
      }
      s.push({ x, y, len });
    }
    return { tileSamples: s, tileArcLength: len };
  }, [width, tileHeight]);

  const pointAtTileArcLength = (d: number): { x: number; y: number } => {
    const clamped = Math.max(0, Math.min(tileArcLength, d));
    let lo = 0;
    let hi = tileSamples.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tileSamples[mid].len < clamped) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const a = tileSamples[i - 1];
    const b = tileSamples[i];
    const span = b.len - a.len || 1;
    const t = (clamped - a.len) / span;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };

  // Closest arc length (within this tile) at which the track's x stays at
  // least CIRCLE_SAFE_X away from both edges — a station can never be
  // anchored where even the circle itself wouldn't fit on-screen.
  const nearestSafeLocalArc = (target: number): number => {
    const safe = tileSamples.filter((s) => s.x >= CIRCLE_SAFE_X && s.x <= width - CIRCLE_SAFE_X);
    if (safe.length === 0) return target;
    let best = safe[0];
    for (const s of safe) {
      if (Math.abs(s.len - target) < Math.abs(best.len - target)) best = s;
    }
    return best.len;
  };

  // ── Correction nudges from the real-DOM measurement pass (section ג) ─────
  const [arcNudge, setArcNudge] = useState<Record<string, number>>({});
  const correctionPassRef = useRef(0);
  // True once the real-DOM overlap check has found zero problems at least
  // once — the marker only ever positions itself after this, so it's never
  // computed from a layout that's still mid-correction and about to shift.
  const [layoutSettled, setLayoutSettled] = useState(false);

  // ── Layout ───────────────────────────────────────────────────────────────
  // Every station is one vertical unit: circle exactly on the track point,
  // label directly beneath it. Stations are spaced by a fixed arc-length step
  // (min 190px), with an extra 220px gap reserved at every part boundary so
  // that part's title always has real empty room, never fighting a station
  // for the same space.
  const { stations, partTitles, totalHeight, tileCount, trackEndY } = useMemo(() => {
    const entries: StationEntry[] = allContent.map((item) => ({ kind: 'node', item }));
    entries.push({ kind: 'milestone' });
    const idOf = (entry: StationEntry) => (entry.kind === 'milestone' ? MILESTONE_ID : entry.item.id);

    let lastPart: number | null = null;
    let cumulativeArc = 0;
    const zoneStartForPart: Record<number, number> = {};
    const baseArcs: number[] = entries.map((entry) => {
      if (entry.kind === 'node' && entry.item.part_number !== lastPart) {
        zoneStartForPart[entry.item.part_number] = cumulativeArc;
        cumulativeArc += TITLE_RESERVED_GAP;
        lastPart = entry.item.part_number;
      }
      const arc = cumulativeArc;
      cumulativeArc += MIN_STATION_ARC_SPACING;
      return arc;
    });
    const stationResults: PositionedStation[] = entries.map((entry, slotIndex) => {
      const id = idOf(entry);
      const globalBase = baseArcs[slotIndex] + (arcNudge[id] ?? 0);
      const ti = Math.floor(globalBase / tileArcLength);
      const baseLocalArc = globalBase - ti * tileArcLength;
      const p0 = pointAtTileArcLength(baseLocalArc);

      // If the track itself is too close to an edge for the circle to fit,
      // relocate to the nearest point (within this tile) where it does.
      const localArc = p0.x < CIRCLE_DANGER_X || p0.x > width - CIRCLE_DANGER_X ? nearestSafeLocalArc(baseLocalArc) : baseLocalArc;
      const p = localArc === baseLocalArc ? p0 : pointAtTileArcLength(localArc);

      const top = tileBaseY(ti) + p.y;
      const stationLeft = p.x - STATION_WIDTH / 2;

      // The box (180px wide) can still run past the screen even though the
      // circle itself is safely inside it — shift ONLY the label, not the
      // circle/anchor, to pull it back on-screen.
      let labelShiftX = 0;
      if (stationLeft < LABEL_EDGE_MARGIN) labelShiftX = LABEL_EDGE_MARGIN - stationLeft;
      else if (stationLeft + STATION_WIDTH > width - LABEL_EDGE_MARGIN) labelShiftX = width - LABEL_EDGE_MARGIN - (stationLeft + STATION_WIDTH);

      const arcLen = ti * tileArcLength + localArc;
      return { id, entry, top, left: p.x, labelShiftX, arcLen };
    });

    // ── Part titles: centered in their reserved zone, on whichever side has
    // more free black space; if neither side has room, a full-width opaque
    // overlay centered on the screen, straddling the track.
    const partOrder: number[] = [];
    for (const item of allContent) {
      if (!partOrder.includes(item.part_number)) partOrder.push(item.part_number);
    }
    const partTitleResults: PartTitleLayout[] = partOrder.map((partNumber) => {
      const zoneStart = zoneStartForPart[partNumber] ?? 0;
      const zoneMidGlobal = zoneStart + TITLE_RESERVED_GAP / 2;
      const ti = Math.max(0, Math.floor(zoneMidGlobal / tileArcLength));
      const local = Math.max(0, Math.min(tileArcLength, zoneMidGlobal - ti * tileArcLength));
      const p = pointAtTileArcLength(local);
      const topY = tileBaseY(ti) + p.y;

      // The track curves, so its x at the title's vertical CENTER isn't
      // necessarily representative of its x across the title's whole height
      // — sample several heights across that span and take the worst case,
      // so the title can never end up with the track swinging into it lower
      // or higher than the one point originally checked.
      let regionLeftWidth = Infinity;
      let regionRightWidth = Infinity;
      let worstRightTrackX = p.x;
      for (let dy = -TITLE_HEIGHT_EST / 2; dy <= TITLE_HEIGHT_EST / 2; dy += 20) {
        const sampleArc = Math.max(0, Math.min(tileArcLength, local + dy));
        const sp = pointAtTileArcLength(sampleArc);
        regionLeftWidth = Math.min(regionLeftWidth, sp.x - TITLE_TRACK_MARGIN - TITLE_SCREEN_MARGIN);
        const rightW = width - TITLE_SCREEN_MARGIN - (sp.x + TITLE_TRACK_MARGIN);
        if (rightW < regionRightWidth) {
          regionRightWidth = rightW;
          worstRightTrackX = sp.x;
        }
      }
      const locked = !allContent.some((it) => it.part_number === partNumber && it.dateUnlocked);
      const firstItem = allContent.find((it) => it.part_number === partNumber)!;

      const friendlyName = partNames[partNumber] ?? `חלק ${partNumber}`;
      const bigTitle = `חלק ${partNumber}`;
      const subtitle = friendlyName !== bigTitle ? friendlyName : null;

      if (Math.max(regionLeftWidth, regionRightWidth) < TITLE_MIN_WIDTH) {
        return {
          partNumber,
          top: topY,
          left: width / 2,
          mode: 'overlay',
          locked,
          daysUntilUnlock: firstItem.daysUntilUnlock,
          subtitle,
        };
      }
      const onLeft = regionLeftWidth >= regionRightWidth;
      const center = onLeft
        ? TITLE_SCREEN_MARGIN + regionLeftWidth / 2
        : worstRightTrackX + TITLE_TRACK_MARGIN + regionRightWidth / 2;

      return { partNumber, top: topY, left: center, mode: 'inline', locked, daysUntilUnlock: firstItem.daysUntilUnlock, subtitle };
    });

    // The page stops shortly after the milestone (no extra whole tile of
    // unused winding road below it) — but the track art itself keeps
    // rendering all the way down to that exact bottom edge, so there's never
    // a flat black gap behind the sticky weekly-survey button.
    const lastStation = stationResults[stationResults.length - 1];
    const minHeight = lastStation.top + MILESTONE_RADIUS + 40 + BOTTOM_PADDING;
    const tileCountForEnd = Math.max(1, Math.floor(minHeight / tileHeight) + 1);

    return {
      stations: stationResults,
      partTitles: partTitleResults,
      totalHeight: minHeight,
      tileCount: tileCountForEnd,
      trackEndY: minHeight,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allContent, width, tileHeight, tileArcLength, arcNudge, partNames]);

  // ── Real-DOM collision check + auto-correction (section ג + ו) ───────────
  const runOverlapCheck = (logErrors: boolean): number => {
    const rectOfEl = (el: HTMLElement): Rect => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    };
    type Item = { id: string; order: number; kind: 'circle' | 'label'; rect: Rect };
    const items: Item[] = [];
    stations.forEach((s, idx) => {
      const c = circleRefs.current.get(s.id);
      const l = labelRefs.current.get(s.id);
      if (c) items.push({ id: s.id, order: idx, kind: 'circle', rect: rectOfEl(c) });
      if (l) items.push({ id: s.id, order: idx, kind: 'label', rect: rectOfEl(l) });
    });
    const titleItems: { partNumber: number; rect: Rect }[] = [];
    titleRefs.current.forEach((el, partNumber) => titleItems.push({ partNumber, rect: rectOfEl(el) }));

    const toNudge = new Set<string>();
    let problemCount = 0;

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (items[i].id === items[j].id) continue;
        if (rectsOverlap(items[i].rect, items[j].rect, 16)) {
          problemCount++;
          const later = items[i].order > items[j].order ? items[i] : items[j];
          toNudge.add(later.id);
          if (logErrors) {
            console.error(`[ContentPath] overlap: ${items[i].id}(${items[i].kind}) <-> ${items[j].id}(${items[j].kind})`);
          }
        }
      }
    }
    for (const it of items) {
      for (const t of titleItems) {
        if (rectsOverlap(it.rect, t.rect, 28)) {
          problemCount++;
          toNudge.add(it.id);
          if (logErrors) {
            console.error(`[ContentPath] overlap: ${it.id}(${it.kind}) <-> title-part${t.partNumber}`);
          }
        }
      }
    }

    if (toNudge.size > 0 && correctionPassRef.current < MAX_CORRECTION_PASSES) {
      correctionPassRef.current++;
      setArcNudge((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const id of toNudge) {
          const cur = next[id] ?? 0;
          if (cur < CORRECTION_MAX) {
            next[id] = cur + CORRECTION_STEP;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
    return problemCount;
  };

  useLayoutEffect(() => {
    const n = runOverlapCheck(import.meta.env.DEV);
    if (n === 0) setLayoutSettled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stations, partTitles]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { assertNoOverlaps?: () => number }).assertNoOverlaps = () => {
      const n = runOverlapCheck(true);
      console.log(n === 0 ? '[ContentPath] assertNoOverlaps: 0 overlaps ✓' : `[ContentPath] assertNoOverlaps: ${n} overlap(s)`);
      return n;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stations, partTitles]);

  const stationDistance = useMemo(() => {
    const dist = new Map<string, number>();
    for (const s of stations) dist.set(s.id, s.arcLen);
    return dist;
  }, [stations]);

  // The exact (x, y) each station is actually rendered at — used to SNAP the
  // marker there directly, instead of re-deriving the point from arc length
  // through a separate sampling pass that could drift a station-width or two
  // off the real circle whenever a station was edge-relocated or DOM-nudged.
  const stationPoint = useMemo(() => {
    const pt = new Map<string, { x: number; y: number }>();
    for (const s of stations) pt.set(s.id, { x: s.left, y: s.top });
    return pt;
  }, [stations]);

  // ── Global centerline samples (tile-by-tile, offset) for marker movement
  // and the SVG overlay paths (completed-segment glow + debug line). ───────
  const { globalSamples, globalTotalLen, globalPathD } = useMemo(() => {
    const g: Sample[] = [];
    let base = 0;
    for (let ti = 0; ti < tileCount; ti++) {
      for (let s = 0; s < tileSamples.length; s++) {
        if (ti > 0 && s === 0) continue; // same point as previous tile's last sample
        const sample = tileSamples[s];
        g.push({ x: sample.x, y: tileBaseY(ti) + sample.y, len: base + sample.len });
      }
      base += tileArcLength;
    }
    const totalLen = g.length ? g[g.length - 1].len : 0;

    let d = '';
    if (g.length) {
      d = `M ${g[0].x} ${g[0].y}`;
      const stride = 2;
      for (let i = stride; i < g.length; i += stride) d += ` L ${g[i].x} ${g[i].y}`;
      const last = g[g.length - 1];
      d += ` L ${last.x} ${last.y}`;
    }
    return { globalSamples: g, globalTotalLen: totalLen, globalPathD: d };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileSamples, tileArcLength, tileCount, tileHeight]);

  const pointAtDistance = (d: number): { x: number; y: number } => {
    const samples = globalSamples;
    if (samples.length === 0) return { x: width / 2, y: 0 };
    const clamped = Math.max(0, Math.min(globalTotalLen, d));
    let lo = 0;
    let hi = samples.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].len < clamped) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const a = samples[i - 1];
    const b = samples[i];
    const span = b.len - a.len || 1;
    const t = (clamped - a.len) / span;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };

  // ── Tiles (virtualized), stacked edge-to-edge, always fully opaque ───────
  const [visibleTileRange, setVisibleTileRange] = useState({ start: 0, end: Math.min(tileCount - 1, 3) });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const rect = el.getBoundingClientRect();
      const viewportTop = -rect.top;
      const viewportBottom = viewportTop + window.innerHeight;
      const start = Math.max(0, Math.floor(viewportTop / tileHeight) - 1);
      const end = Math.min(tileCount - 1, Math.ceil(viewportBottom / tileHeight) + 1);
      setVisibleTileRange({ start, end });
    };
    compute();
    window.addEventListener('scroll', compute, { passive: true });
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('scroll', compute);
      window.removeEventListener('resize', compute);
    };
  }, [tileHeight, tileCount]);

  // ── Marker: position, pings, wake ────────────────────────────────────────
  const [markerPos, setMarkerPos] = useState(
    () => stationPoint.get(boatStationId) ?? pointAtDistance(stationDistance.get(boatStationId) ?? 0)
  );
  const [pingedId, setPingedId] = useState<string | null>(null);
  const [wakes, setWakes] = useState<{ x: number; y: number; id: number }[]>([]);
  const settledIdRef = useRef<string | null>(null);
  const settledDistRef = useRef<number | null>(null);
  const hasMountedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const wakeIdRef = useRef(0);
  const followCameraRef = useRef(false);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (globalSamples.length === 0 || !layoutSettled) return;
    const targetDist = stationDistance.get(boatStationId);
    if (targetDist === undefined) return;

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      settledIdRef.current = boatStationId;
      settledDistRef.current = targetDist;
      setMarkerPos(stationPoint.get(boatStationId) ?? pointAtDistance(targetDist));
      requestAnimationFrame(() => {
        const el = nodeRefs.current.get(boatStationId);
        el?.scrollIntoView({ behavior: 'auto', block: 'center' });
      });
      return;
    }

    const idChanged = settledIdRef.current !== boatStationId;
    const distChanged = settledDistRef.current === null || Math.abs(settledDistRef.current - targetDist) > 0.5;
    if (!idChanged && !distChanged) return;

    // Same station, but its own resolved position shifted (the real-DOM
    // overlap-correction pass nudged it) — snap the dot to match instantly
    // instead of leaving it stranded at the old spot or replaying a "travel"
    // animation for something that isn't a real day-to-day move.
    if (!idChanged) {
      settledDistRef.current = targetDist;
      setMarkerPos(stationPoint.get(boatStationId) ?? pointAtDistance(targetDist));
      return;
    }

    const fromDist = settledDistRef.current ?? targetDist;
    settledIdRef.current = boatStationId;
    settledDistRef.current = targetDist;

    if (prefersReducedMotion) {
      setMarkerPos(stationPoint.get(boatStationId) ?? pointAtDistance(targetDist));
      const el = nodeRefs.current.get(boatStationId);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      onBoatArrived?.();
      return;
    }

    const distancePx = Math.abs(targetDist - fromDist);
    const duration = Math.max(500, (distancePx / MARKER_SPEED_PX_PER_SEC) * 1000);
    const start = performance.now();
    const direction = Math.sign(targetDist - fromDist) || 1;
    let lastD = fromDist;

    const containerDocTop = containerRef.current ? containerRef.current.getBoundingClientRect().top + window.scrollY : 0;
    followCameraRef.current = true;
    let lastExpectedScroll = window.scrollY;

    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeEdges(t);
      const d = fromDist + (targetDist - fromDist) * eased;
      // Snap to the station's exact rendered point on arrival instead of the
      // sampled curve point, so the dot can never end up a hair off the circle.
      const p = t >= 1 ? stationPoint.get(boatStationId) ?? pointAtDistance(d) : pointAtDistance(d);
      setMarkerPos(p);

      for (const [id, dist] of stationDistance) {
        if ((direction > 0 && dist > lastD && dist <= d) || (direction < 0 && dist < lastD && dist >= d)) {
          setPingedId(id);
          window.setTimeout(() => setPingedId((cur) => (cur === id ? null : cur)), PING_MS);
        }
      }
      lastD = d;

      if (Math.round(now / 90) !== Math.round((now - 16) / 90)) {
        const id = wakeIdRef.current++;
        setWakes((prev) => [...prev.slice(-7), { x: p.x, y: p.y, id }]);
        window.setTimeout(() => setWakes((prev) => prev.filter((w) => w.id !== id)), WAKE_LIFETIME_MS);
      }

      if (followCameraRef.current) {
        if (Math.abs(window.scrollY - lastExpectedScroll) > 60) {
          followCameraRef.current = false;
        } else {
          const targetScroll = containerDocTop + p.y - window.innerHeight * 0.4;
          window.scrollTo(0, targetScroll);
          lastExpectedScroll = targetScroll;
        }
      }

      if (t < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        rafRef.current = null;
        onBoatArrived?.();
      }
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boatStationId, globalSamples, stationDistance, stationPoint, layoutSettled]);

  const milestoneDaysLeft = Math.max(0, MILESTONE_DAY - currentDay);
  const currentArcLen = stationDistance.get(boatStationId) ?? 0;
  const glowFraction = globalTotalLen > 0 ? Math.max(0, Math.min(1, currentArcLen / globalTotalLen)) : 0;

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden" style={{ height: totalHeight, backgroundColor: '#0B0B0F' }}>
      {/* Virtualized track tiles — identical, no flip, no overlap/fade: the art
          is designed to self-connect enter/exit dead-center, so plain abutment
          already lines up; a tiny cumulative shift guards against hairline
          rounding seams between tiles. */}
      {Array.from({ length: visibleTileRange.end - visibleTileRange.start + 1 }).map((_, k) => {
        const i = visibleTileRange.start + k;
        const top = tileBaseY(i);
        if (top >= trackEndY) return null; // past the milestone — no more track
        // The tile the milestone falls inside only shows the art down to
        // where the track actually ends; the rest of that tile is cropped so
        // the road visibly stops instead of continuing to wind on-screen.
        const visibleHeight = Math.min(tileHeight, trackEndY - top);
        return (
          <div key={i} className="absolute inset-x-0 w-full overflow-hidden" style={{ top, height: visibleHeight }}>
            <img
              src={TRACK_TILE_SRC_1X}
              srcSet={`${TRACK_TILE_SRC_1X} 1x, ${TRACK_TILE_SRC_2X} 2x`}
              alt=""
              aria-hidden
              className="absolute inset-x-0 top-0 w-full"
              style={{ height: tileHeight }}
            />
          </div>
        );
      })}

      {/* Completed-segment glow: the real track line, re-traced in orange with a
          soft glow, revealed only from the start up to the current station. */}
      {globalPathD && (
        <svg className="absolute inset-0 pointer-events-none overflow-visible" width={width} height={trackEndY}>
          <path
            d={globalPathD}
            fill="none"
            stroke={MARKER_COLOR}
            strokeWidth={4}
            strokeLinecap="round"
            strokeOpacity={0.6}
            pathLength={1}
            strokeDasharray={`${glowFraction} ${1 - glowFraction}`}
            style={{ filter: `drop-shadow(0 0 6px ${MARKER_COLOR})`, transition: 'stroke-dasharray 0.3s linear' }}
          />
          {debugPath && <path d={globalPathD} fill="none" stroke="red" strokeWidth={1} />}
        </svg>
      )}

      {/* Wake trail */}
      {wakes.map((w) => (
        <span
          key={w.id}
          className="absolute rounded-full animate-wake-fade"
          style={{ left: w.x, top: w.y, width: 6, height: 6, backgroundColor: MARKER_DOT_COLOR, transform: 'translate(-50%,-50%)' }}
        />
      ))}

      {partTitles.map((pt) => {
        const bigTitle = `חלק ${pt.partNumber}`;
        return (
          <PartTitle
            key={`part-${pt.partNumber}`}
            {...pt}
            bigTitle={bigTitle}
            widthForMode={width - 2 * TITLE_SCREEN_MARGIN}
            rootRef={(el) => {
              if (el) titleRefs.current.set(pt.partNumber, el);
              else titleRefs.current.delete(pt.partNumber);
            }}
          />
        );
      })}

      {stations.map((s) => {
        if (s.entry.kind === 'milestone') {
          return (
            <div
              key="milestone"
              ref={(el) => {
                if (el) nodeRefs.current.set(MILESTONE_ID, el);
              }}
              className="absolute flex flex-col items-center"
              style={{ top: s.top, left: s.left, transform: 'translate(-50%, -50%)', width: STATION_WIDTH, scrollMarginTop: 100, scrollMarginBottom: 160 }}
            >
              <div
                ref={(el) => {
                  if (el) circleRefs.current.set(MILESTONE_ID, el);
                  else circleRefs.current.delete(MILESTONE_ID);
                }}
                className={cn(
                  'relative w-20 h-20 rounded-full flex items-center justify-center border-2 transition-transform',
                  pingedId === MILESTONE_ID && 'scale-[1.15]'
                )}
                style={{
                  zIndex: 4,
                  ...(milestoneUnlocked
                    ? { backgroundColor: TRACK_COLORS.accent, borderColor: '#D18C1F' }
                    : { backgroundColor: TRACK_COLORS.lockedBg, borderColor: TRACK_COLORS.lockedBorder }),
                }}
              >
                {milestoneUnlocked ? (
                  <Trophy className="h-8 w-8 text-[#1C1C22]" />
                ) : (
                  <Lock className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div
                ref={(el) => {
                  if (el) labelRefs.current.set(MILESTONE_ID, el);
                  else labelRefs.current.delete(MILESTONE_ID);
                }}
                className="mt-2 rounded-xl px-3 py-1.5 text-center"
                style={{
                  zIndex: 3,
                  maxWidth: 170,
                  transform: s.labelShiftX ? `translateX(${s.labelShiftX}px)` : undefined,
                  backgroundColor: '#141418',
                  border: '1px solid #2A2A33',
                }}
              >
                <p className="text-sm font-bold" style={{ color: '#fff' }}>
                  שלב סיכום
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.8)' }}>
                  {milestoneUnlocked ? `יום ${MILESTONE_DAY} — סוף התוכנית` : `ייפתח בעוד ${milestoneDaysLeft} ימים`}
                </p>
              </div>
            </div>
          );
        }

        const item = s.entry.item;
        const isFrontier = item.id === boatStationId;
        return (
          <div
            key={item.id}
            ref={(el) => {
              if (el) nodeRefs.current.set(item.id, el);
              else nodeRefs.current.delete(item.id);
            }}
            className="absolute"
            style={{ top: s.top, left: s.left, transform: 'translate(-50%, -50%)', scrollMarginTop: 100, scrollMarginBottom: 160 }}
          >
            <PathNode
              circleRef={(el) => {
                if (el) circleRefs.current.set(item.id, el);
                else circleRefs.current.delete(item.id);
              }}
              labelRef={(el) => {
                if (el) labelRefs.current.set(item.id, el);
                else labelRefs.current.delete(item.id);
              }}
              title={item.title}
              tag={item.isUnlocked ? item.week_range : 'נעול'}
              contentType={item.content_type ?? (item.video_url ? 'video' : 'content')}
              isUnlocked={item.isUnlocked}
              isCompleted={item.isCompleted}
              isBonus={item.is_bonus}
              isFrontier={isFrontier}
              isCelebrating={pingedId === item.id}
              daysUntilUnlock={item.daysUntilUnlock}
              labelShiftX={s.labelShiftX}
              onClick={() => item.isUnlocked && onSelect(item)}
            />
          </div>
        );
      })}

      {/* Marker — small pulsing white dot (kept white, not orange, so it stays
          visible against the orange track/glow), rendered behind the stations
          (earlier in DOM order, no z-index) so it reads as moving past/under
          them. */}
      <div
        className="absolute pointer-events-none rounded-full animate-marker-pulse"
        style={{
          top: markerPos.y,
          left: markerPos.x,
          width: MARKER_DIAMETER_PX,
          height: MARKER_DIAMETER_PX,
          backgroundColor: MARKER_DOT_COLOR,
          border: '2px solid #1C1C22',
          transform: 'translate(-50%, -50%)',
          transition: prefersReducedMotion ? 'none' : 'top 0.1s linear, left 0.1s linear',
        }}
      />
    </div>
  );
}
