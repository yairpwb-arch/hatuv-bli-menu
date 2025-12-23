import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Footprints, Dumbbell, Calendar, Check, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActivitySchedulerProps {
  userId: string;
  currentWeek: number;
  completedContentIds: Set<string>;
}

interface ScheduleConfig {
  activityType: 'walk' | 'workout';
  maxDays: number;
  label: string;
  unlockContentKeyword: string;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'א׳', fullLabel: 'יום ראשון' },
  { value: 1, label: 'ב׳', fullLabel: 'יום שני' },
  { value: 2, label: 'ג׳', fullLabel: 'יום שלישי' },
  { value: 3, label: 'ד׳', fullLabel: 'יום רביעי' },
  { value: 4, label: 'ה׳', fullLabel: 'יום חמישי' },
  { value: 5, label: 'ו׳', fullLabel: 'יום שישי' },
  { value: 6, label: 'ש׳', fullLabel: 'יום שבת' },
];

export function ActivityScheduler({ userId, currentWeek, completedContentIds }: ActivitySchedulerProps) {
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [savedSchedule, setSavedSchedule] = useState<{ day: number; type: string }[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Determine current activity configuration based on week
  const getActivityConfig = (): ScheduleConfig | null => {
    if (currentWeek >= 16) {
      return { activityType: 'workout', maxDays: 2, label: 'אימונים', unlockContentKeyword: 'אימון' };
    } else if (currentWeek >= 11) {
      return { activityType: 'workout', maxDays: 1, label: 'אימון ראשון', unlockContentKeyword: 'אימון' };
    } else if (currentWeek >= 4) {
      return { activityType: 'walk', maxDays: 2, label: 'הליכות', unlockContentKeyword: 'הליכה' };
    } else if (currentWeek >= 1) {
      return { activityType: 'walk', maxDays: 1, label: 'הליכה', unlockContentKeyword: 'הליכה' };
    }
    return null;
  };

  const config = getActivityConfig();

  // Check if the relevant video has been completed
  // For now, we'll assume the feature is unlocked if we're in the right week range
  // In production, you'd check completedContentIds against specific content IDs
  const isUnlocked = config !== null;

  useEffect(() => {
    const fetchSchedule = async () => {
      if (!config) return;
      
      setIsLoading(true);
      const { data, error } = await supabase
        .from('user_activity_schedule')
        .select('day_of_week, activity_type')
        .eq('user_id', userId)
        .eq('activity_type', config.activityType)
        .eq('is_active', true);

      if (!error && data) {
        setSavedSchedule(data.map(d => ({ day: d.day_of_week, type: d.activity_type })));
        setSelectedDays(data.map(d => d.day_of_week));
      }
      setIsLoading(false);
    };

    fetchSchedule();
  }, [userId, config?.activityType]);

  const toggleDay = (day: number) => {
    if (!config) return;
    
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter(d => d !== day));
    } else if (selectedDays.length < config.maxDays) {
      setSelectedDays([...selectedDays, day]);
    }
  };

  const handleSave = async () => {
    if (!config) return;
    
    setIsSaving(true);
    
    try {
      // First, deactivate old schedules for this activity type
      await supabase
        .from('user_activity_schedule')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('activity_type', config.activityType);

      // Then insert new schedules
      if (selectedDays.length > 0) {
        const newSchedules = selectedDays.map(day => ({
          user_id: userId,
          activity_type: config.activityType,
          day_of_week: day,
          week_start: currentWeek,
          is_active: true,
        }));

        const { error } = await supabase
          .from('user_activity_schedule')
          .upsert(newSchedules, { onConflict: 'user_id,activity_type,day_of_week' });

        if (error) throw error;
      }

      setSavedSchedule(selectedDays.map(d => ({ day: d, type: config.activityType })));
      toast({ title: 'נשמר!', description: 'לוח הזמנים עודכן בהצלחה' });
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error saving schedule:', error);
      toast({ title: 'שגיאה', description: 'לא ניתן לשמור את הלו"ז', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  if (!config || isLoading) return null;

  const Icon = config.activityType === 'walk' ? Footprints : Dumbbell;
  const hasSchedule = savedSchedule.length > 0;

  return (
    <Card className={cn(
      'animate-slide-up border-2',
      hasSchedule ? 'glass-card' : 'border-primary/30 bg-primary/5'
    )}>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center',
              hasSchedule ? 'bg-success/10' : 'gradient-primary'
            )}>
              {isUnlocked ? (
                <Icon className={cn(
                  'h-6 w-6',
                  hasSchedule ? 'text-success' : 'text-primary-foreground'
                )} />
              ) : (
                <Lock className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div>
              <h3 className="font-bold">
                {hasSchedule ? `ימי ה${config.label} שלך` : `קבע את ימי ה${config.label}`}
              </h3>
              <p className="text-sm text-muted-foreground">
                {hasSchedule ? (
                  <span className="flex items-center gap-1">
                    {savedSchedule.map(s => DAYS_OF_WEEK.find(d => d.value === s.day)?.fullLabel).join(', ')}
                  </span>
                ) : (
                  `בחר ${config.maxDays === 1 ? 'יום אחד' : `${config.maxDays} ימים`} בשבוע`
                )}
              </p>
            </div>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant={hasSchedule ? 'outline' : 'default'} size="sm">
                {hasSchedule ? 'עריכה' : 'בחירה'}
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl" className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  בחר את ימי ה{config.label} שלך
                </DialogTitle>
              </DialogHeader>
              <div className="pt-4">
                <p className="text-sm text-muted-foreground mb-4">
                  בחר {config.maxDays === 1 ? 'יום אחד' : `עד ${config.maxDays} ימים`} בשבוע עבור {config.label}
                </p>
                <div className="flex justify-center gap-2 mb-6">
                  {DAYS_OF_WEEK.map(day => (
                    <button
                      key={day.value}
                      onClick={() => toggleDay(day.value)}
                      disabled={!selectedDays.includes(day.value) && selectedDays.length >= config.maxDays}
                      className={cn(
                        'w-10 h-10 rounded-full font-medium transition-all duration-200',
                        selectedDays.includes(day.value)
                          ? 'gradient-primary text-primary-foreground shadow-glow'
                          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
                        !selectedDays.includes(day.value) && selectedDays.length >= config.maxDays && 'opacity-40 cursor-not-allowed'
                      )}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
                <Button 
                  onClick={handleSave} 
                  className="w-full"
                  disabled={isSaving || selectedDays.length === 0}
                >
                  {isSaving ? 'שומר...' : 'שמור לו"ז'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
