import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { CheckCircle2 } from 'lucide-react';

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

export default function WeeklySurveyModal({ open, onClose, currentWeek }: Props) {
  const { user } = useAuth();

  const [questions, setQuestions] = useState<CheckinQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | number | boolean | null>>({});
  const [existingId, setExistingId] = useState<string | null>(null);
  const [showAlreadyDone, setShowAlreadyDone] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
      setAnswers(defaults);
    }

    setIsLoading(false);
  };

  const updateAnswer = (columnKey: string, value: string | number | boolean | null) => {
    setAnswers(prev => ({ ...prev, [columnKey]: value }));
  };

  const handleSubmit = async () => {
    if (!user || questions.length === 0) return;
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

  // ── Already submitted ──────────────────────────────────────────────────────
  if (showAlreadyDone) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>שאלון שבועי — שבוע {currentWeek}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <p className="text-center font-semibold text-lg">תשובותיך לשבוע {currentWeek} נשמרו ✓</p>
            <p className="text-center text-muted-foreground text-sm">תוכל לעדכן את תשובותיך בכל עת</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowAlreadyDone(false)}>
              עדכן תשובות
            </Button>
            <Button className="flex-1" onClick={onClose}>סגור</Button>
          </div>
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
            return (
              <div key={q.id} className="space-y-3">
                {/* Question label */}
                <p className="font-semibold text-sm leading-snug">
                  <span className="text-muted-foreground text-xs ml-1">{idx + 1}.</span>
                  {q.question_text}
                </p>

                {q.question_type === 'text' && (
                  <Input
                    value={String(val ?? '')}
                    onChange={e => updateAnswer(q.column_key, e.target.value)}
                    placeholder="הקלד כאן..."
                  />
                )}

                {q.question_type === 'number' && (
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={String(val ?? '')}
                    onChange={e => updateAnswer(q.column_key, e.target.value)}
                    placeholder="0"
                  />
                )}

                {q.question_type === 'textarea' && (
                  <Textarea
                    value={String(val ?? '')}
                    onChange={e => updateAnswer(q.column_key, e.target.value)}
                    placeholder="כתוב כאן..."
                    rows={3}
                  />
                )}

                {q.question_type === 'scale' && (
                  <div className="space-y-3">
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
                      <span>1 — נמוך</span>
                      <span>10 — גבוה</span>
                    </div>
                  </div>
                )}

                {q.question_type === 'yesno' && (
                  <div className="flex gap-3">
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
