import { ArrowDown, ArrowUp, Scale } from 'lucide-react';
import { Card } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatKg } from './format';

interface WeightHeroCardProps {
  latestWeight: number | null;
  startWeight: number | null;
  targetWeight: number | null;
  onWeighIn: () => void;
  onOpenGuide: (() => void) | null;
}

export function WeightHeroCard({ latestWeight, startWeight, targetWeight, onWeighIn, onOpenGuide }: WeightHeroCardProps) {
  const footer = (
    <>
      <Button onClick={onWeighIn} className="w-full h-12 rounded-2xl bg-primary text-primary-foreground text-base font-bold hover:bg-primary/90">
        שקילה של השבוע
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        שוקלים פעם בשבוע, בבוקר, לפני אוכל
        {onOpenGuide && (
          <>
            {' · '}
            <button type="button" onClick={onOpenGuide} className="inline-flex min-h-[44px] items-center font-semibold text-primary underline-offset-4 hover:underline">
              מדריך השקילה
            </button>
          </>
        )}
      </p>
    </>
  );

  if (latestWeight == null) {
    return (
      <Card className="space-y-4">
        <div className="flex flex-col items-center text-center gap-2 py-2">
          <Scale className="h-8 w-8 text-muted-foreground" strokeWidth={2} />
          <p className="font-bold">עוד אין שקילה</p>
          <p className="text-sm text-muted-foreground">השקילה הראשונה היא נקודת ההתחלה שלך</p>
        </div>
        {footer}
      </Card>
    );
  }

  // Positive = kilos lost since the start.
  const lost = startWeight != null ? +(startWeight - latestWeight).toFixed(1) : null;

  let goalProgress: { pct: number; remaining: number; reached: boolean } | null = null;
  if (targetWeight != null && startWeight != null && startWeight !== targetWeight) {
    const pct = Math.min(Math.max((startWeight - latestWeight) / (startWeight - targetWeight), 0), 1);
    const reached = (startWeight - targetWeight) * (latestWeight - targetWeight) <= 0;
    goalProgress = { pct, remaining: Math.abs(latestWeight - targetWeight), reached };
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">משקל אחרון</p>
          <p className="font-bold leading-none mt-1">
            <span className="text-stat-lg tracking-tight text-primary tabular-nums">{formatKg(latestWeight)}</span>
            <span className="text-lg text-muted-foreground mr-1">ק"ג</span>
          </p>
        </div>
        {lost != null && (
          <span
            className={cn(
              'mt-1 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap',
              lost > 0 ? 'text-success bg-success/10' : 'text-muted-foreground bg-card-inner',
            )}
          >
            {lost > 0 ? <ArrowDown className="h-4 w-4" strokeWidth={2} /> : lost < 0 ? <ArrowUp className="h-4 w-4" strokeWidth={2} /> : null}
            {lost === 0 ? 'כמו בהתחלה' : `${formatKg(Math.abs(lost))} ק"ג מההתחלה`}
          </span>
        )}
      </div>

      {goalProgress ? (
        <div className="space-y-2">
          <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: 'hsl(var(--card-inner))' }}>
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${goalProgress.pct * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>התחלה {formatKg(startWeight!)}</span>
            <span className="font-semibold text-foreground">
              {goalProgress.reached ? 'הגעת ליעד' : `עוד ${formatKg(goalProgress.remaining)} ק"ג ליעד`}
            </span>
            <span>יעד {formatKg(targetWeight!)}</span>
          </div>
        </div>
      ) : (
        targetWeight == null && <p className="text-xs text-muted-foreground">אפשר להגדיר משקל יעד בעריכת הפרופיל</p>
      )}

      {footer}
    </Card>
  );
}
