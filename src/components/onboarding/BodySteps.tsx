import { useRef, useState } from 'react';
import { Camera, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { NumberField } from './inputs';

/* ── Body photos (private bucket) ─────────────────────────────────────────── */

export type Angle = 'front' | 'side' | 'back';
const ANGLES: { key: Angle; label: string }[] = [
  { key: 'front', label: 'מקדימה' },
  { key: 'side', label: 'מהצד' },
  { key: 'back', label: 'מאחור' },
];

interface PhotosStepProps {
  userId: string;
  /** angle → storage path of what's already uploaded */
  value: Partial<Record<Angle, string>>;
  onChange: (value: Partial<Record<Angle, string>>) => void;
}

export function PhotosStep({ userId, value, onChange }: PhotosStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pending = useRef<Angle | null>(null);
  const [busy, setBusy] = useState<Angle | null>(null);
  const [previews, setPreviews] = useState<Partial<Record<Angle, string>>>({});

  const pick = (angle: Angle) => {
    pending.current = angle;
    inputRef.current?.click();
  };

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const angle = pending.current;
    e.target.value = '';
    if (!file || !angle) return;
    if (!file.type.startsWith('image/') || file.size > 15 * 1024 * 1024) {
      toast.error('נא לבחור תמונה עד 15MB');
      return;
    }
    setBusy(angle);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${userId}/${angle}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('body-photos').upload(path, file);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: rowError } = await (supabase as any)
        .from('body_photos')
        .insert({ user_id: userId, angle, storage_path: path });
      if (rowError) throw rowError;
      setPreviews((p) => ({ ...p, [angle]: URL.createObjectURL(file) }));
      onChange({ ...value, [angle]: path });
    } catch (err) {
      console.error('[onboarding] photo upload failed', err);
      toast.error('ההעלאה נכשלה, נסו שוב');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={upload} />
      <div className="grid grid-cols-3 gap-3">
        {ANGLES.map(({ key, label }) => {
          const done = !!value[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => pick(key)}
              disabled={busy !== null}
              aria-label={`צילום ${label}${done ? ', הועלה' : ''}`}
              className={cn(
                'relative aspect-[3/4] overflow-hidden rounded-inner border flex flex-col items-center justify-center gap-2',
                done ? 'border-primary' : 'border-dashed border-primary/50 bg-card',
              )}
            >
              {previews[key] ? (
                <img src={previews[key]} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : busy === key ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              ) : done ? (
                <Check className="h-6 w-6 text-success" strokeWidth={2} />
              ) : (
                <Camera className="h-6 w-6 text-primary" strokeWidth={2} />
              )}
              <span className={cn('relative text-label font-semibold', previews[key] && 'rounded-pill bg-background/80 px-2')}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-label text-muted-foreground">אפשר לדלג ולהעלות אחר כך ממסך ההתקדמות.</p>
    </>
  );
}

/* ── Circumference measurements ───────────────────────────────────────────── */

export type MeasureKey = 'arm' | 'chest' | 'waist' | 'belly';
const MEASURES: { key: MeasureKey; label: string; hint: string; start: number }[] = [
  { key: 'arm', label: 'יד', hint: 'החלק הרחב של הזרוע, יד רפויה', start: 32 },
  { key: 'chest', label: 'חזה', hint: 'בקו הפטמות', start: 95 },
  { key: 'waist', label: 'מותניים', hint: 'החלק הצר ביותר', start: 80 },
  { key: 'belly', label: 'בטן', hint: 'בקו הטבור', start: 88 },
];

/** Where each line is drawn on the figure (viewBox 0 0 120 200). */
const LINES: Record<MeasureKey, { x1: number; x2: number; y: number }> = {
  arm: { x1: 14, x2: 30, y: 74 },
  chest: { x1: 36, x2: 84, y: 70 },
  waist: { x1: 40, x2: 80, y: 100 },
  belly: { x1: 38, x2: 82, y: 114 },
};

function BodyFigure({ active }: { active: MeasureKey | null }) {
  return (
    <svg viewBox="0 0 120 200" className="mx-auto h-44 w-auto" aria-hidden>
      <g fill="hsl(var(--card-inner))" stroke="hsl(var(--border))" strokeWidth="1.5">
        <circle cx="60" cy="24" r="14" />
        <path d="M38 46 Q60 40 82 46 L88 96 Q90 132 80 150 L76 196 H64 L60 152 L56 196 H44 L40 150 Q30 132 32 96 Z" />
        <path d="M38 48 L22 60 L12 112 L20 114 L32 70 Z" />
        <path d="M82 48 L98 60 L108 112 L100 114 L88 70 Z" />
      </g>
      {(Object.keys(LINES) as MeasureKey[]).map((k) => {
        const l = LINES[k];
        const on = active === k;
        return (
          <line
            key={k}
            x1={l.x1}
            x2={l.x2}
            y1={l.y}
            y2={l.y}
            stroke={on ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
            strokeWidth={on ? 3 : 1.5}
            strokeDasharray="4 3"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

interface MeasurementsStepProps {
  value: Partial<Record<MeasureKey, number>>;
  onChange: (value: Partial<Record<MeasureKey, number>>) => void;
}

export function MeasurementsStep({ value, onChange }: MeasurementsStepProps) {
  const [focus, setFocus] = useState<MeasureKey | null>('arm');
  return (
    <div className="space-y-4">
      <BodyFigure active={focus} />
      {MEASURES.map((m) => (
        <div
          key={m.key}
          onFocusCapture={() => setFocus(m.key)}
          onPointerDown={() => setFocus(m.key)}
          className={cn('rounded-inner border bg-card px-3 py-3', focus === m.key ? 'border-primary' : 'border-border')}
        >
          <p className="text-body font-bold">{m.label}</p>
          <p className="text-label text-muted-foreground">{m.hint}</p>
          <NumberField
            compact
            value={value[m.key]}
            onChange={(v) => onChange({ ...value, [m.key]: v })}
            unit='ס"מ'
            min={15}
            max={200}
            step={0.5}
            decimals
            start={m.start}
          />
        </div>
      ))}
    </div>
  );
}
