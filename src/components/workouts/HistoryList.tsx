import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { CheckCircle, ChevronDown, ChevronUp, Clock, Dumbbell, History, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import type { WatchWorkout } from '@/lib/watchWorkouts';
import { WatchWorkoutCard } from '@/components/workouts/WatchWorkouts';
import { manualSessionIds } from '@/lib/activityMarks';
import { useAuth } from '@/hooks/useAuth';

// ---------------------------------------------------------------------------
// HistoryTab
// ---------------------------------------------------------------------------
interface HistoryTabProps {
  sessions: {
    id: string;
    completed_at: string;
    duration_minutes: number | null;
    workout_plan_days?: { id: string; name: string; day_number: number } | null;
  }[];
  isLoading: boolean;
  onDeleteSession: (id: string) => void;
  watchWorkouts: WatchWorkout[];
}

interface ExerciseLogEntry {
  exercise_id: string;
  set_number: number;
  reps: number;
  weight_kg: number;
  exercises: { name: string } | null;
}

export function HistoryTab({ sessions, isLoading, onDeleteSession, watchWorkouts }: HistoryTabProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [logsMap, setLogsMap] = useState<Record<string, ExerciseLogEntry[]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  // Workouts marked by hand ("ביצעתי בלי האפליקציה") get a small tag.
  const { user } = useAuth();
  const [manualIds, setManualIds] = useState<Set<string>>(new Set());
  const idsKey = sessions.map((s) => s.id).join(',');
  useEffect(() => {
    if (!user || !idsKey) return;
    manualSessionIds(user.id, idsKey.split(',')).then(setManualIds);
  }, [user, idsKey]);

  const loadLogs = async (sessionId: string) => {
    if (logsMap[sessionId] !== undefined) return;
    setLoadingId(sessionId);
    const { data } = await (supabase as any)
      .from('workout_exercise_logs')
      .select('exercise_id, set_number, reps, weight_kg, exercises(name)')
      .eq('session_id', sessionId)
      .order('set_number', { ascending: true });
    setLogsMap(prev => ({ ...prev, [sessionId]: (data ?? []) as ExerciseLogEntry[] }));
    setLoadingId(null);
  };

  const handleToggle = (sessionId: string) => {
    if (expandedId === sessionId) {
      setExpandedId(null);
    } else {
      setExpandedId(sessionId);
      loadLogs(sessionId);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3 pt-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (sessions.length === 0 && watchWorkouts.length === 0) {
    return (
      <Card className="mt-4">
        <CardContent className="pt-8 pb-8 text-center">
          <History className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">עדיין לא בוצעו אימונים</p>
          <p className="text-sm text-muted-foreground/70 mt-1">ההיסטוריה תופיע כאן לאחר האימון הראשון</p>
        </CardContent>
      </Card>
    );
  }

  const renderSession = (session: HistoryTabProps['sessions'][number]) => {
        const dateFormatted = format(new Date(session.completed_at), 'EEEE, d בMMMM', { locale: he });
        const timeFormatted = format(new Date(session.completed_at), 'HH:mm', { locale: he });
        const dayName = session.workout_plan_days?.name ?? 'אימון';
        const isExpanded = expandedId === session.id;
        const logs = logsMap[session.id];
        const isLoadingLogs = loadingId === session.id;

        // Group logs by exercise_id
        const byExercise: Record<string, ExerciseLogEntry[]> = {};
        if (logs) {
          logs.forEach(l => {
            if (!byExercise[l.exercise_id]) byExercise[l.exercise_id] = [];
            byExercise[l.exercise_id].push(l);
          });
        }

        return (
          <Card key={session.id} className="overflow-hidden">
            <CardContent className="p-4">
              {/* Session header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Dumbbell className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground">{dayName}</h4>
                    <p className="text-xs text-muted-foreground">
                      {dateFormatted} · {timeFormatted}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  {session.duration_minutes && session.duration_minutes > 0 && (
                    <Badge variant="outline" className="gap-1 text-xs border-primary/30 text-primary">
                      <Clock className="h-3 w-3" />
                      {session.duration_minutes} דק'
                    </Badge>
                  )}
                  {manualIds.has(session.id) && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">סומן ידנית</Badge>
                  )}
                  <Badge className="bg-success/20 text-success border-0 text-xs">
                    <CheckCircle className="h-3 w-3 ml-1" />
                    הושלם
                  </Badge>
                  <button
                    onClick={() => onDeleteSession(session.id)}
                    className="flex items-center gap-1 text-xs text-destructive hover:text-destructive transition-colors mt-0.5"
                    aria-label="מחק אימון"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    מחק
                  </button>
                </div>
              </div>

              {/* Toggle details */}
              <button
                onClick={() => handleToggle(session.id)}
                className="w-full flex items-center justify-center gap-1.5 mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {isExpanded
                  ? <><ChevronUp className="h-3.5 w-3.5" />הסתר פרטים</>
                  : <><ChevronDown className="h-3.5 w-3.5" />הצג פרטי תרגילים</>
                }
              </button>

              {/* Exercise detail */}
              {isExpanded && (
                <div className="mt-3 space-y-3">
                  {isLoadingLogs || (!logs && loadingId === session.id) ? (
                    <Skeleton className="h-16 w-full rounded-xl" />
                  ) : !logs || Object.keys(byExercise).length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-2">אין פרטי תרגילים</p>
                  ) : (
                    Object.entries(byExercise).map(([exerciseId, sets]) => {
                      const exerciseName = sets[0]?.exercises?.name ?? 'תרגיל';
                      return (
                        <div key={exerciseId} className="bg-muted/40 rounded-xl p-3">
                          <p className="text-sm font-semibold mb-2">{exerciseName}</p>
                          <div className="grid grid-cols-3 gap-1.5">
                            {sets.map(s => (
                              <div
                                key={s.set_number}
                                className="bg-background border border-border/60 rounded-lg px-2 py-2 text-center"
                              >
                                <p className="text-xs text-muted-foreground mb-0.5">סט {s.set_number}</p>
                                <p className="text-sm font-bold text-foreground">
                                  {s.reps}
                                  <span className="text-xs font-normal text-muted-foreground"> חז'</span>
                                </p>
                                {s.weight_kg > 0 && (
                                  <p className="text-xs text-primary mt-0.5">{s.weight_kg} ק"ג</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
  };

  // App sessions and watch workouts together, grouped by day, newest first.
  type Item = { at: string; node: JSX.Element };
  const items: Item[] = [
    ...sessions.map((s) => ({ at: s.completed_at, node: renderSession(s) })),
    ...watchWorkouts.map((w) => ({ at: w.started_at, node: <WatchWorkoutCard key={`w-${w.id}`} workout={w} /> })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const groups: { day: string; items: Item[] }[] = [];
  for (const it of items) {
    const day = format(new Date(it.at), 'yyyy-MM-dd');
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(it);
    else groups.push({ day, items: [it] });
  }

  return (
    <div className="space-y-4 pt-2">
      {groups.map((g) => (
        <section key={g.day} className="space-y-2">
          <h3 className="px-1 text-label font-semibold text-muted-foreground">
            {format(new Date(`${g.day}T12:00:00`), 'EEEE, d בMMMM', { locale: he })}
          </h3>
          {g.items.map((it) => it.node)}
        </section>
      ))}
    </div>
  );
}

