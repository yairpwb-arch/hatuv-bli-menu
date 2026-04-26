import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Dumbbell, CheckCircle, Clock, History, Play, ChevronDown, ChevronUp, Pencil, X } from 'lucide-react';
import type { WorkoutPlanDay, WorkoutPlanExercise } from '@/hooks/useWorkoutPlan';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkoutPlan } from '@/hooks/useWorkoutPlan';
import { useWorkoutSession } from '@/hooks/useWorkoutSession';
import { useActiveWorkout } from '@/contexts/ActiveWorkoutContext';

// Hebrew weekday labels (JS getDay(): 0=Sun=א׳ … 6=Sat=ש׳)
const WEEKDAY_LABELS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatRest(seconds: number | null): string | null {
  if (!seconds) return null;
  if (seconds < 60) return `${seconds} שניות מנוחה`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}:${String(secs).padStart(2, '0')} דקות מנוחה` : `${mins} דקות מנוחה`;
}

// ---------------------------------------------------------------------------
// Skeletons / empty states
// ---------------------------------------------------------------------------
function WorkoutSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-36 w-full rounded-2xl" />
      ))}
    </div>
  );
}

function NoActivePlan() {
  return (
    <div className="min-h-screen pb-20 pt-6 px-4 flex items-center justify-center">
      <Card className="w-full max-w-sm shadow-md">
        <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4 text-center">
          <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center">
            <Dumbbell className="h-10 w-10 text-orange-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">אין תוכנית אימון פעילה</h2>
            <p className="text-sm text-muted-foreground mt-1">פנה למאמן שלך להתחלת תוכנית</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WorkoutDayCard — single card for one plan day
// ---------------------------------------------------------------------------
interface WorkoutDayCardProps {
  day: WorkoutPlanDay;
  scheduledWeekday: number | undefined;
  todayWeekday: number;
  alreadyDoneToday: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSaveSchedule: (weekday: number | null) => void;
  onStartSession: (exercises: WorkoutPlanExercise[]) => void;
}

function WorkoutDayCard({
  day,
  scheduledWeekday,
  todayWeekday,
  alreadyDoneToday,
  isExpanded,
  onToggleExpand,
  onSaveSchedule,
  onStartSession,
}: WorkoutDayCardProps) {
  const isScheduledToday = scheduledWeekday === todayWeekday;
  const [isEditingDay, setIsEditingDay] = useState(false);
  const [pendingWeekday, setPendingWeekday] = useState<number | null>(null);

  const startEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingWeekday(scheduledWeekday ?? null);
    setIsEditingDay(true);
  };

  const cancelEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditingDay(false);
  };

  const saveEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSaveSchedule(pendingWeekday);
    setIsEditingDay(false);
  };

  // Fetch exercises only when card is expanded
  const { data: exercises, isLoading: isLoadingExercises } = useQuery({
    queryKey: ['plan-exercises', day.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workout_plan_exercises')
        .select('*, exercises(*)')
        .eq('plan_day_id', day.id)
        .order('sort_order', { ascending: true });
      if (error) return [];
      return (data ?? []) as WorkoutPlanExercise[];
    },
    enabled: isExpanded,
  });

  return (
    <Card className={cn('transition-all', isScheduledToday && 'border-2 border-orange-500')}>
      <CardContent className="p-4 space-y-3">

        {/* ── Header ── */}
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={onToggleExpand}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0',
                isScheduledToday ? 'bg-orange-500 text-white' : 'bg-muted text-muted-foreground'
              )}
            >
              {day.day_number}
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h4 className="font-semibold text-foreground">{day.name}</h4>
                {isScheduledToday && (
                  <Badge className="bg-orange-500 text-white text-xs px-2 py-0">היום</Badge>
                )}
                {alreadyDoneToday && (
                  <Badge className="bg-green-500 text-white text-xs px-2 py-0 gap-0.5">
                    <CheckCircle className="h-3 w-3" />
                    בוצע
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {scheduledWeekday !== undefined
                  ? `מתוכנן ליום ${WEEKDAY_LABELS[scheduledWeekday]}`
                  : 'לא נקבע יום אימון'}
              </p>
            </div>
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform flex-shrink-0',
              isExpanded && 'rotate-180'
            )}
          />
        </div>

        {/* ── Day scheduler: view / edit ── */}
        {!isEditingDay ? (
          <div className="flex items-center justify-between">
            <div className="flex gap-1 flex-1 ml-2">
              {WEEKDAY_LABELS.map((label, wd) => (
                <div
                  key={wd}
                  className={cn(
                    'flex-1 py-1.5 rounded-lg text-xs font-semibold text-center',
                    scheduledWeekday === wd
                      ? 'bg-orange-500 text-white'
                      : wd === todayWeekday
                      ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border border-orange-300 dark:border-orange-700'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {label}
                </div>
              ))}
            </div>
            <button
              onClick={startEditing}
              className="flex items-center gap-1 text-xs text-orange-500 font-medium px-2 py-1.5 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors flex-shrink-0"
            >
              <Pencil className="h-3.5 w-3.5" />
              ערוך
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-1">
              {WEEKDAY_LABELS.map((label, wd) => (
                <button
                  key={wd}
                  onClick={(e) => { e.stopPropagation(); setPendingWeekday(pendingWeekday === wd ? null : wd); }}
                  className={cn(
                    'flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    pendingWeekday === wd
                      ? 'bg-orange-500 text-white shadow-sm'
                      : wd === todayWeekday
                      ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-700'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 h-8 bg-orange-500 hover:bg-orange-600 text-white text-xs rounded-lg"
                onClick={saveEditing}
              >
                שמור
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs rounded-lg"
                onClick={cancelEditing}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Expanded: exercise list + start button ── */}
        {isExpanded && (
          <div className="border-t border-border pt-3 space-y-2">
            {isLoadingExercises ? (
              <Skeleton className="h-20 w-full" />
            ) : !exercises || exercises.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">לא נמצאו תרגילים לאימון זה</p>
            ) : (
              exercises.map((pe, idx) => {
                const ex = pe.exercises;
                const repsLabel =
                  pe.reps_min === pe.reps_max
                    ? `${pe.sets}×${pe.reps_min}`
                    : `${pe.sets}×${pe.reps_min}-${pe.reps_max}`;
                const restLabel = formatRest(pe.rest_seconds);
                return (
                  <div key={pe.id} className="flex items-start gap-3 p-2.5 rounded-xl bg-muted/40">
                    <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-white">{idx + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">{ex.name}</p>
                        <Badge className="bg-orange-500 text-white text-xs flex-shrink-0">{repsLabel}</Badge>
                      </div>
                      {restLabel && (
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {restLabel}
                        </p>
                      )}
                      {ex.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{ex.description}</p>
                      )}
                      {ex.muscle_groups && ex.muscle_groups.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {ex.muscle_groups.map((mg) => (
                            <Badge key={mg} variant="secondary" className="text-xs py-0">{mg}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            <Button
              className="w-full mt-1 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl h-11"
              onClick={() => onStartSession(exercises ?? [])}
            >
              <Play className="h-4 w-4 ml-2" />
              התחל אימון
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// WorkoutsTab — lists all plan days
// ---------------------------------------------------------------------------
interface WorkoutsTabProps {
  userId: string;
  planDays: WorkoutPlanDay[];
  sessions: { id: string; completed_at: string; plan_day_id: string }[];
  onStartSession: (planDay: WorkoutPlanDay, exercises: WorkoutPlanExercise[]) => void;
}

function WorkoutsTab({ userId, planDays, sessions, onStartSession }: WorkoutsTabProps) {
  const queryClient = useQueryClient();
  const [expandedDayId, setExpandedDayId] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const todayWeekday = new Date().getDay(); // 0=Sun … 6=Sat

  // Fetch user's schedule (planDayId → weekday)
  const { data: scheduleRows } = useQuery({
    queryKey: ['workout-day-schedule', userId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('workout_day_schedule')
        .select('plan_day_id, weekday')
        .eq('user_id', userId);
      return (data ?? []) as { plan_day_id: string; weekday: number }[];
    },
  });

  const scheduleMap = new Map((scheduleRows ?? []).map((r) => [r.plan_day_id, r.weekday]));

  const handleSaveSchedule = async (planDayId: string, weekday: number | null) => {
    if (weekday === null) {
      await (supabase as any)
        .from('workout_day_schedule')
        .delete()
        .eq('user_id', userId)
        .eq('plan_day_id', planDayId);
    } else {
      await (supabase as any)
        .from('workout_day_schedule')
        .upsert(
          { user_id: userId, plan_day_id: planDayId, weekday },
          { onConflict: 'user_id,plan_day_id' }
        );
    }
    queryClient.invalidateQueries({ queryKey: ['workout-day-schedule', userId] });
    queryClient.invalidateQueries({ queryKey: ['today-workout', userId] });
  };

  if (planDays.length === 0) {
    return (
      <Card className="mt-4">
        <CardContent className="pt-6 pb-6 text-center text-muted-foreground">
          לא הוגדרו ימים בתוכנית האימון
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3 pt-2">
      {planDays.map((day) => {
        const alreadyDoneToday = sessions.some(
          (s) => s.completed_at.split('T')[0] === today && s.plan_day_id === day.id
        );
        return (
          <WorkoutDayCard
            key={day.id}
            day={day}
            scheduledWeekday={scheduleMap.get(day.id)}
            todayWeekday={todayWeekday}
            alreadyDoneToday={alreadyDoneToday}
            isExpanded={expandedDayId === day.id}
            onToggleExpand={() => setExpandedDayId(expandedDayId === day.id ? null : day.id)}
            onSaveSchedule={(wd) => handleSaveSchedule(day.id, wd)}
            onStartSession={(exs) => onStartSession(day, exs)}
          />
        );
      })}
    </div>
  );
}

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
}

interface ExerciseLogEntry {
  exercise_id: string;
  set_number: number;
  reps: number;
  weight_kg: number;
  exercises: { name: string } | null;
}

function HistoryTab({ sessions, isLoading }: HistoryTabProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [logsMap, setLogsMap] = useState<Record<string, ExerciseLogEntry[]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

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

  if (sessions.length === 0) {
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

  return (
    <div className="space-y-3 pt-2">
      {sessions.map((session) => {
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
                  <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                    <Dumbbell className="h-5 w-5 text-orange-500" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground">{dayName}</h4>
                    <p className="text-xs text-muted-foreground">
                      {dateFormatted} · {timeFormatted}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {session.duration_minutes && session.duration_minutes > 0 && (
                    <Badge variant="outline" className="gap-1 text-xs border-orange-500/30 text-orange-400">
                      <Clock className="h-3 w-3" />
                      {session.duration_minutes} דק'
                    </Badge>
                  )}
                  <Badge className="bg-green-500/20 text-green-500 border-0 text-xs">
                    <CheckCircle className="h-3 w-3 ml-1" />
                    הושלם
                  </Badge>
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
                                  <p className="text-xs text-orange-400 mt-0.5">{s.weight_kg} ק"ג</p>
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
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function AppWorkouts() {
  const { user } = useAuth();
  const { assignment, plan, planDays, isLoading } = useWorkoutPlan();
  const { sessions, logSession, isLoading: isSessionsLoading } = useWorkoutSession();
  const { start } = useActiveWorkout();

  if (isLoading) {
    return (
      <div className="min-h-screen pb-20 pt-6 px-4">
        <WorkoutSkeleton />
      </div>
    );
  }

  if (!assignment || !plan) {
    return <NoActivePlan />;
  }

  const handleStartSession = (planDay: WorkoutPlanDay, exercises: WorkoutPlanExercise[]) => {
    start({
      planDay,
      exercises,
      onFinish: async (durationMinutes, exerciseLogs) => {
        const mappedLogs = exerciseLogs.map((l) => ({
          exerciseId: l.exerciseId,
          sets: l.sets.map((s) => ({
            reps: parseInt(s.reps) || 0,
            weightKg: parseFloat(s.weightKg) || 0,
          })),
        }));
        await logSession(planDay.id, durationMinutes, mappedLogs);
      },
    });
  };

  return (
    <div className="min-h-screen pb-20 pt-6 px-4 space-y-4" dir="rtl">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Dumbbell className="h-6 w-6 text-orange-500" />
          אימונים
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">{plan.name}</p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="workouts" dir="rtl" className="w-full">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="workouts" className="text-sm">
            <Dumbbell className="h-3.5 w-3.5 ml-1" />
            אימונים
          </TabsTrigger>
          <TabsTrigger value="history" className="text-sm">
            <History className="h-3.5 w-3.5 ml-1" />
            היסטוריה
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workouts">
          {user && (
            <WorkoutsTab
              userId={user.id}
              planDays={planDays}
              sessions={sessions}
              onStartSession={handleStartSession}
            />
          )}
        </TabsContent>

        <TabsContent value="history">
          <HistoryTab sessions={sessions} isLoading={isSessionsLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
