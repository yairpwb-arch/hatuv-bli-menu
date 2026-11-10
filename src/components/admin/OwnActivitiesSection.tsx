import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { CalendarClock, Dumbbell, Footprints, Repeat, UserRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ActivityKind, kindInfo } from '@/lib/activityKinds';
import { cn } from '@/lib/utils';

// activities / calendar_events / my_workouts aren't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const SOURCE: Record<string, string> = { manual: 'ידני', gps: 'GPS', player: 'בנגן האימונים', watch: 'מהשעון', health: 'מהשעון' };
const INTENSITY: Record<string, string> = { easy: 'קל', medium: 'בינוני', hard: 'קשה' };

interface Planned {
  id: string;
  type: 'walk' | 'workout' | string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  repeat_rule: string | null;
  repeat_days: number[] | null;
  repeat_until: string | null;
  my_workout_id?: string | null;
}

interface Logged {
  id: string;
  kind: ActivityKind;
  custom_name: string | null;
  started_at: string;
  duration_min: number | null;
  distance_m: number | null;
  intensity: string | null;
  note: string | null;
  source: string | null;
  session_id: string | null;
}

/**
 * What the trainee added on their own, apart from the coach's plan: what they
 * planned in the calendar (once or on fixed days, incl. workouts they built),
 * and everything they logged (runs, their own walks and workouts, other sports).
 * In blue, so it's told apart from the plan (orange) and the plan's walks (green).
 */
export function OwnActivitiesSection({ userId }: { userId: string }) {
  const [planned, setPlanned] = useState<Planned[]>([]);
  const [logged, setLogged] = useState<Logged[]>([]);
  const [workouts, setWorkouts] = useState<Map<string, { name: string; count: number }>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let gone = false;
    setLoading(true);
    (async () => {
      const now = new Date().toISOString();
      const [ev, acts, mine] = await Promise.all([
        db.from('calendar_events').select('*').eq('user_id', userId).in('type', ['walk', 'workout']).is('parent_id', null).order('starts_at', { ascending: true }),
        db.from('activities').select('id, kind, custom_name, started_at, duration_min, distance_m, intensity, note, source, session_id')
          .eq('user_id', userId).eq('status', 'done').order('started_at', { ascending: false }).limit(40),
        db.from('my_workouts').select('id, name, my_workout_exercises(id)').eq('user_id', userId),
      ]);
      if (gone) return;
      const all = (ev.data ?? []) as Planned[];
      // Still ahead: a series without an end (or not ended yet), or a one-off from now on.
      setPlanned(all.filter((e) => (e.repeat_rule ? !e.repeat_until || e.repeat_until >= now.slice(0, 10) : e.starts_at >= now)));
      setLogged((acts.data ?? []) as Logged[]);
      setWorkouts(new Map(((Array.isArray(mine.data) ? mine.data : []) as { id: string; name: string; my_workout_exercises: unknown[] }[]).map((w) => [w.id, { name: w.name, count: w.my_workout_exercises?.length ?? 0 }])));
      setLoading(false);
    })();
    return () => {
      gone = true;
    };
  }, [userId]);

  if (loading) return null;

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <UserRound className="h-4 w-4 text-sky-500" />
        מה המתאמן הוסיף בעצמו
        <span className="mr-auto text-xs font-normal text-muted-foreground">{planned.length} מתוכננים · {logged.length} פעילויות</span>
      </p>

      {planned.length === 0 && logged.length === 0 && (
        <p className="py-3 text-center text-sm text-muted-foreground">המתאמן עוד לא הוסיף פעילות משלו</p>
      )}

      {/* In the calendar: on fixed days or a one-off ahead */}
      {planned.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">ביומן שלו</p>
          {planned.map((e) => {
            const walk = e.type === 'walk';
            const Icon = walk ? Footprints : Dumbbell;
            const start = new Date(e.starts_at);
            const minutes = e.ends_at ? Math.round((new Date(e.ends_at).getTime() - start.getTime()) / 60_000) : null;
            const built = e.my_workout_id ? workouts.get(e.my_workout_id) : null;
            return (
              <div key={e.id} className="flex items-center gap-2.5 rounded-xl border border-sky-500/30 bg-sky-500/5 px-3 py-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/15">
                  <Icon className="h-3.5 w-3.5 text-sky-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {e.title}
                    {built && <span className="font-normal text-muted-foreground"> · אימון שבנה ({built.count} תרגילים)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {e.repeat_rule
                      ? `כל ${e.repeat_rule === 'daily' ? 'יום' : (e.repeat_days ?? []).map((d) => WEEKDAYS[d]).join(' ')} · ${format(start, 'HH:mm')}`
                      : format(start, 'EEEE d/M · HH:mm', { locale: he })}
                    {minutes ? ` · ${minutes} דק'` : ''}
                    {e.repeat_rule ? (e.repeat_until ? ` · עד ${format(new Date(`${e.repeat_until}T12:00:00`), 'd/M')}` : ' · בלי סוף') : ''}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:text-sky-300">
                  {e.repeat_rule ? <><Repeat className="h-3 w-3" />קבוע</> : <><CalendarClock className="h-3 w-3" />מתוכנן</>}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Logged: everything they did and recorded */}
      {logged.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">פעילויות שתיעד (אחרונות קודם)</p>
          {logged.map((a) => {
            const info = kindInfo(a.kind);
            const walk = a.kind === 'walk' || a.kind === 'hike';
            const bits = [
              a.duration_min ? `${a.duration_min} דק'` : null,
              a.distance_m ? `${(a.distance_m / 1000).toFixed(2)} ק"מ` : null,
              a.intensity ? INTENSITY[a.intensity] ?? a.intensity : null,
              a.source ? SOURCE[a.source] ?? a.source : null,
            ].filter(Boolean);
            return (
              <div key={a.id} className={cn('flex items-center gap-2.5 rounded-xl border px-3 py-2.5', walk ? 'border-success/25' : 'border-sky-500/30')}>
                <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', walk ? 'bg-success/15' : 'bg-sky-500/15')}>
                  <info.Icon className={cn('h-3.5 w-3.5', walk ? 'text-success' : 'text-sky-600')} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {a.custom_name ?? info.label}
                    {a.note && <span className="font-normal text-muted-foreground"> · {a.note}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(a.started_at), 'EEEE d/M · HH:mm', { locale: he })}
                    {bits.length ? ` · ${bits.join(' · ')}` : ''}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
