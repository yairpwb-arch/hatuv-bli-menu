import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Pencil, Check, X, Download, ChevronUp, ChevronDown, Loader2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CheckinQuestion {
  id: string;
  sort_order: number;
  question_text: string;
  question_type: 'text' | 'number' | 'scale' | 'yesno' | 'textarea';
  column_key: string;
  is_active: boolean;
}

interface CheckinResponse {
  id: string;
  user_id: string;
  week_number: number;
  submitted_at: string;
  full_name: string | null;
  last_weigh_in: number | null;
  weight_today: number | null;
  habits_score: number | null;
  walking_score: number | null;
  hunger_score: number | null;
  energy_score: number | null;
  water_score: number | null;
  sleep_hours: number | null;
  had_bowel_issues: boolean | null;
  proud_of: string | null;
  to_improve: string | null;
  met_last_goal: boolean | null;
  profiles?: { full_name: string | null; email: string } | null;
}

const TYPE_LABELS: Record<string, string> = {
  text: 'טקסט',
  number: 'מספר',
  scale: 'סקאלה 1-10',
  yesno: 'כן/לא',
  textarea: 'טקסט ארוך',
};

function scoreColor(v: number | null) {
  if (v == null) return 'text-muted-foreground';
  if (v <= 4) return 'text-red-500 font-semibold';
  if (v <= 7) return 'text-yellow-500 font-semibold';
  return 'text-green-500 font-semibold';
}

function formatValue(question: CheckinQuestion, row: CheckinResponse): string {
  const val = (row as any)[question.column_key];
  if (val == null) return '-';
  if (question.question_type === 'yesno') return val ? 'כן' : 'לא';
  return String(val);
}

// ── Questions Tab ─────────────────────────────────────────────────────────────

