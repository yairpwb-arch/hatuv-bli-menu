import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useHabits } from '@/hooks/useHabits';
import { useWorkoutPlan } from '@/hooks/useWorkoutPlan';
import { BottomSheet, PrimaryButton, SecondaryButton } from '@/components/ds';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NumberField, OptionList } from '@/components/onboarding/inputs';
import { cn } from '@/lib/utils';
import { selectionHaptic, successHaptic } from '@/lib/native';
import {
  HABIT_SCALE, IMPROVE, PROGRESS_AMOUNT, SurveyItem, T, WORKOUT_FEEL, YES_NO,
  hasWorkoutQuestions, labelOf, say, weekOfDay,
} from '@/lib/weeklySurvey';

// weekly_checkin, program_content.unlocks and the plan tables aren't all in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface Props {
  open: boolean;
  onClose: () => void;
  currentWeek: number;
  externalLink?: string;
}

type Answers = Record<string, unknown>;

const draftKey = (userId: string, week: number) => `survey_v2_draft_${userId}_week_${week}`;
function loadDraft(userId: string, week: number): Answers | null {
  try {
    const raw = localStorage.getItem(draftKey(userId, week));
    return raw ? (JSON.parse(raw) as Answers) : null;
  } catch {
    return null;
  }
}
function saveDraft(userId: string, week: number, a: Answers) {
  try {
    localStorage.setItem(draftKey(userId, week), JSON.stringify(a));
  } catch {
    // Without storage the draft just isn't kept.
  }
}
function clearDraft(userId: string, week: number) {
  try {
    localStorage.removeItem(draftKey(userId, week));
  } catch {
    // Nothing to clear.
  }
}

