import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Scale, TrendingDown, ArrowDown, ArrowUp, Plus, Calendar as CalendarIcon,
  Footprints, Dumbbell, Sparkles, ExternalLink, BookOpen, AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

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

interface ScheduledActivity {
  activity_type: 'walk' | 'workout';
  day_of_week: number;
}

export default function AppProgress() {
  const { user, currentDay } = useAuth();
  const navigate = useNavigate();
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [todayActivity, setTodayActivity] = useState<ScheduledActivity | null>(null);
  const [activityCompleted, setActivityCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Weight modal state
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [newWeight, setNewWeight] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentWeek = Math.ceil(currentDay / 7);
  const today = new Date();
  const todayDayOfWeek = today.getDay();
  const isFriday = todayDayOfWeek === 5;
  const dateString = format(today, 'yyyy-MM-dd');

  const fetchData = async () => {
    if (!user) return;
    setIsLoading(true);

    const [profileRes, weightRes, habitsRes, habitLogsRes, scheduleRes, activityLogRes] = await Promise.all([
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
      supabase
        .from('habit_definitions')
        .select('id, name')
        .lte('week_start', currentWeek)
        .or(`week_end.gte.${currentWeek},week_end.is.null`),
      supabase
        .from('daily_habits_log')
        .select('habit_id')
        .eq('user_id', user.id)
        .eq('completed_at', dateString),
      supabase
        .from('user_activity_schedule')
        .select('activity_type, day_of_week')
        .eq('user_id', user.id)
        .eq('day_of_week', todayDayOfWeek)
        .eq('is_active', true)
        .maybeSingle(),
      supabase
        .from('activity_log')
        .select('id')
        .eq('user_id', user.id)
        .eq('completed_at', dateString)
        .maybeSingle(),
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

    if (scheduleRes.data) {
      setTodayActivity(scheduleRes.data as ScheduledActivity);
      setActivityCompleted(!!activityLogRes.data);
    }

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
        {/* Activity Alert Card */}
        {todayActivity && !activityCompleted && (
          <Card className="border-2 border-warning/50 bg-warning/5 animate-fade-in">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center">
                  {todayActivity.activity_type === 'walk' ? (
                    <Footprints className="h-6 w-6 text-warning" />
                  ) : (
                    <Dumbbell className="h-6 w-6 text-warning" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-warning">
                    היום יש לך {todayActivity.activity_type === 'walk' ? 'הליכה' : 'אימון'}!
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    אל תשכח לסמן ביומן המעקב
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => navigate('/app/tracker')}
                  className="border-warning text-warning hover:bg-warning/10"
                >
                  למעקב
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

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
          onClick={() => navigate('/app/content')}
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
