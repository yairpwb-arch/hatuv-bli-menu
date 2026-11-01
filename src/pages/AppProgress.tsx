import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Flame, CalendarCheck, BookOpen, Dumbbell, Trash2, Loader2 } from 'lucide-react';
import { format, startOfMonth } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useStepLogs } from '@/hooks/useStepLogs';
import { useStepCounter } from '@/hooks/useStepCounter';
import { useStreak } from '@/hooks/useStreak';
import { successHaptic } from '@/lib/native';
import { DEFAULT_STEP_GOAL } from '@/lib/stepGoal';
import { Pill, StatTile } from '@/components/ds';
import { WeightHeroCard } from '@/components/progress/WeightHeroCard';
import { WeightTrendCard } from '@/components/progress/WeightTrendCard';
import { StepsCard } from '@/components/progress/StepsCard';
import { BeforeNowCard, ProgressPhoto } from '@/components/progress/BeforeNowCard';
import { withSignedUrls } from '@/lib/bodyPhotos';
import { guideBody } from '@/lib/guideBlocks';
import {
  WeightEntry, formatKg, formatNumber, parseDay, sortWeights, weightOnOrBefore,
} from '@/components/progress/format';

interface ProfileData {
  start_date: string | null;
  initial_weight: number | null;
  target_weight: number | null;
}

function openExternalLink(raw: string) {
  const trimmed = raw.trim();
  // Bare email → mailto:, otherwise assume it needs https:// (and leave
  // anything that already has a scheme, e.g. mailto:/tel:, as-is).
  const url = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
    ? `mailto:${trimmed}`
    : `https://${trimmed}`;
  window.open(url, Capacitor.isNativePlatform() ? '_system' : '_blank');
}

