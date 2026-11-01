import { useState } from 'react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Moon, X } from 'lucide-react';
import { Card, PrimaryButton } from '@/components/ds';
import { Textarea } from '@/components/ui/textarea';
import type { Habit } from '@/hooks/useHabits';
import type { SummaryInput } from '@/hooks/useDailySummary';
import { SummaryAnswer, habitsCount, questionFor } from '@/lib/dailySummary';
import { isWeeklyCheckinDay } from '@/lib/sleepSchedule';
import { selectionHaptic, successHaptic } from '@/lib/native';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

function Choice<T extends string | number>({
  options, value, onChange, label,
}: {
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-2">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => {
            selectionHaptic();
            onChange(o.value);
          }}
          className={cn(
            'h-12 flex-1 rounded-button text-body font-semibold transition-colors',
            value === o.value ? 'bg-primary text-primary-foreground' : 'bg-card-inner text-muted-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const SCALE = [1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }));

/**
 * One scrolling screen, one tap per question. On Thursdays three weekly
 * check-in questions are added (energy, hunger, one proud sentence).
 */
export function DailySummary({
  day, habits, firstName, onSubmit, onClose,
}: {
  day: string;
  habits: Habit[];
  firstName: string;
  onSubmit: (input: SummaryInput) => Promise<number | null>;
  onClose: () => void;
}) {
  const questions = habits.map(questionFor);
  const weekly = isWeeklyCheckinDay(day);
  const [answers, setAnswers] = useState<Record<string, SummaryAnswer>>({});
  const [energy, setEnergy] = useState<number>();
  const [hunger, setHunger] = useState<number>();
  const [proudOf, setProudOf] = useState('');
  const [sending, setSending] = useState(false);
  const [doneCount, setDoneCount] = useState<number | null>(null);

  const complete = questions.every((q) => answers[q.habit.id]) && (!weekly || (energy && hunger));

  const send = async () => {
    setSending(true);
    const n = await onSubmit({ answers, energy: weekly ? energy : null, hunger: weekly ? hunger : null, proudOf: weekly ? proudOf : null });
    setSending(false);
    if (n === null) {
      toast({ title: 'לא הצלחנו לשמור, נסו שוב', variant: 'destructive' });
      return;
    }
    successHaptic();
    setDoneCount(n);
  };

  if (doneCount !== null) {
    return (
      <div className="fixed inset-0 z-[60] !mt-0 flex flex-col bg-background px-4 safe-top" dir="rtl" role="dialog" aria-label="לילה טוב">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-pill bg-primary-tint">
            <Moon className="h-10 w-10 text-primary" strokeWidth={2} />
          </span>
          <h2 className="text-screen-title">לילה טוב{firstName ? `, ${firstName}` : ''}</h2>
          <p className="text-body text-muted-foreground">
            {doneCount > 0 ? `ביצעת היום ${habitsCount(doneCount)}` : 'מחר יום חדש'}
          </p>
        </div>
        <div className="pt-3" style={{ paddingBottom: 'calc(1rem + var(--app-safe-bottom))' }}>
          <PrimaryButton onClick={onClose}>סגירה</PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] !mt-0 flex flex-col bg-background safe-top" dir="rtl" role="dialog" aria-label="סיכום היום">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-2">
        <button type="button" onClick={onClose} aria-label="סגירה" className="flex h-11 w-11 items-center justify-center rounded-pill text-muted-foreground">
          <X className="h-5 w-5" strokeWidth={2} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-card-title leading-tight">סיכום היום</h1>
          <p className="text-label text-muted-foreground">{format(new Date(`${day}T12:00:00`), 'EEEE, d בMMMM', { locale: he })}</p>
        </div>
      </header>

      <div className="flex-1 space-y-card-gap overflow-y-auto px-4 py-4">
        {questions.map((q) => (
          <Card key={q.habit.id} className="space-y-3">
            <p className="text-body font-semibold">{q.text}</p>
            <Choice label={q.text} options={q.options} value={answers[q.habit.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.habit.id]: v }))} />
          </Card>
        ))}

        {weekly && (
          <>
            <Card className="space-y-3">
              <p className="text-body font-semibold">אנרגיה ומוטיבציה השבוע</p>
              <Choice<number> label="אנרגיה ומוטיבציה" options={SCALE} value={energy} onChange={setEnergy} />
              <div className="flex justify-between text-label text-muted-foreground"><span>נמוכה</span><span>גבוהה</span></div>
            </Card>
            <Card className="space-y-3">
              <p className="text-body font-semibold">רעב השבוע</p>
              <Choice<number> label="רעב" options={SCALE} value={hunger} onChange={setHunger} />
              <div className="flex justify-between text-label text-muted-foreground"><span>כמעט לא</span><span>הרבה</span></div>
            </Card>
            <Card className="space-y-2">
              <label htmlFor="proud" className="text-body font-semibold">משפט אחד: במה אני גאה השבוע?</label>
              <Textarea id="proud" rows={2} maxLength={200} value={proudOf} onChange={(e) => setProudOf(e.target.value)} placeholder="לא חובה" />
            </Card>
          </>
        )}

        {questions.length === 0 && !weekly && (
          <p className="py-8 text-center text-body text-muted-foreground">אין היום שאלות. אפשר פשוט לשלוח.</p>
        )}
      </div>

      <div className="shrink-0 border-t border-border px-4 pt-3" style={{ paddingBottom: 'calc(0.75rem + var(--app-safe-bottom))' }}>
        <PrimaryButton onClick={send} disabled={!complete || sending}>{sending ? 'שולח...' : 'שליחה'}</PrimaryButton>
      </div>
    </div>
  );
}
