import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ArrowDown, ArrowUp, Ruler } from 'lucide-react';
import { toast } from 'sonner';
import { BottomSheet, Card, PrimaryButton, SectionHeader } from '@/components/ds';
import { MEASURES, MeasurementsStep } from '@/components/onboarding/BodySteps';
import { MeasureValues, useMeasurements, valuesOf } from '@/hooks/useMeasurements';
import { successHaptic } from '@/lib/native';
import { cn } from '@/lib/utils';

/** Window event: measurements were saved outside the profile card. */
export const MEASUREMENTS_CHANGED = 'measurements-changed';
/** Window event: a body photo was added outside the gallery. */
export const PHOTOS_CHANGED = 'photos-changed';

const fmt = (n: number) => String(Math.round(n * 10) / 10);

/** Entering the four circumferences (arm, chest, waist, belly), starting from the last ones. */
export function MeasurementsSheet({
  open, onClose, initial, onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial: MeasureValues;
  onSave: (values: MeasureValues) => Promise<boolean>;
}) {
  const [values, setValues] = useState<MeasureValues>(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setValues(initial);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const filled = Object.values(values).filter((v) => v != null).length;
  const save = async () => {
    setSaving(true);
    const ok = await onSave(values);
    setSaving(false);
    if (!ok) return void toast.error('לא הצלחנו לשמור, נסו שוב');
    successHaptic();
    toast.success('ההיקפים נשמרו');
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => !o && !saving && onClose()}
      title="מדידת היקפים"
      icon={Ruler}
      description="סרט מדידה רך, צמוד לגוף בלי ללחוץ. הכי טוב בבוקר, לפני האוכל."
    >
      <MeasurementsStep value={values} onChange={setValues} />
      <PrimaryButton className="mt-5" disabled={saving || filled === 0} onClick={save}>
        {saving ? 'שומר…' : filled === 4 || filled === 0 ? 'שמירה' : `שמירה (${filled} מתוך 4)`}
      </PrimaryButton>
    </BottomSheet>
  );
}

/** The profile's "my measurements": the latest, the change since the first, and updating them. */
export function MeasurementsCard({ userId }: { userId: string }) {
  const m = useMeasurements(userId);
  const [open, setOpen] = useState(false);

  // Saved somewhere else (the reminder): show the new ones.
  const { reload } = m;
  useEffect(() => {
    const onChange = () => void reload();
    window.addEventListener(MEASUREMENTS_CHANGED, onChange);
    return () => window.removeEventListener(MEASUREMENTS_CHANGED, onChange);
  }, [reload]);

  if (m.isLoading) return null;
  const latest = valuesOf(m.latest);
  const first = valuesOf(m.first);
  const hasHistory = m.rows.length > 1;

  return (
    <Card id="measurements" className="space-y-3">
      <SectionHeader
        title="ההיקפים שלי"
        icon={Ruler}
        action={m.latest ? { label: 'עדכון', onClick: () => setOpen(true) } : undefined}
      />
      {m.latest ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {MEASURES.map(({ key, label }) => {
              const now = latest[key];
              const diff = now != null && first[key] != null && hasHistory ? +(now - first[key]!).toFixed(1) : null;
              return (
                <div key={key} className="rounded-inner bg-card-inner px-3 py-2.5">
                  <p className="text-label text-muted-foreground">{label}</p>
                  <p className="text-body font-bold tabular-nums">{now != null ? `${fmt(now)} ס"מ` : '—'}</p>
                  {diff != null && diff !== 0 && (
                    <p className={cn('inline-flex items-center gap-0.5 text-label font-semibold', diff < 0 ? 'text-success' : 'text-muted-foreground')}>
                      {diff < 0 ? <ArrowDown className="h-3.5 w-3.5" strokeWidth={2.25} /> : <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.25} />}
                      {fmt(Math.abs(diff))} מההתחלה
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-label text-muted-foreground">
            מדידה אחרונה {format(new Date(`${m.latest.measured_at}T12:00:00`), 'd/M/yyyy')}
            {m.rows.length > 1 ? ` · ${m.rows.length} מדידות` : ''}
          </p>
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-body text-muted-foreground">
            4 מדידות עם סרט מדידה: יד, חזה, מותניים ובטן. ככה רואים שינוי גם בשבועות שהמשקל לא זז.
          </p>
          <PrimaryButton icon={Ruler} onClick={() => setOpen(true)}>להוספת היקפים</PrimaryButton>
        </div>
      )}
      <MeasurementsSheet open={open} onClose={() => setOpen(false)} initial={latest} onSave={m.save} />
    </Card>
  );
}
