import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Footprints, Dumbbell, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TodayActivityTaskProps {
  userId: string;
  currentWeek: number;
}

interface ScheduledActivity {
  activity_type: 'walk' | 'workout';
  day_of_week: number;
}

const ACTIVITY_LABELS: Record<string, { action: string; emoji: string }> = {
  walk: { action: 'צא להליכה היומית שלך!', emoji: '🚶' },
  workout: { action: 'הגיע הזמן לאימון!', emoji: '💪' },
};

export function TodayActivityTask({ userId, currentWeek }: TodayActivityTaskProps) {
  const [todayActivity, setTodayActivity] = useState<ScheduledActivity | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showConfetti, setShowConfetti] = useState(false);

  const todayDayOfWeek = new Date().getDay();
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const fetchTodayActivity = async () => {
      setIsLoading(true);

      // Get today's scheduled activity
      const { data: scheduleData } = await supabase
        .from('user_activity_schedule')
        .select('activity_type, day_of_week')
        .eq('user_id', userId)
        .eq('day_of_week', todayDayOfWeek)
        .eq('is_active', true)
        .maybeSingle();

      if (scheduleData) {
        setTodayActivity(scheduleData as ScheduledActivity);

        // Check if already completed today
        const { data: logData } = await supabase
          .from('activity_log')
          .select('id')
          .eq('user_id', userId)
          .eq('activity_type', scheduleData.activity_type)
          .eq('completed_at', today)
          .maybeSingle();

        setIsCompleted(!!logData);
      }

      setIsLoading(false);
    };

    fetchTodayActivity();
  }, [userId, todayDayOfWeek, today]);

  const toggleCompletion = async () => {
    if (!todayActivity) return;

    if (isCompleted) {
      // Remove completion
      await supabase
        .from('activity_log')
        .delete()
        .eq('user_id', userId)
        .eq('activity_type', todayActivity.activity_type)
        .eq('completed_at', today);

      setIsCompleted(false);
      toast({ title: 'בוטל', description: 'הסימון בוטל' });
    } else {
      // Add completion
      await supabase
        .from('activity_log')
        .insert({
          user_id: userId,
          activity_type: todayActivity.activity_type,
          completed_at: today,
        });

      setIsCompleted(true);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 600);
      toast({ title: 'כל הכבוד! 🎉', description: 'סימנת את הפעילות כהושלמה' });
    }
  };

  if (isLoading || !todayActivity) return null;

  const Icon = todayActivity.activity_type === 'walk' ? Footprints : Dumbbell;
  const activityInfo = ACTIVITY_LABELS[todayActivity.activity_type];

  return (
    <Card className={cn(
      'border-2 animate-slide-up transition-all duration-300',
      isCompleted 
        ? 'bg-success/10 border-success/30' 
        : 'border-warning/50 bg-warning/5',
      showConfetti && 'animate-confetti'
    )}>
      <CardContent className="pt-5">
        <div 
          className="flex items-center gap-4 cursor-pointer"
          onClick={toggleCompletion}
        >
          <Checkbox
            checked={isCompleted}
            className={cn(
              'h-7 w-7 rounded-lg',
              isCompleted && 'bg-success border-success'
            )}
          />
          <div className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center',
            isCompleted ? 'bg-success/20' : 'bg-warning/20'
          )}>
            <Icon className={cn(
              'h-6 w-6',
              isCompleted ? 'text-success' : 'text-warning'
            )} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Sparkles className={cn(
                'h-4 w-4',
                isCompleted ? 'text-success' : 'text-warning'
              )} />
              <h3 className={cn(
                'font-bold',
                isCompleted && 'line-through text-muted-foreground'
              )}>
                היום יום הפעילות שלך!
              </h3>
            </div>
            <p className={cn(
              'text-sm',
              isCompleted ? 'text-success' : 'text-muted-foreground'
            )}>
              {isCompleted ? `ביצעת ${todayActivity.activity_type === 'walk' ? 'הליכה' : 'אימון'} ✓` : activityInfo.action}
            </p>
          </div>
          {isCompleted && (
            <span className="text-2xl">{activityInfo.emoji}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
