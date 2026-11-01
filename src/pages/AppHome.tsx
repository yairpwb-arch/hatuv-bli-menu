import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Flame, Footprints, Moon, Play, Scale } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useHabits } from '@/hooks/useHabits';
import { useStreak } from '@/hooks/useStreak';
import { useStepCounter } from '@/hooks/useStepCounter';
import { DEFAULT_STEP_GOAL } from '@/lib/stepGoal';
import { Capacitor } from '@capacitor/core';
import { format } from 'date-fns';
import { successHaptic } from '@/lib/native';
import { Card, Pill } from '@/components/ds';
import { HabitTable } from '@/components/home/HabitTable';
import { DailySummary } from '@/components/home/DailySummary';
import { NightScreen } from '@/components/home/NightScreen';
import { useDailySummary } from '@/hooks/useDailySummary';
import { useSleepSchedule } from '@/hooks/useSleepSchedule';
import { isTableKey, shortLabel, summaryHabitsOf } from '@/lib/habitVisuals';
import { showUndo } from '@/lib/undoToast';
import type { Habit } from '@/hooks/useHabits';
import { isNight, openSummaryDay } from '@/lib/sleepSchedule';
import { scheduleBedtimeReminders } from '@/lib/localReminders';
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
  // Food habits sit on the table; the rest are asked in the bedtime summary.
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
  const summaryHabits = summaryHabitsOf(habits);

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

  // Sleep hours drive the bedtime summary window and night mode.
  const { schedule: sleep, isReady: sleepReady } = useSleepSchedule(user?.id);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const summaryDay = openSummaryDay(sleep, now);
  const { summary, isLoading: isLoadingSummary, submit: submitSummary } = useDailySummary(user?.id, summaryDay);
  const summaryPending = !!summaryDay && !isLoadingSummary && !summary;

  const [searchParams, setSearchParams] = useSearchParams();
  const [summaryOpen, setSummaryOpen] = useState(false);
  // The bedtime notification opens /app?summary=1 straight into the summary.
  useEffect(() => {
    if (searchParams.get('summary') !== '1' || !sleepReady) return;
    if (summaryPending) setSummaryOpen(true);
    if (!summaryDay || !isLoadingSummary) setSearchParams({}, { replace: true });
  }, [searchParams, sleepReady, summaryPending, summaryDay, isLoadingSummary, setSearchParams]);

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
  const showNight = isNight(sleep, now) && !nightDismissed && !summaryOpen && searchParams.get('summary') !== '1';

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

      {/* Bedtime summary — only in its window (an hour either side of bedtime), until sent */}
      {summaryPending && (
        <button
          type="button"
          onClick={() => setSummaryOpen(true)}
          className="flex min-h-[56px] w-full items-center gap-3 rounded-card border border-primary/40 bg-card px-4 py-3 text-right"
        >
          <Moon className="h-5 w-5 shrink-0 text-primary" strokeWidth={2} aria-hidden />
          <span className="flex-1 text-body font-semibold">סיכום היום מחכה לך</span>
          <span className="text-label font-semibold text-primary-soft">20 שניות</span>
        </button>
      )}
      {summaryOpen && summaryDay && (
        <DailySummary
          day={summaryDay}
          habits={summaryHabits}
          firstName={firstName}
          onSubmit={async (input) => {
            const n = await submitSummary(input);
            if (n !== null) {
              refetchHabits();
              refetchStreak();
              scheduleBedtimeReminders(sleep, { enabled: true, skipDay: summaryDay });
            }
            return n;
          }}
          onClose={() => setSummaryOpen(false)}
        />
      )}
      {showNight && (
        <NightScreen
          wake={sleep.wake}
          onEnter={dismissNight}
          onOpenSummary={summaryPending ? () => setSummaryOpen(true) : undefined}
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
      <StepsCompact steps={todaySteps ?? 0} goal={DEFAULT_STEP_GOAL} onStartWalk={() => navigate('/app/walk')} />

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
