import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Bot, Check, Loader2, RefreshCw, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Pill } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

// bot_workout_plans isn't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface DraftExercise { exercise_id: string; name: string; sets: number; reps_min: number; reps_max: number; rest_seconds: number; is_duration: boolean; notes: string | null }
export interface DraftDay { stage: '1' | '2' | 'now'; name: string; replaces?: string | null; replaces_name?: string | null; exercises: DraftExercise[] }
export interface PlanDraft {
  id: string;
  user_id: string;
  kind: 'initial' | 'request';
  status: 'building' | 'pending' | 'approved' | 'rejected' | 'failed';
  request: string | null;
  note: string | null;
  chat_id: string | null;
  plan: { days: DraftDay[] } | null;
  rationale: string | null;
  template: string | null;
  error: string | null;
  created_at: string;
  decided_at: string | null;
  decided_by?: string | null;
}

const STAGE: Record<DraftDay['stage'], string> = { '1': 'נפתח עם סרטון האימונים הראשון (שבוע 5–6)', '2': 'נפתח עם סרטון האימונים השני (שבוע 9–10)', now: 'נפתח מיד' };
const EXTRA_LABEL: Record<string, string> = { extra_pullups: 'אימון מתח נוסף (ההצעה בשבועות 9–10)', extra_abs: 'אימון בטן נוסף (ההצעה בשבועות 9–10)' };
const reps = (e: DraftExercise) => `${e.reps_min === e.reps_max ? e.reps_min : `${e.reps_min}–${e.reps_max}`} ${e.is_duration ? 'שנ׳' : 'חזרות'}`;

/** Calls the bot's background function (an admin's session). */
export async function botJob(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('bot-jobs', { body });
  if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'failed');
  return data;
}

/**
 * A plan the workout bot built: the days, each exercise, why, and the coach's
 * choice: write it into the app, build it again with a note, or drop it.
 */
