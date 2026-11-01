import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BottomSheet, PrimaryButton, SheetActions } from '@/components/ds';
import { useWorkoutPlan } from '@/hooks/useWorkoutPlan';
import { cn } from '@/lib/utils';
import type { CalEvent, EventInput, EventType, SeriesScope } from '@/hooks/useCalendar';

/** The calendar actions the editor needs (from useCalendar). */
export interface EventActions {
  saveEvent: (existing: CalEvent | null, input: EventInput, scope?: SeriesScope) => Promise<boolean>;
  deleteEvent: (event: CalEvent, scope?: SeriesScope) => Promise<boolean>;
  addPlanRepeat: (kind: 'walk' | 'workout', weekdays: number[], time: string, minutes: number, planDayId?: string) => Promise<boolean>;
}

interface EventEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing an existing custom event (or one day of a repeating one); otherwise a new one. */
  event?: CalEvent | null;
  /** Prefill date for a new event. */
  defaultDate?: Date;
  actions: EventActions;
}

// Sleep isn't here: it comes from the sleep hours in Settings.
const TYPES: { value: EventType; label: string; title: string }[] = [
  { value: 'walk', label: 'הליכה', title: 'הליכה' },
  { value: 'workout', label: 'אימון', title: 'אימון' },
  { value: 'meal', label: 'ארוחה', title: 'ארוחה' },
  { value: 'other', label: 'אחר', title: '' },
];
const DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
type RepeatMode = 'none' | 'daily' | 'weekly';

const chip = (on: boolean) =>
  cn(
    'min-h-[44px] rounded-pill border px-4 text-label font-semibold transition-colors',
    on ? 'border-primary bg-primary-tint text-primary-soft' : 'border-border text-muted-foreground',
  );