export default function AppProgress() {
  const { user, currentDay, currentWeek } = useAuth();
  const navigate = useNavigate();
  const { currentStreak, perfectDaysThisMonth } = useStreak(user?.id, currentWeek);

  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [lessons, setLessons] = useState({ done: 0, total: 0 });
  const [workoutsThisMonth, setWorkoutsThisMonth] = useState(0);
  const [fromStartAverage, setFromStartAverage] = useState<number | null>(null);
  const [weighingGuideLink, setWeighingGuideLink] = useState('');
  const [weighingGuideId, setWeighingGuideId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  // The Friday weigh-in reminder opens /app/progress?weigh=1 straight into adding a weight.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('weigh') !== '1') return;
    setIsWeightModalOpen(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [newWeight, setNewWeight] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingWeightId, setDeletingWeightId] = useState<string | null>(null);

  // Steps — DB logs for history, live counter for today on device
  const { logs: stepLogs, todaySteps, weeklyAverage } = useStepLogs();
  const { stepData } = useStepCounter(user?.id);
  const liveSteps = Capacitor.isNativePlatform() ? stepData.steps : todaySteps;

  const fetchWeights = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('weight_log')
      .select('id, recorded_at, weight, created_at')
      .eq('user_id', user.id);
    setWeights(sortWeights(data || []));
  }, [user]);

  const fetchPhotos = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('transformation_photos')
      .select('id, photo_url, photo_type, taken_at')
      .eq('user_id', user.id)
      .order('taken_at', { ascending: true })
      .order('created_at', { ascending: true });
    // Private body photos are shown through short-lived signed links.
    setPhotos(await withSignedUrls((data as ProgressPhoto[]) || []));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const monthStart = startOfMonth(new Date()).toISOString();
      const [profileRes, settingsRes, contentRes, progressRes, workoutsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('start_date, initial_weight, target_weight')
          .eq('id', user.id)
          .single(),
        supabase.from('app_settings').select('key, value').eq('key', 'weighing_guide_link'),
        supabase.from('program_content').select('*').filter('archived_at', 'is', null),
        supabase.from('content_progress').select('content_id').eq('user_id', user.id),
        (supabase as any)
          .from('workout_session_logs')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('completed_at', monthStart),
        fetchWeights(),
        fetchPhotos(),
      ]);
      if (cancelled) return;

      if (profileRes.data) setProfile(profileRes.data);
      setWeighingGuideLink(settingsRes.data?.[0]?.value || '');
      // The weighing guide in the app, when it's written there.
      const inApp = ((contentRes.data || []) as { id: string; title: string; body?: unknown }[]).find((c) => c.title.includes('להישקל') && guideBody(c.body));
      setWeighingGuideId(inApp?.id ?? null);
      const contentIds = new Set((contentRes.data || []).map((c) => c.id));
      const done = new Set(
        (progressRes.data || []).map((p) => p.content_id).filter((id) => contentIds.has(id)),
      ).size;
      setLessons({ done, total: contentIds.size });
      setWorkoutsThisMonth(workoutsRes.count ?? 0);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, currentDay, fetchWeights, fetchPhotos]);

  // Average daily steps since the program started (days with steps only)
  useEffect(() => {
    if (!user || !profile?.start_date) return;
    (supabase as any)
      .from('steps_log')
      .select('steps')
      .eq('user_id', user.id)
      .gte('date', profile.start_date)
      .gt('steps', 0)
      .then(({ data }: { data: { steps: number }[] | null }) => {
        if (!data || data.length === 0) return;
        setFromStartAverage(Math.round(data.reduce((s, r) => s + r.steps, 0) / data.length));
      });
  }, [user, profile?.start_date]);

  // "Current" weight is always the newest weigh-in by date — never the
  // questionnaire value or a possibly stale profiles.current_weight.
  const latestWeight = weights.length > 0 ? weights[weights.length - 1].weight : null;
  const startWeight = profile?.initial_weight ?? weights[0]?.weight ?? null;

  const weightAt = useMemo(
    () => (day: string) => weightOnOrBefore(weights, day) ?? startWeight,
    [weights, startWeight],
  );

  const handleAddWeight = async () => {
    if (!user || !newWeight) return;
    const weightValue = parseFloat(newWeight);
    if (isNaN(weightValue) || weightValue <= 0) {
      toast.error('נא להזין משקל תקין');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('weight_log').insert({
        user_id: user.id,
        weight: weightValue,
        recorded_at: format(new Date(), 'yyyy-MM-dd'),
      });
      if (error) throw error;

      // profiles.current_weight is kept in sync by the weight_log trigger
      successHaptic();
      toast.success('השקילה נוספה בהצלחה');
      setNewWeight('');
      setIsWeightModalOpen(false);
      fetchWeights();
    } catch (error) {
      console.error('Error adding weight:', error);
      toast.error('שגיאה בהוספת השקילה');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteWeight = async (entryId: string) => {
    setDeletingWeightId(entryId);
    // .select() so a silent RLS no-op (0 rows affected, no error) is
    // distinguishable from an actual delete.
    const { data, error } = await supabase.from('weight_log').delete().eq('id', entryId).select('id');
    if (error || !data || data.length === 0) {
      toast.error('שגיאה במחיקת השקילה');
    } else {
      // profiles.current_weight is recomputed by the weight_log trigger
      setWeights((prev) => prev.filter((w) => w.id !== entryId));
      toast.success('השקילה נמחקה');
    }
    setDeletingWeightId(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen pb-24 pt-4 px-4 space-y-card-gap">
        <Skeleton className="h-12 w-56 rounded-2xl" />
        <Skeleton className="h-72 rounded-3xl" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-24 rounded-3xl" />
          <Skeleton className="h-24 rounded-3xl" />
          <Skeleton className="h-24 rounded-3xl" />
        </div>
        <Skeleton className="h-80 rounded-3xl" />
      </div>
    );
  }

  const tiles = [
    { icon: CalendarCheck, value: formatNumber(perfectDaysThisMonth), label: 'ימים מושלמים', sub: 'החודש' },
    { icon: BookOpen, value: `${lessons.done}/${lessons.total}`, label: 'שיעורים', sub: 'הושלמו' },
    { icon: Dumbbell, value: formatNumber(workoutsThisMonth), label: 'אימונים', sub: 'החודש' },
  ];

  return (
    <div className="min-h-screen pb-24 pt-4 px-4 space-y-card-gap">
      {/* Header */}
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-screen-title">ההתקדמות שלי</h2>
          <p className="text-body text-muted-foreground">
            יום {currentDay} במסע · שלב {currentWeek}
          </p>
        </div>
        <Pill tone="brand" icon={Flame} className="mt-1" aria-label={`רצף של ${currentStreak} ימים`}>
          {currentStreak === 1 ? 'יום אחד' : `${formatNumber(currentStreak)} ימים`}
        </Pill>
      </header>

      <WeightHeroCard
        latestWeight={latestWeight}
        startWeight={startWeight}
        targetWeight={profile?.target_weight ?? null}
        onWeighIn={() => setIsWeightModalOpen(true)}
        onOpenGuide={
          weighingGuideId ? () => navigate(`/app/guides/${weighingGuideId}`) : weighingGuideLink ? () => openExternalLink(weighingGuideLink) : null
        }
      />

      <div className="grid grid-cols-3 gap-3">
        {tiles.map(({ icon, value, label, sub }) => (
          <StatTile key={label} icon={icon} value={value} label={label} caption={sub} />
        ))}
      </div>

      <WeightTrendCard
        weights={weights}
        targetWeight={profile?.target_weight ?? null}
        onOpenAll={() => setIsHistoryOpen(true)}
      />

      <StepsCard
        todaySteps={liveSteps}
        goal={DEFAULT_STEP_GOAL}
        logs={stepLogs}
        weeklyAverage={weeklyAverage}
        fromStartAverage={fromStartAverage}
      />

      {user && (
        <BeforeNowCard
          userId={user.id}
          currentDay={currentDay}
          photos={photos}
          weightAt={weightAt}
          onUploaded={fetchPhotos}
          onOpenAll={() => navigate('/app/profile')}
        />
      )}

      {/* Weight entry */}
      <Dialog open={isWeightModalOpen} onOpenChange={setIsWeightModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>שקילה של השבוע</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>משקל (ק"ג)</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="לדוגמה: 75.5"
                value={newWeight}
                onChange={(e) => setNewWeight(e.target.value)}
                className="text-lg h-12"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button onClick={handleAddWeight} disabled={isSubmitting || !newWeight}>
              {isSubmitting ? 'שומר...' : 'שמור שקילה'}
            </Button>
            <Button variant="outline" onClick={() => setIsWeightModalOpen(false)}>ביטול</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* All weigh-ins, with delete */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>כל השקילות ({weights.length})</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-1.5 pt-2">
            {[...weights].reverse().map((w) => (
              <div key={w.id} className="flex items-center justify-between rounded-xl bg-muted/40 pr-3 text-sm">
                <span className="text-muted-foreground tabular-nums">
                  {format(parseDay(w.recorded_at), 'dd/MM/yyyy')}
                </span>
                <div className="flex items-center gap-1">
                  <span className="font-semibold tabular-nums">{formatKg(w.weight)} ק"ג</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteWeight(w.id)}
                    disabled={deletingWeightId === w.id}
                    aria-label={`מחיקת השקילה מ-${format(parseDay(w.recorded_at), 'd/M')}`}
                    className="h-11 w-11 inline-flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                  >
                    {deletingWeightId === w.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" strokeWidth={2} />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
