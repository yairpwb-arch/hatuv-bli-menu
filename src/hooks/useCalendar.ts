import { useCallback, useEffect, useState } from 'react';
import { addDays, format, startOfDay } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { fetchSleepSchedule } from '@/hooks/useSleepSchedule';
import { fetchHabitSchedule } from '@/hooks/useHabitSchedule';
import { planDay, programDay } from '@/lib/habitSchedule';
import { fetchPlacements, placementFor, savePlacements } from '@/hooks/usePlacements';
import { toMinutes } from '@/lib/sleepSchedule';
import { bedtimeOf, scheduleOn, sleepEventKey, wakeEventKey, wakeOf } from '@/lib/sleepSchedule';

/** 'wake' is only the generated wake-up moment; it's not offered in the editor. */
/** 'wake' / 'eat_start' / 'eat_stop' are generated moments; they're not offered in the editor. */
export type EventType = 'walk' | 'workout' | 'meal' | 'sleep' | 'wake' | 'eat_start' | 'eat_stop' | 'other';

export interface CalEvent {
  /** Stable key: the row id for custom events, "<source>:<yyyy-MM-dd>" for recurring ones. */
  key: string;
  /** 'habit' = a timed habit (eating window, meal layout), worked out at display time. */
  source: 'custom' | 'walk' | 'workout' | 'sleep' | 'habit';
  /** yyyy-MM-dd the event belongs to, when it differs from start (a 00:30 bedtime is the evening before). */
  day?: string;
  /** calendar_events.id — only for custom events. */
  id?: string;
  type: EventType;
  title: string;
  start: Date;
  end?: Date;
  /** Recurring walks/workouts have a day but no set time. */
  hasTime: boolean;
  done: boolean;
  notes?: string | null;
  /** Shown but never ticked (sleep hours, timed habits). */
  readOnly?: boolean;
  /** Meal size in the meal layout (drives the icon size). */
  size?: 'big' | 'small';
  /** A meal marked "לא חובה". */
  optional?: boolean;
  /** Short "why" from the habit, shown on tap. */
  explanation?: string | null;
  /** Placement key of a movable recurring item ("workout:<id>", "walk", "meal:<key>"). */
  itemKey?: string;
  /** The trainee set this time (dragged / Settings) — never moved automatically. */
  pinned?: boolean;
  /** An occurrence of a repeating custom event: its series row and the day it's on. */
  seriesId?: string;
  occurrenceDay?: string;
  repeat?: Repeat;
}

/** How a custom event repeats. */
export interface Repeat {
  rule: 'daily' | 'weekly';
  /** weekly: 0 = Sunday … 6 = Saturday */
  days: number[];
  /** Last day (yyyy-MM-dd), or null for no end. */
  until: string | null;
}

/** "Only this one" or "this one and all after it" — for edits and deletes of a repeating event. */
export type SeriesScope = 'one' | 'following';

/** A point in time (a line on the day view), not a block. */
export const isPointEvent = (e: CalEvent) =>
  e.source === 'sleep' || (e.source === 'habit' && (e.type === 'eat_start' || e.type === 'eat_stop'));

/** The day an event is listed under. */
export const eventDay = (e: CalEvent) => e.day ?? format(e.start, 'yyyy-MM-dd');

/**
 * Within a day, by time (wake-up → start eating → … → stop eating → bedtime
 * follows from the times themselves). At the same minute: a point in time,
 * then workout/walk, then a meal, then anything else.
 */
const sameTimeRank = (e: CalEvent) =>
  isPointEvent(e) ? 0 : e.source === 'workout' || e.source === 'walk' ? 1 : e.type === 'meal' ? 2 : 3;
export function compareEvents(a: CalEvent, b: CalEvent): number {
  const da = eventDay(a);
  const db_ = eventDay(b);
  if (da !== db_) return da < db_ ? -1 : 1;
  return Number(a.hasTime) - Number(b.hasTime) || a.start.getTime() - b.start.getTime() || sameTimeRank(a) - sameTimeRank(b);
}

export const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: 'walk', label: 'הליכה' },
  { value: 'workout', label: 'אימון' },
  { value: 'meal', label: 'ארוחה' },
  { value: 'sleep', label: 'שינה' },
  { value: 'other', label: 'אחר' },
];

