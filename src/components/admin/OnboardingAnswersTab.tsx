import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { MEASURES } from '@/components/onboarding/BodySteps';
import { Answers, Question, activeQuestions, otherKey, picksOther } from '@/lib/onboarding';
import { cn } from '@/lib/utils';

interface OnboardingRow {
  answers: Answers;
  current_step: string | null;
  questionnaire_completed_at: string | null;
  intro_video_watched_at: string | null;
  permissions: Record<string, string> | null;
  permissions_completed_at: string | null;
}

const PERMISSION_LABEL: Record<string, string> = { steps: 'צעדים', notifications: 'התראות', background: 'רקע' };
const PERMISSION_VALUE: Record<string, string> = { granted: 'אושר', denied: 'נדחה', skipped: 'דילג', unavailable: 'לא זמין' };
const when = (iso: string | null) => (iso ? format(new Date(iso), 'd/M/yyyy HH:mm') : null);

/** One answer as text, the way the trainee picked it (with their own words for "other"). */
function answerText(q: Question, a: Answers): string | null {
  const v = a[q.id];
  const typed = picksOther(q, a) ? String(a[otherKey(q.id)] ?? '').trim() : '';
  const withTyped = (s: string) => (typed ? `${s}: ${typed}` : s);
  switch (q.kind) {
    case 'text':
      return typeof v === 'string' && v.trim() ? v.trim() : null;
    case 'number':
      return typeof v === 'number' ? `${v} ${q.unit}` : null;
    case 'single': {
      const o = q.options.find((x) => x.value === v);
      return o ? withTyped(o.label) : null;
    }
    case 'multi': {
      if (!Array.isArray(v) || !v.length) return null;
      return withTyped(v.map((x) => q.options.find((o) => o.value === x)?.label ?? String(x)).join(', '));
    }
    case 'photos': {
      const n = v && typeof v === 'object' ? Object.keys(v as object).length : 0;
      return n ? `${n} תמונות (בלשונית "נתונים")` : 'דילג';
    }
    case 'measurements': {
      const m = (v ?? {}) as Record<string, number>;
      const parts = MEASURES.filter((x) => m[x.key] != null).map((x) => `${x.label} ${m[x.key]}`);
      return parts.length ? `${parts.join(' · ')} ס"מ` : 'דילג';
    }
  }
}

/** Everything the trainee answered in the opening questionnaire, in its order. */
export function OnboardingAnswersTab({ userId }: { userId: string }) {
  const [row, setRow] = useState<OnboardingRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('onboarding_responses')
      .select('answers, current_step, questionnaire_completed_at, intro_video_watched_at, permissions, permissions_completed_at')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }: { data: OnboardingRow | null }) => {
        setRow(data);
        setLoading(false);
      });
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }
  if (!row) return <p className="py-8 text-center text-sm text-muted-foreground">המתאמן עוד לא התחיל את שאלון הפתיחה</p>;

  const answers = row.answers ?? {};
  const questions = activeQuestions(answers);
  const perms = Object.entries(row.permissions ?? {});

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        {[
          ['שאלון', when(row.questionnaire_completed_at) ?? (row.current_step ? `באמצע (${questions.find((q) => q.id === row.current_step)?.title ?? row.current_step})` : 'לא הושלם')],
          ['סרטון פתיחה', when(row.intro_video_watched_at) ?? 'לא נצפה'],
          ['הרשאות', perms.length ? perms.map(([k, v]) => `${PERMISSION_LABEL[k] ?? k}: ${PERMISSION_VALUE[v] ?? v}`).join(' · ') : 'עוד לא'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className="font-medium">{v}</p>
          </div>
        ))}
      </div>

      <div className="divide-y divide-border rounded-lg border border-border">
        {questions.map((q) => {
          const text = answerText(q, answers);
          const title = q.dynamicTitle?.(answers) ?? q.title;
          return (
            <div key={q.id} className="flex flex-col gap-0.5 px-3 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              <p className="text-xs text-muted-foreground sm:text-sm">{title}</p>
              <p className={cn('text-sm font-medium sm:text-left', !text && 'text-muted-foreground')}>{text ?? 'לא נענתה'}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
