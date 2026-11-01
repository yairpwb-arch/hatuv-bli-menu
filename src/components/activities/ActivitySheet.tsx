import { useEffect, useState } from 'react';
import { addDays, format } from 'date-fns';
import { ChevronRight, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { BottomSheet, PrimaryButton } from '@/components/ds';
import { useAuth } from '@/hooks/useAuth';
import { ActivityRow, useActivities } from '@/hooks/useActivities';
import { ACTIVITY_KINDS, INTENSITY, kindInfo, tallyType, type ActivityKind } from '@/lib/activityKinds';
import { successHaptic } from '@/lib/native';
import { showUndo } from '@/lib/undoToast';
import { cn } from '@/lib/utils';
import { BuiltExercise, WorkoutBuilder } from './WorkoutBuilder';

type When = 'now' | 'earlier' | 'date' | 'planned';
const MINUTES = [15, 30, 45, 60, 90];

const chip = (on: boolean) =>
  cn(
    'min-h-[44px] rounded-pill border px-4 text-label font-semibold transition-colors',
    on ? 'border-primary bg-primary-tint text-primary-soft' : 'border-border text-muted-foreground',
  );

/**
 * "הוסף פעילות": what you did (a grid of activity types), then the details —
 * when, how long, how hard, distance where it applies, a note; strength can be
 * just logged or built exercise by exercise and run in the player. Also edits
 * an existing activity.
 */
export function ActivitySheet({
  open, onOpenChange, defaultDate, initialKind, existing, replaceable, onRunWorkout,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Prefill the day (from the calendar). */
  defaultDate?: Date;
  /** Skip the grid (e.g. "התחל הליכה"). */
  initialKind?: ActivityKind;
  existing?: ActivityRow | null;
  /** Today's planned workout / walk that isn't done yet — offers "this replaces it". */
  replaceable?: { workout?: boolean; walk?: boolean };
  onRunWorkout: (name: string, items: BuiltExercise[], kind: ActivityKind, myWorkoutId: string | null) => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { save, plan, remove } = useActivities(user?.id);
  const [step, setStep] = useState<'kind' | 'details' | 'build'>('kind');
  const [kind, setKind] = useState<ActivityKind>('walk');
  const [customName, setCustomName] = useState('');
  const [when, setWhen] = useState<When>('now');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [minutes, setMinutes] = useState<number | null>(30);
  const [freeMinutes, setFreeMinutes] = useState('');
  const [intensity, setIntensity] = useState<'easy' | 'medium' | 'hard' | null>(null);
  const [distance, setDistance] = useState('');
  const [note, setNote] = useState('');
  const [replaces, setReplaces] = useState<'workout' | 'walk' | null>(null);
  const [strengthMode, setStrengthMode] = useState<'log' | 'build'>('log');
  const [busy, setBusy] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    if (!open) return;
    const base = existing ? new Date(existing.started_at) : defaultDate ?? new Date();
    const baseDay = format(base, 'yyyy-MM-dd');
    setKind(existing?.kind ?? initialKind ?? 'walk');
    setStep(existing || initialKind ? 'details' : 'kind');
    setCustomName(existing?.custom_name ?? '');
    setWhen(existing ? (baseDay === today ? 'earlier' : 'date') : baseDay > today ? 'planned' : baseDay < today ? 'date' : 'now');
    setDate(baseDay);
    setTime(format(existing ? base : new Date(), 'HH:mm'));
    const m = existing?.duration_min ?? 30;
    setMinutes(MINUTES.includes(m) ? m : null);
    setFreeMinutes(MINUTES.includes(m) ? '' : String(m));
    setIntensity(existing?.intensity ?? null);
    const info = kindInfo(existing?.kind ?? initialKind ?? 'walk');
    setDistance(existing?.distance_m != null ? String(info.distance === 'm' ? existing.distance_m : existing.distance_m / 1000) : '');
    setNote(existing?.note ?? '');
    setReplaces(existing?.replaces ?? null);
    setStrengthMode('log');
  }, [open, existing, defaultDate, initialKind, today]);

  const info = kindInfo(kind);
  const duration = freeMinutes ? Number(freeMinutes) || null : minutes;
  const startedAt = (): Date => {
    if (when === 'now') return new Date();
    const day = when === 'earlier' ? today : date;
    return new Date(`${day}T${time || '12:00'}`);
  };
  const minDate = format(addDays(new Date(), -7), 'yyyy-MM-dd');
  const dateOk = when !== 'date' || (date >= minDate && date <= today);
  const plannedOk = when !== 'planned' || date > today;
  const valid = (kind !== 'other' || customName.trim().length > 1) && dateOk && plannedOk;
  const title = kind === 'other' ? customName.trim() : info.label;
  const offerReplace = !existing && (when === 'now' || when === 'earlier') && replaceable;

  const submit = async () => {
    if (!valid || !user) return;
    setBusy(true);
    if (when === 'planned') {
      const ok = await plan(kind, title, startedAt(), duration);
      setBusy(false);
      if (!ok) return toast.error('לא נשמר, נסו שוב');
      toast('נכנס ליומן');
      return onOpenChange(false);
    }
    const km = Number(distance.replace(',', '.'));
    const id = await save(
      {
        kind,
        custom_name: kind === 'other' ? customName.trim() : null,
        started_at: startedAt().toISOString(),
        duration_min: duration,
        distance_m: info.distance && km > 0 ? Math.round(info.distance === 'm' ? km : km * 1000) : null,
        intensity,
        note: note.trim() || null,
        source: existing?.source ?? 'manual',
        replaces,
      },
      existing,
    );
    setBusy(false);
    if (!id) return toast.error('לא נשמר, נסו שוב');
    successHaptic();
    onOpenChange(false);
    if (!existing) {
      const day = format(startedAt(), 'yyyy-MM-dd');
      showUndo(`${title} נרשם`, () => remove({ id, kind, day, replaces } as ActivityRow));
    }
  };

  const Header = ({ back }: { back?: () => void }) =>
    back ? (
      <button type="button" onClick={back} className="-mr-2 mb-2 inline-flex h-11 items-center gap-1 text-label font-semibold text-muted-foreground">
        <ChevronRight className="h-4 w-4" strokeWidth={2} />
        חזרה
      </button>
    ) : null;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={step === 'kind' ? 'מה עשית?' : step === 'build' ? 'בנה אימון' : existing ? `עריכת ${title || 'פעילות'}` : title || 'פעילות'}
    >
      {step === 'kind' && (
        <button
          type="button"
          onClick={() => {
            onOpenChange(false);
            navigate('/app/walk');
          }}
          className="mb-3 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-inner bg-primary text-body font-bold text-primary-foreground"
        >
          <MapPin className="h-5 w-5" strokeWidth={2} />
          התחל הליכה עם מפה
        </button>
      )}
      {step === 'kind' && (
        <div className="grid grid-cols-3 gap-2 pb-2">
          {ACTIVITY_KINDS.map(({ kind: k, label, Icon }) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setStep('details');
              }}
              className="flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-inner border border-border bg-card-inner px-1 text-center"
            >
              <Icon className="h-6 w-6 text-primary" strokeWidth={1.75} aria-hidden />
              <span className="text-[12px] font-semibold leading-tight">{label}</span>
            </button>
          ))}
        </div>
      )}

      {step === 'build' && user && (
        <>
          <Header back={() => setStep('details')} />
          <WorkoutBuilder
            userId={user.id}
            onRun={(name, items, myId) => {
              onOpenChange(false);
              onRunWorkout(name, items, kind, myId);
            }}
          />
        </>
      )}

      {step === 'details' && (
        <div className="space-y-4 pb-2">
          {!existing && !initialKind && <Header back={() => setStep('kind')} />}

          {kind === 'other' && (
            <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="מה עשית? (למשל: סקי)" className="h-12" autoFocus />
          )}

          {info.strength && !existing && (
            <div role="radiogroup" aria-label="איך לתעד" className="grid grid-cols-2 gap-2">
              <button type="button" role="radio" aria-checked={strengthMode === 'log'} onClick={() => setStrengthMode('log')} className={chip(strengthMode === 'log')}>
                רק לתעד
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={strengthMode === 'build'}
                onClick={() => {
                  setStrengthMode('build');
                  setStep('build');
                }}
                className={chip(strengthMode === 'build')}
              >
                בנה אימון
              </button>
            </div>
          )}

          {/* When */}
          <fieldset className="space-y-2">
            <legend className="text-label font-semibold">מתי</legend>
            <div className="flex flex-wrap gap-2">
              {([
                { v: 'now', label: 'עכשיו' },
                { v: 'earlier', label: 'מוקדם יותר היום' },
                { v: 'date', label: 'תאריך אחר' },
                { v: 'planned', label: 'מתוכנן' },
              ] as const).map((o) => (
                <button key={o.v} type="button" onClick={() => setWhen(o.v)} className={chip(when === o.v)}>
                  {o.label}
                </button>
              ))}
            </div>
            {when !== 'now' && (
              <div className="grid grid-cols-2 gap-2">
                {(when === 'date' || when === 'planned') && (
                  <Input
                    type="date"
                    value={date}
                    min={when === 'date' ? minDate : format(addDays(new Date(), 1), 'yyyy-MM-dd')}
                    max={when === 'date' ? today : undefined}
                    onChange={(e) => setDate(e.target.value)}
                    className="h-12"
                    aria-label="תאריך"
                  />
                )}
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-12" aria-label="שעה" />
              </div>
            )}
            {when === 'date' && !dateOk && <p className="text-label text-muted-foreground">אפשר לרשום עד 7 ימים אחורה</p>}
            {when === 'planned' && <p className="text-label text-muted-foreground">פעילות מתוכננת נכנסת ליומן</p>}
          </fieldset>

          {/* Duration */}
          <fieldset className="space-y-2">
            <legend className="text-label font-semibold">משך</legend>
            <div className="flex flex-wrap gap-2">
              {MINUTES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMinutes(m);
                    setFreeMinutes('');
                  }}
                  className={chip(!freeMinutes && minutes === m)}
                >
                  {m} דק'
                </button>
              ))}
              <Input
                inputMode="numeric"
                value={freeMinutes}
                onChange={(e) => setFreeMinutes(e.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder="אחר"
                aria-label="משך בדקות"
                className="h-11 w-20 text-center"
              />
            </div>
          </fieldset>

          {when !== 'planned' && (
            <fieldset className="space-y-2">
              <legend className="text-label font-semibold">עצימות</legend>
              <div className="grid grid-cols-3 gap-2">
                {INTENSITY.map((o) => (
                  <button key={o.value} type="button" onClick={() => setIntensity(intensity === o.value ? null : o.value)} className={chip(intensity === o.value)}>
                    {o.label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {info.distance && when !== 'planned' && (
            <label className="block space-y-2">
              <span className="text-label font-semibold">מרחק ({info.distance === 'm' ? 'מטרים' : 'ק"מ'}, לא חובה)</span>
              <Input
                inputMode="decimal"
                dir="ltr"
                value={distance}
                onChange={(e) => setDistance(e.target.value.replace(/[^\d.,]/g, ''))}
                placeholder={info.distance === 'm' ? '800' : '3.5'}
                className="h-12 text-left"
              />
            </label>
          )}

          <label className="block space-y-2">
            <span className="text-label font-semibold">הערה (לא חובה)</span>
            <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-12" />
          </label>

          {offerReplace && (replaceable!.workout || replaceable!.walk) && (
            <div className="space-y-2">
              {(['workout', 'walk'] as const)
                .filter((t) => replaceable![t])
                .sort((a) => (a === tallyType(kind) ? -1 : 1))
                .map((t) => (
                  <label key={t} className="flex min-h-[48px] items-center gap-3 rounded-inner bg-card-inner px-4">
                    <input
                      type="checkbox"
                      checked={replaces === t}
                      onChange={(e) => setReplaces(e.target.checked ? t : null)}
                      className="h-5 w-5 accent-[hsl(var(--primary))]"
                    />
                    <span className="text-body">זה מחליף את {t === 'workout' ? 'האימון' : 'ההליכה'} של היום</span>
                  </label>
                ))}
            </div>
          )}

          <PrimaryButton onClick={submit} disabled={!valid || busy}>
            {busy ? 'שומר...' : when === 'planned' ? 'הוסף ליומן' : 'שמור'}
          </PrimaryButton>
        </div>
      )}
    </BottomSheet>
  );
}
