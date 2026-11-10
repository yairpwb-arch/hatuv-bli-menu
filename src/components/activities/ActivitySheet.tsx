import { useEffect, useState } from 'react';
import { addDays, format } from 'date-fns';
import { ChevronRight, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { BottomSheet, PrimaryButton, SheetActions } from '@/components/ds';
import { Button } from '@/components/ui/button';
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
  open, onOpenChange, defaultDate, initialKind, existing, replaceable, onRunWorkout, initialStep,
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
  /** 'build': open straight on "בנה אימון" (a planned workout's "התחל אימון"). */
  initialStep?: 'build';
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [strengthMode, setStrengthMode] = useState<'log' | 'build'>('log');
  // A planned activity on fixed weekdays (0 = Sunday), for some weeks or with no end.
  const [repeat, setRepeat] = useState(false);
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [repeatWeeks, setRepeatWeeks] = useState<number | null>(8);
  const [busy, setBusy] = useState(false);
  // A saved workout ("האימונים שלי") being planned on fixed days.
  const [built, setBuilt] = useState<{ id: string; name: string } | null>(null);

  const today = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    if (!open) return;
    const base = existing ? new Date(existing.started_at) : defaultDate ?? new Date();
    const baseDay = format(base, 'yyyy-MM-dd');
    setKind(existing?.kind ?? initialKind ?? (initialStep === 'build' ? 'strength_gym' : 'walk'));
    setStep(initialStep === 'build' && !existing ? 'build' : existing || initialKind ? 'details' : 'kind');
    setBuilt(null);
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
    setRepeat(false);
    setRepeatDays([]);
    setRepeatWeeks(8);
    setConfirmDelete(false);
  }, [open, existing, defaultDate, initialKind, initialStep, today]);

  const info = kindInfo(kind);
  const duration = freeMinutes ? Number(freeMinutes) || null : minutes;
  const startedAt = (): Date => {
    if (when === 'now') return new Date();
    const day = when === 'earlier' ? today : date;
    return new Date(`${day}T${time || '12:00'}`);
  };
  const minDate = format(addDays(new Date(), -7), 'yyyy-MM-dd');
  const dateOk = when !== 'date' || (date >= minDate && date <= today);
  // A one-off plan is from tomorrow; a recurring one may start today.
  const plannedOk = when !== 'planned' || (repeat ? date >= today && repeatDays.length > 0 : date > today);
  const valid = (kind !== 'other' || customName.trim().length > 1) && dateOk && plannedOk;
  const title = kind === 'other' ? customName.trim() : info.label;
  const offerReplace = !existing && (when === 'now' || when === 'earlier') && replaceable;

  const submit = async () => {
    if (!valid || !user) return;
    setBusy(true);
    if (when === 'planned') {
      const until = repeat && repeatWeeks ? format(addDays(new Date(`${date}T12:00`), repeatWeeks * 7 - 1), 'yyyy-MM-dd') : null;
      const ok = await plan(kind, built?.name ?? title, startedAt(), duration, repeat ? { days: repeatDays, until } : null, built?.id ?? null);
      setBusy(false);
      if (!ok) return toast.error('לא נשמר, נסו שוב');
      toast(repeat ? 'נכנס ליומן כפעילות קבועה' : 'נכנס ליומן');
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
            onPlan={(id, name) => {
              setBuilt({ id, name });
              setStrengthMode('build');
              setWhen('planned');
              setRepeat(true);
              setRepeatDays([new Date(`${date || today}T12:00`).getDay()]);
              setStep('details');
            }}
          />
        </>
      )}

      {step === 'details' && (
        <div className="space-y-4 pb-2">
          {!existing && !initialKind && <Header back={() => setStep('kind')} />}

          {built && (
            <div className="flex items-center justify-between gap-3 rounded-inner border border-success/40 bg-success/10 px-4 py-3">
              <p className="min-w-0 truncate text-body">
                האימון: <span className="font-bold">{built.name}</span>
              </p>
              <button type="button" onClick={() => setStep('build')} className="min-h-[44px] shrink-0 text-label font-semibold text-success">
                החלפה
              </button>
            </div>
          )}

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
              <div className="grid grid-cols-2 gap-2 [&>*]:min-w-0">
                {(when === 'date' || when === 'planned') && (
                  <Input
                    type="date"
                    value={date}
                    min={when === 'date' ? minDate : repeat ? today : format(addDays(new Date(), 1), 'yyyy-MM-dd')}
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

          {/* Once, or on fixed weekdays for some weeks */}
          {when === 'planned' && !existing && (
            <fieldset className="space-y-2">
              <legend className="text-label font-semibold">חוזר</legend>
              <div role="radiogroup" aria-label="חוזר" className="flex flex-wrap gap-2">
                {([
                  { v: false, label: 'פעם אחת' },
                  { v: true, label: 'קבוע' },
                ] as const).map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    role="radio"
                    aria-checked={repeat === o.v}
                    onClick={() => {
                      setRepeat(o.v);
                      // Start from the chosen day's weekday.
                      if (o.v && repeatDays.length === 0) setRepeatDays([new Date(`${date || today}T12:00`).getDay()]);
                    }}
                    className={chip(repeat === o.v)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {repeat && (
                <>
                  <p className="text-label text-muted-foreground">באילו ימים</p>
                  <div className="flex flex-wrap gap-2">
                    {['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'].map((d, i) => {
                      const on = repeatDays.includes(i);
                      return (
                        <button
                          key={d}
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          aria-label={['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'][i]}
                          onClick={() => setRepeatDays((list) => (on ? list.filter((x) => x !== i) : [...list, i]))}
                          className={cn(chip(on), 'h-11 w-11 min-w-0 px-0')}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-label text-muted-foreground">למשך</p>
                  <div className="flex flex-wrap gap-2">
                    {([4, 8, 12, null] as const).map((w) => (
                      <button key={w ?? 'open'} type="button" onClick={() => setRepeatWeeks(w)} className={chip(repeatWeeks === w)}>
                        {w ? `${w} שבועות` : 'בלי סוף'}
                      </button>
                    ))}
                  </div>
                  {repeatDays.length === 0 && <p className="text-label text-muted-foreground">בחרו לפחות יום אחד</p>}
                </>
              )}
            </fieldset>
          )}

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
          {existing && !confirmDelete && (
            <button type="button" onClick={() => setConfirmDelete(true)} className="min-h-[44px] w-full text-body font-semibold text-destructive">
              מחיקת הפעילות
            </button>
          )}
          {existing && confirmDelete && (
            <div className="space-y-2">
              <p className="text-center text-body">למחוק את {title || 'הפעילות'}?</p>
              <SheetActions>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const ok = await remove(existing);
                    setBusy(false);
                    if (!ok) return toast.error('לא נמחק, נסו שוב');
                    toast('נמחק');
                    onOpenChange(false);
                  }}
                >
                  מחיקה
                </Button>
                <Button onClick={() => setConfirmDelete(false)}>השארה</Button>
              </SheetActions>
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
