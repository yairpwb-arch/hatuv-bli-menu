import { Check, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { selectionHaptic } from '@/lib/native';
import type { Option } from '@/lib/onboarding';

/* ── Big tappable answer cards ────────────────────────────────────────────── */

interface OptionListProps {
  options: Option[];
  value: string | string[] | undefined;
  multiple?: boolean;
  onChange: (value: string | string[]) => void;
}

/** Number ranges ("1–2", "22:00–23:00") read left to right inside Hebrew. */
function withLtrRanges(label: string) {
  return label.split(/(d[d:]*s*[–-]s*d[d:]*)/).map((part, i) =>
    i % 2 ? (
      <span key={i} dir="ltr" className="inline-block">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function OptionList({ options, value, multiple = false, onChange }: OptionListProps) {
  const selected = new Set(Array.isArray(value) ? value : value ? [value] : []);

  const toggle = (v: string) => {
    selectionHaptic();
    if (!multiple) return onChange(v);
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(options.map((o) => o.value).filter((o) => next.has(o)));
  };

  return (
    <div role={multiple ? 'group' : 'radiogroup'} className="space-y-3">
      {options.map((o) => {
        const on = selected.has(o.value);
        return (
          <button
            key={o.value}
            type="button"
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={on}
            onClick={() => toggle(o.value)}
            className={cn(
              'flex min-h-[60px] w-full items-center justify-between gap-3 rounded-inner border px-5 text-right text-body font-semibold transition-colors duration-150',
              on ? 'border-primary bg-primary-tint text-foreground' : 'border-border bg-card text-foreground',
            )}
          >
            <span>{withLtrRanges(o.label)}</span>
            <span
              aria-hidden
              className={cn(
                'inline-flex h-6 w-6 shrink-0 items-center justify-center border-2 transition-colors',
                multiple ? 'rounded-md' : 'rounded-pill',
                on ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
              )}
            >
              {on && <Check className="h-4 w-4" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Number entry: numeric keyboard plus ± steppers ───────────────────────── */

interface NumberFieldProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  unit: string;
  min: number;
  max: number;
  step: number;
  decimals?: boolean;
  /** Where the steppers start from when the field is empty. */
  start?: number;
  label?: string;
  compact?: boolean;
}

export function NumberField({ value, onChange, unit, min, max, step, decimals, start, label, compact }: NumberFieldProps) {
  const round = (n: number) => Math.round(n * 10) / 10;
  const bump = (dir: 1 | -1) => {
    selectionHaptic();
    const base = value ?? start ?? Math.round((min + max) / 2);
    onChange(round(Math.min(max, Math.max(min, base + dir * step))));
  };
  const outOfRange = value != null && (value < min || value > max);

  const stepper = (dir: 1 | -1) => (
    <button
      type="button"
      onClick={() => bump(dir)}
      aria-label={dir > 0 ? 'הוספה' : 'הפחתה'}
      className="h-12 w-12 shrink-0 inline-flex items-center justify-center rounded-pill bg-card-inner text-foreground active:scale-95 transition-transform"
    >
      {dir > 0 ? <Plus className="h-5 w-5" strokeWidth={2} /> : <Minus className="h-5 w-5" strokeWidth={2} />}
    </button>
  );

  return (
    <div className={cn('flex flex-col items-center', compact ? 'gap-1' : 'gap-3 pt-6')}>
      {label && <span className="text-label text-muted-foreground">{label}</span>}
      <div className="flex w-full items-center justify-center gap-4" dir="ltr">
        {stepper(-1)}
        <div className="flex items-baseline gap-2" dir="rtl">
          <input
            type="text"
            inputMode={decimals ? 'decimal' : 'numeric'}
            aria-label={label ?? unit}
            value={value ?? ''}
            placeholder="—"
            onChange={(e) => {
              const raw = e.target.value.replace(',', '.').replace(decimals ? /[^\d.]/g : /\D/g, '');
              if (raw === '') return onChange(undefined);
              const n = Number(raw);
              if (!Number.isNaN(n)) onChange(decimals ? n : Math.round(n));
            }}
            className={cn(
              'bg-transparent text-center tabular-nums outline-none placeholder:text-muted-foreground',
              compact ? 'w-20 text-stat' : 'w-36 text-stat-lg',
            )}
          />
          <span className="text-body text-muted-foreground">{unit}</span>
        </div>
        {stepper(1)}
      </div>
      {outOfRange && (
        <p className="text-label text-destructive">
          ערך בין {min} ל-{max}
        </p>
      )}
    </div>
  );
}
