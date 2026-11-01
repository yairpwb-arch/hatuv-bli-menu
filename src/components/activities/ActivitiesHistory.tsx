import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { decodePath } from '@/lib/walkTrack';
import { RouteThumb } from '@/components/walk/RouteThumb';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { BottomSheet, Card, SheetActions } from '@/components/ds';
import type { ActivityRow } from '@/hooks/useActivities';
import { INTENSITY, kindInfo } from '@/lib/activityKinds';
import type { WatchWorkout } from '@/lib/watchWorkouts';

const titleOf = (a: ActivityRow) => (a.kind === 'other' && a.custom_name ? a.custom_name : kindInfo(a.kind).label);
const distanceOf = (a: ActivityRow) =>
  a.distance_m == null ? null : kindInfo(a.kind).distance === 'm' ? `${a.distance_m} מ'` : `${(a.distance_m / 1000).toFixed(1)} ק"מ`;
const SOURCE: Record<ActivityRow['source'], string> = { manual: 'נרשם ידנית', gps: 'מעקב GPS', player: 'נגן האימון', watch: 'מהשעון' };

/** Watch workouts that an activity already covers (same kind of thing, about the same time) aren't shown twice. */
export function withoutDuplicates(watch: WatchWorkout[], activities: ActivityRow[]): WatchWorkout[] {
  const family = (k: string) => (k === 'strength_gym' || k === 'strength_home' || k === 'strength' ? 'strength' : k === 'hike' ? 'walk' : k);
  return watch.filter(
    (w) =>
      !activities.some(
        (a) => family(a.kind) === family(w.kind) && Math.abs(new Date(a.started_at).getTime() - new Date(w.started_at).getTime()) < 45 * 60_000,
      ),
  );
}

/**
 * Activities in the history list, each with its own icon. Tapping one shows
 * what was logged, with "ערוך" and "מחק" (deleting asks first).
 */
export function ActivitiesHistory({ activities, onEdit, onDelete }: {
  activities: ActivityRow[];
  onEdit: (a: ActivityRow) => void;
  onDelete: (a: ActivityRow) => Promise<boolean>;
}) {
  const [open, setOpen] = useState<ActivityRow | null>(null);
  const [confirm, setConfirm] = useState(false);
  // Workouts from the plan / the player are listed with the sessions already.
  const list = activities.filter((a) => a.status === 'done' && !a.session_id);
  // GPS walks show a small drawing of their route (the trainee's own tracks only).
  const [routes, setRoutes] = useState<Map<string, { lat: number; lng: number }[]>>(new Map());
  const gpsIds = list.filter((a) => a.source === 'gps').map((a) => a.id).join(',');
  useEffect(() => {
    if (!gpsIds) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('activity_tracks')
      .select('activity_id, path')
      .in('activity_id', gpsIds.split(','))
      .then(({ data }: { data: { activity_id: string; path: string }[] | null }) =>
        setRoutes(new Map((data ?? []).map((r) => [r.activity_id, decodePath(r.path)]))),
      );
  }, [gpsIds]);
  if (list.length === 0) return null;

  const rows = (a: ActivityRow): [string, string][] =>
    [
      ['מתי', format(new Date(a.started_at), 'EEEE d/M · HH:mm', { locale: he })],
      a.duration_min ? ['משך', `${a.duration_min} דק'`] : null,
      distanceOf(a) ? ['מרחק', distanceOf(a)!] : null,
      a.intensity ? ['עצימות', INTENSITY.find((i) => i.value === a.intensity)!.label] : null,
      a.note ? ['הערה', a.note] : null,
      ['נרשם', SOURCE[a.source]],
    ].filter(Boolean) as [string, string][];

  return (
    <>
      <Card className="space-y-2">
        <h3 className="text-card-title">פעילויות</h3>
        <ul className="divide-y divide-border">
          {list.map((a) => {
            const { Icon } = kindInfo(a.kind);
            const meta = [a.duration_min ? `${a.duration_min} דק'` : null, distanceOf(a)].filter(Boolean).join(' · ');
            return (
              <li key={a.id}>
                <button type="button" onClick={() => setOpen(a)} className="flex min-h-[56px] w-full items-center gap-3 py-2 text-right">
                  {routes.get(a.id) ? (
                    <RouteThumb route={routes.get(a.id)!} className="h-12 w-12 shrink-0 rounded-inner bg-card-inner" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-inner bg-card-inner text-primary">
                      <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-semibold">{titleOf(a)}</span>
                    <span className="block text-label text-muted-foreground">
                      {format(new Date(a.started_at), 'EEEE d/M', { locale: he })}
                      {meta ? ` · ${meta}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <BottomSheet open={!!open && !confirm} onOpenChange={(o) => !o && setOpen(null)} title={open ? titleOf(open) : ''}>
        {open && (
          <dl className="mb-5 divide-y divide-border rounded-inner bg-card-inner">
            {rows(open).map(([k, v]) => (
              <div key={k} className="flex min-h-[44px] items-center justify-between gap-3 px-4 py-2">
                <dt className="shrink-0 text-body text-muted-foreground">{k}</dt>
                <dd className="text-left text-body font-semibold" dir="auto">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <SheetActions>
          <Button
            onClick={() => {
              const a = open!;
              setOpen(null);
              onEdit(a);
            }}
          >
            ערוך
          </Button>
          <Button variant="outline" className="text-destructive" onClick={() => setConfirm(true)}>
            <Trash2 className="h-4 w-4" strokeWidth={2} />
            מחק
          </Button>
        </SheetActions>
      </BottomSheet>

      <BottomSheet open={confirm} onOpenChange={(o) => !o && setConfirm(false)} title="למחוק את הפעילות?">
        <p className="mb-4 text-body text-muted-foreground">היא תוסר מההיסטוריה ומהסיכום השבועי.</p>
        <SheetActions>
          <Button variant="outline" onClick={() => setConfirm(false)}>השאר</Button>
          <Button
            variant="destructive"
            onClick={async () => {
              const a = open!;
              setConfirm(false);
              setOpen(null);
              if (!(await onDelete(a))) toast.error('לא נמחק, נסו שוב');
            }}
          >
            מחק
          </Button>
        </SheetActions>
      </BottomSheet>
    </>
  );
}
