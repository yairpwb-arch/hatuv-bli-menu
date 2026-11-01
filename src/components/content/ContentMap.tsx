import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, Droplet, Dumbbell, Footprints, Lock, Moon, Trophy, UtensilsCrossed } from 'lucide-react';
import { getNodeVisual } from '@/lib/contentPathStyle';
import { ContentItem, NodeState, PartGroup, countdown, kindOf, metaLine, stateOf } from '@/lib/contentModel';
import { cn } from '@/lib/utils';
import { PartBanner } from './PartBanner';

/*
 * The content map as a road trip: a wide asphalt road with a dashed centre
 * line that winds right–centre–left in S-curves of varying width, filled
 * orange up to the current stage and fogged ahead. Each part sits on a very
 * slightly different ground tone with faded themed icons by the roadside and
 * ends at a road sign with a trophy. Laid out in plain pixels from the width:
 * a static SVG (one road path per part) plus absolutely placed nodes, so it
 * costs nothing while scrolling. The only running animation is the current
 * stage's ring, paused off screen.
 */

const ORANGE = '#FF8A2A';
const ASPHALT = '#22222A';
const SHOULDER = '#2E2E37';
const ROAD_W = 24;
const STEP = 124; // between node centres
const BANNER_H = 64;
const BANNER_GAP = 40;
const SIGN_H = 96; // the end-of-part sign and its post
const TOP_PAD = 24;
const BOTTOM_PAD = 72;
/** Lane positions (fraction of width): right, centre, left with uneven swings. */
const LANES = [0.76, 0.46, 0.22, 0.56, 0.8, 0.34, 0.24, 0.62];
const GROUNDS = ['#0E0E11', '#111115'];
const DECOR = [Droplet, UtensilsCrossed, Footprints, Dumbbell, Moon];

type Point =
  | { kind: 'item'; id: string; item: ContentItem; x: number; y: number; size: number; part: number }
  | { kind: 'sign'; id: string; part: PartGroup; x: number; y: number }
  | { kind: 'final'; id: string; x: number; y: number };

export const FINAL_ID = '__final__';
const signId = (n: number) => `__part_${n}__`;

export interface ContentMapHandle {
  /** Document Y of a node's centre (item id), or null. */
  nodeY: (id: string) => number | null;
  partY: (part: number) => number | null;
  nodeEl: (id: string) => HTMLElement | null;
  /** A short ring "here it is" after jumping to a node. */
  spotlight: (id: string) => void;
}

interface Props {
  parts: PartGroup[];
  currentId: string | null;
  soonId: string | null;
  /** Unlocked since the last visit: the lock opens and the road fills up to it. */
  revealIds: Set<string>;
  /** Parts finished since the last visit: their sign pops. */
  trophyParts: Set<number>;
  finalUnlocked: boolean;
  finalOpensLabel: string;
  /** The trainee's initials, on the "you are here" pin. */
  initials: string;
  onSelect: (item: ContentItem) => void;
}

const frac = (n: number) => n - Math.floor(n);

/**
 * S-curves with vertical tangents; each bend gets its own depth so no two look
 * alike. `seed` is the route index of pts[0], keeping bends identical across
 * the paths that redraw the same stretch.
 */
function roadPath(pts: { x: number; y: number }[], seed = 0): string {
  if (pts.length === 0) return '';
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dy = b.y - a.y;
    const h1 = dy * (0.3 + 0.4 * frac((i + seed) * 0.618));
    const h2 = dy * (0.3 + 0.4 * frac((i + seed) * 0.382 + 0.5));
    d += ` C${a.x} ${a.y + h1} ${b.x} ${b.y - h2} ${b.x} ${b.y}`;
  }
  return d;
}

