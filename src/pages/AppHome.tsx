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
import { Quote, Droplets, Footprints, Timer, Moon, Target, Apple, Scale, Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface DailyQuote {
  day_number: number;
  message: string;
}

interface Habit {
  id: string;
  name: string;
  icon: string;
  completed: boolean;
}

const iconMap: Record<string, typeof Droplets> = {
  droplets: Droplets,
  footprints: Footprints,
  timer: Timer,
  moon: Moon,
  target: Target,
  apple: Apple,
};

export default function AppHome() {
  const { profile, currentDay, user, refreshProfile } = useAuth();
  const [quote, setQuote] = useState<DailyQuote | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [isLoadingQuote, setIsLoadingQuote] = useState(true);
  const [isLoadingHabits, setIsLoadingHabits] = useState(true);
  const [weight, setWeight] = useState('');
  const [isWeightDialogOpen, setIsWeightDialogOpen] = useState(false);
  const [showConfetti, setShowConfetti] = useState<string | null>(null);

  const isWeighInDay = currentDay % 7 === 0;
  const currentWeek = Math.ceil(currentDay / 7);
  const progressPercentage = Math.min((currentDay / 168) * 100, 100);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'בוקר טוב';
    if (hour < 17) return 'צהריים טובים';
    if (hour < 21) return 'ערב טוב';
    return 'לילה טוב';
  };

  useEffect(() => {
    const fetchQuote = async () => {
      setIsLoadingQuote(true);
      const dayToFetch = Math.min(currentDay, 14); // We only seeded 14 quotes
      
      const { data, error } = await supabase
        .from('daily_quotes')
        .select('*')
        .eq('day_number', dayToFetch)
        .maybeSingle();

      if (data) {
        setQuote(data);
      }
      setIsLoadingQuote(false);
    };

    fetchQuote();
  }, [currentDay]);

  useEffect(() => {
    const fetchHabits = async () => {
      if (!user) return;
      setIsLoadingHabits(true);

      // Get habit definitions for current week
      const { data: habitDefs, error: habitsError } = await supabase
        .from('habit_definitions')
        .select('*')
        .lte('week_start', currentWeek)
        .or(`week_end.gte.${currentWeek},week_end.is.null`);

      if (habitsError) {
        console.error('Error fetching habits:', habitsError);
        setIsLoadingHabits(false);
        return;
      }

      // Get today's completed habits
      const today = new Date().toISOString().split('T')[0];
      const { data: completedHabits } = await supabase
        .from('daily_habits_log')
        .select('habit_id')
        .eq('user_id', user.id)
        .eq('completed_at', today);

      const completedIds = new Set(completedHabits?.map((h) => h.habit_id) || []);

      const habitsWithStatus = (habitDefs || []).map((h) => ({
        id: h.id,
        name: h.name,
        icon: h.icon || 'target',
        completed: completedIds.has(h.id),
      }));

      setHabits(habitsWithStatus);
      setIsLoadingHabits(false);
    };

    fetchHabits();
  }, [user, currentWeek]);

  const toggleHabit = async (habitId: string, completed: boolean) => {
    if (!user) return;

    const today = new Date().toISOString().split('T')[0];

    if (completed) {
      // Remove completion
      await supabase
        .from('daily_habits_log')
        .delete()
        .eq('user_id', user.id)
        .eq('habit_id', habitId)
        .eq('completed_at', today);
    } else {
      // Add completion
      await supabase
        .from('daily_habits_log')
        .insert({ user_id: user.id, habit_id: habitId, completed_at: today });
      
      // Show confetti animation
      setShowConfetti(habitId);
      setTimeout(() => setShowConfetti(null), 600);
    }

    setHabits((prev) =>
      prev.map((h) => (h.id === habitId ? { ...h, completed: !completed } : h))
    );
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
      {/* Header Greeting */}
      <div className="animate-slide-up">
        <h2 className="text-2xl font-bold text-foreground">
          {getGreeting()}, {profile?.full_name?.split(' ')[0] || 'חבר'}!
        </h2>
        <p className="text-muted-foreground">יום {currentDay} במסע שלך</p>
      </div>

      {/* Progress Card */}
      <Card className="glass-card animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">התקדמות כללית</span>
            <span className="text-sm text-muted-foreground">{Math.round(progressPercentage)}%</span>
          </div>
          <Progress value={progressPercentage} className="h-3" />
          <p className="text-xs text-muted-foreground mt-2">
            {168 - currentDay > 0 ? `עוד ${168 - currentDay} ימים לסיום התוכנית` : 'סיימת את התוכנית! 🎉'}
          </p>
        </CardContent>
      </Card>

      {/* Daily Quote */}
      <Card className="gradient-primary text-primary-foreground animate-slide-up" style={{ animationDelay: '0.2s' }}>
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Quote className="h-6 w-6 flex-shrink-0 opacity-80" />
            {isLoadingQuote ? (
              <Skeleton className="h-16 w-full bg-primary-foreground/20" />
            ) : (
              <p className="text-lg font-medium leading-relaxed">
                {quote?.message || 'כל יום הוא הזדמנות חדשה לשינוי'}
              </p>
            )}
          </div>
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
