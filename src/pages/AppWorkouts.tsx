import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dumbbell, CheckCircle, Clock, CalendarDays, History, ChevronLeft, Play, ChevronDown } from 'lucide-react';
import type { WorkoutPlanDay } from '@/hooks/useWorkoutPlan';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkoutPlan } from '@/hooks/useWorkoutPlan';
import { useWorkoutSession } from '@/hooks/useWorkoutSession';
import WorkoutActiveSession, { type ExerciseLog } from '@/components/WorkoutActiveSession';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

interface Exercise {
  id: string;
  name: string;
  description: string | null;
  muscle_groups: string[] | null;
  media_url: string | null;
}

interface WorkoutPlanExercise {
  id: string;
  plan_day_id: string;
  exercise_id: string;
  sets: number;
  reps_min: number;
  reps_max: number;
  rest_seconds: number | null;
  sort_order: number | null;
  exercises: Exercise;
}

// ---------------------------------------------------------------------------
// Helper: format rest time in Hebrew
// ---------------------------------------------------------------------------
function formatRest(seconds: number | null): string | null {
  if (!seconds) return null;
  if (seconds < 60) return `${seconds} שניות מנוחה`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}:${String(secs).padStart(2, '0')} דקות מנוחה` : `${mins} דקות מנוחה`;
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
function WorkoutSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-10 w-full rounded-xl" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state — no active plan
// ---------------------------------------------------------------------------
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
// Tab 1 — Today's workout (with day selector + exercise detail dialog)
// ---------------------------------------------------------------------------
interface TodayTabProps {
  planName: string;
  planDays: WorkoutPlanDay[];
  todayDayId: string | null;
  logSession: (planDayId: string, durationMinutes: number, exerciseLogs: { exerciseId: string; sets: { reps: number; weightKg: number }[] }[]) => Promise<void>;
  alreadyDoneToday: boolean;
  onStartSession: () => void;
}

function TodayTab({ planName, planDays, todayDayId, logSession, alreadyDoneToday, onStartSession }: TodayTabProps) {
  const [selectedDayId, setSelectedDayId] = useState<string | null>(todayDayId);
  const [isFinishDialogOpen, setIsFinishDialogOpen] = useState(false);
  const [durationInput, setDurationInput] = useState('');
  const [exerciseDetail, setExerciseDetail] = useState<WorkoutPlanExercise | null>(null);

  const activeDayId = selectedDayId ?? planDays[0]?.id ?? null;
  const activeDay = planDays.find((d) => d.id === activeDayId) ?? null;

  const { data: planExercises, isLoading } = useQuery({
    queryKey: ['plan-exercises', activeDayId],
    queryFn: async () => {
      if (!activeDayId) return [];
      const { data, error } = await (supabase as any)
        .from('workout_plan_exercises')
        .select('*, exercises (*)')
        .eq('plan_day_id', activeDayId)
        .order('sort_order', { ascending: true });
      if (error) return [];
      return (data ?? []) as WorkoutPlanExercise[];
    },
    enabled: !!activeDayId,
  });

  const handleFinish = async () => {
    if (!activeDayId) return;
    const duration = parseInt(durationInput, 10);
    await logSession(activeDayId, isNaN(duration) ? 0 : duration, []);
    setIsFinishDialogOpen(false);
    setDurationInput('');
  };

  return (
    <div className="space-y-4 pt-2">

      {/* Day selector — horizontal scroll */}
      {planDays.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {planDays.map((day) => {
            const isToday = day.id === todayDayId;
            const isSelected = day.id === activeDayId;
            return (
              <button
                key={day.id}
                onClick={() => setSelectedDayId(day.id)}
                className={cn(
                  'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all',
                  isSelected
                    ? 'bg-orange-500 text-white shadow-md'
                    : isToday
                    ? 'bg-orange-100 text-orange-700 border border-orange-300'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                {isToday ? '⚡ ' : ''}{day.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Header card */}
      {activeDay && (
        <Card className="border-2 border-orange-500 bg-orange-500/10">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">{planName}</p>
                <h3 className="text-lg font-bold text-foreground">
                  יום {activeDay.day_number} — {activeDay.name}
                </h3>
              </div>
              {alreadyDoneToday && activeDayId === todayDayId && (
                <Badge className="bg-green-500 text-white gap-1 px-3 py-1">
                  <CheckCircle className="h-3.5 w-3.5" />
                  בוצע היום ✓
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Exercise list */}
      {isLoading ? (
        <WorkoutSkeleton />
      ) : !planExercises || planExercises.length === 0 ? (
        <Card>
          <CardContent className="pt-6 pb-6 text-center text-muted-foreground">
            לא נמצאו תרגילים לאימון זה
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {planExercises.map((pe, idx) => {
            const ex = pe.exercises;
            const repsLabel =
              pe.reps_min === pe.reps_max
                ? `${pe.sets}×${pe.reps_min}`
                : `${pe.sets}×${pe.reps_min}-${pe.reps_max}`;
            const restLabel = formatRest(pe.rest_seconds);

            return (
              <Card
                key={pe.id}
                className="overflow-hidden cursor-pointer hover:border-orange-400 transition-colors active:scale-[0.99]"
                onClick={() => setExerciseDetail(pe)}
              >
                <CardContent className="p-0">
                  <div className="flex gap-3 p-4">
                    {/* Number / thumbnail */}
                    {ex.media_url && !ex.media_url.includes('.mp4') && !ex.media_url.includes('video') ? (
                      <img
                        src={ex.media_url}
                        alt={ex.name}
                        className="w-16 h-16 object-cover rounded-xl flex-shrink-0 bg-muted"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                        <span className="text-2xl font-bold text-white">{idx + 1}</span>
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-semibold text-foreground leading-tight">{ex.name}</h4>
                        <Badge className="text-xs flex-shrink-0 bg-orange-500 text-white border-0">
                          {repsLabel}
                        </Badge>
                      </div>
                      {restLabel && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {restLabel}
                        </p>
                      )}
                      {ex.muscle_groups && ex.muscle_groups.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {ex.muscle_groups.map((mg) => (
                            <Badge key={mg} variant="secondary" className="text-xs">
                              {mg}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0 self-center -rotate-90" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Start / finish buttons */}
      {!(alreadyDoneToday && activeDayId === todayDayId) && activeDayId === todayDayId && (
        <div className="flex gap-2">
          <Button
            className="flex-1 h-12 bg-orange-500 hover:bg-orange-600 text-white font-bold text-base rounded-xl shadow-md"
            onClick={onStartSession}
          >
            <Play className="h-5 w-5 ml-2" />
            התחל אימון
          </Button>
          <Button
            variant="outline"
            className="h-12 px-4 rounded-xl border-orange-400 text-orange-600"
            onClick={() => setIsFinishDialogOpen(true)}
          >
            <CheckCircle className="h-5 w-5" />
          </Button>
        </div>
      )}

      {/* Finish dialog */}
      <Dialog open={isFinishDialogOpen} onOpenChange={setIsFinishDialogOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>סיום אימון</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-muted-foreground text-sm">כל הכבוד! רוצה לרשום כמה זמן אימנת?</p>
            <div className="space-y-2">
              <Label htmlFor="duration">משך האימון (דקות) — אופציונלי</Label>
              <Input
                id="duration"
                type="number"
                min="1"
                max="300"
                placeholder="לדוגמה: 45"
                value={durationInput}
                onChange={(e) => setDurationInput(e.target.value)}
                dir="ltr"
                className="text-left"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsFinishDialogOpen(false)} className="flex-1">ביטול</Button>
            <Button className="flex-1 bg-orange-500 hover:bg-orange-600 text-white" onClick={handleFinish}>
              שמור אימון
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exercise detail dialog */}
      <Dialog open={!!exerciseDetail} onOpenChange={() => setExerciseDetail(null)}>
        <DialogContent dir="rtl" className="max-w-sm max-h-[92vh] overflow-y-auto p-0">
          {exerciseDetail && (() => {
            const ex = exerciseDetail.exercises;
            const repsLabel = exerciseDetail.reps_min === exerciseDetail.reps_max
              ? `${exerciseDetail.sets}×${exerciseDetail.reps_min}`
              : `${exerciseDetail.sets}×${exerciseDetail.reps_min}-${exerciseDetail.reps_max}`;
            const restLabel = formatRest(exerciseDetail.rest_seconds);
            return (
              <>
                {/* Video — portrait (reels) */}
                {ex.media_url && (ex.media_url.includes('.mp4') || ex.media_url.includes('video') || ex.media_url.includes('supabase')) ? (
                  <div className="w-full bg-black" style={{ aspectRatio: '9/16' }}>
                    <video
                      src={ex.media_url}
                      controls
                      autoPlay
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : ex.media_url ? (
                  <div className="w-full aspect-video bg-black">
                    <img src={ex.media_url} alt={ex.name} className="w-full h-full object-cover" />
                  </div>
                ) : null}

                <div className="p-4 space-y-3">
                  {/* Title + reps */}
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-bold">{ex.name}</h2>
                    <Badge className="bg-orange-500 text-white text-sm px-3">{repsLabel}</Badge>
                  </div>

                  {restLabel && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Clock className="h-4 w-4" />
                      {restLabel}
                    </p>
                  )}

                  {ex.muscle_groups && ex.muscle_groups.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {ex.muscle_groups.map((mg) => (
                        <Badge key={mg} variant="secondary">{mg}</Badge>
                      ))}
                    </div>
                  )}

                  {ex.description && (
                    <div className="bg-muted/40 rounded-xl p-3">
                      <p className="text-sm font-medium mb-1">📋 הוראות ביצוע</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{ex.description}</p>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2 — Full week overview
// ---------------------------------------------------------------------------
interface WeekTabProps {
  planDays: {
    id: string;
    day_number: number;
    name: string;
    description: string | null;
    plan_id: string;
  }[];
  todayPlanDayId: string | null;
}

function WeekTab({ planDays, todayPlanDayId }: WeekTabProps) {
  const [expandedDayId, setExpandedDayId] = useState<string | null>(null);

  // Fetch exercises for expanded day
  const { data: expandedExercises } = useQuery({
    queryKey: ['plan-exercises', expandedDayId],
    queryFn: async () => {
      if (!expandedDayId) return [];
      const { data, error } = await (supabase as any)
        .from('workout_plan_exercises')
        .select(`*, exercises(*)`)
        .eq('plan_day_id', expandedDayId)
        .order('sort_order', { ascending: true });
      if (error) return [];
      return (data ?? []) as WorkoutPlanExercise[];
    },
    enabled: !!expandedDayId,
  });

  return (
    <div className="space-y-3 pt-2">
      {planDays.map((day) => {
        const isToday = day.id === todayPlanDayId;
        const isExpanded = expandedDayId === day.id;

        return (
          <Card
            key={day.id}
            className={cn(
              'transition-all cursor-pointer',
              isToday && 'border-2 border-orange-500 bg-orange-500/10'
            )}
            onClick={() => setExpandedDayId(isExpanded ? null : day.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0',
                      isToday
                        ? 'bg-orange-500 text-white'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {day.day_number}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-foreground">{day.name}</h4>
                      {isToday && (
                        <Badge className="bg-orange-500 text-white text-xs px-2 py-0">
                          היום
                        </Badge>
                      )}
                    </div>
                    {day.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{day.description}</p>
                    )}
                  </div>
                </div>
                <ChevronLeft
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform',
                    isExpanded && '-rotate-90'
                  )}
                />
              </div>

              {/* Expanded: exercise list */}
              {isExpanded && expandedExercises && expandedExercises.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  {expandedExercises.map((pe) => {
                    const repsLabel =
                      pe.reps_min === pe.reps_max
                        ? `${pe.sets}×${pe.reps_min}`
                        : `${pe.sets}×${pe.reps_min}-${pe.reps_max}`;

                    return (
                      <div key={pe.id} className="flex items-center justify-between gap-2">
                        <span className="text-sm text-foreground">{pe.exercises.name}</span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Badge
                            variant="outline"
                            className="text-xs border-orange-300 text-orange-700"
                          >
                            {repsLabel}
                          </Badge>
                          {pe.exercises.muscle_groups?.map((mg) => (
                            <Badge key={mg} variant="secondary" className="text-xs">
                              {mg}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    );
                  })}
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
// Tab 3 — History
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
  const { assignment, plan, planDays, todayPlanDay, todayExercises, isLoading } = useWorkoutPlan();
  const { sessions, logSession, isLoading: isSessionsLoading } = useWorkoutSession();
  const [activeSession, setActiveSession] = useState(false);

  // Check whether today's workout was already done
  const today = new Date().toISOString().split('T')[0];
  const alreadyDoneToday = sessions.some((s) => {
    const sessionDate = s.completed_at.split('T')[0];
    return sessionDate === today && s.plan_day_id === todayPlanDay?.id;
  }) || sessions.some((s) => {
    const sessionDate = new Date(s.completed_at).toISOString().split('T')[0];
    return sessionDate === today && s.workout_plan_days?.id === todayPlanDay?.id;
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
    if (!todayPlanDay) return;
    const mappedLogs = exerciseLogs.map((l) => ({
      exerciseId: l.exerciseId,
      sets: l.sets.map((s) => ({
        reps: parseInt(s.reps) || 0,
        weightKg: parseFloat(s.weightKg) || 0,
      })),
    }));
    await logSession(todayPlanDay.id, durationMinutes, mappedLogs);
    setActiveSession(false);
  };

  return (
    <>
    {activeSession && todayPlanDay && (
      <WorkoutActiveSession
        planDay={todayPlanDay}
        exercises={todayExercises}
        onClose={() => setActiveSession(false)}
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
      <Tabs defaultValue="today" dir="rtl" className="w-full">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="today" className="text-sm">
            <Dumbbell className="h-3.5 w-3.5 ml-1" />
            אימון היום
          </TabsTrigger>
          <TabsTrigger value="week" className="text-sm">
            <CalendarDays className="h-3.5 w-3.5 ml-1" />
            כל השבוע
          </TabsTrigger>
          <TabsTrigger value="history" className="text-sm">
            <History className="h-3.5 w-3.5 ml-1" />
            היסטוריה
          </TabsTrigger>
        </TabsList>

        {/* Tab 1 — Today */}
        <TabsContent value="today">
          {planDays.length > 0 ? (
            <TodayTab
              planName={plan.name}
              planDays={planDays}
              todayDayId={todayPlanDay?.id ?? null}
              logSession={logSession}
              alreadyDoneToday={alreadyDoneToday}
              onStartSession={() => setActiveSession(true)}
            />
          ) : (
            <Card className="mt-4">
              <CardContent className="pt-6 pb-6 text-center text-muted-foreground">
                לא הוגדרו ימים בתוכנית האימון
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab 2 — Full week */}
        <TabsContent value="week">
          <WeekTab
            planDays={planDays}
            todayPlanDayId={todayPlanDay?.id ?? null}
          />
        </TabsContent>

        {/* Tab 3 — History */}
        <TabsContent value="history">
          <HistoryTab sessions={sessions} isLoading={isSessionsLoading} />
        </TabsContent>
      </Tabs>
    </div>
    </>
  );
}
