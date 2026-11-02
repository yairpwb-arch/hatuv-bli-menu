import { useEffect, useState } from 'react';
import { BottomSheet, PrimaryButton } from '@/components/ds';
import { cn } from '@/lib/utils';
import { WEEKDAY_SHORT } from './WeekCards';

/** A walk or workout that just opened and has no day yet. */
export interface PendingDay {
  kind: 'walk' | 'workout';
  /** The walk's row, or the plan day. */
  id: string;
  name: string;
  /** Weekdays already taken by the same kind: not two walks (or workouts) on one day. */
  taken: number[];
}

/**
 * Opens by itself on the workouts page when a watched video has opened a walk
 * or a workout: the trainee picks its weekday. Closing it only puts it off, it
 * comes back the next time they enter the page.
 */
export function StageDayPrompt({ pending, onSave }: { pending: PendingDay | null; onSave: (p: PendingDay, weekday: number) => Promise<void> }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [weekday, setWeekday] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setWeekday(null), [pending?.id]);

  const open = !!pending && !dismissed.includes(pending.id);

  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => {
        if (!o && pending) setDismissed((d) => [...d, pending.id]);
      }}
      title={pending?.kind === 'workout' ? `האימון שלך מוכן: ${pending.name}` : `נפתחה לך ${pending?.name ?? 'הליכה'}`}
      description={pending?.kind === 'workout' ? 'באיזה יום בשבוע תעשו אותו?' : 'באיזה יום בשבוע תלכו?'}
    >
      <div className="space-y-5 pb-2">
        <div role="radiogroup" aria-label="יום בשבוע" className="grid grid-cols-7 gap-1.5">
          {WEEKDAY_SHORT.map((d, wd) => {
            const isTaken = pending?.taken.includes(wd);
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={weekday === wd}
                disabled={isTaken}
                onClick={() => setWeekday(wd)}
                className={cn(
                  'h-12 rounded-inner text-body font-bold transition-colors disabled:opacity-30',
                  weekday === wd ? 'bg-primary text-primary-foreground' : 'bg-card-inner text-foreground',
                )}
              >
                {d}
              </button>
            );
          })}
        </div>
        <PrimaryButton
          className="w-full"
          disabled={weekday === null || busy}
          onClick={async () => {
            if (!pending || weekday === null) return;
            setBusy(true);
            await onSave(pending, weekday);
            setBusy(false);
          }}
        >
          {busy ? 'שומר...' : 'שמירה'}
        </PrimaryButton>
      </div>
    </BottomSheet>
  );
}
