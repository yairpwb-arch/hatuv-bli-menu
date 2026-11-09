import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { History, Loader2, RefreshCw, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ModelTest } from '@/components/admin/ModelTest';

// The bot's tables aren't in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type Row = Record<string, any>;
const EDITABLE = [
  { key: 'rules', label: 'כללים', hint: 'מה הבוט עושה ומה לא. נכנס לכל תשובה.' },
  { key: 'style_guide', label: 'תדריך סגנון', hint: 'איך אנחנו כותבים. נכנס לכל תשובה אחרי הכללים.' },
] as const;

const usd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;

/**
 * The WhatsApp bot, for admins: its rules and style guide (with their history),
 * what it costs, and the conversations it handed to us.
 */
export default function AdminBot() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">הבוט בוואטסאפ</h1>
        <p className="text-sm text-muted-foreground">ההנחיות שלו, העלויות, וההעברות אלינו</p>
      </div>
      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">הנחיות</TabsTrigger>
          <TabsTrigger value="costs">עלויות</TabsTrigger>
          <TabsTrigger value="handoffs">העברות</TabsTrigger>
          <TabsTrigger value="eval">מבחן מודלים</TabsTrigger>
        </TabsList>
        <TabsContent value="settings" className="space-y-6 pt-4">
          {EDITABLE.map((e) => <SettingEditor key={e.key} settingKey={e.key} label={e.label} hint={e.hint} />)}
          <KnowledgeStatus />
        </TabsContent>
        <TabsContent value="costs" className="pt-4"><Costs /></TabsContent>
        <TabsContent value="handoffs" className="pt-4"><Handoffs /></TabsContent>
        <TabsContent value="eval" className="pt-4"><ModelTest /></TabsContent>
      </Tabs>
    </div>
  );
}

