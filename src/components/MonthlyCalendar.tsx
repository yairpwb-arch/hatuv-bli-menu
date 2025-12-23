import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ChevronRight, ChevronLeft, Check, Flame, 
  Trophy, Footprints, Dumbbell, Circle 
} from 'lucide-react';
import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, 
  isSameDay, isToday, isSameMonth, addMonths, subMonths,
  startOfWeek, endOfWeek, isBefore
} from 'date-fns';
import { he } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface DayCompletionData {
  date: string;
  completedHabits: number;
  totalHabits: number;
  activityCompleted: boolean;
  hasActivity: boolean;
}

interface ScheduledActivity {
  activity_type: 'walk' | 'workout';
  day_of_week: number;
}

interface MonthlyCalendarProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  monthlyData: DayCompletionData[];
  scheduledActivities: ScheduledActivity[];
  perfectDaysCount: number;
  currentStreak: number;
}

export function MonthlyCalendar({
  selectedDate,
  onSelectDate,
  monthlyData,
  scheduledActivities,
  perfectDaysCount,
  currentStreak,
}: MonthlyCalendarProps) {
  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  
  const dayNames = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = direction === 'next' 
      ? addMonths(selectedDate, 1) 
      : subMonths(selectedDate, 1);
    onSelectDate(newDate);
  };

  const getCompletionStatus = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayData = monthlyData.find(d => d.date === dateStr);
    const dayOfWeek = date.getDay();
    const hasScheduledActivity = scheduledActivities.some(a => a.day_of_week === dayOfWeek);
    
    if (!dayData) return 'none';
    
    const totalTasks = dayData.totalHabits + (hasScheduledActivity ? 1 : 0);
    const completedTasks = dayData.completedHabits + (dayData.activityCompleted ? 1 : 0);
    
    if (totalTasks === 0) return 'none';
    if (completedTasks === totalTasks) return 'complete';
    if (completedTasks > 0) return 'partial';
    return 'none';
  };

  const hasActivityOnDay = (date: Date) => {
    const dayOfWeek = date.getDay();
    return scheduledActivities.some(a => a.day_of_week === dayOfWeek);
  };

  return (
    <div className="space-y-4">
      {/* Monthly Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="glass-card">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-success/20 flex items-center justify-center">
                <Trophy className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-success">{perfectDaysCount}</p>
                <p className="text-xs text-muted-foreground">ימים מושלמים</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-warning/20 flex items-center justify-center">
                <Flame className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-warning">{currentStreak}</p>
                <p className="text-xs text-muted-foreground">רצף נוכחי</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Calendar */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => navigateMonth('prev')}>
              <ChevronRight className="h-5 w-5" />
            </Button>
            <CardTitle className="text-lg">
              {format(selectedDate, 'MMMM yyyy', { locale: he })}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={() => navigateMonth('next')}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {dayNames.map((day) => (
              <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((date) => {
              const isCurrentMonth = isSameMonth(date, selectedDate);
              const isSelected = isSameDay(date, selectedDate);
              const isTodayDate = isToday(date);
              const completionStatus = getCompletionStatus(date);
              const hasActivity = hasActivityOnDay(date);
              const isPast = isBefore(date, new Date()) && !isToday(date);

              return (
                <button
                  key={date.toISOString()}
                  onClick={() => onSelectDate(date)}
                  className={cn(
                    'relative aspect-square flex flex-col items-center justify-center rounded-lg transition-all duration-200 text-sm',
                    !isCurrentMonth && 'opacity-30',
                    isSelected
                      ? 'gradient-primary text-primary-foreground shadow-glow'
                      : isTodayDate
                      ? 'bg-primary/10 text-primary border-2 border-primary'
                      : 'hover:bg-secondary/80'
                  )}
                >
                  <span className={cn(
                    'font-medium',
                    isSelected && 'text-primary-foreground'
                  )}>
                    {format(date, 'd')}
                  </span>
                  
                  {/* Completion indicator */}
                  {isPast && isCurrentMonth && (
                    <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                      {completionStatus === 'complete' && (
                        <div className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          isSelected ? 'bg-primary-foreground' : 'bg-success'
                        )} />
                      )}
                      {completionStatus === 'partial' && (
                        <div className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          isSelected ? 'bg-primary-foreground/70' : 'bg-warning'
                        )} />
                      )}
                      {hasActivity && completionStatus !== 'none' && (
                        <div className={cn(
                          'w-1 h-1 rounded-full',
                          isSelected ? 'bg-primary-foreground/50' : 'bg-primary/50'
                        )} />
                      )}
                    </div>
                  )}

                  {/* Activity indicator for future/today */}
                  {!isPast && hasActivity && isCurrentMonth && (
                    <div className={cn(
                      'absolute bottom-0.5 w-1 h-1 rounded-full',
                      isSelected ? 'bg-primary-foreground/70' : 'bg-warning'
                    )} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-4 mt-4 pt-3 border-t border-border">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-success" />
              <span>הושלם</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-warning" />
              <span>חלקי</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Footprints className="w-3 h-3" />
              <span>פעילות</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
