import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Scale, TrendingDown, ArrowDown, ArrowUp, Plus, Calendar as CalendarIcon,
  Footprints, Dumbbell, Sparkles, ExternalLink, BookOpen, AlertCircle, BarChart2
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { he } from 'date-fns/locale';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useStepLogs } from '@/hooks/useStepLogs';
import { useStepCounter } from '@/hooks/useStepCounter';

interface WeightEntry {
  id: string;
  recorded_at: string;
  weight: number;
}

interface ProfileData {
  start_date: string | null;
  current_weight: number | null;
  initial_weight: number | null;
  height: number | null;
}

interface Habit {
  id: string;
  name: string;
  completed: boolean;
}


const CIRCLE_RADIUS = 40;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS; // ~251.3

export default function AppProgress() {
  const { user, currentDay, currentWeek, currentWeekForHabits } = useAuth();
  const navigate = useNavigate();
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);

  const [isLoading, setIsLoading] = useState(true);

  // Weight modal state
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [newWeight, setNewWeight] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Steps state — DB logs for history, live counter for today's display
  const { logs: stepLogs, todaySteps, isLoading: stepsLoading } = useStepLogs();
  const { stepData } = useStepCounter(user?.id);
  const liveSteps = Capacitor.isNativePlatform() ? stepData.steps : todaySteps;

  // Step averages (from steps_log — auto-counted by pedometer)
  const [stepAverages, setStepAverages] = useState<{
    weekly: number | null;
    monthly: number | null;
    fromStart: number | null;
  }>({ weekly: null, monthly: null, fromStart: null });

  const stepGoal = stepAverages.weekly ?? 10_000;

  const today = new Date();
  const todayDayOfWeek = today.getDay();
  const isFriday = todayDayOfWeek === 5;
  const dateString = format(today, 'yyyy-MM-dd');

  // Build last-7-days scaffold for bar chart (fills missing days with 0)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(today, 6 - i);
    const dateKey = format(d, 'yyyy-MM-dd');
    const label = format(d, 'd/M');
    const found = stepLogs.find((log) => log.date === dateKey);
    return { date: label, steps: found?.steps ?? 0 };
  });

  const stepProgress = Math.min((liveSteps / stepGoal) * CIRCLE_CIRCUMFERENCE, CIRCLE_CIRCUMFERENCE);
  const strokeDashoffset = CIRCLE_CIRCUMFERENCE - stepProgress;

  const fetchStepAverages = useCallback(async () => {
    if (!user) return;
    const now = new Date();
    const sevenDaysAgo = format(subDays(now, 6), 'yyyy-MM-dd');
    const thirtyDaysAgo = format(subDays(now, 29), 'yyyy-MM-dd');

    const [weeklyRes, monthlyRes] = await Promise.all([
      (supabase as any).from('steps_log').select('steps').eq('user_id', user.id).gte('date', sevenDaysAgo),
      (supabase as any).from('steps_log').select('steps').eq('user_id', user.id).gte('date', thirtyDaysAgo),
    ]);

    const avg = (rows: { steps: number }[] | null) => {
      if (!rows || rows.length === 0) return null;
      return Math.round(rows.reduce((s: number, r: { steps: number }) => s + r.steps, 0) / rows.length);
    };

    // fromStart requires start_date — defer to profileData effect
    setStepAverages(prev => ({
      ...prev,
      weekly: avg(weeklyRes.data),
      monthly: avg(monthlyRes.data),
    }));
  }, [user]);

  // Fetch from-start average once profileData is known
  useEffect(() => {
    if (!user || !profileData?.start_date) return;
    (supabase as any)
      .from('steps_log')
      .select('steps')
      .eq('user_id', user.id)
      .gte('date', profileData.start_date)
      .then(({ data }: { data: { steps: number }[] | null }) => {
        if (!data || data.length === 0) return;
        const avg = Math.round(data.reduce((s, r) => s + r.steps, 0) / data.length);
        setStepAverages(prev => ({ ...prev, fromStart: avg }));
      });
  }, [user, profileData?.start_date]);

  useEffect(() => {
    fetchStepAverages();
  }, [fetchStepAverages]);

  const fetchData = async () => {
    if (!user) return;
    setIsLoading(true);

    const [profileRes, weightRes, habitsRes, habitLogsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('start_date, current_weight, initial_weight, height')
        .eq('id', user.id)
        .single(),
      supabase
        .from('weight_log')
        .select('id, recorded_at, weight')
        .eq('user_id', user.id)
        .order('recorded_at', { ascending: true }),
      (supabase as any)
        .from('habit_definitions')
        .select('id, name')
        .lte('week_start', currentWeekForHabits)
        .or(`week_end.gte.${currentWeekForHabits},week_end.is.null`)
        .or(`user_id.is.null,user_id.eq.${user.id}`),
      supabase
        .from('daily_habits_log')
        .select('habit_id')
        .eq('user_id', user.id)
        .eq('completed_at', dateString),
    ]);

    if (profileRes.data) setProfileData(profileRes.data);
    setWeightHistory(weightRes.data || []);

    const completedHabitIds = new Set(habitLogsRes.data?.map((h) => h.habit_id) || []);
    const processedHabits = (habitsRes.data || []).map((h) => ({
      id: h.id,
      name: h.name,
      completed: completedHabitIds.has(h.id),
    }));
    setHabits(processedHabits);

    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [user, currentDay]);

  const weightDifference = profileData?.initial_weight && profileData?.current_weight
    ? (profileData.current_weight - profileData.initial_weight).toFixed(1)
    : null;

  const chartData = weightHistory.map((entry) => ({
    date: format(new Date(entry.recorded_at), 'dd/MM', { locale: he }),
    weight: entry.weight,
  }));

  const completedHabits = habits.filter(h => h.completed).length;
  const habitCompletionPercentage = habits.length > 0 ? Math.round((completedHabits / habits.length) * 100) : 0;

  const handleAddWeight = async () => {
    if (!user || !newWeight) return;

    const weightValue = parseFloat(newWeight);
    if (isNaN(weightValue) || weightValue <= 0) {
      toast.error('נא להזין משקל תקין');
      return;
    }

    setIsSubmitting(true);

    try {
      const { error: logError } = await supabase
        .from('weight_log')
        .insert({
          user_id: user.id,
          weight: weightValue,
          recorded_at: dateString,
        });

      if (logError) throw logError;

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ current_weight: weightValue })
        .eq('id', user.id);

      if (profileError) throw profileError;

      toast.success('השקילה נוספה בהצלחה');
      setNewWeight('');
      setIsWeightModalOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error adding weight:', error);
      toast.error('שגיאה בהוספת השקילה');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWeightButtonClick = () => {
    setIsWeightModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen pb-20 pt-4 px-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 pt-4 px-4 space-y-5">
      {/* Header */}
      <div className="animate-fade-in">
        <h2 className="text-2xl font-bold text-foreground">ההתקדמות שלי</h2>
        <p className="text-muted-foreground">מעקב אחר המסע שלך</p>
      </div>

      {/* Today's Status Section */}
      <div className="space-y-3">

        {/* Habit Completion Snapshot */}
        <Card className="glass-card animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <span className="font-medium">ההרגלים של היום</span>
              </div>
              <span className={cn(
                'text-sm font-bold',
                habitCompletionPercentage === 100 ? 'text-success' : 'text-primary'
              )}>
                {completedHabits}/{habits.length}
              </span>
            </div>
            <div className="relative">
              <Progress
                value={habitCompletionPercentage}
                className={cn('h-3', habitCompletionPercentage === 100 && '[&>div]:bg-success')}
              />
            </div>
            {habitCompletionPercentage === 100 ? (
              <p className="text-xs text-success mt-2">כל ההרגלים הושלמו היום! 🎉</p>
            ) : (
              <p className="text-xs text-muted-foreground mt-2">
                עוד {habits.length - completedHabits} הרגלים להשלמה
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Steps Section */}
      <Card className="shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Footprints className="h-5 w-5 text-primary" />
            ספירת צעדים
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Circular progress + number display */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative w-28 h-28">
              <svg
                className="w-full h-full -rotate-90"
                viewBox="0 0 100 100"
                aria-label={`${todaySteps} מתוך ${stepGoal.toLocaleString()} צעדים`}
              >
                {/* Track circle */}
                <circle
                  cx="50"
                  cy="50"
                  r={CIRCLE_RADIUS}
                  fill="none"
                  stroke="hsl(var(--muted))"
                  strokeWidth="10"
                />
                {/* Progress circle */}
                <circle
                  cx="50"
                  cy="50"
                  r={CIRCLE_RADIUS}
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={CIRCLE_CIRCUMFERENCE}
                  strokeDashoffset={strokeDashoffset}
                  style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                />
              </svg>
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold leading-none">
                  {Math.round((liveSteps / stepGoal) * 100)}%
                </span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground" dir="rtl">
              <span className="font-bold text-foreground">{liveSteps.toLocaleString()}</span>
              {' / '}
              {stepGoal.toLocaleString()} צעדים
            </p>
          </div>

          {/* Bar chart – last 7 days */}
          <div>
            <p className="text-xs text-muted-foreground mb-2 text-right">7 הימים האחרונים</p>
            {stepsLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : (
              <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={last7Days} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      className="fill-muted-foreground"
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        direction: 'rtl',
                        fontSize: 12,
                      }}
                      formatter={(value: number) => [value.toLocaleString(), 'צעדים']}
                      cursor={{ fill: 'hsl(var(--muted))' }}
                    />
                    <Bar
                      dataKey="steps"
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={32}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Step Averages */}
          <div>
            <p className="text-xs text-muted-foreground mb-2 text-right flex items-center justify-end gap-1">
              <BarChart2 className="h-3 w-3" />
              ממוצעי צעדים
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'שבוע', value: stepAverages.weekly },
                { label: '30 יום', value: stepAverages.monthly },
                { label: 'מתחילת תהליך', value: stepAverages.fromStart },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-xl bg-muted/40 border border-border/40 p-2 text-center"
                >
                  <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
                  <p className="text-sm font-bold text-primary leading-none">
                    {value != null ? value.toLocaleString() : '—'}
                  </p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">צעד/יום</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Weight Tracking Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            מעקב משקל
          </h3>
          <Button
            onClick={handleWeightButtonClick}
            className="gap-2 gradient-primary shadow-glow"
          >
            <Plus className="h-4 w-4" />
            הוסף שקילה
          </Button>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
          <AlertCircle className="h-4 w-4" />
          <span>צפ/י במדריך שקילה לפני הוספת המשקל</span>
        </div>

        {/* Weight Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="glass-card">
            <CardContent className="pt-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">משקל נוכחי</p>
              <p className="text-xl font-bold text-primary">
                {profileData?.current_weight || '-'}
              </p>
              <p className="text-xs text-muted-foreground">ק"ג</p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="pt-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">משקל התחלתי</p>
              <p className="text-xl font-bold">
                {profileData?.initial_weight || '-'}
              </p>
              <p className="text-xs text-muted-foreground">ק"ג</p>
            </CardContent>
          </Card>

          <Card className={cn(
            'glass-card',
            weightDifference && Number(weightDifference) < 0 && 'bg-success/5 border-success/20'
          )}>
            <CardContent className="pt-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">סה"כ שינוי</p>
              <div className="flex items-center justify-center gap-1">
                {weightDifference && Number(weightDifference) < 0 && (
                  <ArrowDown className="h-4 w-4 text-success" />
                )}
                {weightDifference && Number(weightDifference) > 0 && (
                  <ArrowUp className="h-4 w-4 text-destructive" />
                )}
                <p className={cn(
                  'text-xl font-bold',
                  weightDifference && Number(weightDifference) < 0 ? 'text-success' :
                  weightDifference && Number(weightDifference) > 0 ? 'text-destructive' : ''
                )}>
                  {weightDifference || '-'}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">ק"ג</p>
            </CardContent>
          </Card>
        </div>

        {/* Weighing Guide Link */}
        <Button
          variant="outline"
          className="w-full border-primary/30 text-primary hover:bg-primary/5"
          onClick={() => window.open('https://drive.google.com/file/d/1p3x2BAI9QyTPuX2PD0xuLlDhNnr_r8No/view?usp=sharing', '_blank')}
        >
          <BookOpen className="h-4 w-4 ml-2" />
          מדריך שקילה נכונה
          <ExternalLink className="h-4 w-4 mr-auto" />
        </Button>

        {/* Weight Progress Chart */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-primary" />
              גרף התקדמות
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 1 ? (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                    />
                    <YAxis
                      domain={['dataMin - 2', 'dataMax + 2']}
                      tick={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        direction: 'rtl',
                      }}
                      formatter={(value: number) => [`${value} ק"ג`, 'משקל']}
                    />
                    <Line
                      type="monotone"
                      dataKey="weight"
                      stroke="hsl(var(--primary))"
                      strokeWidth={3}
                      dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, fill: 'hsl(var(--primary))' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-52 flex items-center justify-center text-muted-foreground text-center">
                <div>
                  <Scale className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p>הגרף יוצג לאחר שתי שקילות לפחות</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Weight Entry Modal */}
      <Dialog open={isWeightModalOpen} onOpenChange={setIsWeightModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>הוספת שקילה - יום שישי</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>משקל (ק"ג)</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="לדוגמה: 75.5"
                value={newWeight}
                onChange={(e) => setNewWeight(e.target.value)}
                className="text-lg h-12"
              />
            </div>
            <Button
              onClick={handleAddWeight}
              className="w-full gradient-primary"
              disabled={isSubmitting || !newWeight}
            >
              {isSubmitting ? 'שומר...' : 'שמור שקילה'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
