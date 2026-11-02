import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { ClipboardList, Flame, Footprints, Play, Scale } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useHabits } from '@/hooks/useHabits';
import { useStreak } from '@/hooks/useStreak';
import { useStepCounter } from '@/hooks/useStepCounter';
import { useStepGoal } from '@/hooks/useStepGoal';
import { Capacitor } from '@capacitor/core';
import { format } from 'date-fns';
import { successHaptic } from '@/lib/native';
import { Card, Pill } from '@/components/ds';
import { HabitTable } from '@/components/home/HabitTable';
import WeeklySurveyModal from '@/components/WeeklySurveyModal';
import { NightScreen } from '@/components/home/NightScreen';
import { useSleepSchedule } from '@/hooks/useSleepSchedule';
import { isTableKey, shortLabel } from '@/lib/habitVisuals';
import { showUndo } from '@/lib/undoToast';
import type { Habit } from '@/hooks/useHabits';
import { isNight } from '@/lib/sleepSchedule';
import { TodayAgenda } from '@/components/home/TodayAgenda';
import { formatNumber } from '@/components/progress/format';

const STEPS_PER_MINUTE = 100;
const RING_R = 26;
const RING_C = 2 * Math.PI * RING_R;

/** 5–12 morning, 12–17 afternoon, 17–22 evening, 22–5 night. */
function greeting(hour = new Date().getHours()) {
  if (hour >= 5 && hour < 12) return 'בוקר טוב';
  if (hour >= 12 && hour < 17) return 'צהריים טובים';
  if (hour >= 17 && hour < 22) return 'ערב טוב';
  return 'לילה טוב';
}

function StepsCompact({ steps, goal, onStartWalk }: { steps: number; goal: number; onStartWalk: () => void }) {
  const ratio = Math.min(steps / goal, 1);
  const remaining = Math.max(goal - steps, 0);
  return (
    <Card className="flex items-center gap-4 py-4">
      <div className="relative h-16 w-16 shrink-0">
        <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="32" cy="32" r={RING_R} fill="none" stroke="hsl(var(--card-inner))" strokeWidth="7" />
          <circle
            cx="32" cy="32" r={RING_R} fill="none" stroke="hsl(var(--primary))" strokeWidth="7" strokeLinecap="round"
            strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - ratio)}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <Footprints className="absolute inset-0 m-auto h-5 w-5 text-primary" strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="text-stat tabular-nums">{formatNumber(steps)}</p>
        <p className="text-label text-muted-foreground">
          {remaining > 0
            ? `עוד ${formatNumber(remaining)} צעדים · בערך ${Math.ceil(remaining / STEPS_PER_MINUTE)} דקות הליכה`
            : `עברת את היעד של ${formatNumber(goal)} צעדים`}
        </p>
      </div>
      <button
        type="button"
        onClick={onStartWalk}
        aria-label="התחל הליכה"
        className="mr-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary"
      >
        <Play className="h-5 w-5" strokeWidth={2} fill="currentColor" />
      </button>
    </Card>
  );
}

