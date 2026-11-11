import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PlanDraft, PlanDraftCard, botJob } from './PlanDraftCard';

// bot_workout_plans isn't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * A trainee's "אימון" tab: the plan the workout bot built (waiting, being
 * built, failed), or a button to have it build one (with what to build).
 */
export function TraineePlanBot({ userId, hasDays, onApplied }: { userId: string; hasDays: boolean; onApplied: () => void }) {
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [request, setRequest] = useState('');
  const [building, setBuilding] = useState(false);
  const lastStatus = useRef<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await db.from('bot_workout_plans').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    const d = (data ?? null) as PlanDraft | null;
    // Just approved: the plan above changed.
    if (d?.status === 'approved' && lastStatus.current === 'pending') onApplied();
    lastStatus.current = d?.status ?? null;
    setDraft(d);
    setLoading(false);
  }, [userId, onApplied]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const build = async () => {
    setBuilding(true);
    setAsking(false);
    try {
      await botJob({ job: 'build_plan', user_id: userId, request: request.trim() || null });
      setRequest('');
    } catch (e) {
      toast({ title: 'הבנייה נכשלה', description: e instanceof Error ? e.message : '', variant: 'destructive' });
    }
    setBuilding(false);
    void load();
  };

  if (loading) return null;
  const open = draft && ['building', 'pending', 'failed'].includes(draft.status);

  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Bot className="h-4 w-4 text-primary" />
        בוט האימונים
      </p>

      {open ? (
        <PlanDraftCard draft={draft!} onChanged={load} />
      ) : building ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />בונה את התוכנית, בדרך כלל פחות מדקה…</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {hasDays
              ? 'הבוט יכול להוסיף ימי אימון או להחליף יום קיים, לפי מה שתכתבו. הוא בונה לפי העקרונות והתבניות שלכם, ואתם מאשרים לפני שזה מגיע למתאמן.'
              : 'למתאמן עוד אין ימי אימון. הבוט יבנה לו תוכנית ראשונה לפי המסלול שלו בשאלון הפתיחה (מתחילים: עם הסרטונים של שבוע 5–6 ו-9–10; מתאמנים כוח: פתוח מיד).'}
            {draft?.status === 'approved' && draft.kind === 'initial' && !draft.decided_by
              ? ' (הבוט בנה את התוכנית הראשונה אחרי השאלון. היא למטה, כבויה עד שתדליקו.)'
              : draft?.status === 'approved' ? ' (התוכנית האחרונה של הבוט אושרה.)' : ''}
          </p>
          {asking && (
            <Textarea
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              rows={3}
              autoFocus
              placeholder={hasDays ? 'מה לבנות? למשל: עוד אימון רגליים לבית, 30 דקות' : 'משהו שחשוב לדעת (לא חובה)? למשל: מתאמן רק בבית עם גומיות'}
            />
          )}
          <Button size="sm" className="gap-1.5" onClick={() => (asking ? build() : setAsking(true))} disabled={hasDays && asking && !request.trim()}>
            <Sparkles className="h-4 w-4" />
            {asking ? 'לבנות' : hasDays ? 'לבקש מהבוט אימון' : 'לבנות תוכנית עם הבוט'}
          </Button>
        </div>
      )}
    </div>
  );
}