export default function WeeklySurveyModal({ open, onClose, currentWeek }: Props) {
  const { user, profile, currentDay, planDays: programDays } = useAuth();
  const gender = (profile as { gender?: string | null } | null)?.gender ?? null;
  const today = format(new Date(), 'yyyy-MM-dd');
  const { habits, isLoading: habitsLoading } = useHabits(user?.id, currentDay, today, programDays);
  const { planDays, isLoading: planLoading } = useWorkoutPlan();

  const [answers, setAnswers] = useState<Answers>({});
  const [doneAlready, setDoneAlready] = useState(false);
  const [workoutsFromWeek, setWorkoutsFromWeek] = useState<number | null>(null);
  const [exerciseNames, setExerciseNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);

  // The habits asked about: this week's, the ones the trainee ticks (bonus ones left out).
  const surveyHabits = useMemo(() => habits.filter((h) => !h.is_bonus), [habits]);
  const askWorkouts = planDays.length > 0 && hasWorkoutQuestions(currentWeek, workoutsFromWeek);

  useEffect(() => {
    if (!open || !user || planLoading) return;
    let gone = false;
    (async () => {
      setIsLoading(true);
      setAttempted(false);
      const [existing, lastWeight, unlockRow, exRows] = await Promise.all([
        db.from('weekly_checkin').select('id').eq('user_id', user.id).eq('week_number', currentWeek).maybeSingle(),
        db.from('weight_log').select('weight').eq('user_id', user.id).order('recorded_at', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        db.from('program_content').select('unlock_day').eq('unlocks', 'workout_1').is('archived_at', null).maybeSingle(),
        planDays.length
          ? db.from('workout_plan_exercises').select('plan_day_id, sort_order, exercises(name)').in('plan_day_id', planDays.map((d) => d.id)).order('sort_order')
          : Promise.resolve({ data: [] }),
      ]);
      if (gone) return;
      setDoneAlready(!!existing.data);

      // Workouts open from the start → week 1; else the week of the video that opens them (weeks 5–6).
      const fromStart = planDays.some((d) => !d.unlocks_with);
      setWorkoutsFromWeek(planDays.length === 0 ? null : fromStart ? 1 : unlockRow.data?.unlock_day ? weekOfDay(unlockRow.data.unlock_day) : null);

      const names: string[] = [];
      for (const r of (exRows.data ?? []) as { exercises: { name: string } | null }[]) {
        const n = r.exercises?.name;
        if (n && !names.includes(n)) names.push(n);
      }
      setExerciseNames(names);

      const startWeight = (lastWeight.data?.weight as number | undefined) ?? profile?.current_weight ?? undefined;
      setAnswers({ weight: startWeight, ...(loadDraft(user.id, currentWeek) ?? {}) });
      setIsLoading(false);
    })();
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id, currentWeek, planLoading, planDays.length]);

  const set = (key: string, value: unknown) =>
    setAnswers((a) => {
      const next = { ...a, [key]: value };
      if (user) saveDraft(user.id, currentWeek, next);
      return next;
    });

  // ── What's missing (everything but the last, optional question) ──
  const progressedYes = answers.progressed === 'yes';
  const progressedList = (answers.progressed_exercises as string[] | undefined) ?? [];
  const improveList = (answers.improve as string[] | undefined) ?? [];
  const missing: string[] = [];
  const weight = answers.weight as number | undefined;
  if (weight == null || weight < 30 || weight > 300) missing.push('weight');
  for (const h of surveyHabits) if (answers[`habit:${h.id}`] == null) missing.push(`habit:${h.id}`);
  if (askWorkouts) {
    for (const d of planDays) if (!answers[`workout:${d.id}`]) missing.push(`workout:${d.id}`);
    if (!answers.progressed) missing.push('progressed');
    if (progressedYes) {
      if (progressedList.length === 0) missing.push('progressed_exercises');
      for (const n of progressedList) if (!answers[`progress:${n}`]) missing.push('progressed_exercises');
    }
    if (improveList.length === 0) missing.push('improve');
    if (improveList.includes('other') && String(answers.improve_other ?? '').trim().length < 2) missing.push('improve');
  }
  const bad = (key: string) => attempted && missing.includes(key);

  const submit = async () => {
    if (!user) return;
    setAttempted(true);
    if (missing.length > 0) {
      toast.error('יש שאלות שעוד לא ענית עליהן');
      return;
    }
    setIsSaving(true);

    // The answers as asked, readable as is (admin screen, coaching bot).
    const items: SurveyItem[] = [{ key: 'weight', question: T.weight, answer: weight! }];
    for (const h of surveyHabits) items.push({ key: `habit:${h.id}`, question: h.name, answer: answers[`habit:${h.id}`] as number });
    if (askWorkouts) {
      for (const d of planDays) {
        items.push({ key: `workout:${d.id}`, question: T.workoutFeel(d.name), answer: labelOf(WORKOUT_FEEL, answers[`workout:${d.id}`]) });
      }
      items.push({ key: 'progressed', question: say(T.progressed, gender), answer: labelOf(YES_NO, answers.progressed) });
      if (progressedYes) {
        items.push({
          key: 'progressed_exercises',
          question: say(T.progressedWhich, gender),
          answer: progressedList.map((n) => `${n}: ${labelOf(PROGRESS_AMOUNT, answers[`progress:${n}`])}`).join(' · '),
        });
      }
      items.push({
        key: 'improve',
        question: say(T.improve, gender),
        answer: improveList
          .map((v) => (v === 'other' ? `אחר: ${String(answers.improve_other ?? '').trim()}` : labelOf(IMPROVE, v)))
          .join(' · '),
      });
      const share = String(answers.share ?? '').trim();
      if (share) items.push({ key: 'share', question: say(T.share, gender), answer: share });
    }

    const payload = {
      user_id: user.id,
      week_number: currentWeek,
      submitted_at: new Date().toISOString(),
      weight_today: weight,
      answers: { version: 2, workouts: askWorkouts, items },
    };
    const { error } = await db.from('weekly_checkin').upsert(payload, { onConflict: 'user_id,week_number' });
    if (error) {
      setIsSaving(false);
      toast.error('לא נשמר, נסו שוב');
      return;
    }

    // Today's weight: one weigh-in per day (the trigger keeps profiles.current_weight in step).
    const { data: todays } = await db.from('weight_log').select('id').eq('user_id', user.id).eq('recorded_at', today).limit(1);
    const w = todays?.[0]
      ? await db.from('weight_log').update({ weight }).eq('id', todays[0].id)
      : await db.from('weight_log').insert({ user_id: user.id, weight, recorded_at: today });
    if (w.error) toast.error('השאלון נשמר, אבל המשקל לא עודכן');

    clearDraft(user.id, currentWeek);
    successHaptic();
    setIsSaving(false);
    toast.success('השאלון נשמר');
    onClose();
  };

  const loading = isLoading || habitsLoading || planLoading;

  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`שאלון שבועי · שבוע ${currentWeek}`}
      description={doneAlready ? undefined : '2–3 דקות, וזה עוזר לנו לכוון אותך'}
    >
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-pill border-4 border-primary border-t-transparent" />
        </div>
      ) : doneAlready ? (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <CheckCircle2 className="h-14 w-14 text-success" strokeWidth={1.75} aria-hidden />
          <p className="text-card-title">מילאת את השאלון של השבוע</p>
          <p className="text-body text-muted-foreground">השאלון הבא ייפתח ביום שישי הבא</p>
          <SecondaryButton className="w-full" onClick={onClose}>סגירה</SecondaryButton>
        </div>
      ) : (
        <div className="space-y-8 pb-2">
          {/* Weight */}
          <Question title={T.weight} hint={T.weightHint} invalid={bad('weight')}>
            <NumberField value={weight} onChange={(v) => set('weight', v)} unit='ק"ג' min={30} max={300} step={0.1} decimals compact />
          </Question>

          {/* Habits, 1–10 each */}
          {surveyHabits.length > 0 && (
            <section className="space-y-5">
              <div>
                <h3 className="text-card-title">{T.habitsTitle}</h3>
                <p className="text-label text-muted-foreground">{T.habitsHint}</p>
              </div>
              {surveyHabits.map((h) => (
                <Question key={h.id} title={h.name} invalid={bad(`habit:${h.id}`)} small>
                  <Scale value={answers[`habit:${h.id}`] as number | undefined} onChange={(v) => set(`habit:${h.id}`, v)} label={h.name} />
                </Question>
              ))}
            </section>
          )}

          {/* Workout progress, every second week */}
          {askWorkouts && (
            <section className="space-y-6">
              <h3 className="text-card-title">{T.workoutsTitle}</h3>
              {planDays.map((d) => (
                <Question key={d.id} title={T.workoutFeel(d.name)} invalid={bad(`workout:${d.id}`)}>
                  <OptionList options={WORKOUT_FEEL} value={answers[`workout:${d.id}`] as string | undefined} onChange={(v) => set(`workout:${d.id}`, v)} />
                </Question>
              ))}

              <Question title={say(T.progressed, gender)} invalid={bad('progressed')}>
                <OptionList options={YES_NO} value={answers.progressed as string | undefined} onChange={(v) => set('progressed', v)} />
              </Question>

              {progressedYes && (
                <Question title={say(T.progressedWhich, gender)} hint="בוחרים תרגיל, ואז בכמה" invalid={bad('progressed_exercises')}>
                  <div className="flex flex-wrap gap-2">
                    {exerciseNames.map((n) => {
                      const on = progressedList.includes(n);
                      return (
                        <button
                          key={n}
                          type="button"
                          aria-pressed={on}
                          onClick={() => {
                            selectionHaptic();
                            set('progressed_exercises', on ? progressedList.filter((x) => x !== n) : [...progressedList, n]);
                          }}
                          className={cn(
                            'min-h-[44px] rounded-pill border px-4 text-body font-semibold',
                            on ? 'border-primary bg-primary-tint' : 'border-border bg-card',
                          )}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                  {progressedList.map((n) => (
                    <div key={n} className="mt-4 space-y-2 rounded-inner bg-card-inner p-3">
                      <p className="text-body font-semibold">{n}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {PROGRESS_AMOUNT.map((o) => {
                          const on = answers[`progress:${n}`] === o.value;
                          return (
                            <button
                              key={o.value}
                              type="button"
                              aria-pressed={on}
                              onClick={() => {
                                selectionHaptic();
                                set(`progress:${n}`, o.value);
                              }}
                              className={cn(
                                'min-h-[44px] rounded-inner border px-2 text-label font-semibold',
                                on ? 'border-primary bg-primary-tint' : 'border-border bg-card',
                              )}
                            >
                              {o.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </Question>
              )}

              <Question title={say(T.improve, gender)} hint={T.improveHint} invalid={bad('improve')}>
                <OptionList options={IMPROVE} multiple value={improveList} onChange={(v) => set('improve', v)} />
                {improveList.includes('other') && (
                  <Input
                    value={String(answers.improve_other ?? '')}
                    onChange={(e) => set('improve_other', e.target.value)}
                    placeholder={T.improveOther}
                    aria-label={T.improveOther}
                    className="mt-3 h-12"
                  />
                )}
              </Question>

              <Question title={say(T.share, gender)} hint={T.shareHint}>
                <Textarea value={String(answers.share ?? '')} onChange={(e) => set('share', e.target.value)} rows={3} aria-label={say(T.share, gender)} />
              </Question>
            </section>
          )}

          <PrimaryButton className="w-full" onClick={submit} disabled={isSaving}>
            {isSaving ? 'שולח...' : 'שליחת השאלון'}
          </PrimaryButton>
        </div>
      )}
    </BottomSheet>
  );
}

function Question({ title, hint, invalid, small, children }: { title: string; hint?: string; invalid?: boolean; small?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div>
        <p className={cn(small ? 'text-body font-semibold' : 'text-body font-bold', invalid && 'text-destructive')}>{title}</p>
        {hint && <p className="text-label text-muted-foreground">{hint}</p>}
      </div>
      {children}
      {invalid && <p className="text-label text-destructive">צריך לענות על השאלה הזו</p>}
    </div>
  );
}

/** 1–10 as two rows of five buttons (no slider: one tap, and no default the trainee didn't pick). */
function Scale({ value, onChange, label }: { value: number | undefined; onChange: (v: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-5 gap-2" dir="ltr">
      {HABIT_SCALE.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          onClick={() => {
            selectionHaptic();
            onChange(n);
          }}
          className={cn(
            'min-h-[44px] rounded-inner border text-body font-bold tabular-nums',
            value === n ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card',
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
