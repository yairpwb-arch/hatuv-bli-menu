import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Dumbbell, CheckCircle, Clock, History, Play, ChevronDown } from 'lucide-react';
import type { WorkoutPlanDay, WorkoutPlanExercise } from '@/hooks/useWorkoutPlan';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkoutPlan } from '@/hooks/useWorkoutPlan';
import { useWorkoutSession } from '@/hooks/useWorkoutSession';
import WorkoutActiveSession, { type ExerciseLog } from '@/components/WorkoutActiveSession';

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
  onSchedule: (weekday: number) => void;
  onStartSession: () => void;
}

function WorkoutDayCard({
  day,
  scheduledWeekday,
  todayWeekday,
  alreadyDoneToday,
  isExpanded,
  onToggleExpand,
  onSchedule,
  onStartSession,
}: WorkoutDayCardProps) {
  const isScheduledToday = scheduledWeekday === todayWeekday;

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
              {scheduledWeekday !== undefined && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  מתוכנן ליום {WEEKDAY_LABELS[scheduledWeekday]}
                </p>
              )}
            </div>
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform flex-shrink-0',
              isExpanded && 'rotate-180'
            )}
          />
        </div>

        {/* ── Weekday pills ── */}
        <div className="flex gap-1">
          {WEEKDAY_LABELS.map((label, wd) => (
            <button
              key={wd}
              onClick={() => onSchedule(wd)}
              className={cn(
                'flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all',
                scheduledWeekday === wd
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
              onClick={onStartSession}
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
  onStartSession: (planDay: WorkoutPlanDay) => void;
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

  const handleScheduleDay = async (planDayId: string, weekday: number) => {
    const current = scheduleMap.get(planDayId);
    if (current === weekday) {
      // Same pill tapped → deselect
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
      <p className="text-xs text-muted-foreground text-center">
        בחר יום שבוע לכל אימון כדי לקבל תזכורת בדף הבית
      </p>
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
            onSchedule={(wd) => handleScheduleDay(day.id, wd)}
            onStartSession={() => onStartSession(day)}
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

function HistoryTab({ sessions, isLoading }: HistoryTabProps) {
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

        return (
          <Card key={session.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
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
                    <Badge variant="outline" className="gap-1 text-xs border-orange-300 text-orange-700">
                      <Clock className="h-3 w-3" />
                      {session.duration_minutes} דק'
                    </Badge>
                  )}
                  <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
                    <CheckCircle className="h-3 w-3 ml-1" />
                    הושלם
                  </Badge>
                </div>
              </div>
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
  const [activePlanDay, setActivePlanDay] = useState<WorkoutPlanDay | null>(null);

  // Exercises for the currently active session (fetched on demand)
  const { data: activeDayExercises } = useQuery({
    queryKey: ['plan-exercises', activePlanDay?.id],
    queryFn: async () => {
      if (!activePlanDay) return [];
      const { data } = await (supabase as any)
        .from('workout_plan_exercises')
        .select('*, exercises(*)')
        .eq('plan_day_id', activePlanDay.id)
        .order('sort_order', { ascending: true });
      return (data ?? []) as WorkoutPlanExercise[];
    },
    enabled: !!activePlanDay,
  });

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

  const handleSessionFinish = async (durationMinutes: number, exerciseLogs: ExerciseLog[]) => {
    if (!activePlanDay) return;
    const mappedLogs = exerciseLogs.map((l) => ({
      exerciseId: l.exerciseId,
      sets: l.sets.map((s) => ({
        reps: parseInt(s.reps) || 0,
        weightKg: parseFloat(s.weightKg) || 0,
      })),
    }));
    await logSession(activePlanDay.id, durationMinutes, mappedLogs);
    setActivePlanDay(null);
  };

  return (
    <>
      {activePlanDay && activeDayExercises && activeDayExercises.length > 0 && (
        <WorkoutActiveSession
          planDay={activePlanDay}
          exercises={activeDayExercises}
          onClose={() => setActivePlanDay(null)}
          onFinish={handleSessionFinish}
        />
      )}

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
                onStartSession={(day) => setActivePlanDay(day)}
              />
            )}
          </TabsContent>

          <TabsContent value="history">
            <HistoryTab sessions={sessions} isLoading={isSessionsLoading} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
