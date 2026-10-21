import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Lock, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import PathNode from './PathNode';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import {
  RIVER_TILE_ASPECT,
  RIVER_TILE_SRC_1X,
  RIVER_TILE_SRC_2X,
  SINE_AMPLITUDE_FRACTION,
  STATION_SPACING_PX,
  BANK_OFFSET_PX,
  LABEL_HEIGHT_PX,
  MILESTONE_GAP_PX,
  TOP_PADDING_PX,
  MILESTONE_DAY,
  MILESTONE_ID,
  BOAT_WIDTH_FRACTION,
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

type PathEntry =
  | { kind: 'label'; partNumber: number }
  | { kind: 'node'; item: ContentItem }
  | { kind: 'milestone' };

interface Positioned {
  entry: PathEntry;
  top: number;
  left: number;
  bankSide: -1 | 0 | 1;
}

interface Sample {
  x: number;
  y: number;
  len: number;
}

interface ContentPathProps {
  allContent: ContentItem[];
  currentDay: number;
  milestoneUnlocked: boolean;
  partNames: Record<number, string>;
  /** the station (content id, or MILESTONE_ID) the boat should be at / sail to */
  boatStationId: string;
  /** fires once the boat finishes sailing to boatStationId */
  onBoatArrived?: () => void;
  onSelect: (item: ContentItem) => void;
}

const SAMPLE_STEP_PX = 8;
const BOAT_SPEED_PX_PER_SEC = 250;
const PING_MS = 200;
const WAKE_LIFETIME_MS = 600;

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

  // Rounded to a whole pixel: fractional tile heights make adjacent absolutely-
  // positioned tiles round to the pixel grid inconsistently in some browsers,
  // showing up as a faint hairline seam between them even with zero gap.
  const tileHeight = Math.round(width * RIVER_TILE_ASPECT);
  const centerX = useCallback(
    (y: number) => width / 2 + SINE_AMPLITUDE_FRACTION * width * Math.sin((y * 2 * Math.PI) / tileHeight),
    [width, tileHeight]
  );

  // ── Layout: stations, labels, milestone ──────────────────────────────────
  const { positioned, totalHeight } = useMemo(() => {
    const entries: PathEntry[] = [];
    let lastPart: number | null = null;
    for (const item of allContent) {
      if (item.part_number !== lastPart) {
        entries.push({ kind: 'label', partNumber: item.part_number });
        lastPart = item.part_number;
      }
      entries.push({ kind: 'node', item });
    }
    entries.push({ kind: 'milestone' });

    let y = TOP_PADDING_PX;
    let bank: -1 | 1 = -1;
    const result: Positioned[] = entries.map((entry) => {
      if (entry.kind === 'label') {
        const top = y;
        y += LABEL_HEIGHT_PX;
        return { entry, top, left: width / 2, bankSide: 0 };
      }
      if (entry.kind === 'milestone') {
        y += MILESTONE_GAP_PX;
        const top = y;
        y += STATION_SPACING_PX;
        return { entry, top, left: width / 2, bankSide: 0 };
      }
      const top = y;
      const left = centerX(top) + bank * BANK_OFFSET_PX;
      const side = bank;
      bank = bank === -1 ? 1 : -1;
      y += STATION_SPACING_PX;
      return { entry, top, left, bankSide: side };
    });

    // Extra bottom buffer so the river still fills the screen behind the page's
    // own bottom padding (reserved for the fixed weekly-survey button + bottom
    // nav) — otherwise the plain dark page background shows through as a black
    // strip below the milestone once you've scrolled all the way down. Generous
    // on purpose: the fixed button/nav permanently cover this zone, so extra
    // river here is never actually seen — better too much than too little.
    return { positioned: result, totalHeight: y + 340 };
  }, [allContent, width, centerX]);

  // ── River center-line samples (for the boat path + stationDistance) ─────
  const { samples, totalLen, stationDistance } = useMemo(() => {
    const s: Sample[] = [];
    let len = 0;
    for (let y = 0; y <= totalHeight + SAMPLE_STEP_PX; y += SAMPLE_STEP_PX) {
      const x = centerX(y);
      if (s.length > 0) {
        const prev = s[s.length - 1];
        len += Math.hypot(x - prev.x, y - prev.y);
      }
      s.push({ x, y, len });
    }
    const dist = new Map<string, number>();
    for (const p of positioned) {
      if (p.entry.kind === 'label') continue;
      const idx = Math.min(s.length - 1, Math.round(p.top / SAMPLE_STEP_PX));
      const id = p.entry.kind === 'node' ? p.entry.item.id : MILESTONE_ID;
      dist.set(id, s[idx].len);
    }
    return { samples: s, totalLen: len, stationDistance: dist };
  }, [positioned, totalHeight, centerX]);

  const pointAtDistance = (d: number): { x: number; y: number } => {
    const clamped = Math.max(0, Math.min(totalLen, d));
    // binary search
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

  // ── Tiles (virtualized) ───────────────────────────────────────────────────
  // Tiles stack edge-to-edge (no overlap, no fade/mask blending) — the river
  // enters and exits each tile dead-center by design, and flipping every
  // other tile keeps that center alignment at every seam, so plain abutment
  // already lines up cleanly. A mask-based crossfade was tried here and
  // caused visible hard cuts in practice (plus a transparent gap at the very
  // bottom); plain stacking has no fade to go wrong, so it can't do that.
  const tileCount = Math.max(1, Math.ceil(totalHeight / tileHeight));
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

  // ── Boat: position, rotation, pings, wake ────────────────────────────────
  const [boatPose, setBoatPose] = useState(() => {
    const p = pointAtDistance(stationDistance.get(boatStationId) ?? 0);
    return { x: p.x, y: p.y, angle: 0 };
  });
  const [pingedId, setPingedId] = useState<string | null>(null);
  const [wakes, setWakes] = useState<{ x: number; y: number; id: number }[]>([]);
  const settledIdRef = useRef<string | null>(null);
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
    if (samples.length === 0) return;
    const targetDist = stationDistance.get(boatStationId);
    if (targetDist === undefined) return;

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      settledIdRef.current = boatStationId;
      const p = pointAtDistance(targetDist);
      setBoatPose({ x: p.x, y: p.y, angle: 0 });
      // Land the viewport on the boat on first paint.
      requestAnimationFrame(() => {
        const el = nodeRefs.current.get(boatStationId);
        el?.scrollIntoView({ behavior: 'auto', block: 'center' });
      });
      return;
    }

    if (settledIdRef.current === boatStationId) return;
    const fromDist = stationDistance.get(settledIdRef.current ?? '') ?? targetDist;
    settledIdRef.current = boatStationId;

    if (prefersReducedMotion) {
      const p = pointAtDistance(targetDist);
      setBoatPose({ x: p.x, y: p.y, angle: 0 });
      const el = nodeRefs.current.get(boatStationId);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      onBoatArrived?.();
      return;
    }

    // Sail from fromDist to targetDist at ~constant speed, easing only at the edges.
    const distancePx = Math.abs(targetDist - fromDist);
    const duration = Math.max(500, (distancePx / BOAT_SPEED_PX_PER_SEC) * 1000);
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

      const p = pointAtDistance(d);
      const ahead = pointAtDistance(d + direction * 3);
      const angle = (Math.atan2(ahead.x - p.x, ahead.y - p.y) * 180) / Math.PI;
      setBoatPose({ x: p.x, y: p.y, angle });

      // Station ping + segment pass-through
      for (const [id, dist] of stationDistance) {
        if ((direction > 0 && dist > lastD && dist <= d) || (direction < 0 && dist < lastD && dist >= d)) {
          setPingedId(id);
          window.setTimeout(() => setPingedId((cur) => (cur === id ? null : cur)), PING_MS);
        }
      }
      lastD = d;

      // Wake trail (throttled)
      if (Math.round(now / 90) !== Math.round((now - 16) / 90)) {
        const id = wakeIdRef.current++;
        setWakes((prev) => [...prev.slice(-7), { x: p.x, y: p.y, id }]);
        window.setTimeout(() => setWakes((prev) => prev.filter((w) => w.id !== id)), WAKE_LIFETIME_MS);
      }

      // Camera follow — keep the boat at ~40% viewport height, unless the user scrolled themselves.
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
  }, [boatStationId, samples]);

  const milestoneDaysLeft = Math.max(0, MILESTONE_DAY - currentDay);
  const boatWidthPx = width * BOAT_WIDTH_FRACTION;
  const boatHeightPx = boatWidthPx * (199 / 111);

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden" style={{ height: totalHeight }}>
      {/* Virtualized river tiles, stacked edge-to-edge with no gap and always
          fully opaque — see the note above on why there's no overlap/fade here. */}
      {Array.from({ length: visibleTileRange.end - visibleTileRange.start + 1 }).map((_, k) => {
        const i = visibleTileRange.start + k;
        // Small cumulative overlap per tile as a belt-and-braces hairline guard
        // on top of the whole-pixel rounding above — harmless since tiles are
        // always fully opaque, so an overlapping sliver just repeats itself.
        const top = i * tileHeight - i * 2;
        const flipped = i % 2 === 1;
        return (
          <img
            key={i}
            src={RIVER_TILE_SRC_1X}
            srcSet={`${RIVER_TILE_SRC_1X} 1x, ${RIVER_TILE_SRC_2X} 2x`}
            alt=""
            aria-hidden
            className="absolute inset-x-0 w-full"
            style={{
              top,
              height: tileHeight,
              transform: flipped ? 'scaleY(-1)' : undefined,
            }}
          />
        );
      })}

      {/* Wake trail */}
      {wakes.map((w) => (
        <span
          key={w.id}
          className="absolute rounded-full bg-white/70"
          style={{ left: w.x, top: w.y, width: 10, height: 10, transform: 'translate(-50%,-50%)' }}
        />
      ))}

      {/* Boat — rendered behind the stations (no z-index, earlier in DOM order)
          so it reads as sailing past/under them rather than floating on top. */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: boatPose.y,
          left: boatPose.x,
          width: boatWidthPx,
          height: boatHeightPx,
          transform: `translate(-50%, -50%) rotate(${boatPose.angle}deg)`,
          transition: prefersReducedMotion ? 'none' : 'transform 0.1s linear',
        }}
      >
        <div className={prefersReducedMotion ? undefined : 'animate-boat-rock'}>
          <img src="/boat.png" alt="" aria-hidden className="w-full h-full object-contain drop-shadow-lg" />
        </div>
      </div>

      {positioned.map((p, i) => {
        if (p.entry.kind === 'label') {
          const { partNumber } = p.entry;
          const label = partNames[partNumber];
          const partStarted = allContent.some((it) => it.part_number === partNumber && it.dateUnlocked);
          return (
            <div
              key={`label-${partNumber}-${i}`}
              className="absolute flex justify-center"
              style={{ top: p.top, left: 0, width }}
            >
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold shadow',
                  partStarted ? 'bg-primary text-primary-foreground' : 'bg-black/80 text-white/80'
                )}
              >
                {!partStarted && <Lock className="h-3 w-3" />}
                {label}
              </span>
            </div>
          );
        }

        if (p.entry.kind === 'milestone') {
          return (
            <div
              key="milestone"
              ref={(el) => {
                if (el) nodeRefs.current.set(MILESTONE_ID, el);
              }}
              className="absolute flex flex-col items-center"
              style={{ top: p.top, left: p.left, transform: 'translateX(-50%)' }}
            >
              <div
                className={cn(
                  'w-20 h-20 rounded-full flex items-center justify-center border-2 transition-transform',
                  'ring-[3px] ring-black shadow-[0_3px_10px_rgba(0,0,0,0.6)]',
                  milestoneUnlocked ? 'gradient-gold border-yellow-500/50' : 'bg-muted border-border',
                  pingedId === MILESTONE_ID && 'scale-[1.15]'
                )}
              >
                {milestoneUnlocked ? (
                  <Trophy className="h-8 w-8 text-white" />
                ) : (
                  <Lock className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <p className="mt-1.5 text-center text-sm font-bold bg-black/80 text-white rounded-lg px-2 py-0.5">שלב סיכום</p>
              <p className="mt-1 text-xs text-white/80 bg-black/80 rounded-lg px-2 py-0.5">
                {milestoneUnlocked ? `יום ${MILESTONE_DAY} — סוף התוכנית` : `ייפתח בעוד ${milestoneDaysLeft} ימים`}
              </p>
            </div>
          );
        }

        const item = p.entry.item;
        const isFrontier = item.id === boatStationId;
        return (
          <div key={item.id} className="absolute" style={{ top: p.top, left: p.left }}>
            <PathNode
              ref={(el) => {
                if (el) nodeRefs.current.set(item.id, el);
                else nodeRefs.current.delete(item.id);
              }}
              title={item.title}
              weekRange={item.week_range}
              contentType={item.content_type ?? (item.video_url ? 'video' : 'content')}
              partNumber={item.part_number}
              isUnlocked={item.isUnlocked}
              isCompleted={item.isCompleted}
              isBonus={item.is_bonus}
              isFrontier={isFrontier}
              isCelebrating={pingedId === item.id}
              daysUntilUnlock={item.daysUntilUnlock}
              style={{ top: 0, left: 0 }}
              onClick={() => item.isUnlocked && onSelect(item)}
            />
          </div>
        );
      })}
    </div>
  );
}
