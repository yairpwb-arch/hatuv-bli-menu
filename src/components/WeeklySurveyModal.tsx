import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { CheckCircle2, Lock, Calendar } from 'lucide-react';

function getNextFriday(): Date {
  const d = new Date();
  const day = d.getDay(); // 0=Sun … 5=Fri … 6=Sat
  const daysToAdd = day === 5 ? 7 : (5 - day + 7) % 7;
  const next = new Date(d);
  next.setDate(d.getDate() + daysToAdd);
  return next;
}

const HEBREW_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

function formatHebrew(d: Date): string {
  return `${d.getDate()} ב${HEBREW_MONTHS[d.getMonth()]}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  currentWeek: number;
  externalLink?: string;
}

interface CheckinQuestion {
  id: string;
  sort_order: number;
  question_text: string;
  question_type: 'text' | 'number' | 'scale' | 'yesno' | 'textarea';
  column_key: string;
}

function draftKey(userId: string, week: number) {
  return `survey_draft_${userId}_week_${week}`;
}

function saveDraft(userId: string, week: number, answers: Record<string, string | number | boolean | null>) {
  try {
    localStorage.setItem(draftKey(userId, week), JSON.stringify(answers));
  } catch {}
}

function loadDraft(userId: string, week: number): Record<string, string | number | boolean | null> | null {
  try {
    const raw = localStorage.getItem(draftKey(userId, week));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearDraft(userId: string, week: number) {
  try {
    localStorage.removeItem(draftKey(userId, week));
  } catch {}
}

export default function WeeklySurveyModal({ open, onClose, currentWeek }: Props) {
  const { user } = useAuth();

  const [questions, setQuestions] = useState<CheckinQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | number | boolean | null>>({});
  const [existingId, setExistingId] = useState<string | null>(null);
  const [showAlreadyDone, setShowAlreadyDone] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const isAnswered = (q: CheckinQuestion): boolean => {
    const val = answers[q.column_key];
    if (q.question_type === 'scale') return true; // always has default
    if (q.question_type === 'yesno') return val === true || val === false;
    return val !== null && val !== undefined && String(val).trim() !== '';
  };

  useEffect(() => {
    if (!open || !user) return;
    loadData();
  }, [open, user, currentWeek]);

  const loadData = async () => {
    setIsLoading(true);

    const { data: qs } = await (supabase as any)
      .from('checkin_questions')
      .select('id, sort_order, question_text, question_type, column_key')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    const qList = (qs || []) as CheckinQuestion[];
    setQuestions(qList);

    const defaults: Record<string, string | number | boolean | null> = {};
    qList.forEach(q => {
      defaults[q.column_key] = q.question_type === 'scale' ? 5 : q.question_type === 'yesno' ? null : '';
    });

    const { data: existing } = await (supabase as any)
      .from('weekly_checkin')
      .select('*')
      .eq('user_id', user!.id)
      .eq('week_number', currentWeek)
      .maybeSingle();

    if (existing) {
      setExistingId(existing.id);
      setShowAlreadyDone(true);
      const filled: Record<string, string | number | boolean | null> = { ...defaults };
      qList.forEach(q => {
        const val = existing[q.column_key];
        if (val !== undefined && val !== null) {
          filled[q.column_key] = q.question_type === 'number' ? String(val) : val;
        }
      });
      setAnswers(filled);
    } else {
      setExistingId(null);
      setShowAlreadyDone(false);
      // Restore draft if user previously filled in answers without submitting
      const draft = user ? loadDraft(user.id, currentWeek) : null;
      setAnswers(draft ? { ...defaults, ...draft } : defaults);
    }

    setIsLoading(false);
  };

  const updateAnswer = (columnKey: string, value: string | number | boolean | null) => {
    setAnswers(prev => {
      const next = { ...prev, [columnKey]: value };
      if (user) saveDraft(user.id, currentWeek, next);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!user || questions.length === 0) return;
    setAttempted(true);
    const missing = questions.filter(q => !isAnswered(q));
    if (missing.length > 0) {
      toast({ title: 'שאלות חסרות', description: `יש למלא את כל ${missing.length} השאלות החסרות`, variant: 'destructive' });
      return;
    }
    setIsSaving(true);

    const payload: Record<string, unknown> = {
      user_id: user.id,
      week_number: currentWeek,
      submitted_at: new Date().toISOString(),
    };

    questions.forEach(q => {
      const val = answers[q.column_key];
      if (q.question_type === 'number') {
        payload[q.column_key] = val !== '' && val !== null ? parseFloat(String(val)) : null;
      } else {
        payload[q.column_key] = val !== '' ? val : null;
      }
    });

    let error;
    if (existingId) {
      const res = await (supabase as any).from('weekly_checkin').update(payload).eq('id', existingId);
      error = res.error;
    } else {
      const res = await (supabase as any).from('weekly_checkin').insert(payload);
      error = res.error;
    }

    if (error) {
      toast({ title: 'שגיאה', description: 'לא ניתן לשמור', variant: 'destructive' });
    } else {
      if (user) clearDraft(user.id, currentWeek);
      toast({ title: 'הצלחה!', description: 'השאלון נשמר ✓' });
      onClose();
    }
    setIsSaving(false);
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-sm" dir="rtl">
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Already submitted — locked until next Friday ──────────────────────────
  if (showAlreadyDone) {
    const nextFri = getNextFriday();
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>שאלון שבועי — שבוע {currentWeek}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-5 py-5">
            <div className="relative">
              <CheckCircle2 className="h-16 w-16 text-green-500" />
              <div className="absolute -bottom-1 -left-1 bg-background rounded-full p-0.5">
                <Lock className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
            <div className="text-center space-y-1">
              <p className="font-semibold text-lg">ענית על השאלון השבועי ✓</p>
              <p className="text-muted-foreground text-sm">השאלון נעול עד לשישי הקרוב</p>
            </div>
            <div className="flex items-center gap-2 bg-muted rounded-xl px-4 py-3 w-full justify-center">
              <Calendar className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm font-medium">
                יפתח ביום שישי, <span className="text-primary">{formatHebrew(nextFri)}</span>
              </p>
            </div>
          </div>
          <Button className="w-full" onClick={onClose}>סגור</Button>
        </DialogContent>
      </Dialog>
    );
  }

  if (questions.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>שאלון שבועי</DialogTitle></DialogHeader>
          <p className="text-center text-muted-foreground py-8">אין שאלות זמינות כרגע</p>
          <Button onClick={onClose} className="w-full">סגור</Button>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Main: all questions on one scrollable page ─────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-sm flex flex-col p-0 gap-0"
        dir="rtl"
        style={{ maxHeight: '90vh' }}
      >
        {/* Fixed header */}
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0 border-b border-border">
          <DialogTitle>שאלון שבועי — שבוע {currentWeek}</DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{questions.length} שאלות</p>
        </DialogHeader>

        {/* Scrollable questions */}
        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4 space-y-6">
          {questions.map((q, idx) => {
            const val = answers[q.column_key];
            const invalid = attempted && !isAnswered(q);
            return (
              <div key={q.id} className="space-y-3">
                {/* Question label */}
                <p className={`font-semibold text-sm leading-snug ${invalid ? 'text-red-500' : ''}`}>
                  <span className="text-muted-foreground text-xs ml-1">{idx + 1}.</span>
                  {q.question_text}
                  <span className="text-red-500 mr-0.5">*</span>
                </p>

                {q.question_type === 'text' && (
                  <Input
                    value={String(val ?? '')}
                    onChange={e => updateAnswer(q.column_key, e.target.value)}
                    placeholder="הקלד כאן..."
                    className={invalid ? 'border-red-500 focus-visible:ring-red-500' : ''}
                  />
                )}

                {q.question_type === 'number' && (
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={String(val ?? '')}
                    onChange={e => updateAnswer(q.column_key, e.target.value)}
                    placeholder="0"
                    className={invalid ? 'border-red-500 focus-visible:ring-red-500' : ''}
                  />
                )}

                {q.question_type === 'textarea' && (
                  <Textarea
                    value={String(val ?? '')}
                    onChange={e => updateAnswer(q.column_key, e.target.value)}
                    placeholder="כתוב כאן..."
                    rows={3}
                    className={invalid ? 'border-red-500 focus-visible:ring-red-500' : ''}
                  />
                )}

                {q.question_type === 'scale' && (
                  // dir="ltr" forces the slider to go left (1) → right (10),
                  // preventing RTL from reversing the track direction.
                  <div className="space-y-3" dir="ltr">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-3xl font-bold text-primary tabular-nums">
                        {Number(val ?? 5)}
                      </span>
                      <span className="text-muted-foreground text-sm">/ 10</span>
                    </div>
                    <Slider
                      value={[Number(val ?? 5)]}
                      min={1}
                      max={10}
                      step={1}
                      onValueChange={([v]) => updateAnswer(q.column_key, v)}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span dir="rtl">נמוך — 1</span>
                      <span dir="rtl">גבוה — 10</span>
                    </div>
                  </div>
                )}

                {q.question_type === 'yesno' && (
                  <div className={`flex gap-3 ${invalid ? 'rounded-lg ring-2 ring-red-500 p-1' : ''}`}>
                    <Button
                      variant={val === true ? 'default' : 'outline'}
                      className="flex-1 h-11 text-base"
                      onClick={() => updateAnswer(q.column_key, true)}
                    >
                      כן
                    </Button>
                    <Button
                      variant={val === false ? 'default' : 'outline'}
                      className="flex-1 h-11 text-base"
                      onClick={() => updateAnswer(q.column_key, false)}
                    >
                      לא
                    </Button>
                  </div>
                )}

                {invalid && (
                  <p className="text-red-500 text-xs">שדה חובה</p>
                )}
              </div>
            );
          })}

          {/* Bottom padding so last question isn't hidden behind submit bar */}
          <div className="h-2" />
        </div>

        {/* Fixed submit button */}
        <div className="shrink-0 px-5 pb-5 pt-3 border-t border-border bg-background">
          <Button
            className="w-full h-12 text-base font-bold"
            onClick={handleSubmit}
            disabled={isSaving}
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                שולח...
              </span>
            ) : (
              'שלח שאלון'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
