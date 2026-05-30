import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  Pencil, Check, X, Download, ChevronUp, ChevronDown, Loader2, Trash2, Plus, Search,
} from 'lucide-react';
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
  extra_q1?: string | null;
  extra_q2?: string | null;
  extra_q3?: string | null;
  extra_q4?: string | null;
  extra_q5?: string | null;
  profiles?: { full_name: string | null; email: string } | null;
}

const TYPE_LABELS: Record<string, string> = {
  text: 'טקסט',
  number: 'מספר',
  scale: 'סקאלה 1-10',
  yesno: 'כן/לא',
  textarea: 'טקסט ארוך',
};

// Extra column keys reserved for admin-added questions
const EXTRA_KEYS = ['extra_q1', 'extra_q2', 'extra_q3', 'extra_q4', 'extra_q5'];

function scoreColor(v: number | null) {
  if (v == null) return 'text-muted-foreground';
  if (v <= 4) return 'text-red-500 font-semibold';
  if (v <= 7) return 'text-yellow-500 font-semibold';
  return 'text-green-500 font-semibold';
}

// ── Questions Tab ─────────────────────────────────────────────────────────────

function QuestionsTab() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editType, setEditType] = useState<CheckinQuestion['question_type']>('text');
  const [savingId, setSavingId] = useState<string | null>(null);

  // New question form
  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState('');
  const [newType, setNewType] = useState<CheckinQuestion['question_type']>('text');
  const [addingNew, setAddingNew] = useState(false);

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

  const cancelEdit = () => { setEditingId(null); setEditText(''); };

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
    const remaining = questions.filter(x => x.id !== q.id);
    await Promise.all(
      remaining.map((item, i) =>
        (supabase as any).from('checkin_questions').update({ sort_order: i + 1 }).eq('id', item.id)
      )
    );
    toast({ title: 'נמחק', description: 'השאלה נמחקה' });
    queryClient.invalidateQueries({ queryKey: ['checkin-questions'] });
  };

  const moveQuestion = async (q: CheckinQuestion, direction: 'up' | 'down') => {
    const idx = questions.findIndex(x => x.id === q.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= questions.length) return;
    const reordered = [...questions];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    await Promise.all(
      reordered.map((item, i) =>
        (supabase as any).from('checkin_questions').update({ sort_order: i + 1 }).eq('id', item.id)
      )
    );
    queryClient.invalidateQueries({ queryKey: ['checkin-questions'] });
  };

  const addQuestion = async () => {
    if (!newText.trim()) return;
    // Find next available extra_qN key
    const usedKeys = questions.map(q => q.column_key);
    const freeKey = EXTRA_KEYS.find(k => !usedKeys.includes(k));
    if (!freeKey) {
      toast({
        title: 'לא ניתן להוסיף שאלה',
        description: 'הגעת למגבלה של 5 שאלות מותאמות אישית',
        variant: 'destructive',
      });
      return;
    }
    setAddingNew(true);
    const nextOrder = questions.length + 1;
    const { error } = await (supabase as any)
      .from('checkin_questions')
      .insert({
        question_text: newText.trim(),
        question_type: newType,
        column_key: freeKey,
        sort_order: nextOrder,
        is_active: true,
      });
    if (error) {
      toast({ title: 'שגיאה', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'נוספה', description: 'השאלה נוספה לשאלון של כלל הלקוחות' });
      queryClient.invalidateQueries({ queryKey: ['checkin-questions'] });
      setNewText('');
      setNewType('text');
      setShowAdd(false);
    }
    setAddingNew(false);
  };

  if (isLoading) {
    return <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {questions.filter(q => q.is_active).length} שאלות פעילות מתוך {questions.length}
        </p>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setShowAdd(v => !v)}
          variant={showAdd ? 'secondary' : 'default'}
        >
          <Plus className="h-4 w-4" />
          הוסף שאלה
        </Button>
      </div>

      {/* Add question form */}
      {showAdd && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <p className="text-sm font-medium">שאלה חדשה</p>
          <Input
            value={newText}
            onChange={e => setNewText(e.target.value)}
            placeholder="טקסט השאלה..."
            className="text-sm"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && addQuestion()}
          />
          <div className="flex items-center gap-2">
            <Select value={newType} onValueChange={v => setNewType(v as CheckinQuestion['question_type'])}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-8 gap-1" onClick={addQuestion} disabled={addingNew || !newText.trim()}>
              {addingNew ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              הוסף
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => { setShowAdd(false); setNewText(''); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            השאלה תופיע בשאלון של כלל הלקוחות (עד 5 שאלות מותאמות אישית)
          </p>
        </div>
      )}

      <div className="space-y-2">
        {questions.map((q, idx) => (
          <div
            key={q.id}
            className={`border rounded-xl p-3 transition-colors ${q.is_active ? 'bg-card border-border' : 'bg-muted/30 border-border/50 opacity-60'}`}
          >
            {editingId === q.id ? (
              <div className="space-y-2">
                <Input
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  className="text-sm"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <Select value={editType} onValueChange={v => setEditType(v as CheckinQuestion['question_type'])}>
                    <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
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
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button onClick={() => moveQuestion(q, 'up')} disabled={idx === 0}
                    className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20">
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => moveQuestion(q, 'down')} disabled={idx === questions.length - 1}
                    className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span className="w-5 text-xs text-muted-foreground shrink-0 text-center">{idx + 1}</span>
                <span className="flex-1 text-sm">{q.question_text}</span>
                <Badge variant="secondary" className="text-xs shrink-0">{TYPE_LABELS[q.question_type]}</Badge>
                <div dir="ltr" className="shrink-0">
                  <Switch checked={q.is_active} onCheckedChange={() => toggleActive(q)} />
                </div>
                <button onClick={() => startEdit(q)} className="p-1.5 text-muted-foreground hover:text-foreground shrink-0">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {EXTRA_KEYS.includes(q.column_key) && (
                  <button onClick={() => deleteQuestion(q)} className="p-1.5 text-muted-foreground hover:text-red-500 shrink-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Week helpers ──────────────────────────────────────────────────────────────

function getWeekBounds() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun,1=Mon..6=Sat
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysSinceMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

// ── Responses Tab ─────────────────────────────────────────────────────────────

function ResponsesTab() {
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [filterPeriod, setFilterPeriod] = useState<'week' | 'all' | 'date'>('week');
  const [filterDate, setFilterDate] = useState('');
  const [nameSearch, setNameSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const { data: allResponses = [], isLoading } = useQuery({
    queryKey: ['checkin-responses'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('weekly_checkin')
        .select('*')
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      const rows = (data || []) as CheckinResponse[];
      if (rows.length === 0) return rows;
      const userIds = [...new Set(rows.map(r => r.user_id))];
      const { data: profiles } = await (supabase as any)
        .from('profiles').select('id, full_name, email').in('id', userIds);
      const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]));
      return rows.map(r => ({ ...r, profiles: profileMap[r.user_id] ?? null }));
    },
  });

  // Client-side filter + sort
  const responses = allResponses
    .filter(r => {
      // Name search
      if (nameSearch.trim()) {
        const search = nameSearch.trim().toLowerCase();
        const name = (r.profiles?.full_name || r.full_name || '').toLowerCase();
        const email = (r.profiles?.email || '').toLowerCase();
        if (!name.includes(search) && !email.includes(search)) return false;
      }
      // Period filter
      if (filterPeriod === 'week') {
        const { monday, sunday } = getWeekBounds();
        const d = new Date(r.submitted_at);
        return d >= monday && d <= sunday;
      }
      if (filterPeriod === 'date') {
        return filterDate ? format(new Date(r.submitted_at), 'yyyy-MM-dd') === filterDate : true;
      }
      return true; // 'all'
    })
    .sort((a, b) => {
      const diff = new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime();
      return sortOrder === 'desc' ? diff : -diff;
    });

  const exportCSV = () => {
    if (responses.length === 0) return;
    const BOM = '﻿';
    const headers = ['שם', 'אימייל', 'שבוע', 'תאריך הגשה', ...questions.map(q => q.question_text)];
    const csvRows = responses.map(r => {
      const userName = r.profiles?.full_name || r.full_name || r.user_id;
      const email = r.profiles?.email || '';
      const date = format(new Date(r.submitted_at), 'dd/MM/yyyy HH:mm', { locale: he });
      const values = questions.map(q => {
        const val = (r as any)[q.column_key];
        if (val == null) return '';
        if (q.question_type === 'yesno') return val ? 'כן' : 'לא';
        return String(val);
      });
      return [userName, email, String(r.week_number), date, ...values];
    });
    const csv = BOM + [headers, ...csvRows].map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `checkins${filterDate ? `-${filterDate}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const { monday, sunday } = getWeekBounds();
  const weekLabel = `${format(monday, 'dd/MM')} – ${format(sunday, 'dd/MM')}`;

  return (
    <div className="space-y-3">
      {/* Row 1: period + sort */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterPeriod} onValueChange={v => { setFilterPeriod(v as 'week' | 'all' | 'date'); setFilterDate(''); }}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">השבוע ({weekLabel})</SelectItem>
            <SelectItem value="all">כל הזמן</SelectItem>
            <SelectItem value="date">בחר תאריך</SelectItem>
          </SelectContent>
        </Select>

        {filterPeriod === 'date' && (
          <Input
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            className="w-36 text-sm"
            dir="ltr"
          />
        )}

        <Select value={sortOrder} onValueChange={v => setSortOrder(v as 'desc' | 'asc')}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">מהחדש לישן</SelectItem>
            <SelectItem value="asc">מהישן לחדש</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={exportCSV} disabled={responses.length === 0} className="gap-1.5 mr-auto">
          <Download className="h-4 w-4" />
          ייצוא CSV
        </Button>
      </div>

      {/* Row 2: name search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={nameSearch}
          onChange={e => setNameSearch(e.target.value)}
          placeholder="חפש לפי שם..."
          className="pr-9 text-sm"
          dir="rtl"
        />
        {nameSearch && (
          <button
            onClick={() => setNameSearch('')}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{responses.length} תשובות</p>

      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
      ) : responses.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">לא נמצאו תשובות</div>
      ) : (
        <div className="space-y-2">
          {responses.map(row => {
            const isOpen = expandedId === row.id;
            const name = row.profiles?.full_name || row.full_name || row.profiles?.email || '-';
            const dateStr = format(new Date(row.submitted_at), 'dd/MM/yyyy', { locale: he });
            return (
              <div key={row.id} className="rounded-xl border border-border overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-right hover:bg-muted/40 transition-colors"
                  onClick={() => setExpandedId(isOpen ? null : row.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-medium text-sm truncate">{name}</span>
                    <Badge variant="outline" className="text-xs shrink-0">שבוע {row.week_number}</Badge>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-muted-foreground">
                    <span className="text-xs">{dateStr}</span>
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-border px-4 py-4 space-y-3 bg-muted/20">
                    {row.profiles?.email && (
                      <p className="text-xs text-muted-foreground pb-1">{row.profiles.email}</p>
                    )}
                    {questions.map(q => {
                      const val = (row as any)[q.column_key];
                      if (val == null) return null;
                      return (
                        <div key={q.id} className="flex flex-col gap-0.5">
                          <span className="text-xs text-muted-foreground">{q.question_text}</span>
                          <span className={`text-sm font-medium ${q.question_type === 'scale' ? scoreColor(val as number) : ''}`}>
                            {q.question_type === 'yesno' ? (val ? '✓ כן' : '✗ לא') : String(val)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
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
