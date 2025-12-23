import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { 
  ChevronRight, ChevronLeft, Droplets, Footprints, Timer, 
  Moon, Target, Apple, Dumbbell, Lock, Check, Sparkles 
} from 'lucide-react';
import { format, addDays, subDays, startOfWeek, isSameDay, isToday } from 'date-fns';
import { he } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Habit {
  id: string;
  name: string;
  icon: string;
  completed: boolean;
  isLocked: boolean;
  lockReason?: string;
}

interface ScheduledActivity {
  activity_type: 'walk' | 'workout';
  day_of_week: number;
}

const iconMap: Record<string, typeof Droplets> = {
  droplets: Droplets,
  footprints: Footprints,
  timer: Timer,
  moon: Moon,
  target: Target,
  apple: Apple,
  dumbbell: Dumbbell,
};

export default function AppTracker() {
  const { user, currentDay } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [habits, setHabits] = useState<Habit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [completedContentIds, setCompletedContentIds] = useState<Set<string>>(new Set());
  const [scheduledActivities, setScheduledActivities] = useState<ScheduledActivity[]>([]);
  const [activityCompleted, setActivityCompleted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentWeek = Math.ceil(currentDay / 7);
  const selectedDayOfWeek = selectedDate.getDay();
  const dateString = format(selectedDate, 'yyyy-MM-dd');

  // Generate week dates for horizontal calendar
  const generateWeekDates = () => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  };

  const weekDates = generateWeekDates();

  // Fetch all data
  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      setIsLoading(true);

      const [habitsResult, progressResult, completedHabitsResult, scheduleResult, activityLogResult] = await Promise.all([
        // Get habit definitions for current week
        supabase
          .from('habit_definitions')
          .select('*')
          .lte('week_start', currentWeek)
          .or(`week_end.gte.${currentWeek},week_end.is.null`),
        // Get completed content
        supabase
          .from('content_progress')
          .select('content_id')
          .eq('user_id', user.id),
        // Get completed habits for selected date
        supabase
          .from('daily_habits_log')
          .select('habit_id')
          .eq('user_id', user.id)
          .eq('completed_at', dateString),
        // Get user's activity schedule
        supabase
          .from('user_activity_schedule')
          .select('activity_type, day_of_week')
          .eq('user_id', user.id)
          .eq('is_active', true),
        // Get activity log for selected date
        supabase
          .from('activity_log')
          .select('id, activity_type')
          .eq('user_id', user.id)
          .eq('completed_at', dateString),
      ]);

      const completedIds = new Set(progressResult.data?.map((p) => p.content_id) || []);
      setCompletedContentIds(completedIds);

      const completedHabitIds = new Set(completedHabitsResult.data?.map((h) => h.habit_id) || []);

      // Process habits with lock status
      const processedHabits = (habitsResult.data || []).map((h) => ({
        id: h.id,
        name: h.name,
        icon: h.icon || 'target',
        completed: completedHabitIds.has(h.id),
        isLocked: false, // In production, check against specific content IDs
        lockReason: undefined,
      }));

      setHabits(processedHabits);
      setScheduledActivities((scheduleResult.data as ScheduledActivity[]) || []);
      setActivityCompleted(!!activityLogResult.data?.length);
      setIsLoading(false);
    };

    fetchData();
  }, [user, currentWeek, dateString]);

  // Check if today has a scheduled activity
  const todayActivity = scheduledActivities.find(a => a.day_of_week === selectedDayOfWeek);

  const toggleHabit = async (habitId: string, completed: boolean) => {
    if (!user) return;

    if (completed) {
      await supabase
        .from('daily_habits_log')
        .delete()
        .eq('user_id', user.id)
        .eq('habit_id', habitId)
        .eq('completed_at', dateString);
    } else {
      await supabase
        .from('daily_habits_log')
        .insert({ user_id: user.id, habit_id: habitId, completed_at: dateString });
    }

    setHabits((prev) =>
      prev.map((h) => (h.id === habitId ? { ...h, completed: !completed } : h))
    );

    if (!completed) {
      toast({ title: 'כל הכבוד! 🎉', description: 'ההרגל סומן כהושלם' });
    }
  };

  const toggleActivity = async () => {
    if (!user || !todayActivity) return;

    if (activityCompleted) {
      await supabase
        .from('activity_log')
        .delete()
        .eq('user_id', user.id)
        .eq('activity_type', todayActivity.activity_type)
        .eq('completed_at', dateString);
      setActivityCompleted(false);
    } else {
      await supabase
        .from('activity_log')
        .insert({
          user_id: user.id,
          activity_type: todayActivity.activity_type,
          completed_at: dateString,
        });
      setActivityCompleted(true);
      toast({ title: 'מעולה! 💪', description: `ה${todayActivity.activity_type === 'walk' ? 'הליכה' : 'אימון'} הושלם/ה` });
    }
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    setSelectedDate(prev => direction === 'next' ? addDays(prev, 7) : subDays(prev, 7));
  };

  // Calculate completion stats
  const completedHabits = habits.filter(h => h.completed).length;
  const totalTasks = habits.length + (todayActivity ? 1 : 0);
  const completedTasks = completedHabits + (activityCompleted ? 1 : 0);
  const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  if (isLoading) {
    return (
      <div className="min-h-screen pb-20 pt-4 px-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 pt-4 px-4 space-y-5">
      {/* Header */}
      <div className="animate-fade-in">
        <h2 className="text-2xl font-bold text-foreground">מעקב יומי</h2>
        <p className="text-muted-foreground">שבוע {currentWeek} | יום {currentDay}</p>
      </div>

      {/* Horizontal Week Calendar */}
      <Card className="glass-card animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <Button variant="ghost" size="icon" onClick={() => navigateWeek('prev')}>
              <ChevronRight className="h-5 w-5" />
            </Button>
            <span className="font-medium text-sm">
              {format(weekDates[0], 'MMMM yyyy', { locale: he })}
            </span>
            <Button variant="ghost" size="icon" onClick={() => navigateWeek('next')}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </div>
          
          <div 
            ref={scrollRef}
            className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
          >
            {weekDates.map((date) => {
              const isSelected = isSameDay(date, selectedDate);
              const isTodayDate = isToday(date);
              const dayOfWeek = date.getDay();
              const hasActivity = scheduledActivities.some(a => a.day_of_week === dayOfWeek);
              return (
                <button
                  key={date.toISOString()}
                  onClick={() => setSelectedDate(date)}
                  className={cn(
                    'flex flex-col items-center p-2 rounded-xl min-w-[52px] transition-all duration-200 relative',
                    isSelected
                      ? 'gradient-primary text-primary-foreground shadow-glow'
                      : isTodayDate
                      ? 'bg-primary/10 text-primary border-2 border-primary'
                      : 'bg-secondary hover:bg-secondary/80'
                  )}
                >
                  <span className="text-xs font-medium">
                    {format(date, 'EEEEEE', { locale: he })}
                  </span>
                  <span className={cn(
                    'text-lg font-bold',
                    isSelected ? 'text-primary-foreground' : ''
                  )}>
                    {format(date, 'd')}
                  </span>
                  {hasActivity && (
                    <div className={cn(
                      'w-1.5 h-1.5 rounded-full mt-0.5',
                      isSelected ? 'bg-primary-foreground' : 'bg-warning'
                    )} />
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Daily Progress */}
      <Card className="glass-card animate-fade-in" style={{ animationDelay: '0.15s' }}>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">ההתקדמות של {format(selectedDate, 'EEEE', { locale: he })}</span>
            <Badge variant={completionPercentage === 100 ? 'default' : 'secondary'} className={cn(
              completionPercentage === 100 && 'bg-success'
            )}>
              {completedTasks}/{totalTasks}
            </Badge>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div 
              className={cn(
                'h-full transition-all duration-500',
                completionPercentage === 100 ? 'bg-success' : 'bg-primary'
              )}
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
          {completionPercentage === 100 && (
            <p className="text-sm text-success mt-2 flex items-center gap-1">
              <Sparkles className="h-4 w-4" />
              כל המשימות הושלמו! יום מצוין! 🎉
            </p>
          )}
        </CardContent>
      </Card>

      {/* Activity Task (if scheduled for this day) */}
      {todayActivity && (
        <Card 
          className={cn(
            'border-2 animate-fade-in transition-all',
            activityCompleted 
              ? 'bg-success/10 border-success/30' 
              : 'border-warning/50 bg-warning/5'
          )}
          style={{ animationDelay: '0.2s' }}
        >
          <CardContent className="pt-5">
            <div 
              className="flex items-center gap-4 cursor-pointer"
              onClick={toggleActivity}
            >
              <Checkbox
                checked={activityCompleted}
                className={cn(
                  'h-7 w-7 rounded-lg',
                  activityCompleted && 'bg-success border-success'
                )}
              />
              <div className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center',
                activityCompleted ? 'bg-success/20' : 'bg-warning/20'
              )}>
                {todayActivity.activity_type === 'walk' ? (
                  <Footprints className={cn('h-6 w-6', activityCompleted ? 'text-success' : 'text-warning')} />
                ) : (
                  <Dumbbell className={cn('h-6 w-6', activityCompleted ? 'text-success' : 'text-warning')} />
                )}
              </div>
              <div className="flex-1">
                <h3 className={cn(
                  'font-bold',
                  activityCompleted && 'line-through text-muted-foreground'
                )}>
                  {todayActivity.activity_type === 'walk' ? 'הליכה יומית' : 'אימון'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {activityCompleted ? 'הושלם ✓' : 'הגיע הזמן לצאת!'}
                </p>
              </div>
              {activityCompleted && <Check className="h-6 w-6 text-success" />}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Habits List */}
      <Card className="glass-card animate-fade-in" style={{ animationDelay: '0.25s' }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            ההרגלים היומיים
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {habits.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              ההרגלים יופיעו כאן בהתאם להתקדמות שלך בתוכנית
            </p>
          ) : (
            habits.map((habit) => {
              const IconComponent = iconMap[habit.icon] || Target;
              return (
                <div
                  key={habit.id}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl border transition-all duration-200',
                    habit.isLocked
                      ? 'bg-muted/50 border-muted cursor-not-allowed'
                      : habit.completed
                      ? 'bg-success/10 border-success/30'
                      : 'bg-card border-border hover:border-primary/30 cursor-pointer'
                  )}
                  onClick={() => !habit.isLocked && toggleHabit(habit.id, habit.completed)}
                >
                  {habit.isLocked ? (
                    <div className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center">
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ) : (
                    <Checkbox
                      checked={habit.completed}
                      className={cn(
                        'h-6 w-6 rounded-lg',
                        habit.completed && 'bg-success border-success'
                      )}
                    />
                  )}
                  <IconComponent className={cn(
                    'h-5 w-5',
                    habit.isLocked 
                      ? 'text-muted-foreground' 
                      : habit.completed 
                      ? 'text-success' 
                      : 'text-muted-foreground'
                  )} />
                  <div className="flex-1">
                    <span className={cn(
                      'font-medium',
                      habit.isLocked && 'text-muted-foreground',
                      habit.completed && 'text-success line-through'
                    )}>
                      {habit.name}
                    </span>
                    {habit.isLocked && habit.lockReason && (
                      <p className="text-xs text-muted-foreground">{habit.lockReason}</p>
                    )}
                  </div>
                  {habit.completed && !habit.isLocked && (
                    <Check className="h-5 w-5 text-success" />
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