export function PlanDraftCard({ draft, name, onChanged }: { draft: PlanDraft; name?: string; onChanged: () => void }) {
  const [busy, setBusy] = useState<null | 'approve' | 'rebuild' | 'reject'>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');

  // While the bot is building, check back every few seconds.
  useEffect(() => {
    if (draft.status !== 'building') return;
    const t = window.setInterval(onChanged, 6000);
    return () => window.clearInterval(t);
  }, [draft.status, onChanged]);

  const approve = async () => {
    setBusy('approve');
    try {
      await botJob({ job: 'approve_plan', draft_id: draft.id });
      toast({ title: 'התוכנית נכנסה לאפליקציה', description: draft.kind === 'initial' ? 'הימים ייפתחו למתאמן עם הסרטונים' : 'הימים החדשים כבר פתוחים למתאמן' });
    } catch (e) {
      toast({ title: 'לא אושר', description: e instanceof Error ? e.message : '', variant: 'destructive' });
    }
    setBusy(null);
    onChanged();
  };

  const rebuild = async () => {
    setBusy('rebuild');
    setNoteOpen(false);
    try {
      await botJob({ job: 'build_plan', user_id: draft.user_id, kind: draft.kind, request: draft.request, note: note.trim() || null });
      setNote('');
    } catch (e) {
      toast({ title: 'הבנייה נכשלה', description: e instanceof Error ? e.message : '', variant: 'destructive' });
    }
    setBusy(null);
    onChanged();
  };

  const reject = async () => {
    setBusy('reject');
    await db.from('bot_workout_plans').update({ status: 'rejected', decided_at: new Date().toISOString() }).eq('id', draft.id).eq('status', 'pending');
    setBusy(null);
    onChanged();
  };

  const days = draft.plan?.days ?? [];
  const decided = draft.status === 'approved' || draft.status === 'rejected';

  return (
    <div className={cn('space-y-3 rounded-card border p-4', draft.status === 'pending' ? 'border-primary/50 bg-primary-tint/40' : 'border-border bg-card')}>
      <div className="flex flex-wrap items-center gap-2">
        <Bot className="h-5 w-5 text-primary" />
        <p className="text-body font-bold">
          {draft.kind === 'initial' ? 'תוכנית ראשונה' : 'בקשה'}{name ? ` · ${name}` : ''}
        </p>
        <Pill
          tone={draft.status === 'pending' ? 'brand' : draft.status === 'approved' ? 'success' : draft.status === 'failed' ? 'danger' : 'neutral'}
          className="px-2 py-0.5 text-[11px]"
        >
          {{ building: 'הבוט בונה…', pending: 'מחכה לאישור', approved: 'אושרה', rejected: 'נדחתה', failed: 'נכשלה' }[draft.status]}
        </Pill>
        <span className="mr-auto text-label text-muted-foreground">{format(new Date(draft.created_at), 'd/M HH:mm')}</span>
      </div>

      {draft.request && (
        <p className="rounded-inner bg-card-inner px-3 py-2 text-label">
          {EXTRA_LABEL[draft.request] ? `ביקש מהאפליקציה: ${EXTRA_LABEL[draft.request]}` : `ביקש: "${draft.request}"`}
        </p>
      )}
      {draft.note && <p className="text-label text-muted-foreground">הערה לבנייה: {draft.note}</p>}

      {draft.status === 'building' && (
        <p className="flex items-center gap-2 text-body text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />בונה את התוכנית, בדרך כלל פחות מדקה</p>
      )}
      {draft.status === 'failed' && (
        <p className="flex items-start gap-2 text-body text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{draft.error ?? 'הבנייה נכשלה'}</p>
      )}

      {days.length > 0 && (
        <>
          {(draft.rationale || draft.template) && (
            <div className="rounded-inner bg-card px-3 py-2 text-label">
              {draft.template && <p className="font-semibold">מתבנית: {draft.template}</p>}
              {draft.rationale && <p className="whitespace-pre-line text-muted-foreground">{draft.rationale}</p>}
            </div>
          )}
          <div className="space-y-2">
            {days.map((d, i) => (
              <div key={i} className="overflow-hidden rounded-inner border border-border bg-card">
                <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card-inner px-3 py-2">
                  <p className="text-body font-semibold">{d.name}</p>
                  <span className="text-label text-muted-foreground">{d.replaces_name ? `מחליף את "${d.replaces_name}"` : STAGE[d.stage]}</span>
                </div>
                <ol className="divide-y divide-border">
                  {d.exercises.map((e, j) => (
                    <li key={j} className="flex flex-wrap items-baseline gap-x-3 px-3 py-1.5 text-label">
                      <span className="w-4 shrink-0 font-bold tabular-nums text-muted-foreground">{j + 1}</span>
                      <span className="min-w-0 flex-1 font-semibold">{e.name}</span>
                      <span className="tabular-nums">{e.sets} × {reps(e)}</span>
                      <span className="text-muted-foreground">מנוחה {e.rest_seconds} שנ׳</span>
                      {e.notes && <span className="basis-full pr-7 text-muted-foreground">{e.notes}</span>}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </>
      )}

      {!decided && draft.status !== 'building' && (
        <div className="space-y-2">
          {noteOpen && (
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              autoFocus
              placeholder="מה לשנות? למשל: בלי לחיצת כתפיים בגלל הכתף, יותר עבודה על רגליים, אימונים של 30 דקות"
            />
          )}
          <div className="flex flex-wrap gap-2">
            {draft.status === 'pending' && (
              <Button onClick={approve} disabled={!!busy} className="gap-1.5">
                {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}אישור והכנסה לאפליקציה
              </Button>
            )}
            <Button variant="outline" onClick={() => (noteOpen ? rebuild() : setNoteOpen(true))} disabled={!!busy} className="gap-1.5">
              {busy === 'rebuild' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {noteOpen ? 'לבנות מחדש' : draft.status === 'failed' ? 'לנסות שוב' : 'לבנות מחדש עם הערה'}
            </Button>
            {draft.status === 'pending' && (
              <Button variant="ghost" onClick={reject} disabled={!!busy} className="gap-1.5 text-destructive hover:text-destructive">
                {busy === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}דחייה
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