export default function AppHome() {
  const navigate = useNavigate();
  const { profile, currentDay, currentWeek, planDays, user, refreshProfile } = useAuth();
  const [weight, setWeight] = useState('');
  const [isWeightDialogOpen, setIsWeightDialogOpen] = useState(false);
  const [todayStepsDb, setTodayStepsDb] = useState<number | null>(null);
  const { stepData } = useStepCounter(user?.id);
  const todaySteps = Capacitor.isNativePlatform() ? stepData.steps : (todayStepsDb ?? 0);
  const { currentStreak, refetch: refetchStreak } = useStreak(user?.id, currentWeek);

  const isWeighInDay = currentDay % 7 === 0;
  const today = format(new Date(), 'yyyy-MM-dd');

  const { habits, isLoading: isLoadingHabits, toggleHabit, refetch: refetchHabits } =
    useHabits(user?.id, currentDay, today, planDays);
  // Food habits sit on the table.
  const tableHabits = habits.filter((h) => isTableKey(h.visual_key));

  // Empty table: say when the first habit opens.
  const [firstOpens, setFirstOpens] = useState<string | null>(null);
  useEffect(() => {
    if (isLoadingHabits || tableHabits.length > 0 || !user) return;
    let cancelled = false;
    // day_start isn't in the generated types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('habit_definitions')
      .select('day_start')
      .gt('day_start', currentDay)
      .or(`user_id.is.null,user_id.eq.${user.id}`)
      .order('day_start', { ascending: true })
      .limit(1)
      .then(({ data }: { data: { day_start: number }[] | null }) => {
        if (cancelled) return;
        const next = data?.[0] ? data[0].day_start - currentDay : null;
        const days = next != null && next > 0 ? next : null;
        setFirstOpens(days == null ? null : days === 1 ? 'מחר' : days === 2 ? 'בעוד יומיים' : `בעוד ${days} ימים`);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoadingHabits, tableHabits.length, user, currentDay]);

  // Ticking a habit offers a 5-second undo; either way the streak is recounted.
  const toggleOnTable = async (h: Habit) => {
    await toggleHabit(h.id, h.completed);
    refetchStreak();
    if (h.completed) return;
    showUndo(`סומן כבוצע: ${shortLabel(h)}`, async () => {
      await toggleHabit(h.id, true);
      refetchStreak();
    });
  };

  // Sleep hours drive night mode.
  const { schedule: sleep } = useSleepSchedule(user?.id);
  const { goal: stepGoal } = useStepGoal();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  // The weekly survey: Fridays, until it's filled in (a card here; the reminders open it with ?survey=1).
  const isFriday = now.getDay() === 5;
  const surveyQuery = useQuery({
    queryKey: ['weekly-checkin', user?.id, currentWeek],
    enabled: !!user && isFriday,
    queryFn: async () => {
      // weekly_checkin isn't in the generated types yet.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from('weekly_checkin').select('id').eq('user_id', user!.id).eq('week_number', currentWeek).maybeSingle();
      return !!data;
    },
  });
  const surveyPending = isFriday && surveyQuery.data === false;
  const [searchParams, setSearchParams] = useSearchParams();
  const [surveyOpen, setSurveyOpen] = useState(false);
  useEffect(() => {
    if (searchParams.get('survey') !== '1') return;
    setSurveyOpen(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  // Night mode: the trainee can step past it once per night.
  const nightKey = `nightDismissed:${format(new Date(now.getTime() - 12 * 3600_000), 'yyyy-MM-dd')}`;
  const [nightDismissed, setNightDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(nightKey) === '1';
    } catch {
      return false;
    }
  });
  const dismissNight = () => {
    try {
      sessionStorage.setItem(nightKey, '1');
    } catch {
      /* storage blocked: dismissed for this visit only */
    }
    setNightDismissed(true);
  };
  const showNight = isNight(sleep, now) && !nightDismissed && !surveyOpen;

  useEffect(() => {
    if (!user) return;
    supabase
      .from('steps_log')
      .select('steps')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setTodayStepsDb(data.steps);
      });
  }, [user, today]);

  const handleWeightSubmit = async () => {
    if (!user || !weight) return;
    const weightNum = parseFloat(weight);
    if (isNaN(weightNum) || weightNum < 30 || weightNum > 300) {
      toast({ title: 'שגיאה', description: 'אנא הזן משקל תקין', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('weight_log').insert({ user_id: user.id, weight: weightNum });
    if (error) {
      toast({ title: 'שגיאה', description: 'לא ניתן לשמור את המשקל', variant: 'destructive' });
      return;
    }
    // profiles.current_weight is kept in sync by the weight_log trigger
    await refreshProfile();
    successHaptic();
    toast({ title: 'נשמר!', description: 'המשקל נרשם בהצלחה' });
    setWeight('');
    setIsWeightDialogOpen(false);
  };

  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || '';

  return (
    <div className="min-h-screen space-y-card-gap px-4 pt-4 pb-[calc(3.5rem+1px+var(--app-safe-bottom)+16px)]">
      {/* 1. Greeting */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-screen-title">
            {greeting()}{firstName ? `, ${firstName}` : ''}
          </h2>
          <p className="text-body text-muted-foreground">
            יום {currentDay} במסע · שלב {currentWeek}
          </p>
        </div>
        <Pill tone="brand" icon={Flame} className="mt-1.5" aria-label={`רצף של ${currentStreak} ימים`}>
          {currentStreak === 1 ? 'יום אחד' : `${currentStreak} ימים`}
        </Pill>
      </header>

      {/* The weekly survey, on Fridays until it's filled in */}
      {surveyPending && (
        <button
          type="button"
          onClick={() => setSurveyOpen(true)}
          className="flex min-h-[56px] w-full items-center gap-3 rounded-card border border-primary/40 bg-card px-4 text-right"
        >
          <ClipboardList className="h-5 w-5 shrink-0 text-primary" strokeWidth={2} aria-hidden />
          <span className="flex-1 text-body font-semibold">השאלון השבועי מחכה לך</span>
          <span className="text-label font-semibold text-primary-soft">למילוי</span>
        </button>
      )}
      <WeeklySurveyModal
        open={surveyOpen}
        onClose={() => {
          setSurveyOpen(false);
          surveyQuery.refetch();
        }}
        currentWeek={currentWeek}
      />
      {showNight && (
        <NightScreen
          wake={sleep.wake}
          onEnter={dismissNight}
        />
      )}

      {/* 2. The plate */}
      {isLoadingHabits ? (
        <Skeleton className="h-[380px] rounded-card" />
      ) : (
        <HabitTable
          habits={tableHabits}
          onToggle={toggleOnTable}
          onPerfectDay={refetchStreak}
          firstOpens={firstOpens}
        />
      )}

      {/* 3. Steps */}
      <StepsCompact steps={todaySteps ?? 0} goal={stepGoal} onStartWalk={() => navigate('/app/walk')} />

      {/* Weigh-in day */}
      {isWeighInDay && (
        <Card className="flex items-center justify-between gap-3 border-primary/40">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-primary-tint">
              <Scale className="h-5 w-5 text-primary" strokeWidth={2} />
            </span>
            <div>
              <p className="text-body font-bold">היום שוקלים</p>
              <p className="text-label text-muted-foreground">בבוקר, לפני אוכל</p>
            </div>
          </div>
          <Button size="sm" onClick={() => setIsWeightDialogOpen(true)}>עדכון משקל</Button>
        </Card>
      )}
      <Dialog open={isWeightDialogOpen} onOpenChange={setIsWeightDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>עדכון משקל שבועי</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="weight">משקל בק"ג</Label>
              <Input
                id="weight"
                inputMode="decimal"
                placeholder="75.5"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                dir="ltr"
                className="h-14 text-left text-2xl"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button onClick={handleWeightSubmit}>שמירה</Button>
            <Button variant="outline" onClick={() => setIsWeightDialogOpen(false)}>ביטול</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 4. Today's agenda — the last card on the screen */}
      {user && <TodayAgenda userId={user.id} onChanged={refetchStreak} />}
    </div>
  );
}