/** Pauses an element's CSS animation while it's off screen. */
function usePauseOffscreen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => {
      el.style.animationPlayState = e.isIntersecting ? 'running' : 'paused';
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

function HereRing({ size }: { size: number }) {
  const ref = usePauseOffscreen<HTMLSpanElement>();
  return (
    <span
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute rounded-full border-2 border-primary animate-here-ring"
      style={{ inset: -6, width: size + 12, height: size + 12 }}
    />
  );
}

/** "You are here": a pin with the trainee's initials and a tag, above the current stage. */
function HerePin({ initials }: { initials: string }) {
  return (
    <span aria-hidden className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 flex -translate-x-1/2 flex-col items-center">
      <span className="mb-1 whitespace-nowrap rounded-pill bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">אתה כאן</span>
      <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary bg-[#17171C] text-[12px] font-bold text-foreground">
        {initials}
      </span>
      <span className="h-0 w-0 border-x-[6px] border-t-[7px] border-x-transparent border-t-primary" />
    </span>
  );
}

function ItemNode({
  p, state, reveal, spot, initials, onSelect, elRef,
}: {
  p: Extract<Point, { kind: 'item' }>;
  state: NodeState;
  reveal: boolean;
  spot: boolean;
  initials: string;
  onSelect: () => void;
  elRef: (el: HTMLDivElement | null) => void;
}) {
  const { Icon } = getNodeVisual(kindOf(p.item));
  const tappable = state === 'done' || state === 'current' || state === 'open';
  const size = p.size;
  return (
    <div ref={elRef} className="absolute" style={{ left: p.x, top: p.y, width: size, height: size, transform: 'translate(-50%, -50%)' }}>
      {state === 'current' && <HerePin initials={initials} />}
      {state === 'current' && <HereRing size={size} />}
      {spot && <span aria-hidden className="pointer-events-none absolute rounded-full border-[3px] border-primary animate-spot-ping" style={{ inset: -4 }} />}
      <button
        type="button"
        disabled={!tappable}
        onClick={onSelect}
        aria-label={tappable ? `${p.item.title}${state === 'done' ? ', הושלם' : state === 'current' ? ', הבא בתור' : ''}` : `שלב נעול, ${countdown(p.item)}`}
        className={cn(
          'relative flex items-center justify-center rounded-full',
          state === 'done' && 'bg-primary',
          state === 'current' && 'border-[4px] border-primary bg-[#22160C]',
          state === 'open' && 'border-[3px] border-primary bg-card',
          state === 'soon' && 'border-2 border-[#3A3A42] bg-[#1F1F25]',
          state === 'locked' && 'border-2 border-[#2E2E37] bg-[#1A1A20]',
          reveal && 'animate-node-reveal',
        )}
        style={{ width: size, height: size }}
      >
        {state === 'done' && <Icon className="h-5 w-5 text-white" strokeWidth={2} />}
        {state === 'current' && <Icon className="h-7 w-7 text-primary" strokeWidth={2} />}
        {state === 'open' && <Icon className="h-6 w-6 text-primary" strokeWidth={2} />}
        {(state === 'soon' || state === 'locked') && <Lock className="h-5 w-5 text-[#6E6E76]" strokeWidth={2} />}
        {state === 'done' && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-primary">
            <Check className="h-3 w-3 text-white" strokeWidth={3.5} />
          </span>
        )}
      </button>
      {reveal && (
        <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center animate-lock-open">
          <Lock className="h-6 w-6 text-muted-foreground" strokeWidth={2} />
        </span>
      )}
    </div>
  );
}

/** The stage's name in a small card on the free side of the node — never on the road. */
function Label({ p, state, width, onSelect }: { p: Extract<Point, { kind: 'item' }>; state: NodeState; width: number; onSelect: () => void }) {
  const gap = p.size / 2 + 12;
  const onLeft = p.x >= width / 2; // node on the right half → card to its left
  const room = onLeft ? p.x - gap - 12 : width - (p.x + gap) - 12;
  const tappable = state === 'done' || state === 'current' || state === 'open';
  const meta = metaLine(p.item);
  return (
    <button
      type="button"
      tabIndex={-1}
      disabled={!tappable}
      onClick={onSelect}
      className={cn(
        'absolute -translate-y-1/2 rounded-inner border px-2.5 py-1.5 text-right',
        state === 'current' ? 'border-primary/50 bg-[#22160C]' : 'border-[#26262D] bg-[#141418]',
      )}
      style={onLeft ? { right: width - p.x + gap, top: p.y, maxWidth: Math.min(190, room) } : { left: p.x + gap, top: p.y, maxWidth: Math.min(190, room) }}
      dir="rtl"
    >
      <span className={cn('block truncate text-[11px] font-normal', state === 'locked' ? 'text-[#5A5A63]' : state === 'current' ? 'text-primary-soft' : 'text-muted-foreground')}>
        {meta}
      </span>
      {/* Locked stages keep their name hidden until they open. */}
      <span
        className={cn(
          // The stage's own name carries the weight; the week / kind line above stays quiet.
          'block text-[14px] font-bold leading-snug line-clamp-2',
          tappable ? 'text-foreground' : 'font-semibold text-[#6E6E76]',
        )}
      >
        {tappable ? p.item.title : countdown(p.item)}
      </span>
    </button>
  );
}

/** End of a part: a road sign on a post, "סוף חלק N" with a trophy. */
function EndSign({ p, pop }: { p: Extract<Point, { kind: 'sign' }>; pop: boolean }) {
  const done = p.part.complete;
  return (
    <div
      className={cn('absolute flex -translate-x-1/2 flex-col items-center', pop && 'animate-trophy-pop')}
      style={{ left: p.x, top: p.y - SIGN_H / 2 }}
      role="img"
      aria-label={`סוף חלק ${p.part.number}${done ? ', הושלם' : ''}`}
    >
      <span
        className={cn(
          'flex items-center gap-2 rounded-[10px] border-2 px-3 py-2',
          done ? 'border-[#FFB27A] bg-primary text-primary-foreground' : 'border-[#3A3A42] bg-[#1F1F25] text-[#8A8A93]',
        )}
      >
        <Trophy className="h-5 w-5" strokeWidth={2} />
        <span className="whitespace-nowrap text-[14px] font-bold">סוף חלק {p.part.number}</span>
      </span>
      <span className={cn('h-10 w-1 rounded-b', done ? 'bg-[#B35E1C]' : 'bg-[#2E2E37]')} />
    </div>
  );
}

const ContentMap = forwardRef<ContentMapHandle, Props>(function ContentMap(
  { parts, currentId, soonId, revealIds, trophyParts, finalUnlocked, finalOpensLabel, initials, onSelect },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [spotId, setSpotId] = useState<string | null>(null);
  const [filled, setFilled] = useState(false);
  const nodeEls = useRef(new Map<string, HTMLElement>());

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Layout ──
  const layout = useMemo(() => {
    const points: Point[] = [];
    const sections: { part: PartGroup; top: number; bottom: number; bannerY: number; points: Point[] }[] = [];
    let y = TOP_PAD;
    let k = 0;
    const laneX = () => width * LANES[k++ % LANES.length];
    for (const part of parts) {
      const top = y - TOP_PAD / 2;
      const bannerY = y;
      y += BANNER_H + BANNER_GAP + 24;
      const own: Point[] = [];
      for (const item of part.items) {
        const size = item.id === currentId ? 64 : 48;
        const p: Point = { kind: 'item', id: item.id, item, x: laneX(), y, size, part: part.number };
        points.push(p);
        own.push(p);
        y += STEP;
      }
      y += 10;
      const sign: Point = { kind: 'sign', id: signId(part.number), part, x: width / 2, y };
      points.push(sign);
      own.push(sign);
      y += SIGN_H / 2 + BANNER_GAP;
      sections.push({ part, top, bottom: y - BANNER_GAP / 2, bannerY, points: own });
    }
    const final: Point = { kind: 'final', id: FINAL_ID, x: width / 2, y: y + 40 };
    points.push(final);
    return { points, sections, height: y + 40 + 60 + BOTTOM_PAD };
  }, [parts, width, currentId]);

  const pts = layout.points;

  // Where the orange reaches: the current node, else the last thing opened.
  const currentIndex = useMemo(() => {
    const byId = pts.findIndex((p) => p.id === currentId);
    if (byId >= 0) return byId;
    if (finalUnlocked) return pts.length - 1;
    let last = 0;
    pts.forEach((p, i) => {
      if (p.kind === 'item' && p.item.isUnlocked) last = i;
      if (p.kind === 'sign' && p.part.complete) last = i;
    });
    return last;
  }, [pts, currentId, finalUnlocked]);
  const currentY = pts[currentIndex]?.y ?? 0;

  const revealing = pts[currentIndex] && revealIds.has(pts[currentIndex].id);
  useEffect(() => {
    if (!revealing) {
      setFilled(true);
      return;
    }
    setFilled(false);
    const t = window.setTimeout(() => setFilled(true), 250);
    return () => window.clearTimeout(t);
  }, [revealing]);

  useImperativeHandle(ref, () => ({
    nodeY: (id) => {
      const p = pts.find((q) => q.id === id);
      const el = containerRef.current;
      if (!p || !el) return null;
      return el.getBoundingClientRect().top + window.scrollY + p.y;
    },
    partY: (n) => {
      const s = layout.sections.find((q) => q.part.number === n);
      const el = containerRef.current;
      if (!s || !el) return null;
      return el.getBoundingClientRect().top + window.scrollY + s.bannerY;
    },
    nodeEl: (id) => nodeEls.current.get(id) ?? null,
    spotlight: (id) => {
      setSpotId(id);
      window.setTimeout(() => setSpotId((cur) => (cur === id ? null : cur)), 1300);
    },
  }), [pts, layout.sections]);

  // One road path per part, joined to the next part's first stage. The seed is
  // the global index of the part's first point, so the orange overlay (drawn
  // over the whole route) bends exactly like the road under it.
  const roads = layout.sections.map((s, i) => {
    const next = layout.sections[i + 1]?.points[0] ?? pts[pts.length - 1];
    const own = s.points.map((p) => ({ x: p.x, y: p.y }));
    return { key: s.part.number, pts: [...own, { x: next.x, y: next.y }], seed: pts.indexOf(s.points[0]) };
  });
  const travelled = pts.slice(0, currentIndex + 1).map((p) => ({ x: p.x, y: p.y }));
  const settledD = roadPath(travelled.slice(0, Math.max(1, travelled.length - 1)));
  const leadIn = currentIndex > 0 ? roadPath(travelled.slice(-2), currentIndex - 1) : '';

  // Fog ahead: stepped dark bands, thicker the further from the current stage.
  const fogTop = currentY + 40;
  const fogBands = Math.max(0, Math.ceil((layout.height - fogTop) / 220));

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: layout.height }}>
      <svg className="pointer-events-none absolute inset-0" width={width} height={layout.height} aria-hidden>
        {/* Ground: each part a hair lighter or darker than the next */}
        {layout.sections.map((s, i) => (
          <rect key={s.part.number} x={0} y={s.top} width={width} height={s.bottom - s.top} fill={GROUNDS[i % 2]} />
        ))}
        {/* The road: shoulder, asphalt */}
        {roads.map((r) => {
          const d = roadPath(r.pts, r.seed);
          return (
            <g key={r.key}>
              <path d={d} fill="none" stroke={SHOULDER} strokeWidth={ROAD_W + 4} strokeLinecap="round" strokeLinejoin="round" />
              <path d={d} fill="none" stroke={ASPHALT} strokeWidth={ROAD_W} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}
        {/* Travelled: orange under the centre line */}
        {travelled.length > 1 && (
          <>
            <path d={settledD} fill="none" stroke={ORANGE} strokeWidth={ROAD_W} strokeLinecap="round" strokeLinejoin="round" />
            <path
              d={leadIn}
              fill="none"
              stroke={ORANGE}
              strokeWidth={ROAD_W}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1 1"
              style={{ strokeDashoffset: filled ? 0 : 1, transition: 'stroke-dashoffset 600ms ease-out' }}
            />
          </>
        )}
        {/* Dashed centre line */}
        {roads.map((r) => (
          <path key={r.key} d={roadPath(r.pts, r.seed)} fill="none" stroke="#FFFFFF" strokeOpacity={0.25} strokeWidth={2} strokeDasharray="10 12" />
        ))}
        {/* Fog over the road ahead */}
        {Array.from({ length: fogBands }, (_, i) => (
          <rect key={i} x={0} y={fogTop + i * 220} width={width} height={220} fill="#0E0E11" fillOpacity={Math.min(0.5, 0.12 + i * 0.08)} />
        ))}
      </svg>

      {/* Roadside decoration: big, faded, themed per part */}
      {layout.sections.map((s, i) => {
        const Icon = DECOR[i % DECOR.length];
        const span = s.bottom - s.top;
        return [0.3, 0.72].map((f, j) => (
          <Icon
            key={`${s.part.number}-${j}`}
            aria-hidden
            className="pointer-events-none absolute text-foreground"
            style={{ top: s.top + span * f, [j % 2 ? 'right' : 'left']: 6, width: 88, height: 88, opacity: 0.07 }}
            strokeWidth={1.5}
          />
        ));
      })}

      {/* Part banners — full width, on top of the road */}
      {layout.sections.map((s) => (
        <div key={s.part.number} data-part={s.part.number} className="absolute inset-x-4" style={{ top: s.bannerY, height: BANNER_H }}>
          <PartBanner part={s.part} className="h-full" />
        </div>
      ))}

      {pts.map((p) => {
        if (p.kind === 'item') {
          const state = stateOf(p.item, currentId, soonId);
          return (
            <div key={p.id} data-node={p.id}>
              <ItemNode
                p={p}
                state={state}
                reveal={revealIds.has(p.id)}
                spot={spotId === p.id}
                initials={initials}
                onSelect={() => onSelect(p.item)}
                elRef={(el) => (el ? nodeEls.current.set(p.id, el) : nodeEls.current.delete(p.id))}
              />
              <Label p={p} state={state} width={width} onSelect={() => onSelect(p.item)} />
            </div>
          );
        }
        if (p.kind === 'sign') return <EndSign key={p.id} p={p} pop={trophyParts.has(p.part.number)} />;
        return (
          <div key={p.id} className="absolute flex flex-col items-center gap-2" style={{ left: p.x, top: p.y, transform: 'translate(-50%, -40px)' }}>
            <div
              className={cn('flex h-20 w-20 items-center justify-center rounded-full', finalUnlocked ? 'bg-primary' : 'border-2 border-[#3A3A42] bg-[#1F1F25]')}
              role="img"
              aria-label={`שלב סיכום${finalUnlocked ? '' : `, ${finalOpensLabel}`}`}
            >
              <Trophy className={cn('h-9 w-9', finalUnlocked ? 'text-white' : 'text-[#5A5A63]')} strokeWidth={2} />
            </div>
            <p className="text-body font-bold">שלב סיכום</p>
            <p className="-mt-1.5 text-label text-muted-foreground">{finalUnlocked ? 'סוף התוכנית' : finalOpensLabel}</p>
          </div>
        );
      })}
    </div>
  );
});

export default ContentMap;
