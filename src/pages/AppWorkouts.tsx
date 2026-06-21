import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Dumbbell, CheckCircle, Clock, History, Play, ChevronDown, ChevronUp, Pencil, X, Footprints, Trash2, ChevronRight, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
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
// UnifiedWeekBar — one row for the whole page showing workout + walk days
// ---------------------------------------------------------------------------
function UnifiedWeekBar({ userId }: { userId: string }) {
  const todayWd = new Date().getDay();

  const { data: workoutDays } = useQuery({
    queryKey: ['unified-workout-days', userId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('workout_day_schedule')
        .select('weekday')
        .eq('user_id', userId);
      return (data ?? []).map((r: { weekday: number }) => r.weekday) as number[];
    },
  });

  const { data: walkDays } = useQuery({
    queryKey: ['walk-days', userId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('user_walking_schedule')
        .select('day_of_week')
        .eq('user_id', userId)
        .eq('is_active', true)
        .not('day_of_week', 'is', null);
      return (data ?? []).map((r: { day_of_week: number }) => r.day_of_week) as number[];
    },
  });

  const wDays = workoutDays ?? [];
  const wlDays = walkDays ?? [];

  return (
    <div className="flex gap-1.5">
      {WEEKDAY_LABELS.map((label, wd) => {
        const isWorkout = wDays.includes(wd);
        const isWalk = wlDays.includes(wd);
        const isToday = wd === todayWd;
        const isActive = isWorkout || isWalk;

        return (
          <div
            key={wd}
            className={cn(
              'flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl transition-all',
              isActive && 'bg-orange-500 text-white shadow-sm',
              !isActive && isToday && 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 border border-orange-300',
              !isActive && !isToday && 'bg-muted/60 text-muted-foreground',
            )}
          >
            <span className="text-xs font-bold">{label}</span>
            {isToday && <span className="text-[9px] font-semibold leading-none">היום</span>}
            {isWorkout && <Dumbbell className="h-2.5 w-2.5" />}
            {isWalk && !isWorkout && <Footprints className="h-2.5 w-2.5" />}
            {isWorkout && isWalk && <Footprints className="h-2.5 w-2.5" />}
          </div>
        );
      })}
    </div>
  );
}

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
  onStartSession: (exercises: WorkoutPlanExercise[]) => void;
}

