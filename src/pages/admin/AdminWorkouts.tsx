import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  Plus,
  Edit,
  Trash2,
  Loader2,
  Dumbbell,
  ChevronDown,
  ChevronRight,
  X,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Exercise {
  id: string;
  name: string;
  description: string | null;
  muscle_groups: string[] | null;
  equipment: string | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  media_url: string | null;
}

interface WorkoutPlan {
  id: string;
  name: string;
  description: string | null;
  duration_weeks: number | null;
  difficulty: string | null;
  is_active: boolean | null;
}

interface WorkoutPlanDay {
  id: string;
  plan_id: string;
  day_number: number;
  name: string | null;
}

interface WorkoutPlanExercise {
  id: string;
  day_id: string;
  exercise_id: string;
  sets: number | null;
  reps_min: number | null;
  reps_max: number | null;
  rest_seconds: number | null;
  order_index: number | null;
  exercises: {
    name: string;
  } | null;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  is_active: boolean | null;
}

interface UserWorkoutAssignment {
  id: string;
  user_id: string;
  plan_id: string;
  start_date: string | null;
  is_active: boolean | null;
  profiles: {
    full_name: string | null;
    email: string;
  } | null;
  workout_plans: {
    name: string;
  } | null;
}

// ─── Difficulty helpers ────────────────────────────────────────────────────────

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: 'מתחיל',
  intermediate: 'בינוני',
  advanced: 'מתקדם',
};

const DIFFICULTY_BADGE_CLASS: Record<string, string> = {
  beginner: 'bg-green-100 text-green-800 border-green-200',
  intermediate: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  advanced: 'bg-red-100 text-red-800 border-red-200',
};

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 1 — Exercise Library
// ═══════════════════════════════════════════════════════════════════════════════

const EMPTY_EXERCISE_FORM = {
  name: '',
  description: '',
  muscle_groups_raw: '',
  equipment: '',
  difficulty: '' as '' | 'beginner' | 'intermediate' | 'advanced',
  media_url: '',
};

