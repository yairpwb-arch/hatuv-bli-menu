import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Download, Loader2, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// The test's tables aren't in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type Row = Record<string, any>;
const MODELS = [
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { id: 'gpt-6.1-terra', label: 'GPT-6.1 Terra' },
];
/** What the next run asks for. */
const PICKS = {
  sonnet: { label: 'רק Sonnet 5.5', models: ['claude-sonnet-5-5'] },
  terra: { label: 'רק GPT-6.1 Terra', models: ['gpt-6.1-terra'] },
  both: { label: 'Haiku ו-Sonnet', models: ['claude-haiku-5-5', 'claude-sonnet-5-5'] },
};
type Pick = keyof typeof PICKS;
const usd = (n: number) => `$${n.toFixed(4)}`;
const PARALLEL = 3;

/**
 * The model test: each question goes to Haiku and Sonnet with the same prompt.
 * No judge: the answers are downloaded as one file and read by us.
 */
export function ModelTest() {
  const [cases, setCases] = useState<Row[]>([]);
  const [runs, setRuns] = useState<string[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [results, setResults] = useState<Row[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  /** Which models the next run asks for. */
  const [pick, setPick] = useState<Pick>('sonnet');
  /** Which questions the next run asks ("5, 16, 42"); empty = all. */
  const [only, setOnly] = useState('');

  const loadRuns = async () => {
    const { data } = await db.from('bot_eval_results').select('run_id, created_at').order('created_at', { ascending: false }).limit(2000);
    const ids = [...new Set(((data ?? []) as Row[]).map((r) => r.run_id))] as string[];
    setRuns(ids);
    return ids;
  };
  const loadResults = async (id: string) => {
    const { data } = await db.from('bot_eval_results').select('*').eq('run_id', id);
    setResults(data ?? []);
  };
  useEffect(() => {
    db.from('bot_eval_cases').select('*').order('no').then(({ data }: { data: Row[] | null }) => setCases(data ?? []));
    loadRuns().then((ids) => {
      if (ids[0]) {
        setRunId(ids[0]);
        void loadResults(ids[0]);
      }
    });
  }, []);

  const run = async () => {
    const nos = new Set(only.split(/[^0-9]+/).filter(Boolean).map(Number));
    const todo = nos.size ? cases.filter((c) => nos.has(c.no)) : cases;
    if (!todo.length) return;
    const id = `run-${format(new Date(), 'yyyyMMdd-HHmm')}-${pick}${nos.size ? `-${todo.length}q` : ''}`;
    setRunId(id);
    setResults([]);
    setProgress({ done: 0, total: todo.length });
    const queue = [...todo];
    let done = 0;
    let failed = 0;
    const worker = async () => {
      while (queue.length) {
        const c = queue.shift()!;
        const { error } = await supabase.functions.invoke('bot-jobs', { body: { job: 'eval_case', run_id: id, case_no: c.no, models: PICKS[pick].models } });
        if (error) failed++;
        done++;
        setProgress({ done, total: todo.length });
        await loadResults(id);
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    setProgress(null);
    await loadRuns();
    toast({ title: 'המבחן הסתיים', description: failed ? `${failed} שאלות לא רצו, אפשר להריץ שוב` : `${todo.length} שאלות` });
  };

  const byCase = useMemo(() => {
    const m = new Map<number, Record<string, Row>>();
    for (const r of results) (m.get(r.case_no) ?? m.set(r.case_no, {}).get(r.case_no)!)[r.model] = r;
    return m;
  }, [results]);

  // Only the models that ran in this run.
  const ran = MODELS.filter((m) => results.some((r) => r.model === m.id));
  const costs = ran.map((m) => {
    const rs = results.filter((r) => r.model === m.id);
    const total = rs.reduce((s, r) => s + Number(r.cost_usd || 0), 0);
    return { ...m, count: rs.length, total, avg: rs.length ? total / rs.length : 0 };
  });

  /** One Markdown file: every question with its data, history, our answer and both models' answers, then the costs. */
  const download = () => {
    // Only the questions this run asked.
    const asked = cases.filter((c) => byCase.has(c.no));
    const out: string[] = [`# מבחן מודלים: ${runId}`, '', `${asked.length} שאלות (${asked.map((c) => c.no).join(', ')}) · ${ran.map((m) => m.label).join(' ו-')} · ⏎ / --- = הודעה נפרדת`, ''];
    for (const c of asked) {
      const r = byCase.get(c.no) ?? {};
      out.push('---', '', `## שאלה ${c.no}`, '');
      out.push('### נתוני הלקוח', '', c.ctx, '');
      if ((c.history ?? []).length) {
        out.push('### השיחה שלפני', '');
        for (const h of c.history) out.push(`- **${h.side === 'coach' ? 'מאמן' : 'לקוח'}:** ${String(h.text).replace(/\n/g, ' ')}`);
        out.push('');
      }
      out.push('### ההודעה', '', c.question, '');
      out.push('### התשובה שלנו', '', c.ours.split(' ⏎ ').join('\n---\n'), '');
      for (const m of ran) {
        const x = r[m.id];
        out.push(`### ${m.label}`, '', x ? x.answer || '(שתק)' : '(לא רץ)', '');
        if (x) {
          const checks = (x.checks ?? []) as Row[];
          const handoff = checks.find((k) => k.id === 'handoff');
          const msgs = checks.find((k) => k.id === 'messages');
          const mustHandoff = ((c.checks ?? []) as Row[]).some((k) => k.id === 'handoff_required');
          out.push(
            `- [העבר]: ${handoff?.passed ? 'יש' : 'אין'}${mustHandoff ? (handoff?.passed ? ' ✓ (חובה)' : ' ✗ (חובה)') : ''}`,
            `- מספר הודעות: ${msgs?.why ?? '?'}`,
            ...(x.note ? [`- ${x.note}`] : []),
            `- עלות: ${usd(Number(x.cost_usd || 0))}`,
            '',
          );
        }
      }
      const manual = ((c.checks ?? []) as Row[]).filter((k) => k.id !== 'handoff_required');
      if (manual.length) out.push('**לבדיקה שלכם:** ' + manual.map((k) => k.text).join(' · '), '');
    }
    out.push('---', '', '## עלות', '');
    for (const k of costs) out.push(`- **${k.label}:** ${usd(k.total)} ל-${k.count} תשובות · ${usd(k.avg)} בממוצע לתשובה`);
    const blob = new Blob(['﻿' + out.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `model-test-${runId}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
        <div>
          <p className="font-semibold">מבחן מודלים</p>
          <p className="text-xs text-muted-foreground">{cases.length} שאלות · אותו פרומפט לכל המודלים · בלי שופט: התשובות יורדות לקובץ, ואתם בודקים</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {runs.length > 0 && (
            <select
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              value={runId ?? ''}
              onChange={(e) => {
                setRunId(e.target.value);
                void loadResults(e.target.value);
              }}
            >
              {runs.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          <Button variant="outline" onClick={download} disabled={!results.length || !!progress} className="gap-1.5">
            <Download className="h-4 w-4" />הורדת תוצאות
          </Button>
          <select
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            value={pick}
            onChange={(e) => setPick(e.target.value as Pick)}
            disabled={!!progress}
          >
            {(Object.keys(PICKS) as Pick[]).map((k) => <option key={k} value={k}>{PICKS[k].label}</option>)}
          </select>
          <input
            className="h-9 w-44 rounded-md border border-border bg-background px-2 text-sm"
            placeholder="שאלות (ריק = הכל)"
            value={only}
            onChange={(e) => setOnly(e.target.value)}
            disabled={!!progress}
          />
          <Button onClick={run} disabled={!!progress || !cases.length} className="gap-1.5">
            {progress ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {progress ? `${progress.done}/${progress.total}` : 'הרצת המבחן'}
          </Button>
        </div>
      </div>

      {results.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {costs.map((k) => (
            <div key={k.id} className="rounded-xl border border-border p-4">
              <p className="font-semibold">{k.label}</p>
              <p className="text-sm text-muted-foreground">
                {k.count} תשובות · <span dir="ltr">{usd(k.total)}</span> סה"כ · <span dir="ltr">{usd(k.avg)}</span> לתשובה
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {cases.map((c) => {
          const r = byCase.get(c.no) ?? {};
          return (
            <div key={c.no} className="space-y-3 rounded-xl border border-border p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">שאלה {c.no}</Badge>
                <span className="text-xs text-muted-foreground">{c.client_name} · יום {c.day}</span>
              </div>
              <p className="whitespace-pre-wrap"><span className="font-semibold">לקוח: </span>{c.question}</p>
              <div className="grid gap-3 lg:grid-cols-3">
                <Answer title="התשובה שלנו" text={c.ours.split(' ⏎ ').join('\n---\n')} />
                {(ran.length ? ran : MODELS).map((m) => <Answer key={m.id} title={m.label} text={r[m.id] ? r[m.id].answer || '(שתק)' : null} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Answer({ title, text }: { title: string; text: string | null }) {
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <span className="font-semibold">{title}</span>
      {text == null ? (
        <p className="text-xs text-muted-foreground">עוד לא רץ</p>
      ) : (
        <div className="space-y-1.5">
          {text.split(/\n\s*---\s*\n/).map((part, i) => (
            <p key={i} className="whitespace-pre-wrap rounded-md bg-muted/50 px-2 py-1.5">{part}</p>
          ))}
        </div>
      )}
    </div>
  );
}
