import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { addDays, format, isToday } from 'date-fns';
import { he } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Dumbbell, Footprints, Lock, Plus, Utensils } from 'lucide-react';
import { toast } from 'sonner';
import { BottomSheet, PrimaryButton } from '@/components/ds';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { EventEditor } from '@/components/calendar/EventEditor';
import { useAuth } from '@/hooks/useAuth';
import { CalEvent, eventDay, isPointEvent, useCalendar } from '@/hooks/useCalendar';
import { savePlacements } from '@/hooks/usePlacements';
import { selectionHaptic, tapHaptic } from '@/lib/native';
import { cn } from '@/lib/utils';
import { eatStyle } from '@/lib/eventStyle';

const PX_PER_MIN = 1.6; // a 30-minute row = 48px
const SNAP_MIN = 15;
const LONG_PRESS_MS = 300;
const MAX_COLS = 3;
const MIN = 60_000;
const WEEKDAY_NAME = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const hhmm = (d: Date) => format(d, 'HH:mm');

/** Side-by-side columns for overlapping blocks (up to 3; the rest counted as "+N"). */
function layoutBlocks(blocks: CalEvent[]) {
  const sorted = [...blocks].sort((a, b) => a.start.getTime() - b.start.getTime());
  const out = new Map<string, { col: number; cols: number; hidden: boolean; more: number }>();
  let cluster: CalEvent[] = [];
  let clusterEnd = 0;
  const flush = () => {
    const colEnds: number[] = [];
    const cols = new Map<string, number>();
    for (const e of cluster) {
      let c = colEnds.findIndex((end) => end <= e.start.getTime());
      if (c < 0) c = colEnds.length;
      colEnds[c] = e.end!.getTime();
      cols.set(e.key, c);
    }
    const total = Math.min(colEnds.length, MAX_COLS);
    const hiddenCount = cluster.filter((e) => cols.get(e.key)! >= MAX_COLS).length;
    for (const e of cluster) {
      const c = cols.get(e.key)!;
      out.set(e.key, { col: c, cols: total, hidden: c >= MAX_COLS, more: c === MAX_COLS - 1 ? hiddenCount : 0 });
    }
    cluster = [];
  };
  for (const e of sorted) {
    if (cluster.length && e.start.getTime() >= clusterEnd) flush();
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, e.end!.getTime());
  }
  if (cluster.length) flush();
  return out;
}

interface Drag {
  event: CalEvent;
  /** Pointer Y at pick-up (page coordinates) and the block's start then. */
  y0: number;
  start0: Date;
  /** Current snapped start. */
  start: Date;
}