function WorkoutDayCard({
  day,
  scheduledWeekday,
  todayWeekday,
  alreadyDoneToday,
  isExpanded,
  onToggleExpand,
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
              <p className="text-xs mt-0.5">
                {scheduledWeekday !== undefined
                  ? <span className="text-orange-500 font-medium">יום {WEEKDAY_LABELS[scheduledWeekday]}</span>
                  : <span className="text-muted-foreground">לא נקבע יום אימון</span>}
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
// ---------------------------------------------------------------------------
// Walking
// ---------------------------------------------------------------------------
interface WalkEntry {
  id: string;
  walk_number: 1 | 2;
  week_start: number;
  day_of_week: number | null;
  is_active: boolean;
}

function WalkCard({
  walk,
  isCompletedToday,
  onMarkComplete,
}: {
  walk: WalkEntry;
  isCompletedToday: boolean;
  onMarkComplete: () => void;
}) {
  const todayWd = new Date().getDay();
  const isToday = walk.day_of_week === todayWd;
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card className={cn('transition-all', isToday && 'border-2 border-orange-500')}>
      <CardContent className="p-4 space-y-3">
        {/* Header — click to expand */}
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setIsExpanded(p => !p)}
        >
          <div className="flex items-center gap-3">
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
              isCompletedToday ? 'bg-green-500 text-white' : isToday ? 'bg-orange-500 text-white' : 'bg-muted text-muted-foreground')}>
              {isCompletedToday ? <Check className="h-4 w-4" /> : <Footprints className="h-4 w-4" />}
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h4 className="font-semibold text-foreground">
                  הליכה {walk.walk_number === 1 ? 'ראשונה' : 'שנייה'}
                </h4>
                {isCompletedToday && (
                  <Badge className="bg-green-500 text-white text-xs px-2 py-0">הושלם היום ✓</Badge>
                )}
                {isToday && !isCompletedToday && (
                  <Badge className="bg-orange-500 text-white text-xs px-2 py-0">היום</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">20-30 דקות • קצב רגיל</p>
              <p className="text-xs mt-0.5">
                {walk.day_of_week !== null
                  ? <span className="text-orange-500 font-medium">יום {WEEKDAY_LABELS[walk.day_of_week]}</span>
                  : <span className="text-muted-foreground">טרם נקבע יום</span>}
              </p>
            </div>
          </div>
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform flex-shrink-0', isExpanded && 'rotate-180')} />
        </div>

        {/* Expanded: complete button */}
        {isExpanded && (
          <div className="border-t border-border pt-3">
            {isCompletedToday ? (
              <div className="flex items-center justify-center gap-1.5 text-green-500 text-sm font-medium py-1">
                <Check className="h-4 w-4" />
                ההליכה נרשמה להיום
              </div>
            ) : (
              <Button
                className="w-full h-10 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl"
                onClick={e => { e.stopPropagation(); onMarkComplete(); }}
              >
                <Footprints className="h-4 w-4 ml-2" />
                סיימתי את ההליכה!
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WalkingSection({ userId, currentWeek }: { userId: string; currentWeek: number }) {
  const [walks, setWalks] = useState<WalkEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [todayCompletedIds, setTodayCompletedIds] = useState<Set<string>>(new Set());

  const todayStr = new Date().toISOString().split('T')[0];

  const load = async () => {
    const { data: existing } = await (supabase as any)
      .from('user_walking_schedule')
      .select('*')
      .eq('user_id', userId)
      .order('walk_number');
    let list = (existing || []) as WalkEntry[];

    if (!list.find(w => w.walk_number === 1)) {
      const { data: w1 } = await (supabase as any)
        .from('user_walking_schedule')
        .insert({ user_id: userId, walk_number: 1, week_start: 1 })
        .select().single();
      if (w1) list = [...list, w1 as WalkEntry];
    }

    const walk1 = list.find(w => w.walk_number === 1);
    if (!list.find(w => w.walk_number === 2) && currentWeek >= 4 && walk1?.is_active) {
      const { data: w2 } = await (supabase as any)
        .from('user_walking_schedule')
        .insert({ user_id: userId, walk_number: 2, week_start: 4 })
        .select().single();
      if (w2) list = [...list, w2 as WalkEntry];
    }

    setWalks(list.filter(w => w.is_active).sort((a, b) => a.walk_number - b.walk_number));

    // Check if already completed a walk today
    const { data: todayLogs } = await supabase
      .from('activity_log')
      .select('id')
      .eq('user_id', userId)
      .eq('activity_type', 'walk')
      .eq('completed_at', todayStr);
    if (todayLogs && todayLogs.length > 0) {
      // Mark all walk cards as completed today (activity_log doesn't distinguish which walk)
      setTodayCompletedIds(new Set(list.filter(w => w.is_active).map(w => w.id)));
    }

    setIsLoading(false);
  };

  useEffect(() => { load(); }, [userId]);

  const handleMarkComplete = async (walkId: string) => {
    // Check if already logged today
    const { data: existing } = await supabase
      .from('activity_log')
      .select('id')
      .eq('user_id', userId)
      .eq('activity_type', 'walk')
      .eq('completed_at', todayStr);

    if (existing && existing.length > 0) {
      toast({ title: 'כבר נרשמה היום!', description: 'הליכה כבר סומנה להיום' });
      setTodayCompletedIds(prev => new Set([...prev, walkId]));
      return;
    }

    await supabase.from('activity_log').insert({
      user_id: userId,
      activity_type: 'walk',
      completed_at: todayStr,
    });

    // Enforce 10-walk limit
    const { data: allWalks } = await supabase
      .from('activity_log')
      .select('id, completed_at')
      .eq('user_id', userId)
      .eq('activity_type', 'walk')
      .order('completed_at', { ascending: true });
    if (allWalks && allWalks.length > 10) {
      const toDelete = allWalks.slice(0, allWalks.length - 10);
      await supabase.from('activity_log').delete().in('id', toDelete.map((w: { id: string }) => w.id));
    }

    setTodayCompletedIds(prev => new Set([...prev, walkId]));
    toast({ title: 'מעולה! 💪', description: 'ההליכה נרשמה בהצלחה' });
  };

  const [editWalksOpen, setEditWalksOpen] = useState(false);
  const [draftWalkDays, setDraftWalkDays] = useState<Map<string, number | null>>(new Map());
  const [isSavingWalks, setIsSavingWalks] = useState(false);
  const todayWd = new Date().getDay();

  const openEditWalks = () => {
    const draft = new Map<string, number | null>();
    for (const w of walks) draft.set(w.id, w.day_of_week);
    setDraftWalkDays(draft);
    setEditWalksOpen(true);
  };

  const saveWalkDays = async () => {
    setIsSavingWalks(true);
    await Promise.all(
      Array.from(draftWalkDays.entries()).map(([id, day]) =>
        (supabase as any).from('user_walking_schedule').update({ day_of_week: day }).eq('id', id)
      )
    );
    setWalks(prev => prev.map(w => ({ ...w, day_of_week: draftWalkDays.get(w.id) ?? w.day_of_week })));
    setIsSavingWalks(false);
    setEditWalksOpen(false);
    toast({ title: 'ימי ההליכה עודכנו' });
  };

  if (isLoading) return (
    <div className="space-y-3 pt-4">
      {[0,1].map(i => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
    </div>
  );

  if (walks.length === 0) return null;

  return (
    <div className="pt-3 space-y-3">
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2">
          <Footprints className="h-4 w-4 text-orange-500" />
          <h3 className="text-sm font-semibold text-muted-foreground">הליכות שבועיות</h3>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={openEditWalks}>
          <Pencil className="h-3.5 w-3.5" />
          ערוך הליכות
        </Button>
      </div>

      {/* Edit walks dialog */}
      <Dialog open={editWalksOpen} onOpenChange={setEditWalksOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>עריכת ימי הליכה</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {walks.map(w => {
              const current = draftWalkDays.get(w.id) ?? null;
              return (
                <div key={w.id} className="space-y-2">
                  <p className="text-sm font-semibold">הליכה {w.walk_number === 1 ? 'ראשונה' : 'שנייה'}</p>
                  <div className="flex gap-1">
                    {WEEKDAY_LABELS.map((label, wd) => (
                      <button
                        key={wd}
                        type="button"
                        onClick={() => setDraftWalkDays(prev => {
                          const next = new Map(prev);
                          next.set(w.id, current === wd ? null : wd);
                          return next;
                        })}
                        className={cn(
                          'flex-1 py-2 rounded-xl text-xs font-semibold transition-all',
                          current === wd
                            ? 'bg-orange-500 text-white shadow-md'
                            : wd === todayWd
                            ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 border border-orange-300'
                            : 'bg-muted text-muted-foreground hover:bg-muted/70'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
              onClick={saveWalkDays}
              disabled={isSavingWalks}
            >
              שמור
            </Button>
            <Button variant="outline" onClick={() => setEditWalksOpen(false)}>ביטול</Button>
          </div>
        </DialogContent>
      </Dialog>

      {walks.map(w => (
        <WalkCard
          key={w.id}
          walk={w}
          isCompletedToday={todayCompletedIds.has(w.id)}
          onMarkComplete={() => handleMarkComplete(w.id)}
        />
      ))}
    </div>
  );
}

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
  const [editScheduleOpen, setEditScheduleOpen] = useState(false);
  const [draftSchedule, setDraftSchedule] = useState<Map<string, number | null>>(new Map());
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const todayWeekday = new Date().getDay();

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

  const openEditSchedule = () => {
    const draft = new Map<string, number | null>();
    for (const day of planDays) {
      const wd = scheduleMap.get(day.id);
      draft.set(day.id, wd !== undefined ? wd : null);
    }
    setDraftSchedule(draft);
    setEditScheduleOpen(true);
  };

  const handleSaveSingleDay = async (planDayId: string, weekday: number | null) => {
    if (weekday === null) {
      await (supabase as any).from('workout_day_schedule').delete().eq('user_id', userId).eq('plan_day_id', planDayId);
    } else {
      await (supabase as any).from('workout_day_schedule').upsert(
        { user_id: userId, plan_day_id: planDayId, weekday },
        { onConflict: 'user_id,plan_day_id' }
      );
    }
  };

  const saveAllSchedule = async () => {
    setIsSavingSchedule(true);
    await Promise.all(Array.from(draftSchedule.entries()).map(([id, wd]) => handleSaveSingleDay(id, wd)));
    queryClient.invalidateQueries({ queryKey: ['workout-day-schedule', userId] });
    queryClient.invalidateQueries({ queryKey: ['unified-workout-days', userId] });
    queryClient.invalidateQueries({ queryKey: ['today-workout', userId] });
    setIsSavingSchedule(false);
    setEditScheduleOpen(false);
    toast({ title: 'לוח האימונים עודכן' });
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
      {/* Edit schedule button */}
      <div className="flex items-center justify-between px-0.5">
        <p className="text-sm font-semibold text-muted-foreground">ימי האימון</p>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={openEditSchedule}
        >
          <Pencil className="h-3.5 w-3.5" />
          ערוך לוח
        </Button>
      </div>

      {/* Edit schedule dialog */}
      <Dialog open={editScheduleOpen} onOpenChange={setEditScheduleOpen}>
        <DialogContent dir="rtl" className="max-w-sm max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>עריכת לוח אימונים</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {planDays.map(day => {
              const current = draftSchedule.get(day.id) ?? null;
              return (
                <div key={day.id} className="space-y-2">
                  <p className="text-sm font-semibold">{day.name}</p>
                  <div className="flex gap-1">
                    {WEEKDAY_LABELS.map((label, wd) => (
                      <button
                        key={wd}
                        type="button"
                        onClick={() => setDraftSchedule(prev => {
                          const next = new Map(prev);
                          next.set(day.id, current === wd ? null : wd);
                          return next;
                        })}
                        className={cn(
                          'flex-1 py-2 rounded-xl text-xs font-semibold transition-all',
                          current === wd
                            ? 'bg-orange-500 text-white shadow-md'
                            : wd === todayWeekday
                            ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 border border-orange-300'
                            : 'bg-muted text-muted-foreground hover:bg-muted/70'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
              onClick={saveAllSchedule}
              disabled={isSavingSchedule}
            >
              שמור
            </Button>
            <Button variant="outline" onClick={() => setEditScheduleOpen(false)}>
              ביטול
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
  onDeleteSession: (id: string) => void;
}

interface ExerciseLogEntry {
  exercise_id: string;
  set_number: number;
  reps: number;
  weight_kg: number;
  exercises: { name: string } | null;
}

function HistoryTab({ sessions, isLoading, onDeleteSession }: HistoryTabProps) {
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
                <div className="flex flex-col items-end gap-1.5">
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
                  <button
                    onClick={() => onDeleteSession(session.id)}
                    className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors mt-0.5"
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
  const { user, currentWeek } = useAuth();
  const { assignment, plan, planDays, isLoading } = useWorkoutPlan();
  const { sessions, logSession, deleteSession, isLoading: isSessionsLoading } = useWorkoutSession();
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

      {/* Unified week bar */}
      {user && <UnifiedWeekBar userId={user.id} />}

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
            <>
              <WorkoutsTab
                userId={user.id}
                planDays={planDays}
                sessions={sessions}
                onStartSession={handleStartSession}
              />
              <WalkingSection userId={user.id} currentWeek={currentWeek} />
            </>
          )}
        </TabsContent>

        <TabsContent value="history">
          <HistoryTab sessions={sessions} isLoading={isSessionsLoading} onDeleteSession={deleteSession} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
