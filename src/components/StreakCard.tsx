import { Card, CardContent } from '@/components/ui/card';
import { Flame } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface StreakCardProps {
  streak: number;
  isLoading: boolean;
}

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

  return (
    <Card 
      className={cn(
        'animate-slide-up border-2 transition-all',
        streak > 0 
          ? 'bg-gradient-to-br from-warning/10 to-destructive/10 border-warning/30' 
          : 'glass-card'
      )} 
      style={{ animationDelay: '0.15s' }}
    >
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-4">
          <div className={cn(
            'w-14 h-14 rounded-xl flex items-center justify-center',
            streak > 0 
              ? 'bg-gradient-to-br from-warning to-destructive' 
              : 'bg-muted'
          )}>
            <Flame className={cn(
              'h-7 w-7',
              streak > 0 ? 'text-white' : 'text-muted-foreground'
            )} />
          </div>
          <div className="flex-1">
            <div className="flex items-baseline gap-2">
              <span className={cn(
                'text-3xl font-bold',
                streak > 0 ? 'text-warning' : 'text-muted-foreground'
              )}>
                {streak}
              </span>
              <span className="text-sm text-muted-foreground">
                {streak === 1 ? 'יום' : 'ימים'}
              </span>
            </div>
            <p className="text-sm font-medium text-foreground">רצף התמדה 🔥</p>
          </div>
          {streak >= 7 && (
            <div className="text-2xl">🏆</div>
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