/** Token classes per event type (dot / chip). */
export const EVENT_COLORS: Record<EventType, { dot: string; chip: string }> = {
  workout: { dot: 'bg-primary', chip: 'bg-primary-tint text-primary-soft' },
  walk: { dot: 'bg-success', chip: 'bg-success/10 text-success' },
  meal: { dot: 'bg-primary-soft', chip: 'bg-card-inner text-primary-soft' },
  sleep: { dot: 'bg-muted-foreground', chip: 'bg-card-inner text-muted-foreground' },
  wake: { dot: 'bg-primary-soft', chip: 'bg-card-inner text-primary-soft' },
  eat_start: { dot: 'bg-muted-foreground', chip: 'bg-card-inner text-muted-foreground' },
  eat_stop: { dot: 'bg-muted-foreground', chip: 'bg-card-inner text-muted-foreground' },
  other: { dot: 'bg-foreground', chip: 'bg-card-inner text-foreground' },
};

export interface EventInput {
  type: EventType;
  title: string;
  starts_at: string;
  ends_at?: string | null;
  notes?: string | null;
  repeat_rule?: 'daily' | 'weekly' | null;
  repeat_days?: number[] | null;
  repeat_until?: string | null;
}

// calendar_events / workout_day_schedule aren't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');

/**
 * Everything on the trainee's calendar between two days (inclusive):
 * their own events plus the recurring walks and workouts from their plan.
 */
