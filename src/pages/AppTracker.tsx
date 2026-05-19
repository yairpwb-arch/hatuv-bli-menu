import { useEffect, useState, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  ChevronRight, ChevronLeft, Footprints,
  Target, Dumbbell, Check, Sparkles,
  Calendar, CalendarDays, Lock, Star
} from 'lucide-react';
import { 
  format, addDays, subDays, startOfWeek, isSameDay, isToday,
  startOfMonth, endOfMonth, eachDayOfInterval, isBefore, isAfter, startOfDay
} from 'date-fns';
import { he } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { MonthlyCalendar } from '@/components/MonthlyCalendar';
import { useHabits, iconMap } from '@/hooks/useHabits';
import { useStepCounter } from '@/hooks/useStepCounter';
import { useStepLogs } from '@/hooks/useStepLogs';

interface ScheduledActivity {
  activity_type: 'walk' | 'workout';
  day_of_week: number;
}

interface DayCompletionData {
  date: string;
  completedHabits: number;
  totalHabits: number;
  activityCompleted: boolean;
  hasActivity: boolean;
}

export default function AppTracker() {
  const { user, currentDay, currentWeek, planDays } = useAuth();
  const { stepData, isAvailable, isNative, hasPermission, requestPermission } = useStepCounter(user?.id);
  const { weeklyAverage } = useStepLogs();
  const stepGoal = weeklyAverage ?? 10_000;
  const stepPct = isNative && hasPermission ? Math.min(100, Math.round((stepData.steps / stepGoal) * 100)) : 0;
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [allHabitIds, setAllHabitIds] = useState<string[]>([]);
  const [scheduledActivities, setScheduledActivities] = useState<ScheduledActivity[]>([]);
  const [activityCompleted, setActivityCompleted] = useState(false);
  const [viewMode, setViewMode] = useState<'weekly' | 'monthly'>('weekly');
  const [monthlyData, setMonthlyData] = useState<DayCompletionData[]>([]);
  const [isLoadingExtras, setIsLoadingExtras] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedDayOfWeek = selectedDate.getDay();
  const dateString = format(selectedDate, 'yyyy-MM-dd');

  // Use shared habits hook
  const { habits, isLoading: isLoadingHabits, toggleHabit: baseToggleHabit } = useHabits(user?.id, currentDay, dateString, planDays);

  // Check if selected date is in the past (not today)
  const isSelectedDatePast = isBefore(startOfDay(selectedDate), startOfDay(new Date())) && !isToday(selectedDate);
  
  // Check if selected date is in the future (not today)
  const isSelectedDateFuture = isAfter(startOfDay(selectedDate), startOfDay(new Date()));
  
  // Can only edit today's habits
  const canEditHabits = isToday(selectedDate);

  // Wrapper for toggleHabit with date checks
  const toggleHabit = async (habitId: string, completed: boolean) => {
    if (isSelectedDatePast) {
      toast({ 
        title: 'לא ניתן לעדכן', 
        description: 'לא ניתן לעדכן משימות של ימים שעברו.',
        variant: 'destructive'
      });
      return;
    }
    if (isSelectedDateFuture) {
      toast({ 
        title: 'לא ניתן לעדכן', 
        description: 'לא ניתן לעדכן משימות של ימים עתידיים.',
        variant: 'destructive'
      });
      return;
    }
    await baseToggleHabit(habitId, completed);
    if (!completed) {
      toast({ title: 'כל הכבוד! 🎉', description: 'ההרגל סומן כהושלם' });
    }
  };

  // Generate week dates for horizontal calendar
  const generateWeekDates = () => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  };

  const weekDates = generateWeekDates();

  // Fetch additional data (activities, schedules)
  useEffect(() => {
    const fetchExtras = async () => {
      if (!user) return;
      setIsLoadingExtras(true);

      const [scheduleResult, activityLogResult, habitsResult] = await Promise.all([
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
        // Get habit definitions — global + personal for this user
        (supabase as any)
          .from('habit_definitions')
          .select('id, name')
          .lte('week_start', currentWeek)
          .or(`week_end.gte.${currentWeek},week_end.is.null`)
          .or(`user_id.is.null,user_id.eq.${user.id}`),
      ]);

      // Filter out walk/workout habit IDs
      const staticHabitIds = (habitsResult.data || [])
        .filter(h => !h.name.includes('הליכה') && !h.name.includes('אימון'))
        .map(h => h.id);
      setAllHabitIds(staticHabitIds);

      setScheduledActivities((scheduleResult.data as ScheduledActivity[]) || []);
      setActivityCompleted(!!activityLogResult.data?.length);
      setIsLoadingExtras(false);
    };

    fetchExtras();
  }, [user, currentWeek, dateString]);

  // Fetch monthly data when in monthly view
  useEffect(() => {
    const fetchMonthlyData = async () => {
      if (!user || viewMode !== 'monthly') return;

      const monthStart = startOfMonth(selectedDate);
      const monthEnd = endOfMonth(selectedDate);
      const startStr = format(monthStart, 'yyyy-MM-dd');
      const endStr = format(monthEnd, 'yyyy-MM-dd');

      const [habitsLogResult, activityLogResult] = await Promise.all([
        supabase
          .from('daily_habits_log')
          .select('habit_id, completed_at')
          .eq('user_id', user.id)
          .gte('completed_at', startStr)
          .lte('completed_at', endStr),
        supabase
          .from('activity_log')
          .select('activity_type, completed_at')
          .eq('user_id', user.id)
          .gte('completed_at', startStr)
          .lte('completed_at', endStr),
      ]);

      // Filter out walk/workout habits from monthly data too
      const staticHabitIds = new Set(allHabitIds);
      
      const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
      const totalHabits = allHabitIds.length;

      const data: DayCompletionData[] = days.map(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        const dayOfWeek = day.getDay();
        const hasActivity = scheduledActivities.some(a => a.day_of_week === dayOfWeek);
        
        // Only count static habits (filtering by the habit IDs we have)
        const completedHabitsForDay = (habitsLogResult.data || [])
          .filter(h => h.completed_at === dayStr && staticHabitIds.has(h.habit_id)).length;
        
        const activityCompletedForDay = (activityLogResult.data || [])
          .some(a => a.completed_at === dayStr);

        return {
          date: dayStr,
          completedHabits: completedHabitsForDay,
          totalHabits,
          activityCompleted: activityCompletedForDay,
          hasActivity,
        };
      });

      setMonthlyData(data);
    };

    fetchMonthlyData();
  }, [user, viewMode, selectedDate, allHabitIds, scheduledActivities]);

  // Calculate streak and perfect days
  const { perfectDaysCount, currentStreak, bestStreak } = useMemo(() => {
    if (monthlyData.length === 0) return { perfectDaysCount: 0, currentStreak: 0, bestStreak: 0 };

    let perfect = 0;
    let streak = 0;
    let maxStreak = 0;
    let tempStreak = 0;
    let countingStreak = true;
    const today = new Date();

    // Sort by date descending for streak calculation
    const sortedData = [...monthlyData]
      .filter(d => isBefore(new Date(d.date), today) || format(today, 'yyyy-MM-dd') === d.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    for (const day of sortedData) {
      const dayOfWeek = new Date(day.date).getDay();
      const hasActivity = scheduledActivities.some(a => a.day_of_week === dayOfWeek);
      const totalTasks = day.totalHabits + (hasActivity ? 1 : 0);
      const completedTasks = day.completedHabits + (day.activityCompleted ? 1 : 0);
      const isPerfect = totalTasks > 0 && completedTasks === totalTasks;

      if (isPerfect) {
        perfect++;
        if (countingStreak) streak++;
        tempStreak++;
        maxStreak = Math.max(maxStreak, tempStreak);
      } else if (totalTasks > 0) {
        countingStreak = false;
        tempStreak = 0;
      }
    }

    return { perfectDaysCount: perfect, currentStreak: streak, bestStreak: Math.max(maxStreak, streak) };
  }, [monthlyData, scheduledActivities]);

  // Check if today has a scheduled activity
  const todayActivity = scheduledActivities.find(a => a.day_of_week === selectedDayOfWeek);

  const toggleActivity = async () => {
    if (!user || !todayActivity) return;

    // Block editing past or future dates
    if (!canEditHabits) {
      toast({ 
        title: 'לא ניתן לעדכן', 
        description: isSelectedDateFuture 
          ? 'לא ניתן לעדכן משימות של ימים עתידיים.'
          : 'לא ניתן לעדכן משימות של ימים שעברו.',
        variant: 'destructive'
      });
      return;
    }

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

  if (isLoadingHabits || isLoadingExtras) {
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

      {/* Step Counter Card */}
      <Card className="glass-card animate-fade-in overflow-hidden">
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center gap-4">
            {/* Circular progress */}
            <div className="relative w-20 h-20 shrink-0">
              <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="32" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
                <circle
                  cx="40" cy="40" r="32" fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 32}`}
                  strokeDashoffset={`${2 * Math.PI * 32 * (1 - stepPct / 100)}`}
                  className="transition-all duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Footprints className="h-5 w-5 text-primary" />
                <span className="text-xs font-bold text-primary leading-none mt-0.5">
                  {isNative && hasPermission ? `${stepPct}%` : '—'}
                </span>
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground mb-0.5">צעדים היום</p>
              <p className="text-3xl font-bold text-foreground leading-none">
                {isNative && hasPermission
                  ? stepData.steps.toLocaleString('he-IL')
                  : '—'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                יעד: {stepGoal.toLocaleString('he-IL')} צעדים
              </p>
              {stepData.distance != null && (
                <p className="text-xs text-muted-foreground">
                  {(stepData.distance / 1000).toFixed(2)} ק"מ
                </p>
              )}
            </div>

            {/* Status / CTA */}
            <div className="shrink-0 text-left">
              {!isNative ? (
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <Lock className="h-5 w-5" />
                  <span className="text-[10px] text-center leading-tight">רק<br/>באפליקציה</span>
                </div>
              ) : !isAvailable ? (
                <span className="text-xs text-muted-foreground text-center">לא זמין<br/>במכשיר</span>
              ) : !hasPermission ? (
                <Button size="sm" variant="outline" className="text-xs h-8" onClick={requestPermission}>
                  אפשר גישה
                </Button>
              ) : stepPct >= 100 ? (
                <div className="flex flex-col items-center gap-1 text-success">
                  <Check className="h-6 w-6" />
                  <span className="text-xs font-semibold">הגעת!</span>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* View Toggle */}
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'weekly' | 'monthly')} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="weekly" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            שבועי
          </TabsTrigger>
          <TabsTrigger value="monthly" className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            חודשי
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Calendar Views */}
      <div className={cn(
        'transition-all duration-300',
        viewMode === 'monthly' ? 'animate-fade-in' : ''
      )}>
        {viewMode === 'weekly' ? (
          /* Horizontal Week Calendar */
          <Card className="glass-card animate-fade-in">
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
        ) : (
          /* Monthly Calendar */
          <MonthlyCalendar
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            monthlyData={monthlyData}
            scheduledActivities={scheduledActivities}
            perfectDaysCount={perfectDaysCount}
            currentStreak={currentStreak}
            bestStreak={bestStreak}
          />
        )}
      </div>

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
            !canEditHabits
              ? 'bg-muted/50 border-muted'
              : activityCompleted 
              ? 'bg-success/10 border-success/30' 
              : 'border-warning/50 bg-warning/5'
          )}
          style={{ animationDelay: '0.2s' }}
        >
          <CardContent className="pt-5">
            <div 
              className={cn(
                'flex items-center gap-4',
                canEditHabits ? 'cursor-pointer' : 'cursor-not-allowed'
              )}
              onClick={() => canEditHabits && toggleActivity()}
            >
              <Checkbox
                checked={activityCompleted}
                disabled={!canEditHabits}
                className={cn(
                  'h-7 w-7 rounded-lg',
                  activityCompleted && 'bg-success border-success'
                )}
              />
              <div className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center',
                !canEditHabits ? 'bg-muted' : activityCompleted ? 'bg-success/20' : 'bg-warning/20'
              )}>
                {todayActivity.activity_type === 'walk' ? (
                  <Footprints className={cn('h-6 w-6', !canEditHabits ? 'text-muted-foreground' : activityCompleted ? 'text-success' : 'text-warning')} />
                ) : (
                  <Dumbbell className={cn('h-6 w-6', !canEditHabits ? 'text-muted-foreground' : activityCompleted ? 'text-success' : 'text-warning')} />
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
                  {!canEditHabits 
                    ? (isSelectedDateFuture ? 'יום עתידי' : 'יום שעבר')
                    : activityCompleted 
                    ? 'הושלם ✓' 
                    : 'הגיע הזמן לצאת!'}
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
                    !canEditHabits
                      ? 'bg-muted/50 border-muted cursor-not-allowed'
                      : habit.completed
                      ? 'bg-success/10 border-success/30'
                      : 'bg-card border-border hover:border-primary/30 cursor-pointer'
                  )}
                  onClick={() => canEditHabits && toggleHabit(habit.id, habit.completed)}
                >
                  <Checkbox
                    checked={habit.completed}
                    disabled={!canEditHabits}
                    className={cn(
                      'h-6 w-6 rounded-lg',
                      habit.completed && 'bg-success border-success'
                    )}
                  />
                  <IconComponent className={cn(
                    'h-5 w-5',
                    habit.completed ? 'text-success' : 'text-muted-foreground'
                  )} />
                  <div className="flex-1">
                    <span className={cn(
                      'font-medium',
                      habit.completed && 'text-success line-through'
                    )}>
                      {habit.name}
                    </span>
                    {habit.is_bonus && (
                      <span className="inline-flex items-center gap-0.5 mr-2 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full align-middle">
                        <Star className="h-2.5 w-2.5" />
                        בונוס
                      </span>
                    )}
                  </div>
                  {habit.completed && (
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
