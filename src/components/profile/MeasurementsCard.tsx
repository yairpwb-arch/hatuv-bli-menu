import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ArrowDown, ArrowUp, Ruler } from 'lucide-react';
import { toast } from 'sonner';
import { BottomSheet, Card, PrimaryButton, SectionHeader } from '@/components/ds';
import { MEASURES, MeasurementsStep } from '@/components/onboarding/BodySteps';
import { differenceInCalendarDays } from 'date-fns';
import { MEASURE_COLUMN, MeasureValues, MeasurementRow, isMeasureDue, nextMeasureDay, useMeasurements, valuesOf } from '@/hooks/useMeasurements';
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
          <MeasureSummary rows={m.rows} onMeasure={() => setOpen(true)} />
          <MeasureHistory rows={m.rows} />
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

const dm = (ymd: string) => format(new Date(`${ymd}T12:00:00`), 'd/M/yy');
const weeksBetween = (a: string, b: string) => Math.round(differenceInCalendarDays(new Date(`${b}T12:00:00`), new Date(`${a}T12:00:00`)) / 7);

/** How long they've been measuring, and when the next one is due (every two months). */
function MeasureSummary({ rows, onMeasure }: { rows: MeasurementRow[]; onMeasure: () => void }) {
  const first = rows[0];
  const last = rows[rows.length - 1];
  const today = format(new Date(), 'yyyy-MM-dd');
  const span = weeksBetween(first.measured_at, today);
  const due = isMeasureDue(last.measured_at);
  return (
    <div className={cn('flex items-center justify-between gap-3 rounded-inner px-3 py-2.5', due ? 'bg-primary-tint' : 'bg-card-inner')}>
      <p className="text-label">
        {rows.length === 1 ? 'מדידה ראשונה' : `${rows.length} מדידות`} · {span < 1 ? 'התחלת השבוע' : `מודדים כבר ${span} שבועות`}
        <br />
        <span className={cn(due ? 'font-semibold text-primary-soft' : 'text-muted-foreground')}>
          {due ? 'הגיע הזמן למדוד שוב' : `המדידה הבאה: ${dm(nextMeasureDay(last.measured_at))}`}
        </span>
      </p>
      {due && (
        <button type="button" onClick={onMeasure} className="min-h-[44px] shrink-0 text-label font-bold text-primary-soft">
          למדוד עכשיו
        </button>
      )}
    </div>
  );
}

/** Every measurement, newest first: the values and the change since the one before. */
function MeasureHistory({ rows }: { rows: MeasurementRow[] }) {
  const [all, setAll] = useState(false);
  if (rows.length < 2) return null;
  const newest = [...rows].reverse();
  const shown = all ? newest : newest.slice(0, 4);
  return (
    <div className="space-y-2">
      <p className="text-label font-semibold text-muted-foreground">כל המדידות</p>
      <div className="overflow-hidden rounded-inner border border-border">
        <table className="w-full table-fixed text-label">
          <thead className="bg-card-inner text-muted-foreground">
            <tr>
              <th className="w-[26%] px-2 py-2 text-right font-semibold">תאריך</th>
              {MEASURES.map((x) => <th key={x.key} className="px-1 py-2 text-center font-semibold">{x.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const i = rows.indexOf(r);
              const prev = i > 0 ? rows[i - 1] : null;
              return (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="px-2 py-2">
                    <span className="block font-semibold tabular-nums">{dm(r.measured_at)}</span>
                    <span className="block text-[0.7rem] text-muted-foreground">
                      {prev ? `אחרי ${Math.max(1, weeksBetween(prev.measured_at, r.measured_at))} שב׳` : 'התחלה'}
                    </span>
                  </td>
                  {MEASURES.map((x) => {
                    const col = MEASURE_COLUMN[x.key];
                    const v = r[col] as number | null;
                    const p = prev ? (prev[col] as number | null) : null;
                    const diff = v != null && p != null ? +(Number(v) - Number(p)).toFixed(1) : null;
                    return (
                      <td key={x.key} className="px-1 py-2 text-center">
                        <span className="block font-semibold tabular-nums">{v != null ? fmt(Number(v)) : '—'}</span>
                        {diff != null && diff !== 0 && (
                          <span className={cn('block text-[0.7rem] font-semibold tabular-nums', diff < 0 ? 'text-success' : 'text-muted-foreground')} dir="ltr">
                            {diff > 0 ? '+' : '−'}{fmt(Math.abs(diff))}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {newest.length > 4 && (
        <button type="button" onClick={() => setAll((a) => !a)} className="min-h-[44px] w-full text-label font-semibold text-primary-soft">
          {all ? 'פחות' : `כל ${newest.length} המדידות`}
        </button>
      )}
    </div>
  );
}