export function useCalendar(userId: string | undefined, from: Date, to: Date) {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const fromKey = dayKey(from);
  const toKey = dayKey(to);

  const load = useCallback(async () => {
    if (!userId) return;
    const start = startOfDay(new Date(`${fromKey}T00:00:00`));
    const endExclusive = addDays(new Date(`${toKey}T00:00:00`), 1);

    const [customRes, seriesRes, workoutRes, walkRes, walkScheduleRes, logRes, sessionRes, sleep, timed, placed] = await Promise.all([
      db
        .from('calendar_events')
        .select('*')
        .eq('user_id', userId)
        .gte('starts_at', start.toISOString())
        .lt('starts_at', endExclusive.toISOString())
        .order('starts_at', { ascending: true }),
      // Repeating series that started before the range ends (expanded per day below).
      db
        .from('calendar_events')
        .select('id, type, title, starts_at, ends_at, notes, repeat_rule, repeat_days, repeat_until, excluded_days')
        .eq('user_id', userId)
        .not('repeat_rule', 'is', null)
        .lt('starts_at', endExclusive.toISOString()),
      db.from('workout_day_schedule').select('weekday, plan_day_id, workout_plan_days(name)').eq('user_id', userId),
      supabase
        .from('user_activity_schedule')
        .select('day_of_week, activity_type')
        .eq('user_id', userId)
        .eq('is_active', true)
        .eq('activity_type', 'walk'),
      // The workouts screen's walk days (the newer per-walk schedule).
      db
        .from('user_walking_schedule')
        .select('day_of_week')
        .eq('user_id', userId)
        .eq('is_active', true)
        .not('day_of_week', 'is', null),
      supabase
        .from('activity_log')
        .select('activity_type, completed_at')
        .eq('user_id', userId)
        .gte('completed_at', fromKey)
        .lte('completed_at', toKey),
      // Workouts finished in the workout player count as done too.
      db
        .from('workout_session_logs')
        .select('completed_at')
        .eq('user_id', userId)
        .gte('completed_at', start.toISOString())
        .lt('completed_at', endExclusive.toISOString()),
      fetchSleepSchedule(userId),
      fetchHabitSchedule(userId),
      fetchPlacements(userId),
    ]);

    const doneSet = new Set((logRes.data || []).map((l) => `${l.activity_type}:${l.completed_at}`));
    for (const s of (sessionRes.data || []) as { completed_at: string }[]) {
      doneSet.add(`workout:${dayKey(new Date(s.completed_at))}`);
    }
    const list: CalEvent[] = [];

    for (const e of customRes.data || []) {
      if (e.repeat_rule) continue; // a series' first day comes from the expansion below
      list.push({
        key: e.id,
        id: e.id,
        source: 'custom',
        type: e.type,
        title: e.title,
        start: new Date(e.starts_at),
        end: e.ends_at ? new Date(e.ends_at) : undefined,
        hasTime: true,
        done: !!e.done_at,
        notes: e.notes,
      });
    }

    // Repeating custom events: one occurrence per matching day, minus the days taken out.
    type SeriesRow = {
      id: string; type: EventType; title: string; starts_at: string; ends_at: string | null; notes: string | null;
      repeat_rule: 'daily' | 'weekly'; repeat_days: number[] | null; repeat_until: string | null; excluded_days: string[] | null;
    };
    for (const r of (seriesRes.data || []) as SeriesRow[]) {
      if (r.repeat_rule !== 'daily' && r.repeat_rule !== 'weekly') continue;
      const first = new Date(r.starts_at);
      const firstDay = dayKey(first);
      const len = r.ends_at ? new Date(r.ends_at).getTime() - first.getTime() : 0;
      const skip = new Set(r.excluded_days ?? []);
      for (let d = start; d < endExclusive; d = addDays(d, 1)) {
        const dk = dayKey(d);
        if (dk < firstDay || (r.repeat_until && dk > r.repeat_until) || skip.has(dk)) continue;
        if (r.repeat_rule === 'weekly' && !(r.repeat_days ?? []).includes(d.getDay())) continue;
        const s0 = new Date(d.getFullYear(), d.getMonth(), d.getDate(), first.getHours(), first.getMinutes());
        list.push({
          key: `${r.id}:${dk}`,
          id: r.id,
          source: 'custom',
          type: r.type,
          title: r.title,
          start: s0,
          end: len ? new Date(s0.getTime() + len) : undefined,
          hasTime: true,
          done: false,
          notes: r.notes,
          seriesId: r.id,
          occurrenceDay: dk,
          repeat: { rule: r.repeat_rule, days: r.repeat_days ?? [], until: r.repeat_until },
        });
      }
    }

    const workouts = (workoutRes.data || []) as { weekday: number; plan_day_id: string; workout_plan_days: { name: string } | null }[];
    const walkDays = new Set<number>([
      ...(walkRes.data || []).map((w) => w.day_of_week),
      ...((walkScheduleRes.data || []) as { day_of_week: number }[]).map((w) => w.day_of_week),
    ]);
    const MIN = 60_000;
    const at = (d: Date, hhmm: string, wakeMin: number) => {
      // Clock times before the wake-up hour belong to the night after this day.
      const t = toMinutes(hhmm);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (t < wakeMin ? 1 : 0), Math.floor(t / 60), t % 60);
    };
    const roundDown15 = (x: Date) => new Date(Math.floor(x.getTime() / (15 * MIN)) * 15 * MIN);

    for (let d = start; d < endExclusive; d = addDays(d, 1)) {
      const key = dayKey(d);
      const wd = d.getDay();
      // Past days keep the hours they had before a change in Settings.
      const hours = scheduleOn(userId, key, sleep);
      const wakeMin = toMinutes(hours.wake);
      const placementOf = (itemKey: string) => placementFor(placed.list, itemKey, key, wd);

      // ── Timed habits: eating window and meals ──
      const plan = timed.startDate
        ? planDay(d, programDay(timed.startDate, d), hours, timed.habits, timed.mealTimes)
        : { moments: [], noWindow: false };
      const habitEvents: CalEvent[] = plan.moments.map((m) => {
        const itemKey = m.meal ? `meal:${m.meal.key}` : undefined;
        const pl = itemKey ? placementOf(itemKey) : null;
        const startAt = pl ? at(d, pl.start_time, wakeMin) : m.at;
        const minutes = m.meal ? pl?.duration_min ?? (m.meal.size === 'big' ? 30 : 15) : 0;
        return {
          key: `habit:${key}:${m.habitId}:${m.meal?.key ?? m.kind}:${format(startAt, 'HH:mm')}`,
          source: 'habit' as const,
          type: (m.kind === 'meal' ? 'meal' : m.kind) as EventType,
          // The eating window says what it means, not only by colour.
          title: m.kind === 'eat_start' ? `${m.label} · המטבח נפתח` : m.kind === 'eat_stop' ? `${m.label} · המטבח נסגר` : m.label,
          start: startAt,
          end: m.meal ? new Date(startAt.getTime() + minutes * MIN) : undefined,
          day: key,
          hasTime: true,
          done: false,
          readOnly: true,
          size: m.meal?.size,
          optional: m.meal?.optional,
          explanation: m.explanation,
          itemKey,
          pinned: !!pl || (!!m.meal && !!timed.mealTimes[m.meal.key]),
        };
      });

      // ── Workouts and the walk: the trainee's time, else placed before dinner ──
      const dayWorkouts = workouts.filter((x) => x.weekday === wd);
      const hasWalk = walkDays.has(wd);
      const dinner = habitEvents.find((e) => e.itemKey === 'meal:dinner');
      const stop = habitEvents.find((e) => e.type === 'eat_stop');
      const eatStart = habitEvents.find((e) => e.type === 'eat_start');
      const WORKOUT_MIN = 60;
      const WALK_MIN = 30;
      // Without a meal layout: an hour and a half before "stop eating", else 18:00.
      const fallbackStart = stop ? new Date(stop.start.getTime() - 90 * MIN) : at(d, '18:00', wakeMin);

      const activity: CalEvent[] = [];
      let walkStart: Date | null = null;
      if (hasWalk) {
        const pl = placementOf('walk');
        const minutes = pl?.duration_min ?? WALK_MIN;
        const s0 = pl
          ? at(d, pl.start_time, wakeMin)
          : dinner
          ? new Date(dinner.start.getTime() - (15 + minutes) * MIN)
          : new Date(fallbackStart.getTime() + (dayWorkouts.length ? WORKOUT_MIN * MIN * dayWorkouts.length : 0));
        walkStart = pl ? null : s0;
        activity.push({
          key: `walk:${key}`, source: 'walk', type: 'walk', title: 'הליכה', start: s0, end: new Date(s0.getTime() + minutes * MIN),
          day: key, hasTime: true, done: doneSet.has(`walk:${key}`), itemKey: 'walk', pinned: !!pl,
        });
      }
      // Workouts end where the walk starts (or 30 min before dinner), stacked back from there.
      let cursorEnd = walkStart ?? (dinner ? new Date(dinner.start.getTime() - 30 * MIN) : null);
      dayWorkouts.forEach((w, i) => {
        const itemKey = `workout:${w.plan_day_id}`;
        const pl = placementOf(itemKey);
        const minutes = pl?.duration_min ?? WORKOUT_MIN;
        let s0: Date;
        if (pl) s0 = at(d, pl.start_time, wakeMin);
        else if (cursorEnd) {
          s0 = new Date(cursorEnd.getTime() - minutes * MIN);
          cursorEnd = s0;
        } else s0 = new Date(fallbackStart.getTime() + i * WORKOUT_MIN * MIN);
        activity.push({
          key: `workout:${key}${i ? `:${i}` : ''}`, source: 'workout', type: 'workout',
          // The plan day's own name ("אימון חזה"); the dumbbell icon already says it's a workout.
          title: w.workout_plan_days?.name || 'אימון',
          start: s0, end: new Date(s0.getTime() + minutes * MIN), day: key, hasTime: true,
          done: doneSet.has(`workout:${key}`), itemKey, pinned: !!pl,
        });
      });

      // A meal the trainee didn't set that clashes with a workout/walk moves earlier — the workout stays.
      for (const meal of habitEvents) {
        if (meal.type !== 'meal' || meal.pinned || meal.itemKey === 'meal:dinner' || !meal.end) continue;
        const clash = activity.filter((a) => a.end && a.start < meal.end! && a.end > meal.start);
        if (clash.length === 0) continue;
        const firstStart = Math.min(...clash.map((a) => a.start.getTime()));
        const lastEnd = Math.max(...clash.map((a) => a.end!.getTime()));
        const len = meal.end.getTime() - meal.start.getTime();
        // Earlier if that stays inside the eating window, else right after; if neither fits, it may overlap.
        const earlier = roundDown15(new Date(firstStart - len));
        const later = new Date(lastEnd);
        const insideWindow = (s0: Date) =>
          (!eatStart || s0 >= eatStart.start) && (!stop || s0.getTime() + len <= stop.start.getTime());
        const moved = insideWindow(earlier) ? earlier : insideWindow(later) ? later : null;
        if (!moved) continue;
        meal.start = moved;
        meal.end = new Date(moved.getTime() + len);
      }

      list.push(...habitEvents, ...activity);
      list.push(
        { key: wakeEventKey(key, hours), source: 'sleep', type: 'wake', title: 'קימה', start: wakeOf(d, hours), day: key, hasTime: true, done: false, readOnly: true },
        { key: sleepEventKey(key, hours), source: 'sleep', type: 'sleep', title: 'שינה', start: bedtimeOf(d, hours), day: key, hasTime: true, done: false, readOnly: true },
      );
    }

    list.sort(compareEvents);
    setEvents(list);
    setIsLoading(false);
  }, [userId, fromKey, toKey]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (input: EventInput) => {
    const { error } = await db.from('calendar_events').insert({ ...input, user_id: userId });
    if (!error) await load();
    return !error;
  };

  const update = async (id: string, input: Partial<EventInput>) => {
    const { error } = await db
      .from('calendar_events')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) await load();
    return !error;
  };

  const remove = async (id: string) => {
    const { error } = await db.from('calendar_events').delete().eq('id', id);
    if (!error) await load();
    return !error;
  };

  const dayBefore = (day: string) => dayKey(addDays(new Date(`${day}T12:00:00`), -1));
  const series = (id: string) => db.from('calendar_events').select('excluded_days, starts_at').eq('id', id).single();
  /** Takes one day out of a series (it's replaced by a one-off copy, or just removed). */
  const exclude = async (id: string, day: string) => {
    const { data } = await series(id);
    return db.from('calendar_events').update({ excluded_days: [...(data?.excluded_days ?? []), day] }).eq('id', id);
  };

  /**
   * Creates or edits a custom event. For an occurrence of a repeating event:
   * "one" replaces just that day with a one-off copy; "following" ends the
   * series the day before and starts a new one from that day.
   */
  const saveEvent = async (existing: CalEvent | null, input: EventInput, scope: SeriesScope = 'one') => {
    let error: { message: string } | null = null;
    if (!existing) {
      ({ error } = await db.from('calendar_events').insert({ ...input, user_id: userId }));
    } else if (!existing.seriesId) {
      ({ error } = await db.from('calendar_events').update({ ...input, updated_at: new Date().toISOString() }).eq('id', existing.id));
    } else if (scope === 'one') {
      ({ error } = await exclude(existing.seriesId, existing.occurrenceDay!));
      if (!error) {
        ({ error } = await db.from('calendar_events').insert({
          ...input, repeat_rule: null, repeat_days: null, repeat_until: null,
          user_id: userId, parent_id: existing.seriesId, original_day: existing.occurrenceDay,
        }));
      }
    } else {
      const { data } = await series(existing.seriesId);
      const startsHere = data && dayKey(new Date(data.starts_at)) === existing.occurrenceDay;
      if (startsHere) {
        ({ error } = await db.from('calendar_events').update({ ...input, updated_at: new Date().toISOString() }).eq('id', existing.seriesId));
      } else {
        ({ error } = await db.from('calendar_events').update({ repeat_until: dayBefore(existing.occurrenceDay!) }).eq('id', existing.seriesId));
        if (!error) ({ error } = await db.from('calendar_events').insert({ ...input, user_id: userId }));
      }
    }
    if (error) console.error('[calendar] save failed:', error.message);
    else await load();
    return !error;
  };

  /** Deletes a custom event; for a repeating one, just this day or this day and everything after. */
  const deleteEvent = async (event: CalEvent, scope: SeriesScope = 'one') => {
    let error: { message: string } | null = null;
    if (!event.seriesId) {
      ({ error } = await db.from('calendar_events').delete().eq('id', event.id));
    } else if (scope === 'one') {
      ({ error } = await exclude(event.seriesId, event.occurrenceDay!));
    } else {
      const { data } = await series(event.seriesId);
      ({ error } =
        data && dayKey(new Date(data.starts_at)) === event.occurrenceDay
          ? await db.from('calendar_events').delete().eq('id', event.seriesId)
          : await db.from('calendar_events').update({ repeat_until: dayBefore(event.occurrenceDay!) }).eq('id', event.seriesId));
    }
    if (error) console.error('[calendar] delete failed:', error.message);
    else await load();
    return !error;
  };

  /**
   * A walk / workout that repeats belongs to the training plan, so the
   * workouts page and the calendar share one list: walk days go to
   * user_walking_schedule, a workout to its weekday in workout_day_schedule.
   * The chosen time becomes that weekday's fixed time.
   */
  const addPlanRepeat = async (kind: 'walk' | 'workout', weekdays: number[], time: string, minutes: number, planDayId?: string) => {
    if (!userId) return false;
    if (kind === 'workout') {
      if (!planDayId || weekdays.length !== 1) return false;
      const { error } = await db
        .from('workout_day_schedule')
        .upsert({ user_id: userId, plan_day_id: planDayId, weekday: weekdays[0] }, { onConflict: 'user_id,plan_day_id' });
      if (error) return false;
    } else {
      const { data } = await db.from('user_walking_schedule').select('walk_number, day_of_week, is_active').eq('user_id', userId);
      const rows = (data ?? []) as { walk_number: number; day_of_week: number | null; is_active: boolean }[];
      const have = new Set(rows.filter((r) => r.is_active && r.day_of_week != null).map((r) => r.day_of_week));
      let next = Math.max(0, ...rows.map((r) => r.walk_number)) + 1;
      for (const wd of weekdays.filter((d) => !have.has(d))) {
        if (next > 7) break;
        const { error } = await db
          .from('user_walking_schedule')
          .insert({ user_id: userId, walk_number: next++, week_start: 1, day_of_week: wd, is_active: true });
        if (error) return false;
      }
    }
    const itemKey = kind === 'walk' ? 'walk' : `workout:${planDayId}`;
    await savePlacements(userId, weekdays.map((wd) => ({ item_key: itemKey, scope: 'weekday' as const, day: null, weekday: wd, start_time: time, duration_min: minutes || null })));
    await load();
    return true;
  };

  /** Ticks an event as done (recurring ones go to activity_log, like before). */
  const markDone = async (event: CalEvent) => {
    if (event.seriesId) {
      // One occurrence of a repeating event: it becomes its own (done) copy for that day.
      const len = event.end ? event.end.getTime() - event.start.getTime() : 0;
      const ok = await saveEvent(event, {
        type: event.type, title: event.title, notes: event.notes ?? null,
        starts_at: event.start.toISOString(), ends_at: len ? new Date(event.start.getTime() + len).toISOString() : null,
      }, 'one');
      if (ok) {
        const { data } = await db.from('calendar_events').select('id').eq('parent_id', event.seriesId).eq('original_day', event.occurrenceDay).maybeSingle();
        if (data) await db.from('calendar_events').update({ done_at: new Date().toISOString() }).eq('id', data.id);
        await load();
      }
      return ok;
    }
    const { error } =
      event.source === 'custom'
        ? await db.from('calendar_events').update({ done_at: new Date().toISOString() }).eq('id', event.id)
        : await supabase
            .from('activity_log')
            .insert({ user_id: userId!, activity_type: event.source, completed_at: dayKey(event.start) });
    if (!error) {
      setEvents((prev) => prev.map((e) => (e.key === event.key ? { ...e, done: true } : e)));
    }
    return !error;
  };

  /** Takes a "done" back (custom: clears done_at; walk/workout: removes that day's tick). */
  const unmarkDone = async (event: CalEvent) => {
    const { error } =
      event.source === 'custom'
        ? await db.from('calendar_events').update({ done_at: null }).eq('id', event.id)
        : await supabase
            .from('activity_log')
            .delete()
            .eq('user_id', userId!)
            .eq('activity_type', event.source)
            .eq('completed_at', dayKey(event.start));
    if (!error) {
      setEvents((prev) => prev.map((e) => (e.key === event.key ? { ...e, done: false } : e)));
    }
    return !error;
  };

  return { events, isLoading, reload: load, create, update, remove, saveEvent, deleteEvent, addPlanRepeat, markDone, unmarkDone };
}
