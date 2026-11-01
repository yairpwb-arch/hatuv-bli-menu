import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { minutesLabel } from '@/lib/hebrewTime';

interface SessionRow {
  id: string;
  completed_at: string;
  duration_minutes: number | null;
  difficulty?: 'easy' | 'medium' | 'hard' | null;
  workout_plan_days?: { name: string } | null;
}

interface LogRow {
  exercise_id: string;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  exercises: { name: string } | null;
}

const DIFFICULTY = { easy: 'קל', medium: 'בינוני', hard: 'קשה' } as const;

/** Read-only summary of a finished workout. */
export function SessionSummaryDialog({ sessionId, onClose }: { sessionId: string | null; onClose: () => void }) {
  const [session, setSession] = useState<SessionRow | null>(null);
  const [logs, setLogs] = useState<LogRow[] | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    setSession(null);
    setLogs(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    Promise.all([
      db.from('workout_session_logs').select('*, workout_plan_days(name)').eq('id', sessionId).maybeSingle(),
      db.from('workout_exercise_logs').select('exercise_id, set_number, reps, weight_kg, exercises(name)').eq('session_id', sessionId).order('set_number'),
    ]).then(([s, l]) => {
      setSession(s.data as SessionRow | null);
      setLogs((l.data ?? []) as LogRow[]);
    });
  }, [sessionId]);

  const byExercise = new Map<string, LogRow[]>();
  for (const l of logs ?? []) byExercise.set(l.exercise_id, [...(byExercise.get(l.exercise_id) ?? []), l]);
  const volume = (logs ?? []).reduce((s, l) => s + (Number(l.weight_kg) || 0) * (l.reps ?? 0), 0);

  return (
    <Dialog open={!!sessionId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-h-[85vh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{session?.workout_plan_days?.name ?? 'סיכום אימון'}</DialogTitle>
          <DialogDescription>
            {session ? format(new Date(session.completed_at), 'EEEE, d בMMMM · HH:mm', { locale: he }) : ' '}
          </DialogDescription>
        </DialogHeader>

        {!session || !logs ? (
          <div className="space-y-2">
            <Skeleton className="h-16 rounded-inner" />
            <Skeleton className="h-24 rounded-inner" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-inner bg-card-inner px-2 py-3">
                <p className="text-card-title tabular-nums">{session.duration_minutes ? minutesLabel(session.duration_minutes) : '—'}</p>
                <p className="text-label text-muted-foreground">משך</p>
              </div>
              <div className="rounded-inner bg-card-inner px-2 py-3">
                <p className="text-card-title tabular-nums">{logs.length}</p>
                <p className="text-label text-muted-foreground">סטים</p>
              </div>
              <div className="rounded-inner bg-card-inner px-2 py-3">
                <p className="text-card-title tabular-nums">{Math.round(volume).toLocaleString('he-IL')}</p>
                <p className="text-label text-muted-foreground">נפח (ק"ג)</p>
              </div>
            </div>
            {session.difficulty && (
              <p className="text-body text-muted-foreground">איך היה: <span className="font-semibold text-foreground">{DIFFICULTY[session.difficulty]}</span></p>
            )}
            {byExercise.size === 0 ? (
              <p className="py-2 text-center text-body text-muted-foreground">לא נרשמו סטים באימון הזה</p>
            ) : (
              <ul className="space-y-2">
                {Array.from(byExercise.entries()).map(([id, sets]) => (
                  <li key={id} className="space-y-1 rounded-inner bg-card-inner p-3">
                    <p className="text-body font-semibold">{sets[0]?.exercises?.name ?? 'תרגיל'}</p>
                    <p className="text-label tabular-nums text-muted-foreground">
                      {sets.map((s) => (Number(s.weight_kg) > 0 ? `${Number(s.weight_kg)}×${s.reps ?? 0}` : `${s.reps ?? 0} חז'`)).join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