export function EventEditor({ open, onOpenChange, event, defaultDate, actions }: EventEditorProps) {
  const { planDays } = useWorkoutPlan();
  const [type, setType] = useState<EventType>('walk');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState('30');
  const [repeat, setRepeat] = useState<RepeatMode>('none');
  const [days, setDays] = useState<number[]>([]);
  const [until, setUntil] = useState('');
  const [planDayId, setPlanDayId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  // A repeating event asks "only this / this and following" before saving or deleting.
  const [ask, setAsk] = useState<'save' | 'delete' | null>(null);

  useEffect(() => {
    if (!open) return;
    const base = event?.start ?? defaultDate ?? new Date();
    const t = event?.type && TYPES.some((x) => x.value === event.type) ? event.type : 'walk';
    setType(t);
    setTitle(event?.title ?? TYPES.find((x) => x.value === t)!.title);
    setDate(format(base, 'yyyy-MM-dd'));
    setTime(event ? format(event.start, 'HH:mm') : format(new Date(Math.ceil(Date.now() / 1_800_000) * 1_800_000), 'HH:mm'));
    setDuration(event?.end ? String(Math.round((event.end.getTime() - event.start.getTime()) / 60_000)) : '30');
    setRepeat(event?.repeat ? event.repeat.rule : 'none');
    setDays(event?.repeat?.days.length ? event.repeat.days : [base.getDay()]);
    setUntil(event?.repeat?.until ?? '');
    setPlanDayId('');
    setAsk(null);
  }, [open, event, defaultDate]);

  // The picked date's weekday stays selected when the date changes.
  useEffect(() => {
    if (!date || event) return;
    const wd = new Date(`${date}T12:00:00`).getDay();
    setDays((d) => (d.includes(wd) ? d : [...d, wd]));
  }, [date, event]);

  const pickType = (t: EventType) => {
    // Swap the title only while it's still the previous type's default.
    const prevDefault = TYPES.find((x) => x.value === type)?.title;
    if (!title || title === prevDefault) setTitle(TYPES.find((x) => x.value === t)!.title);
    setType(t);
  };

  const repeating = repeat !== 'none';
  // A repeating walk / workout goes into the training plan (no end date there).
  const planRepeat = repeating && !event && (type === 'walk' || type === 'workout');
  const weekdays = repeat === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : days;
  const workoutDayProblem = planRepeat && type === 'workout' && (repeat === 'daily' || days.length !== 1);
  const valid =
    title.trim().length > 0 && !!date && !!time && (!repeating || weekdays.length > 0) &&
    (!planRepeat || type !== 'workout' || (!!planDayId && !workoutDayProblem));

  const input = (): EventInput => {
    const start = new Date(`${date}T${time}`);
    const minutes = Number(duration) || 0;
    return {
      type,
      title: title.trim(),
      starts_at: start.toISOString(),
      ends_at: minutes > 0 ? new Date(start.getTime() + minutes * 60_000).toISOString() : null,
      repeat_rule: repeating ? repeat : null,
      repeat_days: repeat === 'weekly' ? days : null,
      repeat_until: repeating && until ? until : null,
    };
  };

  const doSave = async (scope?: SeriesScope) => {
    if (!valid) return;
    setIsSaving(true);
    const ok = planRepeat
      ? await actions.addPlanRepeat(type as 'walk' | 'workout', weekdays, time, Number(duration) || 0, planDayId || undefined)
      : await actions.saveEvent(event ?? null, input(), scope);
    setIsSaving(false);
    if (ok) {
      if (planRepeat) toast(type === 'walk' ? 'ימי ההליכה עודכנו גם בדף האימונים' : 'האימון שובץ גם בדף האימונים');
      onOpenChange(false);
    } else toast.error('לא נשמר, נסו שוב');
  };

  const doDelete = async (scope?: SeriesScope) => {
    if (!event) return;
    if (await actions.deleteEvent(event, scope)) onOpenChange(false);
    else toast.error('לא נמחק, נסו שוב');
  };

  const isSeries = !!event?.seriesId;

  return (
    <>
      <BottomSheet open={open && !ask} onOpenChange={onOpenChange} title={event ? 'עריכת אירוע' : 'אירוע חדש'}>
        <div className="space-y-4 pb-2">
          <div role="radiogroup" aria-label="סוג" className="flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <button key={t.value} type="button" role="radio" aria-checked={type === t.value} onClick={() => pickType(t.value)} className={chip(type === t.value)}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ev-title">כותרת</Label>
            <Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-12" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-3 space-y-1.5">
              <Label htmlFor="ev-date">{repeating ? 'החל מ-' : 'תאריך'}</Label>
              <Input id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="ev-time">שעה</Label>
              <Input id="ev-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-12" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-dur">דקות</Label>
              <Input id="ev-dur" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value.replace(/\D/g, ''))} className="h-12" />
            </div>
          </div>

          {/* Repeats */}
          <fieldset className="space-y-2">
            <legend className="text-label font-semibold">חוזר</legend>
            <div role="radiogroup" className="flex flex-wrap gap-2">
              {([
                { v: 'none', label: 'לא חוזר' },
                { v: 'daily', label: 'כל יום' },
                { v: 'weekly', label: 'ימים קבועים' },
              ] as const).map((o) => (
                <button key={o.v} type="button" role="radio" aria-checked={repeat === o.v} onClick={() => setRepeat(o.v)} className={chip(repeat === o.v)}>
                  {o.label}
                </button>
              ))}
            </div>
            {repeat === 'weekly' && (
              <div className="flex justify-between gap-1" role="group" aria-label="ימים">
                {DAY_LETTERS.map((l, wd) => {
                  const on = days.includes(wd);
                  return (
                    <button
                      key={wd}
                      type="button"
                      aria-pressed={on}
                      aria-label={`יום ${l}׳`}
                      onClick={() => setDays((d) => (on ? d.filter((x) => x !== wd) : [...d, wd]))}
                      className={cn(
                        'flex h-11 w-11 items-center justify-center rounded-full border text-label font-bold transition-colors',
                        on ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground',
                      )}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>

          {planRepeat && type === 'workout' && (
            <div className="space-y-1.5">
              <Label htmlFor="ev-plan">איזה אימון מהתוכנית</Label>
              <select
                id="ev-plan"
                value={planDayId}
                onChange={(e) => setPlanDayId(e.target.value)}
                className="h-12 w-full rounded-inner border border-input bg-background px-3 text-body"
              >
                <option value="">בחרו אימון</option>
                {(planDays ?? []).map((d: { id: string; name: string }) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              {workoutDayProblem && <p className="text-label text-muted-foreground">אימון מהתוכנית משובץ ליום אחד בשבוע. בחרו יום אחד.</p>}
            </div>
          )}

          {repeating && !planRepeat && (
            <div className="space-y-1.5">
              <Label htmlFor="ev-until">עד תאריך (לא חובה)</Label>
              <Input id="ev-until" type="date" value={until} min={date} onChange={(e) => setUntil(e.target.value)} className="h-12" />
            </div>
          )}
          {planRepeat && (
            <p className="text-label text-muted-foreground">
              {type === 'walk' ? 'ימי ההליכה יתעדכנו גם בדף האימונים.' : 'האימון ישובץ גם בתוכנית בדף האימונים.'}
            </p>
          )}
        </div>

        {event ? (
          <SheetActions>
            <Button disabled={!valid || isSaving} onClick={() => (isSeries ? setAsk('save') : doSave())}>
              {isSaving ? 'שומר...' : 'ערוך'}
            </Button>
            <Button variant="outline" className="text-destructive" onClick={() => (isSeries ? setAsk('delete') : doDelete())}>
              <Trash2 className="h-4 w-4" strokeWidth={2} />
              מחק
            </Button>
          </SheetActions>
        ) : (
          <PrimaryButton onClick={() => doSave()} disabled={!valid || isSaving}>
            {isSaving ? 'שומר...' : 'שמירה'}
          </PrimaryButton>
        )}
      </BottomSheet>

      {/* A repeating event: only this one, or this one and all after it? */}
      <BottomSheet open={!!ask} onOpenChange={(o) => !o && setAsk(null)} title={ask === 'delete' ? 'למחוק את האירוע?' : 'לשמור את השינוי?'}>
        <SheetActions>
          <Button onClick={() => (ask === 'delete' ? doDelete('one') : doSave('one'))}>רק האירוע הזה</Button>
          <Button variant="outline" onClick={() => (ask === 'delete' ? doDelete('following') : doSave('following'))}>
            האירוע הזה וכל הבאים
          </Button>
        </SheetActions>
        <button type="button" onClick={() => setAsk(null)} className="mt-1 min-h-[44px] w-full text-label font-semibold text-muted-foreground">
          ביטול
        </button>
      </BottomSheet>
    </>
  );
}
