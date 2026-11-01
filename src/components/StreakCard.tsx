import { Card, CardContent } from '@/components/ui/card';
import { Flame, Trophy } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface StreakCardProps {
  streak: number;
  isLoading: boolean;
}

const MILESTONE_STREAKS = [7, 14, 21, 30];

export function StreakCard({ streak, isLoading }: StreakCardProps) {
  if (isLoading) {
    return (
      <Card className="glass-card animate-slide-up" style={{ animationDelay: '0.15s' }}>
        <CardContent className="pt-4 pb-4">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const isMilestone = MILESTONE_STREAKS.includes(streak);

  const cardClassName = cn(
    'animate-slide-up animate-bounce-in border-2 transition-all relative',
    streak >= 30
      ? 'gradient-gold text-primary-foreground border-transparent'
      : streak >= 7
      ? 'gradient-premium text-primary-foreground border-transparent'
      : streak > 0
      ? 'bg-primary-tint border-primary/30'
      : 'glass-card'
  );

  return (
    <Card
      className={cardClassName}
      style={{ animationDelay: '0.15s' }}
    >
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-4">
          <div className={cn(
            'w-14 h-14 rounded-xl flex items-center justify-center',
            streak >= 7
              ? 'bg-primary-foreground/15'
              : streak > 0
              ? 'bg-primary'
              : 'bg-muted'
          )}>
            <Flame className={cn(
              'h-7 w-7',
              streak > 0 ? 'text-primary-foreground' : 'text-muted-foreground'
            )} />
          </div>
          <div className="flex-1">
            <div className="flex items-baseline gap-2">
              <span className={cn(
                'text-3xl font-bold',
                streak >= 7
                  ? 'text-primary-foreground'
                  : streak > 0
                  ? 'text-primary-soft'
                  : 'text-muted-foreground'
              )}>
                {streak}
              </span>
              <span className={cn(
                'text-sm',
                streak >= 7 ? 'text-primary-foreground/80' : 'text-muted-foreground'
              )}>
                {streak === 1 ? 'יום' : 'ימים'}
              </span>
            </div>
            <p className={cn(
              'text-sm font-medium',
              streak >= 7 ? 'text-primary-foreground' : 'text-foreground'
            )}>
              רצף התמדה
            </p>
          </div>
          {streak >= 7 && (
            <Trophy className="h-6 w-6" strokeWidth={2} aria-hidden />
          )}
        </div>
        {streak === 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            השלם את כל המשימות היום כדי להתחיל רצף!
          </p>
        )}
      </CardContent>
    </Card>
  );
}
