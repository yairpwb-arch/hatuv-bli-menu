import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Dumbbell, Footprints, Quote, Scale, Sparkles, Star, Target } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ActivityScheduler } from '@/components/ActivityScheduler';
import { TodayActivityTask } from '@/components/TodayActivityTask';
import { StreakCard } from '@/components/StreakCard';
import { MorningStreakPopup } from '@/components/MorningStreakPopup';
import { useStreak } from '@/hooks/useStreak';
import { useHabits, iconMap } from '@/hooks/useHabits';
import { format } from 'date-fns';

interface DailyQuote {
  day_number: number;
  message: string;
  description?: string | null;
}

export default function AppHome() {
  const { profile, currentDay, user, refreshProfile } = useAuth();
  const [quote, setQuote] = useState<DailyQuote | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(true);
  const [quoteTab, setQuoteTab] = useState<'quote' | 'explain'>('quote');
  const [weight, setWeight] = useState('');
  const [isWeightDialogOpen, setIsWeightDialogOpen] = useState(false);
  const [showConfetti, setShowConfetti] = useState<string | null>(null);
  const [todaySteps, setTodaySteps] = useState<number | null>(null);
  const [todayWorkoutName, setTodayWorkoutName] = useState<string | null>(null);

  const isWeighInDay = currentDay % 7 === 0;
  const currentWeek = Math.ceil(currentDay / 7);
  const progressPercentage = Math.min((currentDay / 168) * 100, 100);
  const today = format(new Date(), 'yyyy-MM-dd');

  // Use shared habits hook
  const { habits, isLoading: isLoadingHabits, toggleHabit: baseToggleHabit } = useHabits(user?.id, currentWeek, today);

  // Get streak data
  const { currentStreak, isLoading: isStreakLoading } = useStreak(user?.id, currentWeek);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'בוקר טוב';
    if (hour < 17) return 'צהריים טובים';
    if (hour < 21) return 'ערב טוב';
    return 'לילה טוב';
  };


  useEffect(() => {
    const fetchSteps = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('steps_log')
        .select('steps')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle();
      if (data) setTodaySteps(data.steps);
    };
    fetchSteps();
  }, [user, today]);

  useEffect(() => {
    const fetchTodayWorkout = async () => {
      if (!user) return;
      const weekday = new Date().getDay(); // 0=Sun … 6=Sat
      const { data } = await (supabase as any)
        .from('workout_day_schedule')
        .select('workout_plan_days(name)')
        .eq('user_id', user.id)
        .eq('weekday', weekday)
        .maybeSingle();
      if (data?.workout_plan_days?.name) {
        setTodayWorkoutName(data.workout_plan_days.name);
      }
    };
    fetchTodayWorkout();
  }, [user]);

  useEffect(() => {
    const fetchQuote = async () => {
      setIsLoadingQuote(true);
      
      // First try to get exact day quote
      let { data } = await supabase
        .from('daily_quotes')
        .select('*')
        .eq('day_number', currentDay)
        .maybeSingle();

      // If no quote for this day, get the highest available day quote
      if (!data) {
        const { data: fallbackData } = await supabase
          .from('daily_quotes')
          .select('*')
          .lte('day_number', currentDay)
          .order('day_number', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        data = fallbackData;
      }

      if (data) {
        setQuote(data);
      }
      setIsLoadingQuote(false);
    };

    fetchQuote();
  }, [currentDay]);

  // Wrapper for toggleHabit to add confetti animation
  const toggleHabit = async (habitId: string, completed: boolean) => {
    await baseToggleHabit(habitId, completed);
    
    if (!completed) {
      // Show confetti animation when completing
      setShowConfetti(habitId);
      setTimeout(() => setShowConfetti(null), 600);
    }
  };


  const handleWeightSubmit = async () => {
    if (!user || !weight) return;

    const weightNum = parseFloat(weight);
    if (isNaN(weightNum) || weightNum < 30 || weightNum > 300) {
      toast({
        title: 'שגיאה',
        description: 'אנא הזן משקל תקין',
        variant: 'destructive',
      });
      return;
    }

    const { error } = await supabase
      .from('weight_log')
      .insert({ user_id: user.id, weight: weightNum });

    if (error) {
      toast({
        title: 'שגיאה',
        description: 'לא ניתן לשמור את המשקל',
        variant: 'destructive',
      });
      return;
    }

    // Update profile current weight
    await supabase
      .from('profiles')
      .update({ current_weight: weightNum })
      .eq('id', user.id);

    await refreshProfile();
    
    toast({
      title: 'נשמר!',
      description: 'המשקל נרשם בהצלחה',
    });
    setWeight('');
    setIsWeightDialogOpen(false);
  };

  return (
    <div className="min-h-screen pb-20 pt-4 px-4 space-y-4">
      {/* Morning Streak Popup */}
      <MorningStreakPopup streak={currentStreak} isLoading={isStreakLoading} />

      {/* Header Greeting */}
      <div className="animate-slide-up">
        <h2 className="text-2xl font-bold text-foreground">
          {getGreeting()}, {profile?.full_name?.split(' ')[0] || 'חבר'}!
        </h2>
        <p className="text-muted-foreground">יום {currentDay} במסע שלך</p>
      </div>

      {/* Streak Card */}
      <StreakCard streak={currentStreak} isLoading={isStreakLoading} />

      {/* Daily Steps */}
      <Card className="glass-card animate-slide-up" style={{ animationDelay: '0.15s' }}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0">
              <Footprints className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground font-medium">צעדים היום</p>
              <p className="text-2xl font-bold text-foreground">
                {(todaySteps ?? 0).toLocaleString('he-IL')}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">יעד</p>
              <p className="text-sm font-semibold text-primary">10,000</p>
            </div>
          </div>
          <div className="mt-3">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full gradient-primary rounded-full transition-all"
                style={{ width: `${Math.min(((todaySteps ?? 0) / 10000) * 100, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {todaySteps && todaySteps > 0
                ? `${Math.round((todaySteps / 10000) * 100)}% מהיעד`
                : 'לא נמדדו צעדים היום'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Today's Activity Task (if scheduled for today) */}
      {user && (
        <TodayActivityTask userId={user.id} currentWeek={currentWeek} />
      )}

      {/* Activity Scheduler */}
      {user && (
        <ActivityScheduler 
          userId={user.id} 
          currentWeek={currentWeek} 
          completedContentIds={new Set()} 
        />
      )}

      {/* Today's Workout Reminder */}
      {todayWorkoutName && (
        <Card className="border-2 border-orange-400 bg-orange-500/10 animate-slide-up" style={{ animationDelay: '0.18s' }}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0">
                <Dumbbell className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">אימון להיום</p>
                <p className="font-bold text-foreground">{todayWorkoutName}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daily Quote */}
      <Card className="gradient-primary text-primary-foreground animate-slide-up overflow-hidden" style={{ animationDelay: '0.2s' }}>
        <CardContent className="pt-4 pb-5">
          {isLoadingQuote ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full bg-primary-foreground/20" />
              <Skeleton className="h-16 w-full bg-primary-foreground/20" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Tab pills */}
              {quote?.description && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setQuoteTab('quote')}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                      quoteTab === 'quote'
                        ? 'bg-primary-foreground text-primary'
                        : 'bg-primary-foreground/20 text-primary-foreground/80 hover:bg-primary-foreground/30'
                    }`}
                  >
                    📌 המשפט
                  </button>
                  <button
                    onClick={() => setQuoteTab('explain')}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                      quoteTab === 'explain'
                        ? 'bg-primary-foreground text-primary'
                        : 'bg-primary-foreground/20 text-primary-foreground/80 hover:bg-primary-foreground/30'
                    }`}
                  >
                    💡 הסבר
                  </button>
                </div>
              )}

              {/* Quote tab */}
              {quoteTab === 'quote' && (
                <div className="flex items-start gap-3">
                  <Quote className="h-7 w-7 flex-shrink-0 opacity-80 mt-1" />
                  <p className="text-xl font-bold leading-relaxed">
                    {quote?.message || 'כל יום הוא הזדמנות חדשה לשינוי'}
                  </p>
                </div>
              )}

              {/* Explanation tab */}
              {quoteTab === 'explain' && quote?.description && (
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0 mt-0.5">🔹</span>
                  <p className="text-sm leading-relaxed opacity-95">
                    {quote.description}
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily Habits */}
      <Card className="glass-card animate-slide-up" style={{ animationDelay: '0.3s' }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            ההרגלים היומיים שלי
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoadingHabits ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))
          ) : habits.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              ההרגלים יופיעו כאן כשתתחיל את התוכנית
            </p>
          ) : (
            habits.map((habit) => {
              const IconComponent = iconMap[habit.icon] || Target;
              return (
                <div
                  key={habit.id}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl border transition-all duration-300',
                    habit.completed
                      ? 'bg-success/10 border-success/30'
                      : 'bg-card border-border hover:border-primary/30',
                    showConfetti === habit.id && 'animate-confetti'
                  )}
                  onClick={() => toggleHabit(habit.id, habit.completed)}
                >
                  <Checkbox
                    checked={habit.completed}
                    className={cn(
                      'h-6 w-6 rounded-lg',
                      habit.completed && 'bg-success border-success'
                    )}
                  />
                  <IconComponent className={cn(
                    'h-5 w-5',
                    habit.completed ? 'text-success' : 'text-muted-foreground'
                  )} />
                  <span className={cn(
                    'font-medium flex-1',
                    habit.completed && 'text-success'
                  )}>
                    {habit.name}
                    {habit.is_bonus && (
                      <span className="inline-flex items-center gap-0.5 mr-2 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full align-middle">
                        <Star className="h-2.5 w-2.5" />
                        בונוס
                      </span>
                    )}
                  </span>
                  {habit.completed && (
                    <span className="text-success text-sm">✓</span>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Weekly Weigh-In (Conditional) */}
      {isWeighInDay && (
        <Card className="border-2 border-primary/30 bg-primary/5 animate-slide-up" style={{ animationDelay: '0.4s' }}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
                  <Scale className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="font-bold">זמן שקילה שבועית!</h3>
                  <p className="text-sm text-muted-foreground">
                    {profile?.current_weight 
                      ? `המשקל הנוכחי: ${profile.current_weight} ק"ג`
                      : 'עדכן את המשקל שלך'}
                  </p>
                </div>
              </div>
              
              <Dialog open={isWeightDialogOpen} onOpenChange={setIsWeightDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="default" size="sm">
                    עדכן משקל
                  </Button>
                </DialogTrigger>
                <DialogContent dir="rtl">
                  <DialogHeader>
                    <DialogTitle>עדכון משקל שבועי</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="weight">משקל בק"ג</Label>
                      <Input
                        id="weight"
                        type="number"
                        step="0.1"
                        min="30"
                        max="300"
                        placeholder="75.5"
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        dir="ltr"
                        className="text-left text-2xl h-14"
                      />
                    </div>
                    <Button onClick={handleWeightSubmit} className="w-full">
                      שמור
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
