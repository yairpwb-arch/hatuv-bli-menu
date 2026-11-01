import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

interface Row {
  summary_date: string;
  answers: Record<string, 'yes' | 'partial' | 'no'>;
  energy: number | null;
  hunger: number | null;
  proud_of: string | null;
  habits_done: number | null;
}

const ANSWER: Record<string, { label: string; cls: string }> = {
  yes: { label: 'כן', cls: 'text-green-600' },
  partial: { label: 'חלקית', cls: 'text-amber-600' },
  no: { label: 'לא', cls: 'text-red-600' },
};

/** Admin: a trainee's bedtime summaries, newest first (last 60). */
export function DailySummariesTab({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    setRows(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    db.from('daily_summaries')
      .select('summary_date, answers, energy, hunger, proud_of, habits_done')
      .eq('user_id', userId)
      .order('summary_date', { ascending: false })
      .limit(60)
      .then(async ({ data }: { data: Row[] | null }) => {
        const list = data ?? [];
        const ids = [...new Set(list.flatMap((r) => Object.keys(r.answers ?? {})))];
        if (ids.length) {
          const { data: defs } = await supabase.from('habit_definitions').select('id, name').in('id', ids);
          setNames(Object.fromEntries((defs ?? []).map((d) => [d.id, d.name])));
        }
        setRows(list);
      });
  }, [userId]);

  if (!rows) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">עוד לא מולאו סיכומים יומיים</p>;
  }

  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.summary_date} className="space-y-2 rounded-xl border border-border px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{format(new Date(`${r.summary_date}T12:00:00`), 'EEEE d/M', { locale: he })}</Badge>
            {r.habits_done != null && <span className="text-xs text-muted-foreground">{r.habits_done} הרגלים בוצעו</span>}
          </div>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {Object.entries(r.answers ?? {}).map(([id, a]) => (
              <div key={id}>
                <span className="text-muted-foreground">{names[id] ?? 'הרגל'}:</span>{' '}
                <span className={`font-semibold ${ANSWER[a]?.cls ?? ''}`}>{ANSWER[a]?.label ?? a}</span>
              </div>
            ))}
            {r.energy != null && <div><span className="text-muted-foreground">אנרגיה ומוטיבציה:</span> <span className="font-semibold">{r.energy}/5</span></div>}
            {r.hunger != null && <div><span className="text-muted-foreground">רעב:</span> <span className="font-semibold">{r.hunger}/5</span></div>}
          </div>
          {r.proud_of && (
            <p><span className="text-muted-foreground">גאה ב:</span> {r.proud_of}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