function QuestionsTab() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editType, setEditType] = useState<CheckinQuestion['question_type']>('text');
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ['checkin-questions'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('checkin_questions')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data as CheckinQuestion[];
    },
  });

  const startEdit = (q: CheckinQuestion) => {
    setEditingId(q.id);
    setEditText(q.question_text);
    setEditType(q.question_type);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const saveEdit = async (q: CheckinQuestion) => {
    if (!editText.trim()) return;
    setSavingId(q.id);
    const { error } = await (supabase as any)
      .from('checkin_questions')
      .update({ question_text: editText.trim(), question_type: editType })
      .eq('id', q.id);
    if (error) {
      toast({ title: 'שגיאה', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'הצלחה', description: 'השאלה עודכנה' });
      queryClient.invalidateQueries({ queryKey: ['checkin-questions'] });
      setEditingId(null);
    }
    setSavingId(null);
  };

  const toggleActive = async (q: CheckinQuestion) => {
    await (supabase as any)
      .from('checkin_questions')
      .update({ is_active: !q.is_active })
      .eq('id', q.id);
    queryClient.invalidateQueries({ queryKey: ['checkin-questions'] });
  };

  const deleteQuestion = async (q: CheckinQuestion) => {
    if (!confirm(`למחוק את השאלה "${q.question_text}"?`)) return;
    const { error } = await (supabase as any)
      .from('checkin_questions')
      .delete()
      .eq('id', q.id);
    if (error) {
      toast({ title: 'שגיאה', description: error.message, variant: 'destructive' });
      return;
    }

    // Re-number remaining questions consecutively (1, 2, 3…)
    const remaining = questions.filter(x => x.id !== q.id);
    await Promise.all(
      remaining.map((item, i) =>
        (supabase as any)
          .from('checkin_questions')
          .update({ sort_order: i + 1 })
          .eq('id', item.id)
      )
    );

    toast({ title: 'נמחק', description: 'השאלה נמחקה' });
    queryClient.invalidateQueries({ queryKey: ['checkin-questions'] });
  };

  const moveQuestion = async (q: CheckinQuestion, direction: 'up' | 'down') => {
    const idx = questions.findIndex(x => x.id === q.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= questions.length) return;

    // Reorder the full list and write consecutive sort_orders (1, 2, 3…)
    const reordered = [...questions];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];

    await Promise.all(
      reordered.map((item, i) =>
        (supabase as any)
          .from('checkin_questions')
          .update({ sort_order: i + 1 })
          .eq('id', item.id)
      )
    );
    queryClient.invalidateQueries({ queryKey: ['checkin-questions'] });
  };

  if (isLoading) {
    return <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {questions.filter(q => q.is_active).length} שאלות פעילות מתוך {questions.length}
      </p>

      <div className="space-y-2">
        {questions.map((q, idx) => (
          <div
            key={q.id}
            className={`border rounded-xl p-3 transition-colors ${q.is_active ? 'bg-card border-border' : 'bg-muted/30 border-border/50 opacity-60'}`}
          >
            {editingId === q.id ? (
              /* Edit mode */
              <div className="space-y-2">
                <Input
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  className="text-sm"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <Select value={editType} onValueChange={v => setEditType(v as CheckinQuestion['question_type'])}>
                    <SelectTrigger className="w-36 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-8 gap-1" onClick={() => saveEdit(q)} disabled={savingId === q.id}>
                    {savingId === q.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    שמור
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={cancelEdit}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              /* View mode */
              <div className="flex items-center gap-3">
                {/* Order buttons */}
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => moveQuestion(q, 'up')}
                    disabled={idx === 0}
                    className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => moveQuestion(q, 'down')}
                    disabled={idx === questions.length - 1}
                    className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Number — always 1-based position */}
                <span className="w-5 text-xs text-muted-foreground shrink-0 text-center">{idx + 1}</span>

                {/* Text */}
                <span className="flex-1 text-sm">{q.question_text}</span>

                {/* Type badge */}
                <Badge variant="secondary" className="text-xs shrink-0">
                  {TYPE_LABELS[q.question_type]}
                </Badge>

                {/* Active toggle */}
                <div dir="ltr" className="shrink-0">
                  <Switch
                    checked={q.is_active}
                    onCheckedChange={() => toggleActive(q)}
                  />
                </div>

                {/* Edit */}
                <button onClick={() => startEdit(q)} className="p-1.5 text-muted-foreground hover:text-foreground shrink-0">
                  <Pencil className="h-3.5 w-3.5" />
                </button>

                {/* Delete */}
                <button onClick={() => deleteQuestion(q)} className="p-1.5 text-muted-foreground hover:text-red-500 shrink-0">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Responses Tab ─────────────────────────────────────────────────────────────

function ResponsesTab() {
  const [selectedWeek, setSelectedWeek] = useState<string>('all');

  const { data: questions = [] } = useQuery({
    queryKey: ['checkin-questions'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('checkin_questions')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      return (data || []) as CheckinQuestion[];
    },
  });

  const { data: responses = [], isLoading } = useQuery({
    queryKey: ['checkin-responses', selectedWeek],
    queryFn: async () => {
      // Step 1: fetch checkins without profiles join
      // (weekly_checkin.user_id → auth.users, not profiles — PostgREST can't join directly)
      let q = (supabase as any)
        .from('weekly_checkin')
        .select('*')
        .order('week_number', { ascending: false })
        .order('submitted_at', { ascending: false });

      if (selectedWeek !== 'all') {
        q = q.eq('week_number', parseInt(selectedWeek));
      }

      const { data, error } = await q;
      if (error) throw error;
      const rows = (data || []) as CheckinResponse[];

      // Step 2: enrich with email from profiles
      if (rows.length > 0) {
        const userIds = [...new Set(rows.map(r => r.user_id))];
        const { data: profiles } = await (supabase as any)
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);
        const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]));
        return rows.map(r => ({
          ...r,
          profiles: profileMap[r.user_id] ?? null,
        }));
      }
      return rows;
    },
  });

  // Get unique weeks for filter
  const weeks = Array.from(new Set(responses.map(r => r.week_number))).sort((a, b) => b - a);

  const exportCSV = () => {
    if (responses.length === 0) return;

    const BOM = '\uFEFF';
    const headers = ['שם', 'שבוע', 'תאריך הגשה', ...questions.map(q => q.question_text)];

    const rows = responses.map(r => {
      const userName = r.profiles?.full_name || r.profiles?.email || r.user_id;
      const date = format(new Date(r.submitted_at), 'dd/MM/yyyy HH:mm', { locale: he });
      const values = questions.map(q => {
        const val = (r as any)[q.column_key];
        if (val == null) return '';
        if (q.question_type === 'yesno') return val ? 'כן' : 'לא';
        return String(val);
      });
      return [userName, String(r.week_number), date, ...values];
    });

    const csv = BOM + [headers, ...rows].map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `checkin-week${selectedWeek !== 'all' ? `-${selectedWeek}` : 's'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Filters + Export */}
      <div className="flex items-center gap-3">
        <Select value={selectedWeek} onValueChange={setSelectedWeek}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל השבועות</SelectItem>
            {weeks.map(w => (
              <SelectItem key={w} value={String(w)}>שבוע {w}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={responses.length === 0} className="gap-1.5">
          <Download className="h-4 w-4" />
          ייצוא CSV
        </Button>
        <span className="text-sm text-muted-foreground">{responses.length} תשובות</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : responses.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p>לא נמצאו תשובות</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right sticky right-0 bg-card min-w-[120px]">שם</TableHead>
                <TableHead className="text-right min-w-[60px]">שבוע</TableHead>
                <TableHead className="text-right min-w-[100px]">תאריך</TableHead>
                {questions.map(q => (
                  <TableHead key={q.id} className="text-right min-w-[90px] text-xs max-w-[120px]">
                    <span className="line-clamp-2">{q.question_text}</span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {responses.map(row => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium sticky right-0 bg-card text-sm">
                    {row.profiles?.full_name || row.profiles?.email || '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">שבוע {row.week_number}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(row.submitted_at), 'dd/MM/yy', { locale: he })}
                  </TableCell>
                  {questions.map(q => {
                    const val = (row as any)[q.column_key];
                    return (
                      <TableCell key={q.id} className="text-sm text-center">
                        {val == null ? (
                          <span className="text-muted-foreground/40">—</span>
                        ) : q.question_type === 'scale' ? (
                          <span className={scoreColor(val as number)}>{val}</span>
                        ) : q.question_type === 'yesno' ? (
                          <span className={val ? 'text-green-500' : 'text-red-400'}>{val ? 'כן' : 'לא'}</span>
                        ) : (
                          <span className="text-xs">{String(val)}</span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminSurveys() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h2 className="text-2xl font-bold">שאלון שבועי</h2>
        <p className="text-muted-foreground text-sm">ניהול שאלות ותצוגת תשובות המתאמנים</p>
      </div>

      <Tabs defaultValue="questions" dir="rtl">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="questions">שאלות</TabsTrigger>
          <TabsTrigger value="responses">תשובות</TabsTrigger>
        </TabsList>

        <TabsContent value="questions" className="mt-4">
          <QuestionsTab />
        </TabsContent>

        <TabsContent value="responses" className="mt-4">
          <ResponsesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