function SettingEditor({ settingKey, label, hint }: { settingKey: string; label: string; hint: string }) {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState('');
  const [history, setHistory] = useState<Row[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [{ data: s }, { data: h }] = await Promise.all([
      db.from('bot_settings').select('value').eq('key', settingKey).maybeSingle(),
      db.from('bot_settings_history').select('old_value, changed_at, changed_by').eq('key', settingKey).order('changed_at', { ascending: false }).limit(20),
    ]);
    const text = typeof s?.value === 'string' ? s.value : '';
    setValue(text);
    setSaved(text);
    setHistory(h ?? []);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingKey]);

  const save = async () => {
    setSaving(true);
    const { error } = await db.from('bot_settings').upsert({ key: settingKey, value: value }, { onConflict: 'key' });
    setSaving(false);
    if (error) return toast({ title: 'לא נשמר', description: error.message, variant: 'destructive' });
    toast({ title: 'נשמר', description: 'הבוט משתמש בזה מההודעה הבאה' });
    await load();
  };

  return (
    <div className="space-y-2 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setShowHistory((v) => !v)}>
            <History className="h-4 w-4" />היסטוריה ({history.length})
          </Button>
          <Button size="sm" className="gap-1.5" onClick={save} disabled={saving || value === saved}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}שמירה
          </Button>
        </div>
      </div>
      <Textarea value={value} onChange={(e) => setValue(e.target.value)} rows={14} className="font-mono text-sm leading-relaxed" dir="rtl" />
      {showHistory && (
        <div className="space-y-2">
          {history.length === 0 && <p className="text-xs text-muted-foreground">עוד אין שינויים</p>}
          {history.map((h, i) => (
            <details key={i} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
              <summary className="cursor-pointer">
                {format(new Date(h.changed_at), 'dd/MM/yyyy HH:mm', { locale: he })} · הגרסה שלפני השינוי
              </summary>
              <pre className="mt-2 whitespace-pre-wrap text-xs">{typeof h.old_value === 'string' ? h.old_value : JSON.stringify(h.old_value, null, 1)}</pre>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => setValue(typeof h.old_value === 'string' ? h.old_value : '')}>
                לטעון לעריכה
              </Button>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

/** How much of the program the bot knows, and a button to rebuild now. */
function KnowledgeStatus() {
  const [stats, setStats] = useState<{ total: number; ready: number; queued: number } | null>(null);
  const [running, setRunning] = useState(false);
  const load = async () => {
    const [all, ready, queued] = await Promise.all([
      db.from('bot_knowledge').select('id', { count: 'exact', head: true }),
      db.from('bot_knowledge').select('id', { count: 'exact', head: true }).not('embedding', 'is', null),
      db.from('bot_knowledge_queue').select('content_id', { count: 'exact', head: true }),
    ]);
    setStats({ total: all.count ?? 0, ready: ready.count ?? 0, queued: queued.count ?? 0 });
  };
  useEffect(() => {
    void load();
  }, []);
  const run = async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke('bot-jobs', { body: { job: 'knowledge' } });
    setRunning(false);
    if (error) toast({ title: 'נכשל', description: error.message, variant: 'destructive' });
    else toast({ title: 'עודכן', description: `נבנו מחדש ${data?.rebuilt ?? 0} תכנים, ${data?.embedded ?? 0} קטעים קיבלו חיפוש` });
    await load();
  };
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-4">
      <div>
        <p className="font-semibold">הידע מהתוכנית</p>
        <p className="text-xs text-muted-foreground">
          {stats ? `${stats.ready} מתוך ${stats.total} קטעים מוכנים לחיפוש · ${stats.queued} תכנים ממתינים לעדכון (מתעדכן לבד כל 10 דקות)` : 'טוען…'}
        </p>
      </div>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={run} disabled={running}>
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}לעדכן עכשיו
      </Button>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = { reply: 'תשובות', profile: 'תיקי לקוח', embed: 'חיפוש', transcribe: 'תמלול', eval: 'מבחן מודלים', judge: 'ציון במבחן' };

function Costs() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    const since = new Date();
    since.setMonth(since.getMonth() - 2, 1);
    since.setHours(0, 0, 0, 0);
    db.from('bot_usage')
      .select('created_at, kind, model, cost_usd, input_tokens, output_tokens')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(10000)
      .then(({ data }: { data: Row[] | null }) => setRows(data ?? []));
  }, []);

  const { days, months, kinds } = useMemo(() => {
    const days = new Map<string, number>();
    const months = new Map<string, number>();
    const kinds = new Map<string, { cost: number; count: number }>();
    for (const r of rows ?? []) {
      const d = new Date(r.created_at);
      const c = Number(r.cost_usd) || 0;
      const day = format(d, 'yyyy-MM-dd');
      const month = format(d, 'yyyy-MM');
      days.set(day, (days.get(day) ?? 0) + c);
      months.set(month, (months.get(month) ?? 0) + c);
      const k = kinds.get(r.kind) ?? { cost: 0, count: 0 };
      kinds.set(r.kind, { cost: k.cost + c, count: k.count + 1 });
    }
    return { days: [...days].slice(0, 31), months: [...months], kinds: [...kinds] };
  }, [rows]);

  if (!rows) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />;
  const replies = kinds.find(([k]) => k === 'reply')?.[1];
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {months.map(([m, c]) => (
          <div key={m} className="rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground">{format(new Date(`${m}-01T12:00:00`), 'MMMM yyyy', { locale: he })}</p>
            <p className="text-2xl font-bold tabular-nums" dir="ltr">{usd(c)}</p>
          </div>
        ))}
        {replies && (
          <div className="rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground">ממוצע לתשובה</p>
            <p className="text-2xl font-bold tabular-nums" dir="ltr">{usd(replies.cost / replies.count)}</p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {kinds.map(([k, v]) => (
          <Badge key={k} variant="secondary">{KIND_LABEL[k] ?? k}: {v.count} · <span dir="ltr">{usd(v.cost)}</span></Badge>
        ))}
      </div>
      <div className="rounded-xl border border-border">
        <div className="border-b border-border px-4 py-2 text-sm font-semibold">לפי יום</div>
        {days.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">עוד אין שימוש</p>}
        {days.map(([d, c]) => (
          <div key={d} className="flex justify-between border-b border-border/50 px-4 py-2 text-sm last:border-0">
            <span>{format(new Date(`${d}T12:00:00`), 'EEEE d/M', { locale: he })}</span>
            <span className="tabular-nums" dir="ltr">{usd(c)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Handoffs() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await db.from('bot_handoffs').select('*').order('created_at', { ascending: false }).limit(100);
      const list = (data ?? []) as Row[];
      const ids = [...new Set(list.map((r) => r.user_id).filter(Boolean))];
      const { data: people } = ids.length ? await db.from('profiles').select('id, full_name').in('id', ids) : { data: [] };
      const names = new Map(((people ?? []) as Row[]).map((p) => [p.id, p.full_name]));
      setRows(list.map((r) => ({ ...r, name: names.get(r.user_id) ?? null })));
    })();
  }, []);
  if (!rows) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />;
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">הבוט עוד לא העביר אלינו שיחות</p>;
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.id} className="space-y-2 rounded-xl border border-border p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{r.name ?? (r.user_id ? 'לקוח' : 'קבוצת ניסיון')}</span>
            <span className="text-xs text-muted-foreground">{format(new Date(r.created_at), 'dd/MM HH:mm')}</span>
            <Badge variant={r.sent_to_group ? 'secondary' : 'outline'}>{r.sent_to_group ? 'נשלח לקבוצה' : 'טיוטה, לא נשלח'}</Badge>
          </div>
          <p className="whitespace-pre-wrap"><span className="text-muted-foreground">הלקוח: </span>{r.client_text || '—'}</p>
          <p className="whitespace-pre-wrap"><span className="text-muted-foreground">הבוט: </span>{r.bot_text || '—'}</p>
        </div>
      ))}
    </div>
  );
}
