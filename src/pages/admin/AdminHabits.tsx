import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Switch } from '@/components/ui/switch';
import { Plus, Edit, Trash2, Loader2, Star } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HabitDefinition {
  id: string;
  name: string;
  week_start: number;
  week_end: number | null;
  icon: string | null;
  is_bonus: boolean;
}

interface HabitFormData {
  name: string;
  day_start: number;  // program day when habit first appears (Sunday of week_start)
  day_end: string;    // program day of last Saturday habit shows (empty = no end)
  icon: string;
  is_bonus: boolean;
}

// ─── Day ↔ Week conversions ───────────────────────────────────────────────────
// All users start on Saturday (day 1). Habits unlock on Sunday (day 2).
// Week N habits: visible day (N-1)*7+2 (Sun) through N*7+1 (Sat).
//
// day_start → week_start: floor((day - 2) / 7) + 1
// day_end   → week_end:   floor((day - 2) / 7) + 1
// week_start → day_start: (week - 1) * 7 + 2
// week_end   → day_end:   week * 7 + 1

function dayToWeek(day: number): number {
  return Math.max(1, Math.floor((day - 2) / 7) + 1);
}
function weekToStartDay(week: number): number {
  return (week - 1) * 7 + 2;
}
function weekToEndDay(week: number): number {
  return week * 7 + 1;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ICON_OPTIONS = [
  { value: 'droplets', label: 'טיפות מים' },
  { value: 'footprints', label: 'פסיעות' },
  { value: 'timer', label: 'טיימר' },
  { value: 'moon', label: 'ירח' },
  { value: 'target', label: 'מטרה' },
  { value: 'apple', label: 'תפוח' },
  { value: 'dumbbell', label: 'משקולת' },
  { value: 'heart', label: 'לב' },
  { value: 'zap', label: 'ברק' },
  { value: 'star', label: 'כוכב' },
] as const;

const EMPTY_FORM: HabitFormData = {
  name: '',
  day_start: 2,   // day 2 = Sunday of week 1 (first day habits can appear)
  day_end: '',
  icon: 'target',
  is_bonus: false,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminHabits() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<HabitDefinition | null>(null);
  const [form, setForm] = useState<HabitFormData>(EMPTY_FORM);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────

  const { data: habits = [], isLoading } = useQuery({
    queryKey: ['habit_definitions'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('habit_definitions')
        .select('*')
        .is('user_id', null)
        .order('week_start', { ascending: true });
      if (error) throw error;
      return data as HabitDefinition[];
    },
  });

  // ── Mutations ────────────────────────────────────────────────────────────

  const upsertMutation = useMutation({
    mutationFn: async (payload: Omit<HabitDefinition, 'id'> & { id?: string }) => {
      if (payload.id) {
        const { id, ...rest } = payload;
        const { error } = await supabase
          .from('habit_definitions')
          .update(rest)
          .eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('habit_definitions').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habit_definitions'] });
      toast({ title: 'הצלחה', description: editingHabit ? 'ההרגל עודכן' : 'ההרגל נוסף' });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: 'שגיאה', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('habit_definitions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habit_definitions'] });
      toast({ title: 'הצלחה', description: 'ההרגל נמחק' });
      setDeletingId(null);
    },
    onError: (err: Error) => {
      toast({ title: 'שגיאה', description: err.message, variant: 'destructive' });
      setDeletingId(null);
    },
  });

  // ── Handlers ─────────────────────────────────────────────────────────────

  const openAddDialog = () => {
    setEditingHabit(null);
    setForm(EMPTY_FORM);
    setIsDialogOpen(true);
  };

  const openEditDialog = (habit: HabitDefinition) => {
    setEditingHabit(habit);
    setForm({
      name: habit.name,
      day_start: weekToStartDay(habit.week_start),
      day_end: habit.week_end !== null ? String(weekToEndDay(habit.week_end)) : '',
      icon: habit.icon || 'target',
      is_bonus: habit.is_bonus,
    });
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingHabit(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast({ title: 'שגיאה', description: 'יש להזין שם לרגל', variant: 'destructive' });
      return;
    }
    if (form.day_start < 2) {
      toast({ title: 'שגיאה', description: 'יום התחלה חייב להיות לפחות 2 (ראשון של שבוע 1)', variant: 'destructive' });
      return;
    }

    const week_start = dayToWeek(form.day_start);
    const week_end = form.day_end !== '' ? dayToWeek(Number(form.day_end)) : null;

    const payload = {
      name: form.name.trim(),
      week_start,
      week_end,
      icon: form.icon || null,
      is_bonus: form.is_bonus,
      ...(editingHabit ? { id: editingHabit.id } : {}),
    };

    upsertMutation.mutate(payload);
  };

  const handleDelete = (habit: HabitDefinition) => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את "${habit.name}"?`)) return;
    setDeletingId(habit.id);
    deleteMutation.mutate(habit.id);
  };

  const iconLabel = (icon: string | null) => {
    if (!icon) return '—';
    return ICON_OPTIONS.find((o) => o.value === icon)?.label ?? icon;
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">ניהול הרגלים</h2>
          <p className="text-muted-foreground">{habits.length} הרגלים מוגדרים</p>
        </div>
        <Button onClick={openAddDialog}>
          <Plus className="h-4 w-4 ml-2" />
          הוסף הרגל
        </Button>
      </div>

      {/* Table */}
      <Card className="glass-card">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : habits.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              אין הרגלים מוגדרים. לחץ על "הוסף הרגל" כדי להתחיל.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">שם</TableHead>
                  <TableHead className="text-right">יום התחלה</TableHead>
                  <TableHead className="text-right">יום סיום</TableHead>
                  <TableHead className="text-right">אייקון</TableHead>
                  <TableHead className="text-right w-20">בונוס</TableHead>
                  <TableHead className="text-right w-24">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {habits.map((habit) => (
                  <TableRow key={habit.id}>
                    <TableCell className="font-medium">{habit.name}</TableCell>
                    <TableCell>{weekToStartDay(habit.week_start)}</TableCell>
                    <TableCell>{habit.week_end != null ? weekToEndDay(habit.week_end) : '—'}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {iconLabel(habit.icon)}
                    </TableCell>
                    <TableCell>
                      {habit.is_bonus && (
                        <span className="inline-flex items-center gap-1 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
                          <Star className="h-3 w-3" />
                          בונוס
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(habit)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(habit)}
                          disabled={deletingId === habit.id}
                        >
                          {deletingId === habit.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-destructive" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-destructive" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingHabit ? 'עריכת הרגל' : 'הוספת הרגל חדש'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Name */}
            <div className="space-y-2">
              <Label>שם</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="לדוגמה: שתיית מים"
              />
            </div>

            {/* Day start */}
            <div className="space-y-2">
              <Label>
                יום התחלה{' '}
                <span className="text-muted-foreground font-normal text-xs">(יום 2 = ראשון שבוע 1, יום 9 = ראשון שבוע 2…)</span>
              </Label>
              <Input
                type="number"
                min={2}
                value={form.day_start}
                onChange={(e) =>
                  setForm({ ...form, day_start: Math.max(2, Number(e.target.value)) })
                }
              />
            </div>

            {/* Day end (optional) */}
            <div className="space-y-2">
              <Label>
                יום סיום{' '}
                <span className="text-muted-foreground font-normal text-xs">(אופציונלי — יום 8 = שבת שבוע 1, יום 15 = שבת שבוע 2…)</span>
              </Label>
              <Input
                type="number"
                min={form.day_start + 6}
                value={form.day_end}
                onChange={(e) => setForm({ ...form, day_end: e.target.value })}
                placeholder="ללא הגבלה"
              />
            </div>

            {/* Icon */}
            <div className="space-y-2">
              <Label>אייקון</Label>
              <Select
                value={form.icon}
                onValueChange={(val) => setForm({ ...form, icon: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="בחר אייקון" />
                </SelectTrigger>
                <SelectContent>
                  {ICON_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Is Bonus */}
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">הרגל בונוס</p>
                <p className="text-xs text-muted-foreground">לא נדרש להשלמת הסטריק היומי</p>
              </div>
              <Switch
                checked={form.is_bonus}
                onCheckedChange={(checked) => setForm({ ...form, is_bonus: checked })}
              />
            </div>

            <Button
              onClick={handleSubmit}
              className="w-full"
              disabled={upsertMutation.isPending}
            >
              {upsertMutation.isPending && (
                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
              )}
              {editingHabit ? 'שמור שינויים' : 'הוסף הרגל'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
