import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { nextSaturday } from '@/lib/programStart';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { PrimaryButton } from '@/components/ds';
import { Input } from '@/components/ui/input';
import { successHaptic } from '@/lib/native';
import { Answers, activeQuestions, derivePlan, isAnswered, otherKey, picksOther } from '@/lib/onboarding';
import type { OnboardingRow } from '@/hooks/useOnboarding';
import { OnboardingFrame } from './OnboardingFrame';
import { NumberField, OptionList } from './inputs';
import { Angle, MeasureKey, MeasurementsStep, PhotosStep } from './BodySteps';

const NUMBER_DEFAULTS: Record<string, number> = { age: 30, height: 170, weight: 75 };

interface QuestionnaireProps {
  userId: string;
  initialName: string;
  row: OnboardingRow | null;
  save: (patch: Partial<OnboardingRow>) => Promise<boolean>;
  onDone: (row: OnboardingRow) => void;
}

export function Questionnaire({ userId, initialName, row, save, onDone }: QuestionnaireProps) {
  const [answers, setAnswers] = useState<Answers>(() => ({
    ...(initialName ? { name: initialName } : {}),
    ...(row?.answers ?? {}),
  }));
  const questions = useMemo(() => activeQuestions(answers), [answers]);
  const [index, setIndex] = useState(() => {
    // Resume where the trainee left off.
    const i = questions.findIndex((q) => q.id === row?.current_step);
    return i >= 0 ? i : 0;
  });
  const [isSaving, setIsSaving] = useState(false);

  const q = questions[Math.min(index, questions.length - 1)];
  const isLast = index >= questions.length - 1;
  const canContinue = q.optional || isAnswered(q, answers);
  const set = (value: unknown) => setAnswers((a) => ({ ...a, [q.id]: value }));

  // Number questions open on a typical value instead of an empty field.
  useEffect(() => {
    if (q.kind !== 'number' || answers[q.id] != null) return;
    const start = q.id === 'target_weight' ? answers.weight : NUMBER_DEFAULTS[q.id];
    if (start != null) setAnswers((a) => ({ ...a, [q.id]: start }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id]);

  const finish = async (final: Answers) => {
    const plan = derivePlan(final);
    const today = format(new Date(), 'yyyy-MM-dd');
    const m = (final.measurements ?? {}) as Partial<Record<MeasureKey, number>>;

    const age = Number(final.age);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const results = await Promise.all([
      db
        .from('profiles')
        .update({
          full_name: String(final.name).trim(),
          age: final.age,
          gender: final.gender,
          height: final.height,
          initial_weight: final.weight,
          current_weight: final.weight,
          target_weight: final.target_weight,
          birthdate: age > 0 ? `${new Date().getFullYear() - age}-01-01` : null,
          fitness_goal: Array.isArray(final.goal) ? final.goal.join(',') : final.goal,
          ...plan,
        })
        .eq('id', userId),
      // The program starts on the first Saturday from today — unless a start
      // date was already set (e.g. by an admin or at checkout).
      supabase.from('profiles').update({ start_date: nextSaturday() }).eq('id', userId).is('start_date', null),
      // First weigh-in = starting point on the progress screen (the trigger syncs current_weight too).
      supabase.from('weight_log').insert({ user_id: userId, weight: final.weight as number, recorded_at: today }),
      Object.values(m).some((v) => v != null)
        ? db.from('body_measurements').insert({
            user_id: userId,
            measured_at: today,
            arm_cm: m.arm ?? null,
            chest_cm: m.chest ?? null,
            waist_cm: m.waist ?? null,
            belly_cm: m.belly ?? null,
          })
        : Promise.resolve({ error: null }),
    ]);
    const failed = results.find((r) => r.error);
    if (failed) throw failed.error;

    const completed = new Date().toISOString();
    const ok = await save({ answers: final, current_step: null, questionnaire_completed_at: completed });
    if (!ok) throw new Error('saving onboarding state failed');
    successHaptic();
    onDone({ ...(row as OnboardingRow), user_id: userId, answers: final, questionnaire_completed_at: completed });
  };

  const next = async () => {
    if (!canContinue || isSaving) return;
    setIsSaving(true);
    try {
      if (isLast) {
        await finish(answers);
        return;
      }
      // Recompute after this answer — it can add or remove follow-up questions.
      const upcoming = activeQuestions(answers);
      const nextIndex = upcoming.findIndex((x) => x.id === q.id) + 1;
      // Saved after every screen so leaving mid-way resumes here.
      await save({ answers, current_step: upcoming[nextIndex]?.id ?? null });
      setIndex(nextIndex);
    } catch (err) {
      console.error('[onboarding] save failed', err);
      toast.error('לא הצלחנו לשמור, בדקו חיבור ונסו שוב');
    } finally {
      setIsSaving(false);
    }
  };

  const back = index > 0 ? () => setIndex((i) => i - 1) : undefined;

  return (
    <OnboardingFrame
      progress={(index + 1) / questions.length}
      onBack={back}
      footer={
        <>
          <PrimaryButton onClick={next} disabled={!canContinue || isSaving} className="h-14">
            {isSaving ? 'שומר...' : isLast ? 'סיום' : 'הבא'}
          </PrimaryButton>
          {q.optional && (
            <button
              type="button"
              onClick={next}
              disabled={isSaving}
              className="h-11 w-full text-label font-semibold text-muted-foreground"
            >
              דלג בינתיים
            </button>
          )}
        </>
      }
    >
      <div key={q.id} className="motion-safe:animate-page-enter">
        <h1 className="text-screen-title">{q.dynamicTitle?.(answers) ?? q.title}</h1>
        {q.subtitle && <p className="mt-2 text-body text-muted-foreground">{q.subtitle}</p>}

        <div className="mt-8">
          {q.kind === 'text' && (
            <Input
              autoFocus
              value={(answers[q.id] as string) ?? ''}
              onChange={(e) => set(e.target.value)}
              placeholder={q.placeholder}
              className="h-14 rounded-inner text-lg"
              enterKeyHint="next"
              onKeyDown={(e) => e.key === 'Enter' && next()}
            />
          )}
          {q.kind === 'number' && (
            <NumberField
              value={answers[q.id] as number | undefined}
              onChange={set}
              unit={q.unit}
              min={q.min}
              max={q.max}
              step={q.step}
              decimals={q.decimals}
              start={q.id === 'target_weight' ? (answers.weight as number | undefined) : undefined}
            />
          )}
          {(q.kind === 'single' || q.kind === 'multi') && (
            <OptionList
              options={q.options}
              multiple={q.kind === 'multi'}
              value={answers[q.id] as string | string[] | undefined}
              onChange={set}
            />
          )}
          {picksOther(q, answers) && (
            <Input
              autoFocus
              value={(answers[otherKey(q.id)] as string) ?? ''}
              onChange={(e) => setAnswers((a) => ({ ...a, [otherKey(q.id)]: e.target.value }))}
              placeholder={q.id === 'occupation' ? 'במה את/ה עוסק/ת?' : 'מה בדיוק?'}
              aria-label="פירוט"
              className="mt-3 h-14 rounded-inner text-lg"
              enterKeyHint="next"
              onKeyDown={(e) => e.key === 'Enter' && next()}
            />
          )}
          {q.kind === 'photos' && (
            <PhotosStep
              userId={userId}
              value={(answers.photos as Partial<Record<Angle, string>>) ?? {}}
              onChange={set}
            />
          )}
          {q.kind === 'measurements' && (
            <MeasurementsStep
              value={(answers.measurements as Partial<Record<MeasureKey, number>>) ?? {}}
              onChange={set}
            />
          )}
        </div>
      </div>
    </OnboardingFrame>
  );
}
