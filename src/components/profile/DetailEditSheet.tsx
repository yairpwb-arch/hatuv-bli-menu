import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Cake, Minus, Plus, Ruler, Target, UserRound } from 'lucide-react';
import { BottomSheet, ChoiceChips, PrimaryButton } from '@/components/ds';
import { selectionHaptic } from '@/lib/native';
import { cn } from '@/lib/utils';

export type DetailField = 'height' | 'target_weight' | 'gender' | 'age';

interface NumberSpec {
  label: string;
  icon: LucideIcon;
  unit: string;
  min: number;
  max: number;
  step: number;
  /** Where − / + start from when there's no value yet. */
  start: number;
}

export const DETAIL_FIELDS: Record<Exclude<DetailField, 'gender'>, NumberSpec> & { gender: { label: string; icon: LucideIcon } } = {
  height: { label: 'גובה', icon: Ruler, unit: 'ס"מ', min: 120, max: 230, step: 1, start: 170 },
  target_weight: { label: 'משקל יעד', icon: Target, unit: 'ק"ג', min: 35, max: 250, step: 0.5, start: 70 },
  age: { label: 'גיל', icon: Cake, unit: 'שנים', min: 14, max: 90, step: 1, start: 30 },
  gender: { label: 'מין', icon: UserRound },
};

const GENDERS = [
  { value: 'male', label: 'זכר' },
  { value: 'female', label: 'נקבה' },
] as const;

const fmt = (n: number) => String(Math.round(n * 10) / 10);

/**
 * Editing one profile detail. Numbers: big in the middle with their unit,
 * − / + for quick changes, the number pad on tap, and a range check. Gender:
 * two chips.
 */
export function DetailEditSheet({
  field, initial, onClose, onSave,
}: {
  field: DetailField | null;
  /** The current value as text ('' when there's none). */
  initial: string;
  onClose: () => void;
  /** Resolves true when saved (the sheet then closes). */
  onSave: (field: DetailField, value: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Keep the last field while the sheet animates closed.
  const [shown, setShown] = useState<DetailField>(field ?? 'height');

  useEffect(() => {
    if (field) {
      setShown(field);
      setDraft(initial);
    }
  }, [field, initial]);

  const spec = shown === 'gender' ? null : DETAIL_FIELDS[shown];
  const meta = DETAIL_FIELDS[shown];
  const num = draft === '' ? null : Number(draft);
  const outOfRange = !!spec && num != null && (Number.isNaN(num) || num < spec.min || num > spec.max);
  const canSave = !saving && (spec ? num != null && !outOfRange : !!draft) && draft !== initial;

  const nudge = (dir: 1 | -1) => {
    if (!spec) return;
    const base = num == null || Number.isNaN(num) ? spec.start : num;
    const next = Math.min(spec.max, Math.max(spec.min, Math.round((base + dir * spec.step) / spec.step) * spec.step));
    setDraft(fmt(next));
    selectionHaptic();
  };

  // Holding − / + keeps counting (after a short pause, then faster).
  const hold = useRef<{ t?: number; i?: number }>({});
  const stopHold = () => {
    window.clearTimeout(hold.current.t);
    window.clearInterval(hold.current.i);
  };
  const startHold = (dir: 1 | -1) => {
    stopHold();
    hold.current.t = window.setTimeout(() => {
      hold.current.i = window.setInterval(() => nudgeRef.current(dir), 90);
    }, 450);
  };
  const nudgeRef = useRef(nudge);
  nudgeRef.current = nudge;
  useEffect(() => stopHold, []);

  const save = async () => {
    if (!canSave) return;
    inputRef.current?.blur();
    setSaving(true);
    const ok = await onSave(shown, spec ? fmt(num!) : draft);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <BottomSheet open={!!field} onOpenChange={(o) => !o && onClose()} title={meta.label} icon={meta.icon}>
      {spec ? (
        <div className="pb-2">
          <div className="flex items-center justify-between gap-3" dir="ltr">
            {([-1, 1] as const).map((dir) => {
              const Icon = dir === -1 ? Minus : Plus;
              const atEdge = num != null && (dir === -1 ? num <= spec.min : num >= spec.max);
              return (
                <button
                  key={dir}
                  type="button"
                  aria-label={dir === -1 ? 'פחות' : 'יותר'}
                  disabled={atEdge}
                  onClick={() => nudge(dir)}
                  onPointerDown={() => startHold(dir)}
                  onPointerUp={stopHold}
                  onPointerLeave={stopHold}
                  onPointerCancel={stopHold}
                  className={cn(
                    'inline-flex h-14 w-14 shrink-0 select-none items-center justify-center rounded-pill border border-border bg-card-inner text-foreground transition-transform active:scale-95 disabled:opacity-40',
                    dir === -1 ? 'order-first' : 'order-last',
                  )}
                >
                  <Icon className="h-6 w-6" strokeWidth={2.25} />
                </button>
              );
            })}
            {/* The number itself: tap for the number pad. */}
            <label className="flex min-w-0 flex-1 items-baseline justify-center gap-1.5">
              <input
                ref={inputRef}
                inputMode="decimal"
                enterKeyHint="done"
                aria-label={meta.label}
                value={draft}
                placeholder="—"
                onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                onFocus={(e) => e.currentTarget.select()}
                className={cn(
                  'min-w-0 bg-transparent p-0 text-center text-[3rem] font-extrabold leading-none tabular-nums outline-none placeholder:text-muted-foreground caret-primary',
                  outOfRange && 'text-destructive',
                )}
                style={{ width: `${Math.max(2, draft.length || 1) + 0.4}ch` }}
              />
              <span className="text-body font-semibold text-muted-foreground" dir="rtl">{spec.unit}</span>
            </label>
          </div>
          <p
            className={cn('mt-3 min-h-[1.25rem] text-center text-label', outOfRange ? 'text-destructive' : 'text-muted-foreground')}
            aria-live="polite"
          >
            {outOfRange ? `אפשר בין ${spec.min} ל-${spec.max} ${spec.unit}` : 'אפשר ללחוץ על המספר ולהקליד'}
          </p>
        </div>
      ) : (
        <ChoiceChips value={draft || null} onChange={setDraft} options={[...GENDERS]} className="pb-2" />
      )}
      <PrimaryButton className="mt-4" disabled={!canSave} onClick={save}>
        {saving ? 'שומר…' : 'שמירה'}
      </PrimaryButton>
    </BottomSheet>
  );
}