function ExerciseLibraryTab() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [form, setForm] = useState({ ...EMPTY_EXERCISE_FORM });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: exercises = [], isLoading } = useQuery({
    queryKey: ['exercises'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return data as Exercise[];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (payload: Omit<Exercise, 'id'> & { id?: string }) => {
      if (payload.id) {
        const { id, ...rest } = payload;
        const { error } = await supabase
          .from('exercises')
          .update(rest)
          .eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('exercises').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      toast({ title: 'הצלחה', description: editingExercise ? 'התרגיל עודכן' : 'התרגיל נוסף' });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: 'שגיאה', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('exercises').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      toast({ title: 'הצלחה', description: 'התרגיל נמחק' });
      setDeletingId(null);
    },
    onError: (err: Error) => {
      toast({ title: 'שגיאה', description: err.message, variant: 'destructive' });
      setDeletingId(null);
    },
  });

  const openAddDialog = () => {
    setEditingExercise(null);
    setForm({ ...EMPTY_EXERCISE_FORM });
    setIsDialogOpen(true);
  };

  const openEditDialog = (ex: Exercise) => {
    setEditingExercise(ex);
    setForm({
      name: ex.name,
      description: ex.description ?? '',
      muscle_groups_raw: (ex.muscle_groups ?? []).join(', '),
      equipment: ex.equipment ?? '',
      difficulty: ex.difficulty ?? '',
      media_url: ex.media_url ?? '',
    });
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingExercise(null);
    setForm({ ...EMPTY_EXERCISE_FORM });
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast({ title: 'שגיאה', description: 'שם התרגיל הוא שדה חובה', variant: 'destructive' });
      return;
    }
    const muscleGroups = form.muscle_groups_raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      muscle_groups: muscleGroups.length > 0 ? muscleGroups : null,
      equipment: form.equipment.trim() || null,
      difficulty: (form.difficulty || null) as Exercise['difficulty'],
      media_url: form.media_url.trim() || null,
      ...(editingExercise ? { id: editingExercise.id } : {}),
    };

    upsertMutation.mutate(payload);
  };

  const handleDelete = (ex: Exercise) => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את "${ex.name}"?`)) return;
    setDeletingId(ex.id);
    deleteMutation.mutate(ex.id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 className="text-xl font-bold">ספריית תרגילים</h3>
          <p className="text-muted-foreground">{exercises.length} תרגילים</p>
        </div>
        <Button onClick={openAddDialog}>
          <Plus className="h-4 w-4 ml-2" />
          הוסף תרגיל
        </Button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : exercises.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-8 text-center text-muted-foreground">
            אין תרגילים. לחץ על "הוסף תרגיל" כדי להתחיל.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {exercises.map((ex) => (
            <Card key={ex.id} className="glass-card overflow-hidden">
              {/* Image / Placeholder */}
              <div className="h-32 bg-muted flex items-center justify-center overflow-hidden">
                {ex.media_url ? (
                  <img
                    src={ex.media_url}
                    alt={ex.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                      (e.currentTarget.parentElement as HTMLElement).classList.add('flex', 'items-center', 'justify-center');
                    }}
                  />
                ) : (
                  <Dumbbell className="h-10 w-10 text-muted-foreground/40" />
                )}
              </div>

              <CardContent className="p-3 space-y-2">
                {/* Name */}
                <p className="font-bold text-sm leading-snug">{ex.name}</p>

                {/* Difficulty badge */}
                {ex.difficulty && (
                  <span
                    className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${DIFFICULTY_BADGE_CLASS[ex.difficulty] ?? ''}`}
                  >
                    {DIFFICULTY_LABELS[ex.difficulty] ?? ex.difficulty}
                  </span>
                )}

                {/* Muscle groups */}
                {ex.muscle_groups && ex.muscle_groups.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {ex.muscle_groups.map((mg) => (
                      <Badge key={mg} variant="secondary" className="text-xs px-1.5 py-0">
                        {mg}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Equipment */}
                {ex.equipment && (
                  <p className="text-xs text-muted-foreground">{ex.equipment}</p>
                )}

                {/* Actions */}
                <div className="flex gap-1 pt-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openEditDialog(ex)}
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleDelete(ex)}
                    disabled={deletingId === ex.id}
                  >
                    {deletingId === ex.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-destructive" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingExercise ? 'עריכת תרגיל' : 'הוספת תרגיל חדש'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Name */}
            <div className="space-y-2">
              <Label>
                שם <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="לדוגמה: לחיצת חזה"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>תיאור</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="תיאור התרגיל..."
                rows={2}
              />
            </div>

            {/* Muscle groups */}
            <div className="space-y-2">
              <Label>קבוצות שרירים</Label>
              <Input
                value={form.muscle_groups_raw}
                onChange={(e) => setForm({ ...form, muscle_groups_raw: e.target.value })}
                placeholder="חזה, כתפיים, טריצפס (מופרדים בפסיק)"
              />
              <p className="text-xs text-muted-foreground">הפרד בין קבוצות שרירים בפסיק</p>
            </div>

            {/* Equipment */}
            <div className="space-y-2">
              <Label>ציוד</Label>
              <Input
                value={form.equipment}
                onChange={(e) => setForm({ ...form, equipment: e.target.value })}
                placeholder="לדוגמה: מוט, משקולות"
              />
            </div>

            {/* Difficulty */}
            <div className="space-y-2">
              <Label>קושי</Label>
              <Select
                value={form.difficulty}
                onValueChange={(val) =>
                  setForm({ ...form, difficulty: val as typeof form.difficulty })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="בחר רמת קושי" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">מתחיל</SelectItem>
                  <SelectItem value="intermediate">בינוני</SelectItem>
                  <SelectItem value="advanced">מתקדם</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Media URL */}
            <div className="space-y-2">
              <Label>קישור מדיה</Label>
              <Input
                value={form.media_url}
                onChange={(e) => setForm({ ...form, media_url: e.target.value })}
                placeholder="https://..."
                dir="ltr"
                className="text-left"
              />
            </div>

            <Button
              onClick={handleSubmit}
              className="w-full"
              disabled={upsertMutation.isPending}
            >
              {upsertMutation.isPending && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              {editingExercise ? 'שמור שינויים' : 'הוסף תרגיל'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 2 — Workout Plans
// ═══════════════════════════════════════════════════════════════════════════════

const EMPTY_PLAN_FORM = {
  name: '',
  description: '',
  duration_weeks: 4,
  difficulty: '' as '' | 'beginner' | 'intermediate' | 'advanced',
};

const EMPTY_ADD_EXERCISE_FORM = {
  exercise_id: '',
  sets: 3,
  reps_min: 8,
  reps_max: 12,
  rest_seconds: 60,
};

function WorkoutPlansTab() {
  const queryClient = useQueryClient();

  // Plans state
  const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null>(null);
  const [planForm, setPlanForm] = useState({ ...EMPTY_PLAN_FORM });
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);

  // Selected plan & day
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [expandedDayId, setExpandedDayId] = useState<string | null>(null);

  // Add day inline form
  const [isAddingDay, setIsAddingDay] = useState(false);
  const [newDayName, setNewDayName] = useState('');

  // Add exercise to day dialog
  const [addExerciseDayId, setAddExerciseDayId] = useState<string | null>(null);
  const [exerciseForm, setExerciseForm] = useState({ ...EMPTY_ADD_EXERCISE_FORM });

  // ── Fetch plans ───────────────────────────────────────────────────────────

  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ['workout_plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_plans')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return data as WorkoutPlan[];
    },
  });

  // ── Fetch days for selected plan ──────────────────────────────────────────

  const { data: days = [], isLoading: daysLoading } = useQuery({
    queryKey: ['workout_plan_days', selectedPlanId],
    enabled: !!selectedPlanId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_plan_days')
        .select('*')
        .eq('plan_id', selectedPlanId!)
        .order('day_number', { ascending: true });
      if (error) throw error;
      return data as WorkoutPlanDay[];
    },
  });

  // ── Fetch exercises for selected day ──────────────────────────────────────

  const { data: dayExercises = [], isLoading: dayExercisesLoading } = useQuery({
    queryKey: ['workout_plan_exercises', expandedDayId],
    enabled: !!expandedDayId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_plan_exercises')
        .select('*, exercises(name)')
        .eq('day_id', expandedDayId!)
        .order('order_index', { ascending: true });
      if (error) throw error;
      return data as WorkoutPlanExercise[];
    },
  });

  // ── Fetch exercises list (for dropdown) ────────────────────────────────────

  const { data: exercisesList = [] } = useQuery({
    queryKey: ['exercises'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exercises')
        .select('id, name')
        .order('name', { ascending: true });
      if (error) throw error;
      return data as Pick<Exercise, 'id' | 'name'>[];
    },
  });

  // ── Plan mutations ────────────────────────────────────────────────────────

  const upsertPlanMutation = useMutation({
    mutationFn: async (payload: Omit<WorkoutPlan, 'id'> & { id?: string }) => {
      if (payload.id) {
        const { id, ...rest } = payload;
        const { error } = await supabase
          .from('workout_plans')
          .update(rest)
          .eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('workout_plans').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workout_plans'] });
      toast({ title: 'הצלחה', description: editingPlan ? 'התוכנית עודכנה' : 'התוכנית נוספה' });
      closePlanDialog();
    },
    onError: (err: Error) => {
      toast({ title: 'שגיאה', description: err.message, variant: 'destructive' });
    },
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('workout_plans').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workout_plans'] });
      toast({ title: 'הצלחה', description: 'התוכנית נמחקה' });
      setDeletingPlanId(null);
      setSelectedPlanId(null);
    },
    onError: (err: Error) => {
      toast({ title: 'שגיאה', description: err.message, variant: 'destructive' });
      setDeletingPlanId(null);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('workout_plans')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workout_plans'] });
    },
    onError: (err: Error) => {
      toast({ title: 'שגיאה', description: err.message, variant: 'destructive' });
    },
  });

  // ── Day mutations ─────────────────────────────────────────────────────────

  const addDayMutation = useMutation({
    mutationFn: async ({ plan_id, day_number, name }: { plan_id: string; day_number: number; name: string }) => {
      const { error } = await supabase
        .from('workout_plan_days')
        .insert({ plan_id, day_number, name });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workout_plan_days', selectedPlanId] });
      toast({ title: 'הצלחה', description: 'היום נוסף' });
      setIsAddingDay(false);
      setNewDayName('');
    },
    onError: (err: Error) => {
      toast({ title: 'שגיאה', description: err.message, variant: 'destructive' });
    },
  });

  const deleteDayMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('workout_plan_days').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workout_plan_days', selectedPlanId] });
      toast({ title: 'הצלחה', description: 'היום נמחק' });
      if (expandedDayId) setExpandedDayId(null);
    },
    onError: (err: Error) => {
      toast({ title: 'שגיאה', description: err.message, variant: 'destructive' });
    },
  });

  // ── Exercise-in-day mutations ─────────────────────────────────────────────

  const addExerciseMutation = useMutation({
    mutationFn: async (payload: {
      day_id: string;
      exercise_id: string;
      sets: number;
      reps_min: number;
      reps_max: number;
      rest_seconds: number;
      order_index: number;
    }) => {
      const { error } = await supabase.from('workout_plan_exercises').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workout_plan_exercises', expandedDayId] });
      toast({ title: 'הצלחה', description: 'התרגיל נוסף ליום' });
      setAddExerciseDayId(null);
      setExerciseForm({ ...EMPTY_ADD_EXERCISE_FORM });
    },
    onError: (err: Error) => {
      toast({ title: 'שגיאה', description: err.message, variant: 'destructive' });
    },
  });

  const deleteExerciseFromDayMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('workout_plan_exercises').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workout_plan_exercises', expandedDayId] });
      toast({ title: 'הצלחה', description: 'התרגיל הוסר מהיום' });
    },
    onError: (err: Error) => {
      toast({ title: 'שגיאה', description: err.message, variant: 'destructive' });
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openAddPlanDialog = () => {
    setEditingPlan(null);
    setPlanForm({ ...EMPTY_PLAN_FORM });
    setIsPlanDialogOpen(true);
  };

  const openEditPlanDialog = (plan: WorkoutPlan) => {
    setEditingPlan(plan);
    setPlanForm({
      name: plan.name,
      description: plan.description ?? '',
      duration_weeks: plan.duration_weeks ?? 4,
      difficulty: (plan.difficulty ?? '') as typeof planForm.difficulty,
    });
    setIsPlanDialogOpen(true);
  };

  const closePlanDialog = () => {
    setIsPlanDialogOpen(false);
    setEditingPlan(null);
    setPlanForm({ ...EMPTY_PLAN_FORM });
  };

  const handleSubmitPlan = () => {
    if (!planForm.name.trim()) {
      toast({ title: 'שגיאה', description: 'שם התוכנית הוא שדה חובה', variant: 'destructive' });
      return;
    }
    const payload = {
      name: planForm.name.trim(),
      description: planForm.description.trim() || null,
      duration_weeks: planForm.duration_weeks || null,
      difficulty: planForm.difficulty || null,
      is_active: editingPlan ? editingPlan.is_active : true,
      ...(editingPlan ? { id: editingPlan.id } : {}),
    };
    upsertPlanMutation.mutate(payload);
  };

  const handleDeletePlan = (plan: WorkoutPlan) => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את "${plan.name}"?`)) return;
    setDeletingPlanId(plan.id);
    deletePlanMutation.mutate(plan.id);
  };

  const handleAddDay = () => {
    if (!selectedPlanId) return;
    const nextDayNumber = days.length > 0 ? Math.max(...days.map((d) => d.day_number)) + 1 : 1;
    addDayMutation.mutate({
      plan_id: selectedPlanId,
      day_number: nextDayNumber,
      name: newDayName.trim() || `יום ${nextDayNumber}`,
    });
  };

  const handleAddExerciseToDay = () => {
    if (!addExerciseDayId || !exerciseForm.exercise_id) {
      toast({ title: 'שגיאה', description: 'יש לבחור תרגיל', variant: 'destructive' });
      return;
    }
    const orderIndex = dayExercises.length;
    addExerciseMutation.mutate({
      day_id: addExerciseDayId,
      exercise_id: exerciseForm.exercise_id,
      sets: exerciseForm.sets,
      reps_min: exerciseForm.reps_min,
      reps_max: exerciseForm.reps_max,
      rest_seconds: exerciseForm.rest_seconds,
      order_index: orderIndex,
    });
  };

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 className="text-xl font-bold">תוכניות אימון</h3>
          <p className="text-muted-foreground">{plans.length} תוכניות</p>
        </div>
        <Button onClick={openAddPlanDialog}>
          <Plus className="h-4 w-4 ml-2" />
          הוסף תוכנית
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left panel — plans list */}
        <Card className="glass-card">
          <CardContent className="p-0">
            {plansLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : plans.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                אין תוכניות. לחץ על "הוסף תוכנית".
              </div>
            ) : (
              <ul className="divide-y">
                {plans.map((plan) => (
                  <li
                    key={plan.id}
                    className={`p-3 cursor-pointer transition-colors hover:bg-muted/50 ${
                      selectedPlanId === plan.id ? 'bg-muted/80' : ''
                    }`}
                    onClick={() => setSelectedPlanId(plan.id === selectedPlanId ? null : plan.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm leading-tight truncate">{plan.name}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {plan.difficulty && (
                            <span
                              className={`text-xs font-medium px-1.5 py-0 rounded-full border ${
                                DIFFICULTY_BADGE_CLASS[plan.difficulty] ?? ''
                              }`}
                            >
                              {DIFFICULTY_LABELS[plan.difficulty] ?? plan.difficulty}
                            </span>
                          )}
                          {plan.duration_weeks && (
                            <span className="text-xs text-muted-foreground">
                              {plan.duration_weeks} שבועות
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Switch
                          checked={plan.is_active ?? false}
                          onCheckedChange={(checked) => {
                            toggleActiveMutation.mutate({ id: plan.id, is_active: checked });
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => { e.stopPropagation(); openEditPlanDialog(plan); }}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => { e.stopPropagation(); handleDeletePlan(plan); }}
                          disabled={deletingPlanId === plan.id}
                        >
                          {deletingPlanId === plan.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-destructive" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Right panel — plan days */}
        {selectedPlan ? (
          <Card className="glass-card">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">{selectedPlan.name} — ימים</h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setIsAddingDay(true); setNewDayName(''); }}
                >
                  <Plus className="h-3.5 w-3.5 ml-1" />
                  הוסף יום
                </Button>
              </div>

              {/* Inline add-day form */}
              {isAddingDay && (
                <div className="flex gap-2 items-center p-3 bg-muted/50 rounded-lg">
                  <Input
                    className="flex-1 h-8 text-sm"
                    placeholder="שם היום (לדוגמה: חזה)"
                    value={newDayName}
                    onChange={(e) => setNewDayName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddDay(); }}
                  />
                  <Button
                    size="sm"
                    onClick={handleAddDay}
                    disabled={addDayMutation.isPending}
                    className="h-8"
                  >
                    {addDayMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      'הוסף'
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => setIsAddingDay(false)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}

              {/* Days list */}
              {daysLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : days.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  אין ימים. לחץ על "הוסף יום".
                </p>
              ) : (
                <ul className="space-y-2">
                  {days.map((day) => (
                    <li key={day.id} className="border rounded-lg overflow-hidden">
                      {/* Day header */}
                      <div
                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/40 transition-colors"
                        onClick={() =>
                          setExpandedDayId(expandedDayId === day.id ? null : day.id)
                        }
                      >
                        <div className="flex items-center gap-2">
                          {expandedDayId === day.id ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="font-medium text-sm">
                            יום {day.day_number}
                            {day.name ? ` — ${day.name}` : ''}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('למחוק יום זה?')) deleteDayMutation.mutate(day.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>

                      {/* Expanded exercises */}
                      {expandedDayId === day.id && (
                        <div className="border-t p-3 space-y-3 bg-muted/20">
                          {dayExercisesLoading ? (
                            <Skeleton className="h-8 w-full" />
                          ) : dayExercises.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-2">
                              אין תרגילים ביום זה.
                            </p>
                          ) : (
                            <ul className="space-y-1.5">
                              {dayExercises.map((pe) => (
                                <li
                                  key={pe.id}
                                  className="flex items-center justify-between text-sm bg-background rounded-md px-3 py-2"
                                >
                                  <div>
                                    <span className="font-medium">
                                      {pe.exercises?.name ?? '—'}
                                    </span>
                                    <span className="text-muted-foreground text-xs mr-2">
                                      {pe.sets} סטים ·{' '}
                                      {pe.reps_min}–{pe.reps_max} חזרות ·{' '}
                                      {pe.rest_seconds} שניות מנוחה
                                    </span>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => deleteExerciseFromDayMutation.mutate(pe.id)}
                                  >
                                    <X className="h-3 w-3 text-destructive" />
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          )}

                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full h-8 text-xs"
                            onClick={() => {
                              setAddExerciseDayId(day.id);
                              setExerciseForm({ ...EMPTY_ADD_EXERCISE_FORM });
                            }}
                          >
                            <Plus className="h-3.5 w-3.5 ml-1" />
                            הוסף תרגיל ליום
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="glass-card">
            <CardContent className="p-8 text-center text-muted-foreground text-sm">
              בחר תוכנית מהרשימה כדי לצפות בימי האימון
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add / Edit Plan Dialog */}
      <Dialog open={isPlanDialogOpen} onOpenChange={(open) => { if (!open) closePlanDialog(); }}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPlan ? 'עריכת תוכנית' : 'הוספת תוכנית חדשה'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>
                שם <span className="text-destructive">*</span>
              </Label>
              <Input
                value={planForm.name}
                onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                placeholder="לדוגמה: תוכנית כוח 4 ימים"
              />
            </div>

            <div className="space-y-2">
              <Label>תיאור</Label>
              <Textarea
                value={planForm.description}
                onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                placeholder="תיאור התוכנית..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>משך בשבועות</Label>
              <Input
                type="number"
                min={1}
                value={planForm.duration_weeks}
                onChange={(e) =>
                  setPlanForm({ ...planForm, duration_weeks: Number(e.target.value) })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>קושי</Label>
              <Select
                value={planForm.difficulty}
                onValueChange={(val) =>
                  setPlanForm({ ...planForm, difficulty: val as typeof planForm.difficulty })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="בחר רמת קושי" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">מתחיל</SelectItem>
                  <SelectItem value="intermediate">בינוני</SelectItem>
                  <SelectItem value="advanced">מתקדם</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleSubmitPlan}
              className="w-full"
              disabled={upsertPlanMutation.isPending}
            >
              {upsertPlanMutation.isPending && (
                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
              )}
              {editingPlan ? 'שמור שינויים' : 'הוסף תוכנית'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Exercise to Day Dialog */}
      <Dialog
        open={!!addExerciseDayId}
        onOpenChange={(open) => { if (!open) { setAddExerciseDayId(null); setExerciseForm({ ...EMPTY_ADD_EXERCISE_FORM }); } }}
      >
        <DialogContent dir="rtl" className="w-[95vw] max-w-sm">
          <DialogHeader>
            <DialogTitle>הוסף תרגיל ליום</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>תרגיל</Label>
              <Select
                value={exerciseForm.exercise_id}
                onValueChange={(val) =>
                  setExerciseForm({ ...exerciseForm, exercise_id: val })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="בחר תרגיל" />
                </SelectTrigger>
                <SelectContent>
                  {exercisesList.map((ex) => (
                    <SelectItem key={ex.id} value={ex.id}>
                      {ex.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>סטים</Label>
                <Input
                  type="number"
                  min={1}
                  value={exerciseForm.sets}
                  onChange={(e) =>
                    setExerciseForm({ ...exerciseForm, sets: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>מנוחה (שניות)</Label>
                <Input
                  type="number"
                  min={0}
                  value={exerciseForm.rest_seconds}
                  onChange={(e) =>
                    setExerciseForm({ ...exerciseForm, rest_seconds: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>חזרות מינימום</Label>
                <Input
                  type="number"
                  min={1}
                  value={exerciseForm.reps_min}
                  onChange={(e) =>
                    setExerciseForm({ ...exerciseForm, reps_min: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>חזרות מקסימום</Label>
                <Input
                  type="number"
                  min={1}
                  value={exerciseForm.reps_max}
                  onChange={(e) =>
                    setExerciseForm({ ...exerciseForm, reps_max: Number(e.target.value) })
                  }
                />
              </div>
            </div>

            <Button
              onClick={handleAddExerciseToDay}
              className="w-full"
              disabled={addExerciseMutation.isPending}
            >
              {addExerciseMutation.isPending && (
                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
              )}
              הוסף תרגיל
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 3 — User Workout Assignments
// ═══════════════════════════════════════════════════════════════════════════════

const EMPTY_ASSIGNMENT_FORM = {
  user_id: '',
  plan_id: '',
  start_date: '',
  is_active: true,
};

function AssignmentsTab() {
  const queryClient = useQueryClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<UserWorkoutAssignment | null>(null);
  const [form, setForm] = useState({ ...EMPTY_ASSIGNMENT_FORM });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ['user_workout_assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_workout_assignments')
        .select('*, profiles(full_name, email), workout_plans(name)')
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data as UserWorkoutAssignment[];
    },
  });

  const { data: activeProfiles = [] } = useQuery({
    queryKey: ['profiles_active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, is_active')
        .eq('is_active', true)
        .order('full_name', { ascending: true });
      if (error) throw error;
      return data as Profile[];
    },
  });

  const { data: allPlans = [] } = useQuery({
    queryKey: ['workout_plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_plans')
        .select('id, name')
        .order('name', { ascending: true });
      if (error) throw error;
      return data as Pick<WorkoutPlan, 'id' | 'name'>[];
    },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const upsertAssignmentMutation = useMutation({
    mutationFn: async (
      payload: {
        user_id: string;
        plan_id: string;
        start_date: string | null;
        is_active: boolean;
        id?: string;
      }
    ) => {
      if (payload.id) {
        const { id, ...rest } = payload;
        const { error } = await supabase
          .from('user_workout_assignments')
          .update(rest)
          .eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('user_workout_assignments').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user_workout_assignments'] });
      toast({
        title: 'הצלחה',
        description: editingAssignment ? 'השיוך עודכן' : 'השיוך נוסף',
      });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: 'שגיאה', description: err.message, variant: 'destructive' });
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('user_workout_assignments')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user_workout_assignments'] });
      toast({ title: 'הצלחה', description: 'השיוך נמחק' });
      setDeletingId(null);
    },
    onError: (err: Error) => {
      toast({ title: 'שגיאה', description: err.message, variant: 'destructive' });
      setDeletingId(null);
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openAddDialog = () => {
    setEditingAssignment(null);
    setForm({ ...EMPTY_ASSIGNMENT_FORM });
    setIsDialogOpen(true);
  };

  const openEditDialog = (a: UserWorkoutAssignment) => {
    setEditingAssignment(a);
    setForm({
      user_id: a.user_id,
      plan_id: a.plan_id,
      start_date: a.start_date ?? '',
      is_active: a.is_active ?? true,
    });
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingAssignment(null);
    setForm({ ...EMPTY_ASSIGNMENT_FORM });
  };

  const handleSubmit = () => {
    if (!form.user_id || !form.plan_id) {
      toast({ title: 'שגיאה', description: 'יש לבחור משתמש ותוכנית', variant: 'destructive' });
      return;
    }
    const payload = {
      user_id: form.user_id,
      plan_id: form.plan_id,
      start_date: form.start_date || null,
      is_active: form.is_active,
      ...(editingAssignment ? { id: editingAssignment.id } : {}),
    };
    upsertAssignmentMutation.mutate(payload);
  };

  const handleDelete = (a: UserWorkoutAssignment) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק שיוך זה?')) return;
    setDeletingId(a.id);
    deleteAssignmentMutation.mutate(a.id);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 className="text-xl font-bold">שיוכי תוכניות</h3>
          <p className="text-muted-foreground">{assignments.length} שיוכים</p>
        </div>
        <Button onClick={openAddDialog}>
          <Plus className="h-4 w-4 ml-2" />
          הוסף שיוך
        </Button>
      </div>

      {/* Table */}
      <Card className="glass-card">
        <CardContent className="p-0 overflow-x-auto">
          {assignmentsLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : assignments.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              אין שיוכים. לחץ על "הוסף שיוך" כדי להתחיל.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">שם משתמש</TableHead>
                  <TableHead className="text-right">אימייל</TableHead>
                  <TableHead className="text-right">תוכנית</TableHead>
                  <TableHead className="text-right">תאריך התחלה</TableHead>
                  <TableHead className="text-right">פעיל</TableHead>
                  <TableHead className="text-right w-24">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {a.profiles?.full_name ?? '—'}
                    </TableCell>
                    <TableCell dir="ltr" className="text-left text-sm">
                      {a.profiles?.email ?? '—'}
                    </TableCell>
                    <TableCell>{a.workout_plans?.name ?? '—'}</TableCell>
                    <TableCell>
                      {a.start_date
                        ? new Date(a.start_date).toLocaleDateString('he-IL')
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={a.is_active ? 'default' : 'secondary'}>
                        {a.is_active ? 'פעיל' : 'לא פעיל'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEditDialog(a)}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleDelete(a)}
                          disabled={deletingId === a.id}
                        >
                          {deletingId === a.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-destructive" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
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
        <DialogContent dir="rtl" className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAssignment ? 'עריכת שיוך' : 'הוספת שיוך חדש'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* User */}
            <div className="space-y-2">
              <Label>משתמש</Label>
              <Select
                value={form.user_id}
                onValueChange={(val) => setForm({ ...form, user_id: val })}
                disabled={!!editingAssignment}
              >
                <SelectTrigger>
                  <SelectValue placeholder="בחר משתמש" />
                </SelectTrigger>
                <SelectContent>
                  {activeProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name ? `${p.full_name} (${p.email})` : p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Plan */}
            <div className="space-y-2">
              <Label>תוכנית אימון</Label>
              <Select
                value={form.plan_id}
                onValueChange={(val) => setForm({ ...form, plan_id: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="בחר תוכנית" />
                </SelectTrigger>
                <SelectContent>
                  {allPlans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Start date */}
            <div className="space-y-2">
              <Label>תאריך התחלה</Label>
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                dir="ltr"
                className="text-left"
              />
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <Label className="cursor-pointer">פעיל</Label>
              <Switch
                checked={form.is_active}
                onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
              />
            </div>

            <Button
              onClick={handleSubmit}
              className="w-full"
              disabled={upsertAssignmentMutation.isPending}
            >
              {upsertAssignmentMutation.isPending && (
                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
              )}
              {editingAssignment ? 'שמור שינויים' : 'הוסף שיוך'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function AdminWorkouts() {
  return (
    <div className="space-y-6" dir="rtl">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold">ניהול אימונים</h2>
        <p className="text-muted-foreground">ניהול תרגילים, תוכניות אימון ושיוכים למשתמשים</p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="exercises" dir="rtl">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="exercises">ספריית תרגילים</TabsTrigger>
          <TabsTrigger value="plans">תוכניות אימון</TabsTrigger>
          <TabsTrigger value="assignments">שיוכי תוכניות</TabsTrigger>
        </TabsList>

        <TabsContent value="exercises" className="mt-6">
          <ExerciseLibraryTab />
        </TabsContent>

        <TabsContent value="plans" className="mt-6">
          <WorkoutPlansTab />
        </TabsContent>

        <TabsContent value="assignments" className="mt-6">
          <AssignmentsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