/** One day on a vertical time axis, wake-up to bedtime; blocks can be dragged. */
export default function AppCalendarDay() {
  const { day: dayParam } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const day = useMemo(() => (dayParam ? new Date(`${dayParam}T12:00:00`) : new Date()), [dayParam]);
  const key = format(day, 'yyyy-MM-dd');
  const cal = useCalendar(user?.id, day, day);
  const events = cal.events.filter((e) => eventDay(e) === key);
  const [editor, setEditor] = useState<{ open: boolean; event?: CalEvent | null }>({ open: false });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pending, setPending] = useState<{ event: CalEvent; start: Date } | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // ── The axis: wake-up to bedtime ──
  const wake = events.find((e) => e.source === 'sleep' && e.type === 'wake')?.start;
  const bed = events.find((e) => e.source === 'sleep' && e.type === 'sleep')?.start;
  const axisStart = wake ?? new Date(`${key}T07:00:00`);
  const axisEnd = bed && bed > axisStart ? bed : new Date(axisStart.getTime() + 16 * 60 * MIN);
  const totalMin = Math.round((axisEnd.getTime() - axisStart.getTime()) / MIN);
  const yOf = (d: Date) => ((d.getTime() - axisStart.getTime()) / MIN) * PX_PER_MIN;
  const eatStart = events.find((e) => e.type === 'eat_start')?.start;
  const eatStop = events.find((e) => e.type === 'eat_stop')?.start;

  const points = events.filter(isPointEvent);
  const blocks = events
    .filter((e) => !isPointEvent(e) && e.hasTime)
    .map((e) => (e.end ? e : { ...e, end: new Date(e.start.getTime() + 30 * MIN) }));
  // Columns are worked out from where blocks are, not where one is being dragged.
  const layout = useMemo(() => layoutBlocks(blocks), [cal.events]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Dragging (long press → move in 15-minute steps; the page doesn't scroll meanwhile) ──
  const press = useRef<{ timer: number; x: number; y: number; event: CalEvent } | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const lastY = useRef(0);

  const movable = (e: CalEvent) => e.source === 'custom' || !!e.itemKey;

  const onPointerDown = (e: React.PointerEvent, ev: CalEvent) => {
    if (!movable(ev)) return;
    const x = e.pageX;
    const y = e.pageY;
    press.current = {
      x, y, event: ev,
      timer: window.setTimeout(() => {
        selectionHaptic();
        setDrag({ event: ev, y0: y, start0: ev.start, start: ev.start });
      }, LONG_PRESS_MS),
    };
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = press.current;
      if (p && !dragRef.current && Math.hypot(e.pageX - p.x, e.pageY - p.y) > 8) {
        window.clearTimeout(p.timer); // it's a scroll, not a long press
        press.current = null;
      }
      const d = dragRef.current;
      if (!d) return;
      lastY.current = e.clientY;
      const delta = (e.pageY - d.y0) / PX_PER_MIN;
      const snapped = Math.round(delta / SNAP_MIN) * SNAP_MIN;
      const start = new Date(d.start0.getTime() + snapped * MIN);
      if (start.getTime() !== d.start.getTime()) {
        tapHaptic();
        setDrag({ ...d, start });
      }
    };
    const up = () => {
      if (press.current) window.clearTimeout(press.current.timer);
      const tapped = press.current && !dragRef.current ? press.current.event : null;
      press.current = null;
      const d = dragRef.current;
      setDrag(null);
      if (d) drop(d);
      else if (tapped) tap(tapped);
    };
    // While dragging, the page must not scroll under the finger.
    const block = (e: TouchEvent) => {
      if (dragRef.current) e.preventDefault();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    document.addEventListener('touchmove', block, { passive: false });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      document.removeEventListener('touchmove', block);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cal.events]);

  // Near the top/bottom edge while dragging: scroll the page along.
  useEffect(() => {
    if (!drag) return;
    let raf = 0;
    const tick = () => {
      const y = lastY.current;
      const edge = 80;
      const speed = y < edge ? -(edge - y) / 4 : y > window.innerHeight - edge ? (y - (window.innerHeight - edge)) / 4 : 0;
      if (speed) {
        window.scrollBy(0, speed);
        const d = dragRef.current;
        if (d) d.y0 -= speed; // keep the block under the finger
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drag !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const tap = (e: CalEvent) => {
    if (e.source === 'custom') setEditor({ open: true, event: e });
    // A meal opens the meals guide on that meal's page.
    else if (e.source === 'habit' && e.type === 'meal') navigate(`/app/guides/meals?meal=${encodeURIComponent(e.title)}`);
    else if (e.explanation) toast(e.title, { description: e.explanation });
  };

  /** Rules: inside wake-up → bedtime; a meal inside the eating window. */
  const fits = (e: CalEvent, start: Date) => {
    const end = new Date(start.getTime() + (e.end!.getTime() - e.start.getTime()));
    if (start < axisStart || end > axisEnd) return 'רק בין הקימה לשינה';
    if (e.type === 'meal' && ((eatStart && start < eatStart) || (eatStop && end > eatStop))) return 'ארוחה נשארת בתוך חלון האכילה';
    return null;
  };

  const drop = async (d: Drag) => {
    if (d.start.getTime() === d.start0.getTime()) return;
    const problem = fits(d.event, d.start);
    if (problem) {
      toast.error(problem);
      return;
    }
    if (d.event.source === 'custom' && d.event.id) {
      const len = d.event.end ? d.event.end.getTime() - d.event.start.getTime() : 0;
      await cal.update(d.event.id, {
        starts_at: d.start.toISOString(),
        ...(len ? { ends_at: new Date(d.start.getTime() + len).toISOString() } : {}),
      });
      return;
    }
    setPending({ event: d.event, start: d.start }); // recurring: only today, or every <weekday>?
  };

  // "Today only" / "every <weekday>" / "every day" (meals) or "all its days" (workout / walk).
  const [moveScope, setMoveScope] = useState<'date' | 'weekday' | 'all'>('date');
  useEffect(() => {
    if (pending) setMoveScope('date');
  }, [pending]);

  /** The weekdays an item repeats on: every day for a meal, its planned days for a workout / walk. */
  const itemWeekdays = async (ev: CalEvent): Promise<number[]> => {
    if (ev.type === 'meal') return [0, 1, 2, 3, 4, 5, 6];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    if (ev.source === 'walk') {
      const { data } = await db.from('user_walking_schedule').select('day_of_week').eq('user_id', user!.id).eq('is_active', true);
      const days = [...new Set(((data ?? []) as { day_of_week: number | null }[]).map((r) => r.day_of_week).filter((d): d is number => d != null))];
      return days.length ? days : [day.getDay()];
    }
    const planDayId = ev.itemKey?.split(':')[1];
    const { data } = await db.from('workout_day_schedule').select('weekday').eq('user_id', user!.id).eq('plan_day_id', planDayId);
    const days = ((data ?? []) as { weekday: number }[]).map((r) => r.weekday);
    return days.length ? days : [day.getDay()];
  };

  const commit = async () => {
    if (!pending || !user) return;
    const ev = pending.event;
    const base = {
      item_key: ev.itemKey!,
      start_time: hhmm(pending.start),
      duration_min: ev.end ? Math.round((ev.end.getTime() - ev.start.getTime()) / MIN) : null,
    };
    const items =
      moveScope === 'date'
        ? [{ ...base, scope: 'date' as const, day: key, weekday: null }]
        : (moveScope === 'weekday' ? [day.getDay()] : await itemWeekdays(ev)).map((wd) => ({ ...base, scope: 'weekday' as const, day: null, weekday: wd }));
    const ok = await savePlacements(user.id, items);
    setPending(null);
    if (!ok) toast.error('לא נשמר, נסו שוב');
    await cal.reload();
  };

  // ── Swipe between days (not while dragging) ──
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const goDay = (n: number) => navigate(`/app/calendar/day/${format(addDays(day, n), 'yyyy-MM-dd')}`, { replace: true });

  const lockedTap = (e: CalEvent) =>
    toast(e.title, {
      description: 'השעה הזו נקבעת לפי שעות השינה שלך. אפשר לשנות בהגדרות',
      action: { label: 'להגדרות', onClick: () => navigate('/app/settings') },
    });

  const iconFor = (e: CalEvent) => (e.source === 'workout' ? Dumbbell : e.source === 'walk' ? Footprints : e.type === 'meal' ? Utensils : null);

  return (
    <div className="min-h-screen pb-24">
      {/* Header stays put; the axis scrolls under it */}
      <div className="sticky z-30 border-b border-line bg-background px-4 pb-3 pt-3" style={{ top: 'calc(3.5rem + var(--app-safe-top))' }}>
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => goDay(-1)} aria-label="היום הקודם" className="inline-flex h-11 w-11 items-center justify-center rounded-pill bg-card-inner">
            <ChevronRight className="h-5 w-5" strokeWidth={2} />
          </button>
          <button type="button" onClick={() => navigate('/app/calendar')} className="min-w-0 flex-1 text-center">
            <p className="text-card-title">יום {WEEKDAY_NAME[day.getDay()]}</p>
            <p className="text-label text-muted-foreground">{format(day, 'd בMMMM', { locale: he })}{isToday(day) ? ' · היום' : ''}</p>
          </button>
          <button type="button" onClick={() => goDay(1)} aria-label="היום הבא" className="inline-flex h-11 w-11 items-center justify-center rounded-pill bg-card-inner">
            <ChevronLeft className="h-5 w-5" strokeWidth={2} />
          </button>
          <button type="button" onClick={() => setEditor({ open: true, event: null })} aria-label="הוספת אירוע" className="inline-flex h-11 w-11 items-center justify-center rounded-pill bg-primary text-primary-foreground">
            <Plus className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
      </div>

      {cal.isLoading ? (
        <div className="space-y-3 px-4 pt-4">
          <Skeleton className="h-[600px] rounded-card" />
        </div>
      ) : (
        <div
          className="relative mx-4 mt-4"
          style={{ height: totalMin * PX_PER_MIN + 24, touchAction: drag ? 'none' : 'pan-y' }}
          onTouchStart={(e) => (swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
          onTouchEnd={(e) => {
            const s = swipe.current;
            swipe.current = null;
            if (!s || drag) return;
            const dx = e.changedTouches[0].clientX - s.x;
            const dy = e.changedTouches[0].clientY - s.y;
            if (Math.abs(dx) > 70 && Math.abs(dy) < 40) goDay(dx > 0 ? 1 : -1); // RTL: a swipe to the right goes forward
          }}
        >
          {/* Half-hour rows with hour labels */}
          {Array.from({ length: Math.floor(totalMin / 30) + 1 }, (_, i) => {
            const t = new Date(axisStart.getTime() + i * 30 * MIN);
            return (
              <div key={i} className="absolute inset-x-0 flex items-start gap-2" style={{ top: i * 30 * PX_PER_MIN }}>
                <span className="w-11 shrink-0 -translate-y-2 text-[11px] tabular-nums text-muted-foreground" dir="ltr">
                  {t.getMinutes() === 0 ? hhmm(t) : ''}
                </span>
                <span className={cn('h-px flex-1', t.getMinutes() === 0 ? 'bg-line' : 'bg-line/50')} />
              </div>
            );
          })}

          {/* Hours without eating (before the kitchen opens, after it closes) sit a shade darker;
              a thin green strip beside the axis marks the eating window. */}
          {eatStart && (
            <div aria-hidden className="pointer-events-none absolute left-0 top-0 bg-black/[0.06] dark:bg-black/25" style={{ right: 52, height: yOf(eatStart) }} />
          )}
          {eatStop && (
            <div aria-hidden className="pointer-events-none absolute bottom-0 left-0 bg-black/[0.06] dark:bg-black/25" style={{ right: 52, top: yOf(eatStop) }} />
          )}
          {eatStart && eatStop && (
            <div
              aria-label="חלון האכילה"
              className="pointer-events-none absolute w-[3px] rounded-pill bg-success/30"
              style={{ right: 47, top: yOf(eatStart), height: yOf(eatStop) - yOf(eatStart) }}
            />
          )}

          {/* Blocks */}
          <div className="absolute bottom-0 left-0 top-0" style={{ right: 52 }}>
            {blocks.map((e) => {
              const pos = layout.get(e.key);
              if (!pos || pos.hidden) return null;
              const dragging = drag?.event.key === e.key;
              // While dragged, and while the "today / every day" sheet is open, it sits at the new time.
              const start = dragging ? drag!.start : pending?.event.key === e.key ? pending.start : e.start;
              const len = (e.end!.getTime() - e.start.getTime()) / MIN;
              const Icon = iconFor(e);
              const width = 100 / pos.cols;
              return (
                <div
                  key={e.key}
                  onPointerDown={(p) => onPointerDown(p, e)}
                  onContextMenu={(p) => p.preventDefault()}
                  className={cn(
                    'absolute select-none overflow-hidden rounded-inner border px-2 py-1 text-right',
                    e.source === 'workout' ? 'border-primary/50 bg-primary-tint' : e.source === 'walk' ? 'border-success/40 bg-success/10' : 'border-line bg-surface-raised',
                    dragging && 'z-30 scale-[1.03] shadow-[0_8px_24px_rgba(0,0,0,0.5)]',
                  )}
                  style={{
                    top: yOf(start),
                    height: Math.max(len * PX_PER_MIN - 2, 26),
                    right: `${pos.col * width}%`,
                    width: `calc(${width}% - 4px)`,
                    touchAction: dragging ? 'none' : 'pan-y',
                    WebkitTouchCallout: 'none',
                  }}
                >
                  <p className="flex items-center gap-1 truncate text-label font-semibold">
                    {Icon && <Icon className={cn('shrink-0', e.size === 'small' ? 'h-3 w-3' : 'h-3.5 w-3.5')} strokeWidth={2} aria-hidden />}
                    {e.title}
                  </p>
                  {len >= 25 && (
                    <p className="text-[11px] tabular-nums text-muted-foreground" dir="ltr">
                      {hhmm(start)}–{hhmm(new Date(start.getTime() + len * MIN))}
                    </p>
                  )}
                  {pos.more > 0 && (
                    <span className="absolute bottom-1 left-1 rounded-pill bg-card-inner px-1.5 text-[11px] font-bold">+{pos.more}</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Points in time: a thin line across, above the blocks, with a locked label */}
          {points.map((e) => (
            <div key={e.key} className="pointer-events-none absolute inset-x-0 z-20" style={{ top: yOf(e.start) }}>
              <div className={cn('h-px', eatStyle(e)?.line ?? 'bg-muted-foreground/60')} style={{ marginRight: 52 }} />
              <button
                type="button"
                onClick={() => lockedTap(e)}
                // On the left: block titles are right-aligned, so the label never hides one.
                className={cn(
                  'pointer-events-auto absolute -top-3 left-0 inline-flex h-6 items-center gap-1 rounded-pill px-1.5 text-[11px]',
                  eatStyle(e) ? cn(eatStyle(e)!.card, eatStyle(e)!.tint) : 'bg-background text-muted-foreground',
                )}
              >
                <Lock className="h-3 w-3" strokeWidth={2} aria-hidden />
                {e.title} <span dir="ltr" className="tabular-nums">{hhmm(e.start)}</span>
              </button>
            </div>
          ))}

          {/* Now */}
          {isToday(day) && now > axisStart.getTime() && now < axisEnd.getTime() && (
            <div className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-primary" style={{ top: yOf(new Date(now)) }} aria-hidden />
          )}

          {/* While dragging: the new time */}
          {drag && (
            <div
              className="pointer-events-none absolute left-0 z-40 rounded-pill bg-primary px-2 py-0.5 text-label font-bold text-primary-foreground tabular-nums"
              style={{ top: yOf(drag.start) - 28 }}
              dir="ltr"
            >
              {hhmm(drag.start)}–{hhmm(new Date(drag.start.getTime() + (drag.event.end!.getTime() - drag.event.start.getTime())))}
            </div>
          )}
        </div>
      )}

      {/* A recurring item was moved: today only, or every <weekday>? */}
      <BottomSheet open={!!pending} onOpenChange={(o) => !o && setPending(null)} title={pending ? `להזיז את ${pending.event.title} ל-${hhmm(pending.start)}?` : ''}>
        <div role="radiogroup" aria-label="מתי" className="mb-5 divide-y divide-border rounded-inner bg-card-inner">
          {([
            { v: 'date', label: `רק היום (יום ${WEEKDAY_NAME[day.getDay()]} ${format(day, 'd/M')})` },
            { v: 'weekday', label: `כל יום ${WEEKDAY_NAME[day.getDay()]}` },
            {
              v: 'all',
              label:
                pending?.event.source === 'workout' ? 'בכל ימי האימון' : pending?.event.source === 'walk' ? 'בכל ימי ההליכה' : 'כל יום',
            },
          ] as const).map((o) => (
            <button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={moveScope === o.v}
              onClick={() => setMoveScope(o.v)}
              className="flex min-h-[52px] w-full items-center gap-3 px-4 text-right text-body"
            >
              <span
                aria-hidden
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                  moveScope === o.v ? 'border-primary' : 'border-muted-foreground/50',
                )}
              >
                {moveScope === o.v && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
              </span>
              {o.label}
            </button>
          ))}
        </div>
        <p className="-mt-3 mb-4 text-label text-muted-foreground">שינוי קבוע חל מהיום והלאה. ימים שהוזזו בנפרד לא משתנים.</p>
        <PrimaryButton onClick={commit}>הזז</PrimaryButton>
        <button type="button" onClick={() => setPending(null)} className="mt-1 min-h-[44px] w-full text-label font-semibold text-muted-foreground">
          ביטול
        </button>
      </BottomSheet>

      <EventEditor
        open={editor.open}
        onOpenChange={(open) => setEditor((s) => ({ ...s, open }))}
        event={editor.event}
        defaultDate={day}
        actions={cal}
      />
    </div>
  );
}
