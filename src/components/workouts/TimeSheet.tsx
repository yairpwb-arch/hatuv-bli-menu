import { useEffect, useState } from 'react';
import { BottomSheet, SheetActions } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { WEEKDAY_SHORT } from './WeekCards';

export type TimeScope = 'weekday' | 'date';

/**
 * Choosing when a walk or workout happens. The same time the calendar shows:
 * it's saved as the calendar's own placement, so moving it here moves it there.
 */
export function TimeSheet({ open, onOpenChange, title, time, weekday, onSave }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  /** "HH:mm" now shown. */
  time: string;
  weekday: number;
  onSave: (time: string, scope: TimeScope) => Promise<void>;
}) {
  const [draft, setDraft] = useState(time);
  const [scope, setScope] = useState<TimeScope>('weekday');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(time);
    setScope('weekday');
  }, [open, time]);

  const options: { value: TimeScope; label: string }[] = [
    { value: 'weekday', label: `כל יום ${WEEKDAY_SHORT[weekday]}` },
    { value: 'date', label: 'רק ביום הזה' },
  ];

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={title} description="באיזו שעה?">
      <div className="space-y-5 pb-2">
        <Input
          type="time"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          dir="ltr"
          aria-label="שעה"
          className="h-16 text-center text-[28px] font-bold tabular-nums"
        />
        <div role="radiogroup" aria-label="לאיזה ימים" className="grid grid-cols-2 gap-2">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={scope === o.value}
              onClick={() => setScope(o.value)}
              className={cn(
                'min-h-[48px] rounded-inner border text-body font-semibold transition-colors',
                scope === o.value ? 'border-primary bg-primary-tint text-primary-soft' : 'border-border text-muted-foreground',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <SheetActions>
          <Button
            disabled={!draft || busy}
            onClick={async () => {
              setBusy(true);
              await onSave(draft, scope);
              setBusy(false);
            }}
          >
            {busy ? 'שומר...' : 'שמירה'}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
        </SheetActions>
      </div>
    </BottomSheet>
  );
}
