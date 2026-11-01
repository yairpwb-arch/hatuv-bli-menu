import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BottomSheet, SheetActions } from '@/components/ds';
import type { Difficulty } from '@/lib/activityMarks';
import { cn } from '@/lib/utils';

export interface ManualDone {
  durationMin: number | null;
  difficulty: Difficulty | null;
  distanceKm: number | null;
}

const WORKOUT_MINUTES = [30, 45, 60, 75];
/** Chip value for "type your own number". */
const OTHER = -1;
const WALK_MINUTES = [10, 20, 30, 45];
const DIFFICULTY: { value: Difficulty; label: string }[] = [
  { value: 'easy', label: 'קל' },
  { value: 'medium', label: 'בינוני' },
  { value: 'hard', label: 'קשה' },
];

/** One row of 44px+ chips; tapping the picked one clears it (every field is optional). */
function ChipRow<T extends string | number>({
  label, options, value, onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T | null) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-label font-semibold text-muted-foreground">{label}</legend>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(value === o.value ? null : o.value)}
            className={cn(
              'h-11 rounded-inner border text-body font-semibold transition-colors',
              value === o.value ? 'border-primary bg-primary-tint text-foreground' : 'border-border bg-card-inner text-muted-foreground',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** "I did it without the app": a quick, all-optional log for a workout or a walk. */
export function ManualDoneSheet({
  kind, open, onOpenChange, onSave,
}: {
  kind: 'workout' | 'walk';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (v: ManualDone) => Promise<void>;
}) {
  const [duration, setDuration] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [distance, setDistance] = useState('');
  // The "אחר" chip: any number of minutes, typed in.
  const [customMin, setCustomMin] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDuration(null);
    setDifficulty(null);
    setDistance('');
    setCustomMin('');
  }, [open]);

  const minutes = kind === 'workout' ? WORKOUT_MINUTES : WALK_MINUTES;
  const last = minutes[minutes.length - 1];

  const save = async () => {
    setBusy(true);
    const km = Number(distance.replace(',', '.'));
    const typed = Math.round(Number(customMin));
    const durationMin = duration === OTHER ? (typed > 0 ? Math.min(typed, 600) : null) : duration;
    await onSave({ durationMin, difficulty, distanceKm: km > 0 ? km : null });
    setBusy(false);
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={kind === 'workout' ? 'ביצעתי בלי האפליקציה' : 'ביצעתי הליכה'}>
      <div className="mb-5 space-y-4">
        <ChipRow<number>
          label="משך (לא חובה)"
          options={[...minutes.map((m) => ({ value: m, label: m === last ? `${m}+ דק'` : `${m} דק'` })), { value: OTHER, label: 'אחר' }]}
          value={duration}
          onChange={setDuration}
        />
        {duration === OTHER && (
          <Input
            autoFocus
            inputMode="numeric"
            dir="ltr"
            placeholder="כמה דקות?"
            aria-label="משך בדקות"
            value={customMin}
            onChange={(e) => setCustomMin(e.target.value.replace(/\D/g, '').slice(0, 3))}
            className="-mt-2 h-12 rounded-inner text-left text-body placeholder:text-right"
          />
        )}
        {kind === 'workout' ? (
          <ChipRow<Difficulty> label="איך היה? (לא חובה)" options={DIFFICULTY} value={difficulty} onChange={setDifficulty} />
        ) : (
          <label className="block space-y-2">
            <span className="text-label font-semibold text-muted-foreground">מרחק בק"מ (לא חובה)</span>
            <Input
              inputMode="decimal"
              dir="ltr"
              placeholder="2.5"
              value={distance}
              onChange={(e) => setDistance(e.target.value.replace(/[^\d.,]/g, ''))}
              className="h-12 rounded-inner text-left text-body"
            />
          </label>
        )}
      </div>
      <SheetActions>
        <Button disabled={busy} onClick={save}>שמור</Button>
        <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>ביטול</Button>
      </SheetActions>
    </BottomSheet>
  );
}
