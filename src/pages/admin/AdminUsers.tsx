import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { nextSaturday } from '@/lib/programStart';
import { TRACKS, programEnd, trackLabel } from '@/lib/programTracks';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import {
  Plus, Edit, Loader2, RefreshCw, Trash2, ChevronDown, ChevronUp, Dumbbell,
  User as UserIcon, Scale, Repeat2, ClipboardList, Sparkles, Footprints,
  History, Clock, Check, Copy, GripVertical,
} from 'lucide-react';
import {
  DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { format, differenceInDays, startOfWeek, addDays } from 'date-fns';
import { he } from 'date-fns/locale';
import { Bot, X } from 'lucide-react';
import { OnboardingAnswersTab } from '@/components/admin/OnboardingAnswersTab';
import { BodyProgressSection } from '@/components/admin/BodyProgressSection';
import { OwnActivitiesSection } from '@/components/admin/OwnActivitiesSection';
import { TraineePlanBot } from '@/components/admin/TraineePlanBot';
import { BotTab, ClientDrawer, ClientHeader, DetailsTab, useClientHeader } from '@/components/admin/ClientPanel';

// ── Types ─────────────────────────────────────────────────────────────────────

interface User {
  id: string;
  email: string;
  full_name: string | null;
  start_date: string | null;
  current_weight: number | null;
  initial_weight: number | null;
  target_weight: number | null;
  height: number | null;
  birthdate: string | null;
  gender: string | null;
  phone_number: string | null;
  is_active: boolean;
  created_at: string;
  plan_duration_days: number | null;
}

interface WeightEntry {
  id: string;
  recorded_at: string;
  weight: number;
}

interface StepsEntry {
  date: string;
  steps: number;
}

interface Habit {
  id: string;
  name: string;
  icon: string | null;
  week_start: number;
  week_end: number | null;
}

interface WorkoutPlanDay {
  id: string;
  plan_id: string;
  day_number: number;
  name: string;
  notes: string | null;
  unlocks_with?: string | null;
}

interface Exercise {
  id: string;
  name: string;
  muscle_groups: string[] | null;
  equipment: string | null;
}

// ── Exercise inline edit form ─────────────────────────────────────────────────

function ExerciseEditForm({ pe, onSave, onCancel }: {
  pe: { sets: number; reps_min: number; reps_max: number; rest_seconds: number; is_duration: boolean };
  onSave: (u: { sets: number; reps_min: number; reps_max: number; rest_seconds: number; is_duration: boolean }) => void;
  onCancel: () => void;
}) {
  const [sets, setSets] = useState(String(pe.sets));
  const [repsMin, setRepsMin] = useState(String(pe.reps_min));
  const [repsMax, setRepsMax] = useState(String(pe.reps_max));
  const [rest, setRest] = useState(String(pe.rest_seconds));
  const [isDuration, setIsDuration] = useState(pe.is_duration);

  const handleSave = () => {
    const durSec = parseInt(repsMin) || 30;
    onSave({
      sets: parseInt(sets) || 3,
      reps_min: isDuration ? durSec : (parseInt(repsMin) || 8),
      reps_max: isDuration ? durSec : (parseInt(repsMax) || 12),
      rest_seconds: parseInt(rest) || 60,
      is_duration: isDuration,
    });
  };

  return (
    <div className="space-y-2 bg-muted/30 rounded-lg p-2">
      {/* Type toggle */}
      <div className="flex gap-1">
        <button type="button"
          onClick={() => setIsDuration(false)}
          className={`flex-1 text-xs py-1 rounded-md transition-colors ${!isDuration ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
          חזרות
        </button>
        <button type="button"
          onClick={() => setIsDuration(true)}
          className={`flex-1 text-xs py-1 rounded-md transition-colors ${isDuration ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
          שניות
        </button>
      </div>
      <div className={`grid gap-1.5 text-xs ${isDuration ? 'grid-cols-3' : 'grid-cols-4'}`}>
        {[
          { label: 'סטים', val: sets, set: setSets },
          ...(!isDuration ? [{ label: 'מינ׳', val: repsMin, set: setRepsMin }, { label: 'מקס׳', val: repsMax, set: setRepsMax }] : [{ label: 'שנ׳', val: repsMin, set: setRepsMin }]),
          { label: 'מנוחה', val: rest, set: setRest },
        ].map(f => (
          <div key={f.label} className="space-y-0.5">
            <label className="text-muted-foreground">{f.label}</label>
            <input type="number" className="w-full h-7 text-xs text-center rounded-md border border-input bg-background px-1"
              value={f.val} onChange={e => f.set(e.target.value)} dir="ltr" />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5">
        <button type="button" onClick={handleSave}
          className="flex-1 text-xs h-7 rounded-md bg-primary text-primary-foreground font-medium">
          שמור
        </button>
        <button type="button" onClick={onCancel}
          className="text-xs h-7 px-3 rounded-md border border-input text-muted-foreground">
          ביטול
        </button>
      </div>
    </div>
  );
}

// ── Sortable exercise row ─────────────────────────────────────────────────────

function SortableExerciseRow({ pe, editingExercise, setEditingExercise, onSave, onDelete }: {
  pe: PlanExercise;
  editingExercise: PlanExercise | null;
  setEditingExercise: (pe: PlanExercise | null) => void;
  onSave: (u: { sets: number; reps_min: number; reps_max: number; rest_seconds: number; is_duration: boolean }) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pe.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="text-sm py-1.5 border-b border-border/50 last:border-0">
      {editingExercise?.id === pe.id ? (
        <ExerciseEditForm pe={pe} onSave={onSave} onCancel={() => setEditingExercise(null)} />
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <button
              {...attributes} {...listeners}
              style={{ touchAction: 'none' }}
              className="p-1 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
            <div className="min-w-0">
              <span className="font-medium">{pe.exercises?.name}</span>
              <span className="text-muted-foreground text-xs mr-2">
                {pe.sets}×{pe.is_duration ? `${pe.reps_min}שנ'` : `${pe.reps_min}–${pe.reps_max}`} · מנוחה {pe.rest_seconds}שנ'
              </span>
            </div>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setEditingExercise(pe)} className="p-1 text-muted-foreground hover:text-foreground">
              <Edit className="h-3 w-3" />
            </button>
            <button onClick={onDelete} className="p-1 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Exercise filter constants ────────────────────────────────────────────────

const EQUIP_CATEGORIES = [
  {
    id: 'weights',
    label: 'משקולות',
    icon: '🏋️',
    match: (eq: string | null) => {
      if (!eq) return false;
      const l = eq.toLowerCase();
      return l.includes('dumbbell') || l.includes('barbell') || l.includes('weight') ||
        l.includes('משקולת') || l.includes('משקולות') || l.includes('ברבל') || l.includes('גיר');
    },
  },
  {
    id: 'bodyweight',
    label: 'משקל גוף',
    icon: '🤸',
    match: (eq: string | null) => {
      if (!eq || eq.trim() === '') return true;
      const l = eq.toLowerCase();
      return l.includes('bodyweight') || l.includes('body weight') ||
        l.includes('משקל גוף') || l.includes('ללא ציוד') || l === 'none' || l === 'אין' ||
        l.includes('pull-up') || l.includes('pullup') || l.includes('parallel bar') || l === 'bench';
    },
  },
  {
    id: 'machine',
    label: 'מכונות חדר כושר',
    icon: '⚙️',
    match: (eq: string | null) => {
      if (!eq) return false;
      const l = eq.toLowerCase();
      return l.includes('machine') || l.includes('cable') || l.includes('מכונה') ||
        l.includes('מכונות') || l.includes('כבל') || l.includes('פולי');
    },
  },
] as const;

const MUSCLE_GROUPS = [
  { id: 'chest',     label: 'חזה',         match: ['chest', 'חזה', 'pec'] },
  { id: 'back',      label: 'גב',           match: ['back', 'גב', 'lat'] },
  { id: 'shoulders', label: 'כתפיים',       match: ['shoulder', 'כתפיים', 'כתף', 'delt'] },
  { id: 'triceps',   label: 'יד אחורית',    match: ['tricep', 'יד אחורית', 'טרייספס', 'טריצפס'] },
  { id: 'biceps',    label: 'יד קדמית',     match: ['bicep', 'יד קדמית', 'ביספס', 'ביצפס'] },
  { id: 'legs',      label: 'רגליים',        match: ['leg', 'quad', 'hamstring', 'glute', 'calf', 'רגליים', 'רגל', 'ירכיים', 'שוק', 'גלוטאוס'] },
  { id: 'abs',       label: 'בטן',           match: ['ab', 'core', 'בטן', 'ליבה', 'אגפיים'] },
] as const;

interface PlanExercise {
  id: string;
  plan_day_id: string;
  exercise_id: string;
  sets: number;
  reps_min: number;
  reps_max: number;
  rest_seconds: number;
  sort_order: number;
  is_duration: boolean;
  exercises: Exercise;
}

interface CheckinRow {
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
  /** Survey v2: the questions as asked, with their answers. */
  answers: { version: number; workouts?: boolean; items: { key: string; question: string; answer: string | number }[] } | null;
}

interface AdminWorkoutSession {
  id: string;
  completed_at: string;
  duration_minutes: number | null;
  workout_plan_days: { name: string; day_number: number } | null;
}

interface AdminExerciseLog {
  exercise_id: string;
  set_number: number;
  reps: number;
  weight_kg: number;
  exercises: { name: string } | null;
}

interface AdminWalkEntry {
  id: string;
  walk_number: 1 | 2;
  week_start: number;
  day_of_week: number | null;
  is_active: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

// Snap a YYYY-MM-DD string to the next/same Saturday (getDay() === 6).
function toSaturday(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const daysUntilSat = (6 - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + daysUntilSat);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const GENDER_LABELS: Record<string, string> = { male: 'זכר', female: 'נקבה', other: 'אחר' };

function calcCurrentDay(startDate: string | null): string {
  if (!startDate) return '-';
  const days = differenceInDays(new Date(), new Date(startDate)) + 1;
  return days > 0 ? String(days) : '-';
}

function scoreColor(score: number | null): string {
  if (score == null) return '';
  if (score <= 4) return 'text-destructive';
  if (score <= 7) return 'text-yellow-500';
  return 'text-success';
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [adminUserIds, setAdminUserIds] = useState<string[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  // Bumped when something the panel's header shows changes (details saved, the bot's switches).
  const [headerKey, setHeaderKey] = useState(0);
  const headerData = useClientHeader(editingUser, headerKey);
  // Phone: once the header has scrolled away, the tabs bar shows the name and a close button.
  const [headerEl, setHeaderEl] = useState<HTMLDivElement | null>(null);
  const [headerGone, setHeaderGone] = useState(false);
  useEffect(() => {
    if (!headerEl) return;
    const io = new IntersectionObserver(([e]) => setHeaderGone(!e.isIntersecting), { threshold: 0 });
    io.observe(headerEl);
    return () => io.disconnect();
  }, [headerEl]);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [deletingDay, setDeletingDay] = useState<WorkoutPlanDay | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Add-user form
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', startDate: nextSaturday(), planDays: 0 });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Tab-specific data
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
  const [deletingWeightId, setDeletingWeightId] = useState<string | null>(null);
  const [stepsData, setStepsData] = useState<StepsEntry[]>([]);
  const [editPersonal, setEditPersonal] = useState<Partial<User>>({});
  const [isSavingPersonal, setIsSavingPersonal] = useState(false);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [personalHabits, setPersonalHabits] = useState<Habit[]>([]);
  const [habitCompletion, setHabitCompletion] = useState<Record<string, number>>({});

  // New personal habit form
  const [isAddingPersonalHabit, setIsAddingPersonalHabit] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const [newHabitIcon, setNewHabitIcon] = useState('target');
  const [isSavingHabit, setIsSavingHabit] = useState(false);

  // Workout plan tab
  const [planActive, setPlanActive] = useState(false);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [currentAssignmentId, setCurrentAssignmentId] = useState<string | null>(null);
  const [planDays, setPlanDays] = useState<WorkoutPlanDay[]>([]);
  const [planExercisesMap, setPlanExercisesMap] = useState<Record<string, PlanExercise[]>>({});
  const [exerciseLibrary, setExerciseLibrary] = useState<Exercise[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [newDayName, setNewDayName] = useState('');
  const [isAddingDay, setIsAddingDay] = useState(false);
  const [addExerciseDayId, setAddExerciseDayId] = useState<string | null>(null);
  const [newExForm, setNewExForm] = useState({ exerciseId: '', sets: '3', repsMin: '8', repsMax: '12', rest: '60', useType: 'reps' as 'reps' | 'duration' });
  const [editingExercise, setEditingExercise] = useState<PlanExercise | null>(null);
  const [exEquipFilter, setExEquipFilter] = useState<string | null>(null);
  const [exMuscleFilter, setExMuscleFilter] = useState<string | null>(null);
  const [isTogglingPlan, setIsTogglingPlan] = useState(false);

  // Survey tab
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [isLoadingCheckins, setIsLoadingCheckins] = useState(false);

  // Walking schedule tab
  const [adminWalks, setAdminWalks] = useState<AdminWalkEntry[]>([]);

  // Workout history tab
  const [workoutSessions, setWorkoutSessions] = useState<AdminWorkoutSession[]>([]);
  const [walkHistory, setWalkHistory] = useState<{ id: string; completed_at: string }[]>([]);
  const [sessionLogsMap, setSessionLogsMap] = useState<Record<string, AdminExerciseLog[]>>({});
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);


  // ── Fetch all users ──────────────────────────────────────────────────────────

  const fetchAdminUsers = useCallback(async () => {
    const { data } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
    setAdminUserIds((data || []).map((r: any) => r.user_id));
  }, []);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) { toast({ title: 'שגיאה', description: 'לא ניתן לטעון משתמשים', variant: 'destructive' }); }
    else { setUsers(((data || []) as unknown as User[]).filter(u => !adminUserIds.includes(u.id))); }
    setIsLoading(false);
  }, [adminUserIds]);

  useEffect(() => { fetchAdminUsers(); }, []);
  useEffect(() => { fetchUsers(); }, [adminUserIds]);

  // ── Open edit dialog → load all user data ───────────────────────────────────

  const openEdit = async (user: User) => {
    setEditingUser(user);
    setEditPersonal({
      full_name: user.full_name || '',
      birthdate: user.birthdate || '',
      gender: user.gender || '',
      height: user.height ?? undefined,
      phone_number: (user as any).phone_number || '',
      start_date: user.start_date || '',
      plan_duration_days: user.plan_duration_days ?? undefined,
      is_active: user.is_active,
      initial_weight: user.initial_weight ?? undefined,
      current_weight: user.current_weight ?? undefined,
      target_weight: user.target_weight ?? undefined,
    });

    // Weight history
    const { data: wh } = await (supabase as any)
      .from('weight_log')
      .select('id, weight, recorded_at')
      .eq('user_id', user.id)
      .order('recorded_at', { ascending: true });
    setWeightHistory((wh || []) as WeightEntry[]);

    // Steps data (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data: stepsRaw } = await (supabase as any)
      .from('steps_log')
      .select('date, steps')
      .eq('user_id', user.id)
      .gte('date', thirtyDaysAgo)
      .order('date', { ascending: true });
    setStepsData((stepsRaw || []) as StepsEntry[]);

    // Habits
    await loadHabits(user);

    // Workout plan
    await loadWorkoutPlan(user.id);

    // Walking schedule
    await loadAdminWalks(user.id);

    // Checkins
    setIsLoadingCheckins(true);
    const { data: ci } = await (supabase as any)
      .from('weekly_checkin')
      .select('*')
      .eq('user_id', user.id)
      .order('week_number', { ascending: false })
      .limit(5);
    setCheckins((ci || []) as CheckinRow[]);
    setIsLoadingCheckins(false);

    // Workout sessions history
    const { data: ws } = await (supabase as any)
      .from('workout_session_logs')
      .select('id, completed_at, duration_minutes, workout_plan_days(name, day_number)')
      .eq('user_id', user.id)
      .order('completed_at', { ascending: false })
      .limit(15);
    setWorkoutSessions((ws || []) as AdminWorkoutSession[]);
    setSessionLogsMap({});
    setExpandedSessionId(null);

    // Walk history from activity_log
    const { data: walkData } = await (supabase as any)
      .from('activity_log')
      .select('id, completed_at')
      .eq('user_id', user.id)
      .eq('activity_type', 'walk')
      .order('completed_at', { ascending: false })
      .limit(30);
    setWalkHistory((walkData || []) as { id: string; completed_at: string }[]);

    // Exercise library for plan builder
    const { data: exLib } = await (supabase as any)
      .from('exercises')
      .select('id, name, muscle_groups, equipment')
      .order('name', { ascending: true });
    setExerciseLibrary((exLib || []) as Exercise[]);
  };

  const closeEdit = () => {
    setEditingUser(null);
    setPlanDays([]);
    setPlanExercisesMap({});
    setExpandedDays(new Set());
    setCurrentPlanId(null);
    setCurrentAssignmentId(null);
    setPlanActive(false);
    setPersonalHabits([]);
    setIsAddingPersonalHabit(false);
    setNewHabitName('');
    setStepsData([]);
    setWorkoutSessions([]);
    setWalkHistory([]);
    setSessionLogsMap({});
    setExpandedSessionId(null);
    setAdminWalks([]);
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    setIsDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-delete-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ userId: deletingUser.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה במחיקה');
      toast({ title: 'המשתמש נמחק', description: `${deletingUser.full_name || deletingUser.email} הוסר מהמערכת` });
      setDeletingUser(null);
      fetchUsers();
    } catch (err: any) {
      toast({ title: 'שגיאה', description: err.message, variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  // ── Habits ──────────────────────────────────────────────────────────────────

  const loadHabits = async (user: User) => {
    const currentDay = user.start_date
      ? differenceInDays(new Date(), new Date(user.start_date)) + 1
      : 1;

    const { data: hd } = await (supabase as any)
      .from('habit_definitions')
      .select('*')
      .lte('day_start', currentDay)
      .or(`day_end.is.null,day_end.gte.${currentDay}`)
      .or(`user_id.is.null,user_id.eq.${user.id}`);
    const all = (hd || []) as (Habit & { user_id: string | null })[];
    setHabits(all.filter(h => !h.user_id));
    setPersonalHabits(all.filter(h => !!h.user_id));

    // This week's habit completions
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = addDays(weekStart, 6);

    const { data: logs } = await (supabase as any)
      .from('daily_habits_log')
      .select('habit_id')
      .eq('user_id', user.id)
      .gte('completed_at', weekStart.toISOString())
      .lte('completed_at', weekEnd.toISOString());

    const counts: Record<string, number> = {};
    (logs || []).forEach((l: any) => {
      counts[l.habit_id] = (counts[l.habit_id] || 0) + 1;
    });
    setHabitCompletion(counts);
  };

  // ── Workout Plan ─────────────────────────────────────────────────────────────

  const loadAdminWalks = async (userId: string) => {
    const { data } = await (supabase as any)
      .from('user_walking_schedule')
      .select('*')
      .eq('user_id', userId)
      .order('walk_number');
    setAdminWalks((data || []) as AdminWalkEntry[]);
  };

  /** After the workout bot's plan was approved: show the new days. */
  const reloadWorkoutPlan = useCallback(() => {
    if (editingUser) void loadWorkoutPlan(editingUser.id);
  }, [editingUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadWorkoutPlan = async (userId: string) => {
    // Load any assignment (active or inactive) so we can reactivate without creating a new plan
    const { data: assignments } = await (supabase as any)
      .from('user_workout_assignments')
      .select('id, plan_id, is_active')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    const active = (assignments || []).find((a: any) => a.is_active);
    const any = active || (assignments || [])[0] || null;

    if (any) {
      setCurrentAssignmentId(any.id);
      setCurrentPlanId(any.plan_id);
      setPlanActive(!!active);
      // Off too: the days stay visible (e.g. the plan the bot built after the questionnaire, before it's switched on).
      await loadPlanDays(any.plan_id);
    } else {
      setCurrentAssignmentId(null);
      setCurrentPlanId(null);
      setPlanActive(false);
      setPlanDays([]);
      setPlanExercisesMap({});
    }
  };

  const loadPlanDays = async (planId: string) => {
    const { data: days } = await (supabase as any)
      .from('workout_plan_days')
      .select('*')
      .eq('plan_id', planId)
      .order('day_number', { ascending: true });
    setPlanDays((days || []) as WorkoutPlanDay[]);

    // Load exercises for each day
    const map: Record<string, PlanExercise[]> = {};
    await Promise.all(
      (days || []).map(async (day: WorkoutPlanDay) => {
        const { data: exs } = await (supabase as any)
          .from('workout_plan_exercises')
          .select('*, exercises(id, name, muscle_groups)')
          .eq('plan_day_id', day.id)
          .order('sort_order', { ascending: true });
        map[day.id] = (exs || []) as PlanExercise[];
      })
    );
    setPlanExercisesMap(map);
  };

  const handleTogglePlan = async (active: boolean) => {
    if (!editingUser) return;
    setIsTogglingPlan(true);

    if (active) {
      if (currentAssignmentId) {
        // Reactivate the existing assignment — never create a new plan
        const { error } = await (supabase as any)
          .from('user_workout_assignments')
          .update({ is_active: true })
          .eq('id', currentAssignmentId);

        if (error) {
          toast({ title: 'שגיאה', description: 'לא ניתן להפעיל תוכנית', variant: 'destructive' });
          setIsTogglingPlan(false);
          return;
        }
        setPlanActive(true);
        if (currentPlanId) await loadPlanDays(currentPlanId);
        toast({ title: 'הצלחה', description: 'תוכנית האימון הופעלה מחדש' });
      } else {
        // No existing plan at all — create one for the first time
        const planName = `תוכנית של ${editingUser.full_name || editingUser.email}`;
        const { data: newPlan, error: planError } = await (supabase as any)
          .from('workout_plans')
          .insert({ name: planName, user_id: editingUser.id, duration_weeks: 12, is_active: true })
          .select()
          .single();

        if (planError) {
          toast({ title: 'שגיאה', description: 'לא ניתן ליצור תוכנית', variant: 'destructive' });
          setIsTogglingPlan(false);
          return;
        }

        const { data: assign, error: assignError } = await (supabase as any)
          .from('user_workout_assignments')
          .insert({ user_id: editingUser.id, plan_id: newPlan.id, is_active: true, start_date: new Date().toISOString().split('T')[0] })
          .select()
          .single();

        if (assignError) {
          toast({ title: 'שגיאה', description: 'לא ניתן לשייך תוכנית', variant: 'destructive' });
        } else {
          setCurrentPlanId(newPlan.id);
          setCurrentAssignmentId(assign.id);
          setPlanActive(true);
          setPlanDays([]);
          setPlanExercisesMap({});
          toast({ title: 'הצלחה', description: 'תוכנית אימון נפתחה' });
        }
      }
    } else {
      // Deactivate — keep IDs so toggling back on reactivates without creating a new plan
      if (currentAssignmentId) {
        await (supabase as any)
          .from('user_workout_assignments')
          .update({ is_active: false })
          .eq('id', currentAssignmentId);
      }
      setPlanActive(false);
      toast({ title: 'הצלחה', description: 'תוכנית האימון הושבתה' });
    }
    setIsTogglingPlan(false);
  };

  const handleDayUnlock = async (dayId: string, unlocksWith: string | null) => {
    const { error } = await (supabase as any).from('workout_plan_days').update({ unlocks_with: unlocksWith }).eq('id', dayId);
    if (error) return toast({ title: 'לא נשמר, נסו שוב', variant: 'destructive' });
    setPlanDays(prev => prev.map(d => (d.id === dayId ? { ...d, unlocks_with: unlocksWith } : d)));
  };

  const handleAddDay = async () => {
    if (!currentPlanId || !newDayName.trim()) return;
    const nextNumber = planDays.length > 0 ? Math.max(...planDays.map(d => d.day_number)) + 1 : 1;
    const { data, error } = await (supabase as any)
      .from('workout_plan_days')
      .insert({ plan_id: currentPlanId, day_number: nextNumber, name: newDayName.trim() })
      .select()
      .single();
    if (error) { toast({ title: 'שגיאה', description: error.message, variant: 'destructive' }); return; }
    setPlanDays(prev => [...prev, data as WorkoutPlanDay]);
    setPlanExercisesMap(prev => ({ ...prev, [data.id]: [] }));
    setNewDayName('');
    setIsAddingDay(false);
  };

  const handleDeleteDay = async (dayId: string) => {
    const { error } = await (supabase as any).from('workout_plan_days').delete().eq('id', dayId);
    if (error) return toast({ title: 'לא נמחק, נסו שוב', variant: 'destructive' });
    setPlanDays(prev => prev.filter(d => d.id !== dayId));
    setPlanExercisesMap(prev => { const next = { ...prev }; delete next[dayId]; return next; });
  };

  const handleCloneDay = async (dayId: string) => {
    const sourceDay = planDays.find(d => d.id === dayId);
    if (!sourceDay || !currentPlanId) return;
    const nextNumber = planDays.length > 0 ? Math.max(...planDays.map(d => d.day_number)) + 1 : 1;
    const { data: newDay, error: dayError } = await (supabase as any)
      .from('workout_plan_days')
      .insert({ plan_id: currentPlanId, day_number: nextNumber, name: `${sourceDay.name} (עותק)`, notes: sourceDay.notes })
      .select().single();
    if (dayError) { toast({ title: 'שגיאה', description: dayError.message, variant: 'destructive' }); return; }
    const sourceExercises = planExercisesMap[dayId] || [];
    let clonedExercises: PlanExercise[] = [];
    if (sourceExercises.length > 0) {
      const { data: newExs } = await (supabase as any)
        .from('workout_plan_exercises')
        .insert(sourceExercises.map((pe, idx) => ({
          plan_day_id: newDay.id,
          exercise_id: pe.exercise_id,
          sets: pe.sets, reps_min: pe.reps_min, reps_max: pe.reps_max,
          rest_seconds: pe.rest_seconds, is_duration: pe.is_duration, sort_order: idx,
        })))
        .select('*, exercises(id, name, muscle_groups)');
      clonedExercises = (newExs || []) as PlanExercise[];
    }
    setPlanDays(prev => [...prev, newDay as WorkoutPlanDay]);
    setPlanExercisesMap(prev => ({ ...prev, [newDay.id]: clonedExercises }));
    toast({ title: 'יום אימון שוכפל' });
  };

  const handleAddExercise = async (dayId: string) => {
    if (!newExForm.exerciseId) return;
    const existing = planExercisesMap[dayId] || [];
    const isDuration = newExForm.useType === 'duration';
    const durSec = parseInt(newExForm.repsMin) || 30;
    const { data, error } = await (supabase as any)
      .from('workout_plan_exercises')
      .insert({
        plan_day_id: dayId,
        exercise_id: newExForm.exerciseId,
        sets: parseInt(newExForm.sets) || 3,
        reps_min: isDuration ? durSec : (parseInt(newExForm.repsMin) || 8),
        reps_max: isDuration ? durSec : (parseInt(newExForm.repsMax) || 12),
        rest_seconds: parseInt(newExForm.rest) || 60,
        is_duration: isDuration,
        sort_order: existing.length,
      })
      .select('*, exercises(id, name, muscle_groups)')
      .single();

    if (error) { toast({ title: 'שגיאה', description: error.message, variant: 'destructive' }); return; }
    setPlanExercisesMap(prev => ({ ...prev, [dayId]: [...(prev[dayId] || []), data as PlanExercise] }));
    setNewExForm({ exerciseId: '', sets: '3', repsMin: '8', repsMax: '12', rest: '60', useType: 'reps' });
    setAddExerciseDayId(null);
  };

  const handleUpdateExercise = async (pe: PlanExercise, updates: { sets: number; reps_min: number; reps_max: number; rest_seconds: number; is_duration: boolean }) => {
    const { error } = await (supabase as any)
      .from('workout_plan_exercises')
      .update(updates)
      .eq('id', pe.id);
    if (error) { toast({ title: 'שגיאה', description: error.message, variant: 'destructive' }); return; }
    setPlanExercisesMap(prev => ({
      ...prev,
      [pe.plan_day_id]: (prev[pe.plan_day_id] || []).map(e => e.id === pe.id ? { ...e, ...updates } : e),
    }));
    setEditingExercise(null);
    toast({ title: 'עודכן', description: 'התרגיל עודכן בהצלחה' });
  };

  const handleDeleteExercise = async (dayId: string, exId: string) => {
    await (supabase as any).from('workout_plan_exercises').delete().eq('id', exId);
    setPlanExercisesMap(prev => ({ ...prev, [dayId]: (prev[dayId] || []).filter(e => e.id !== exId) }));
  };

  const dndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const handleReorderExercises = async (dayId: string, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const exercises = planExercisesMap[dayId] || [];
    const oldIndex = exercises.findIndex(e => e.id === active.id);
    const newIndex = exercises.findIndex(e => e.id === over.id);
    const reordered = arrayMove(exercises, oldIndex, newIndex);
    setPlanExercisesMap(prev => ({ ...prev, [dayId]: reordered }));
    await Promise.all(
      reordered.map((e, idx) =>
        (supabase as any).from('workout_plan_exercises').update({ sort_order: idx }).eq('id', e.id)
      )
    );
  };

  // ── Workout session logs ──────────────────────────────────────────────────────

  const loadSessionLogs = async (sessionId: string) => {
    if (sessionLogsMap[sessionId] !== undefined) return;
    const { data } = await (supabase as any)
      .from('workout_exercise_logs')
      .select('exercise_id, set_number, reps, weight_kg, exercises(name)')
      .eq('session_id', sessionId)
      .order('set_number', { ascending: true });
    setSessionLogsMap(prev => ({ ...prev, [sessionId]: (data || []) as AdminExerciseLog[] }));
  };

  // ── Personal info save ───────────────────────────────────────────────────────

  /** The weights on the "נתונים" tab: only those columns, so nothing else is overwritten. */
  const handleSaveWeights = async () => {
    if (!editingUser) return;
    setIsSavingPersonal(true);
    const patch = {
      initial_weight: editPersonal.initial_weight ?? null,
      current_weight: editPersonal.current_weight ?? null,
      target_weight: editPersonal.target_weight ?? null,
    };
    const { error } = await supabase.from('profiles').update(patch).eq('id', editingUser.id);
    if (error) { toast({ title: 'שגיאה', description: error.message, variant: 'destructive' }); }
    else {
      toast({ title: 'נשמר' });
      setEditingUser(u => (u ? { ...u, ...patch } : u));
      setHeaderKey(k => k + 1);
      fetchUsers();
    }
    setIsSavingPersonal(false);
  };

  const handleDeleteWeightEntry = async (entryId: string) => {
    if (!editingUser) return;
    setDeletingWeightId(entryId);
    // .select() so a silent RLS no-op (0 rows affected, no error — e.g. the
    // admin DELETE policy on weight_log isn't applied yet) is distinguishable
    // from an actual delete.
    const { data, error } = await (supabase as any)
      .from('weight_log')
      .delete()
      .eq('id', entryId)
      .select('id');
    if (error || !data || data.length === 0) {
      toast({
        title: 'שגיאה',
        description: error?.message || 'המחיקה לא בוצעה (ייתכן שחסרה הרשאה במסד הנתונים)',
        variant: 'destructive',
      });
    } else {
      setWeightHistory(prev => prev.filter(w => w.id !== entryId));
      // profiles.current_weight is recomputed by the weight_log trigger
      const { data: refreshed } = await supabase
        .from('profiles')
        .select('current_weight')
        .eq('id', editingUser.id)
        .single();
      if (refreshed) {
        setEditPersonal(p => ({ ...p, current_weight: refreshed.current_weight ?? undefined }));
      }
      toast({ title: 'הצלחה', description: 'השקילה נמחקה' });
      fetchUsers();
    }
    setDeletingWeightId(null);
  };

  // ── Personal Habits ───────────────────────────────────────────────────────────

  const handleAddPersonalHabit = async () => {
    if (!editingUser || !newHabitName.trim()) return;
    setIsSavingHabit(true);
    const { data, error } = await (supabase as any)
      .from('habit_definitions')
      .insert({
        name: newHabitName.trim(),
        icon: newHabitIcon || 'target',
        week_start: 1,
        week_end: null,
        user_id: editingUser.id,
      })
      .select()
      .single();

    if (error) {
      toast({ title: 'שגיאה', description: error.message, variant: 'destructive' });
    } else {
      setPersonalHabits(prev => [...prev, data as Habit]);
      setNewHabitName('');
      setNewHabitIcon('target');
      setIsAddingPersonalHabit(false);
      toast({ title: 'הצלחה', description: 'ההרגל האישי נוסף' });
    }
    setIsSavingHabit(false);
  };

  const handleDeletePersonalHabit = async (habitId: string) => {
    await (supabase as any).from('habit_definitions').delete().eq('id', habitId);
    setPersonalHabits(prev => prev.filter(h => h.id !== habitId));
    toast({ title: 'הצלחה', description: 'ההרגל האישי נמחק' });
  };

  // ── Add user ─────────────────────────────────────────────────────────────────

  const handleAddUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.startDate) {
      toast({ title: 'שגיאה', description: 'אנא מלא את כל השדות', variant: 'destructive' });
      return;
    }
    if (!newUser.planDays) {
      toast({ title: 'שגיאה', description: 'צריך לבחור מסלול: 6 או 10 חודשים', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);

    // Everything else (name, body details, goal) comes from the trainee's
    // onboarding questionnaire on first login.
    const { data: fnData, error: fnError } = await supabase.functions.invoke('admin-create-user', {
      body: { email: newUser.email.trim(), password: newUser.password, start_date: newUser.startDate, plan_duration_days: newUser.planDays },
    });
    if (fnError || fnData?.error) {
      const msg = fnData?.error || fnError?.message || 'שגיאה ביצירת משתמש';
      toast({ title: 'שגיאה', description: msg, variant: 'destructive' });
    } else {
      toast({ title: 'הצלחה', description: 'המשתמש נוסף בהצלחה' });
      setNewUser({ email: '', password: '', startDate: nextSaturday(), planDays: 0 });
      setIsAddOpen(false);
      fetchUsers();
    }
    setIsSubmitting(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">ניהול מתאמנים</h2>
          <p className="text-muted-foreground text-sm">{users.length} מתאמנים רשומים</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 ml-2" />הוסף מתאמן</Button>
          </DialogTrigger>
          <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto max-w-md">
            <DialogHeader><DialogTitle>הוספת מתאמן חדש</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label>אימייל</Label>
                <Input type="email" placeholder="email@example.com" dir="ltr" className="text-left" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>סיסמה</Label>
                <Input type="password" placeholder="••••••••" dir="ltr" className="text-left" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>תאריך התחלה</Label>
                {/* The program starts on a Saturday: any other day snaps to the next Saturday. */}
                <Input type="date" dir="ltr" className="text-left" value={newUser.startDate} onChange={e => setNewUser(p => ({ ...p, startDate: e.target.value ? nextSaturday(new Date(`${e.target.value}T12:00:00`)) : '' }))} />
                <p className="text-xs text-muted-foreground">התהליך מתחיל תמיד ביום שבת. תאריך אחר יעבור לשבת הקרובה אחריו.</p>
                {newUser.startDate && (() => {
                  const d = differenceInDays(new Date(), new Date(newUser.startDate)) + 1;
                  return (
                    <p className={`text-xs font-medium ${d > 0 ? 'text-success' : 'text-destructive'}`}>
                      {d > 0 ? `יום ${d} בתוכנית` : 'תאריך עתידי: התוכן יהיה נעול עד אז'}
                    </p>
                  );
                })()}
              </div>
              <div className="space-y-1">
                <Label>מסלול</Label>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="מסלול">
                  {TRACKS.map(t => (
                    <Button
                      key={t.days}
                      type="button"
                      role="radio"
                      aria-checked={newUser.planDays === t.days}
                      variant={newUser.planDays === t.days ? 'default' : 'outline'}
                      onClick={() => setNewUser(p => ({ ...p, planDays: t.days }))}
                    >
                      {t.label}
                    </Button>
                  ))}
                </div>
                {newUser.planDays > 0 && newUser.startDate && (
                  <p className="text-xs text-muted-foreground">
                    {newUser.planDays / 7} שבועות · מסתיים ב-{format(new Date(`${programEnd(newUser.startDate, newUser.planDays)}T12:00:00`), 'd.M.yyyy')}
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">שאר הפרטים (שם, גיל, גובה, משקל, מטרה) המתאמן ממלא בשאלון הפתיחה בכניסה הראשונה.</p>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <Button variant="outline" onClick={() => setIsAddOpen(false)} disabled={isSubmitting}>ביטול</Button>
                <Button onClick={handleAddUser} disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}הוסף מתאמן
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Users table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">שם</TableHead>
                  <TableHead className="text-right">אימייל</TableHead>
                  <TableHead className="text-right">יום</TableHead>
                  <TableHead className="text-right">מסלול</TableHead>
                  <TableHead className="text-right">משקל</TableHead>
                  <TableHead className="text-right">סטטוס</TableHead>
                  <TableHead className="text-right">נתוני מתאמן</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(user => (
                  <TableRow key={user.id} className="cursor-pointer" onClick={() => openEdit(user)}>
                    <TableCell className="font-medium">{user.full_name || '-'}</TableCell>
                    <TableCell dir="ltr" className="text-left text-sm">{user.email}</TableCell>
                    <TableCell>{calcCurrentDay(user.start_date)}</TableCell>
                    <TableCell className="whitespace-nowrap">{trackLabel(user.plan_duration_days)}</TableCell>
                    <TableCell>{user.current_weight ? `${user.current_weight} ק"ג` : '-'}</TableCell>
                    <TableCell>
                      <Badge variant={user.is_active ? 'default' : 'secondary'}>{user.is_active ? 'פעיל' : 'לא פעיל'}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(user)}>
                          <UserIcon className="h-4 w-4 ml-1" />נתונים
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeletingUser(user)}
                        >
                          <Trash2 className="h-4 w-4" />
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

      {/* ── The client panel: a wide drawer with a sticky header and tabs ── */}
      <ClientDrawer open={!!editingUser} onClose={closeEdit} title={editingUser?.full_name || editingUser?.email || 'מתאמן'}>
        {editingUser && (
          // Phone: the header scrolls away and the tabs stay on top. Wider: header and tabs stay, the tab scrolls.
          <Tabs defaultValue="personal" dir="rtl" className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain sm:overflow-hidden">
            <div className="bg-card sm:shrink-0">
              <ClientHeader user={editingUser} data={headerData} onClose={closeEdit} />
              <div ref={setHeaderEl} className="h-px" aria-hidden />
            </div>
            <div className="sticky top-0 z-20 border-b border-border bg-card px-3 pb-2 pt-1 sm:static sm:shrink-0 sm:px-6 sm:pb-3">
              {headerGone && (
                <div className="flex items-center gap-2 pb-1 sm:hidden">
                  <p className="min-w-0 flex-1 truncate text-body font-bold">{editingUser.full_name || editingUser.email}</p>
                  <button type="button" onClick={closeEdit} aria-label="סגירה" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-pill text-muted-foreground">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              )}
                <TabsList className="grid h-auto w-full grid-cols-6 gap-1 rounded-inner bg-card-inner p-1">
                  {([
                    ['personal', 'פרטים', UserIcon],
                    ['body', 'נתונים', Scale],
                    ['habits', 'הרגלים', Repeat2],
                    ['workout', 'אימון', Dumbbell],
                    ['survey', 'שאלון', ClipboardList],
                    ['bot', 'בוט', Bot],
                  ] as const).map(([v, label, Icon]) => (
                    <TabsTrigger key={v} value={v} className="flex h-auto min-h-[44px] flex-col gap-0.5 rounded-[12px] px-0 py-1 text-[11px] font-semibold data-[state=active]:bg-card data-[state=active]:shadow-sm sm:min-h-0 sm:flex-row sm:gap-1.5 sm:py-2 sm:text-label">
                      <Icon className="h-4 w-4" />{label}
                    </TabsTrigger>
                  ))}
                </TabsList>
            </div>

            <div className="sm:min-h-0 sm:flex-1 sm:overflow-y-auto">
            {/* ── Tab 1: Details (personal, process, danger zone) ── */}
            <TabsContent value="personal" className="mt-0 min-h-full">
              <DetailsTab
                user={editingUser}
                onSaved={(patch) => {
                  setEditingUser(u => (u ? { ...u, ...(patch as Partial<User>) } : u));
                  setEditPersonal(p => ({ ...p, ...(patch as Partial<User>) }));
                  setHeaderKey(k => k + 1);
                  fetchUsers();
                }}
              />
            </TabsContent>

            {/* ── Tab: Bot (WhatsApp group, switches, what we know) ── */}
            <TabsContent value="bot" className="mt-0">
              <BotTab userId={editingUser.id} onChanged={() => setHeaderKey(k => k + 1)} />
            </TabsContent>

            {/* ── Tab 2: Body / Weight ── */}
            <TabsContent value="body" className="mt-0 px-4 pb-6 pt-4 space-y-4 sm:px-6 sm:pt-5">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'משקל התחלתי (ק"ג)', key: 'initial_weight' },
                  { label: 'משקל נוכחי (ק"ג)', key: 'current_weight' },
                  { label: 'משקל יעד (ק"ג)', key: 'target_weight' },
                ].map(f => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-xs">{f.label}</Label>
                    <Input type="number" step="0.1" dir="ltr" className="text-left"
                      value={(editPersonal as any)[f.key] ?? ''}
                      onChange={e => setEditPersonal(p => ({ ...p, [f.key]: parseFloat(e.target.value) || undefined }))}
                      placeholder="0.0" />
                  </div>
                ))}
              </div>
              <Button onClick={handleSaveWeights} disabled={isSavingPersonal} size="sm">
                {isSavingPersonal && <Loader2 className="h-3.5 w-3.5 ml-1 animate-spin" />}שמור משקלים
              </Button>

              {/* Weight chart */}
              {weightHistory.length > 0 ? (
                <div>
                  <p className="text-sm font-medium mb-2">היסטוריית משקל</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={weightHistory.map(w => ({
                      date: format(new Date(w.recorded_at), 'dd/MM', { locale: he }),
                      weight: w.weight,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => [`${v} ק"ג`, 'משקל']} />
                      <Line type="monotone" dataKey="weight" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm text-center py-4">אין היסטוריית משקל עדיין</p>
              )}

              {/* Weight entries list — manage/delete individual weigh-ins */}
              {weightHistory.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">כל השקילות</p>
                  <div className="max-h-56 overflow-y-auto space-y-1 rounded-lg border border-border p-1.5">
                    {[...weightHistory].reverse().map(w => (
                      <div
                        key={w.id}
                        className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5 text-sm"
                      >
                        <span className="text-muted-foreground">
                          {format(new Date(w.recorded_at), 'dd/MM/yyyy', { locale: he })}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{w.weight} ק"ג</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteWeightEntry(w.id)}
                            disabled={deletingWeightId === w.id}
                            className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                          >
                            {deletingWeightId === w.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Steps section */}
              {(() => {
                // Build a full 7-day scaffold — null for missing days (no bar drawn)
                const today = new Date();
                const stepsMap = new Map(stepsData.map(s => [s.date, s.steps]));
                const last7 = Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(today);
                  d.setDate(today.getDate() - (6 - i));
                  const dateKey = d.toISOString().split('T')[0];
                  const val = stepsMap.get(dateKey);
                  return { date: format(d, 'dd/MM', { locale: he }), steps: val ?? null };
                });
                const avg7Days = last7.filter(d => d.steps != null) as { date: string; steps: number }[];
                const avg7 = avg7Days.length ? Math.round(avg7Days.reduce((a, b) => a + b.steps, 0) / avg7Days.length) : null;
                const avg30Days = stepsData.filter(s => s.steps > 0);
                const avg30 = avg30Days.length ? Math.round(avg30Days.reduce((a, b) => a + b.steps, 0) / avg30Days.length) : null;
                return (
                  <div className="border-t border-border pt-4 space-y-3">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Footprints className="h-4 w-4 text-primary" />
                      נתוני צעדים (7 ימים אחרונים)
                    </p>
                    {stepsData.length === 0 ? (
                      <p className="text-muted-foreground text-sm text-center py-3">אין נתוני צעדים עדיין</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-muted/40 rounded-xl p-3 text-center">
                            <p className="text-xs text-muted-foreground mb-1">ממוצע 7 ימים</p>
                            <p className="text-xl font-bold text-primary">{avg7 != null ? avg7.toLocaleString() : '—'}</p>
                            <p className="text-xs text-muted-foreground">צעדים/יום</p>
                          </div>
                          <div className="bg-muted/40 rounded-xl p-3 text-center">
                            <p className="text-xs text-muted-foreground mb-1">ממוצע 30 ימים</p>
                            <p className="text-xl font-bold text-primary">{avg30 != null ? avg30.toLocaleString() : '—'}</p>
                            <p className="text-xs text-muted-foreground">צעדים/יום</p>
                          </div>
                        </div>
                        <ResponsiveContainer width="100%" height={150}>
                          <BarChart data={last7}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={4} />
                            <YAxis tick={{ fontSize: 9 }} />
                            <Tooltip formatter={(v: number) => [v.toLocaleString(), 'צעדים']} />
                            <Bar dataKey="steps" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </>
                    )}
                  </div>
                );
              })()}

              {/* Circumferences and body photos */}
              {editingUser && <BodyProgressSection userId={editingUser.id} />}
            </TabsContent>

            {/* ── Tab 3: Habits ── */}
            <TabsContent value="habits" className="mt-0 px-4 pb-6 pt-4 space-y-4 sm:px-6 sm:pt-5">
              {/* Global habits */}
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">הרגלים כלליים</p>
                {habits.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-3">אין הרגלים פעילים לשבוע זה</p>
                ) : (
                  habits.map(h => {
                    const done = habitCompletion[h.id] || 0;
                    const pct = Math.min(100, (done / 7) * 100);
                    return (
                      <div key={h.id} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2">
                            {h.icon && <span>{h.icon}</span>}
                            {h.name}
                          </span>
                          <span className="text-muted-foreground text-xs">{done}/7 ימים</span>
                        </div>
                        <Progress value={pct} className="h-2" />
                      </div>
                    );
                  })
                )}
              </div>

              {/* Personal habits */}
              <div className="space-y-3 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    הרגלים אישיים
                  </p>
                  {!isAddingPersonalHabit && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => setIsAddingPersonalHabit(true)}
                    >
                      <Plus className="h-3 w-3" />הוסף
                    </Button>
                  )}
                </div>

                {personalHabits.length === 0 && !isAddingPersonalHabit && (
                  <p className="text-muted-foreground text-xs text-center py-2">אין הרגלים אישיים עדיין</p>
                )}

                {personalHabits.map(h => {
                  const done = habitCompletion[h.id] || 0;
                  const pct = Math.min(100, (done / 7) * 100);
                  return (
                    <div key={h.id} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          {h.icon && <span>{h.icon}</span>}
                          {h.name}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-xs">{done}/7 ימים</span>
                          <button
                            onClick={() => handleDeletePersonalHabit(h.id)}
                            className="p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <Progress value={pct} className="h-2" />
                    </div>
                  );
                })}

                {isAddingPersonalHabit && (
                  <div className="space-y-2 p-3 bg-muted/40 rounded-xl border border-border">
                    <div className="space-y-1">
                      <Label className="text-xs">שם ההרגל</Label>
                      <Input
                        placeholder="למשל: שתיית ויטמינים"
                        value={newHabitName}
                        onChange={e => setNewHabitName(e.target.value)}
                        className="h-8 text-sm"
                        autoFocus
                        onKeyDown={e => e.key === 'Enter' && handleAddPersonalHabit()}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">אייקון</Label>
                      <select
                        value={newHabitIcon}
                        onChange={e => setNewHabitIcon(e.target.value)}
                        className="w-full h-8 text-sm rounded-md border border-input bg-background px-2"
                      >
                        {['target', 'droplets', 'footprints', 'timer', 'moon', 'apple', 'dumbbell'].map(ic => (
                          <option key={ic} value={ic}>{ic}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={handleAddPersonalHabit}
                        disabled={isSavingHabit || !newHabitName.trim()}
                      >
                        {isSavingHabit && <Loader2 className="h-3 w-3 ml-1 animate-spin" />}
                        הוסף הרגל
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => { setIsAddingPersonalHabit(false); setNewHabitName(''); }}
                      >
                        ביטול
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Tab 4: Workout Plan ── */}
            <TabsContent value="workout" className="mt-0 px-4 pb-6 pt-4 space-y-4 sm:px-6 sm:pt-5">
              {/* The workout bot: a plan it built (waiting for us), or build one */}
              <TraineePlanBot userId={editingUser.id} hasDays={planDays.length > 0} onApplied={reloadWorkoutPlan} />

              {/* Toggle */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                <div>
                  <p className="font-medium text-sm">תוכנית אימון פעילה</p>
                  <p className="text-xs text-muted-foreground">
                    {planActive
                      ? 'תוכנית קיימת — ערוך ימים ותרגילים למטה'
                      : planDays.length > 0
                        ? 'כבויה: המתאמן עוד לא רואה אותה. הדלק כשהיא מוכנה'
                        : 'אין תוכנית — הפעל כדי ליצור'}
                  </p>
                </div>
                <Switch
                  checked={planActive}
                  onCheckedChange={handleTogglePlan}
                  disabled={isTogglingPlan}
                />
              </div>

              {(planActive || planDays.length > 0) && (
                <div className="space-y-3">
                  {!planActive && (
                    <p className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                      התוכנית כבויה. כך היא תיראה כשתדליקו: כל יום נפתח לפי מה שמסומן לידו (מיד, אחרי סרטון 5–6 או אחרי סרטון 9–10).
                    </p>
                  )}
                  {/* Days list */}
                  {planDays.map(day => (
                    <div key={day.id} className="border border-border rounded-xl overflow-hidden">
                      {/* Day header */}
                      <div
                        className="flex items-center justify-between px-4 py-3 bg-card cursor-pointer"
                        onClick={() => setExpandedDays(prev => {
                          const next = new Set(prev);
                          next.has(day.id) ? next.delete(day.id) : next.add(day.id);
                          return next;
                        })}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                            {day.day_number}
                          </span>
                          <span className="font-medium text-sm">{day.name}</span>
                          {/* Built ahead: when the trainee gets this day (and picks its weekday). */}
                          <select
                            aria-label="מתי האימון נפתח"
                            value={day.unlocks_with ?? ''}
                            onClick={e => e.stopPropagation()}
                            onChange={e => handleDayUnlock(day.id, e.target.value || null)}
                            className="h-8 rounded-md border border-border bg-background px-1 text-xs"
                          >
                            <option value="">נפתח מיד</option>
                            <option value="workout_1">אחרי סרטון 5–6</option>
                            <option value="workout_2">אחרי סרטון 9–10</option>
                          </select>
                          <Badge variant="secondary" className="text-xs">
                            {(planExercisesMap[day.id] || []).length} תרגילים
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={e => { e.stopPropagation(); handleCloneDay(day.id); }}
                            className="p-1 text-muted-foreground hover:text-primary transition-colors"
                            title="שכפל יום אימון"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setDeletingDay(day); }}
                            title="מחק יום אימון"
                            className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          {expandedDays.has(day.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </div>

                      {/* Day exercises */}
                      {expandedDays.has(day.id) && (
                        <div className="px-4 pb-3 pt-1 space-y-2 border-t border-border">
                          <DndContext
                            sensors={dndSensors}
                            collisionDetection={closestCenter}
                            onDragEnd={e => handleReorderExercises(day.id, e)}
                          >
                            <SortableContext
                              items={(planExercisesMap[day.id] || []).map(e => e.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              {(planExercisesMap[day.id] || []).map(pe => (
                                <SortableExerciseRow
                                  key={pe.id}
                                  pe={pe}
                                  editingExercise={editingExercise}
                                  setEditingExercise={setEditingExercise}
                                  onSave={updates => handleUpdateExercise(pe, updates)}
                                  onDelete={() => handleDeleteExercise(day.id, pe.id)}
                                />
                              ))}
                            </SortableContext>
                          </DndContext>

                          {/* Add exercise form */}
                          {addExerciseDayId === day.id ? (
                            <div className="space-y-2 pt-2 border-t border-border/50">
                              {/* ── Step 1: Equipment type ── */}
                              {!exEquipFilter ? (
                                <div className="space-y-1.5">
                                  <p className="text-[11px] text-muted-foreground font-medium">סוג ציוד:</p>
                                  <div className="flex flex-col gap-1.5">
                                    {EQUIP_CATEGORIES.map(cat => (
                                      <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => setExEquipFilter(cat.id)}
                                        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium bg-secondary hover:bg-primary hover:text-primary-foreground transition-colors text-right"
                                      >
                                        <span>{cat.icon}</span>
                                        <span>{cat.label}</span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : !exMuscleFilter ? (
                                /* ── Step 2: Muscle group ── */
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1 mb-1">
                                    <button
                                      type="button"
                                      onClick={() => setExEquipFilter(null)}
                                      className="text-[11px] text-primary underline"
                                    >
                                      ← חזרה
                                    </button>
                                    <span className="text-[11px] text-muted-foreground">
                                      · {EQUIP_CATEGORIES.find(c => c.id === exEquipFilter)?.label}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground font-medium">אזור גוף:</p>
                                  <div className="grid grid-cols-2 gap-1.5">
                                    {MUSCLE_GROUPS.map(mg => (
                                      <button
                                        key={mg.id}
                                        type="button"
                                        onClick={() => setExMuscleFilter(mg.id)}
                                        className="px-2 py-1.5 rounded-lg text-xs font-medium bg-secondary hover:bg-primary hover:text-primary-foreground transition-colors"
                                      >
                                        {mg.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                /* ── Step 3: Filtered exercise list ── */
                                (() => {
                                  const equipCat = EQUIP_CATEGORIES.find(c => c.id === exEquipFilter)!;
                                  const muscleCat = MUSCLE_GROUPS.find(m => m.id === exMuscleFilter)!;
                                  const filtered = exerciseLibrary.filter(e => {
                                    const equipOk = equipCat.match(e.equipment);
                                    const muscleOk = (e.muscle_groups || []).some(mg =>
                                      muscleCat.match.some(kw => mg.toLowerCase().includes(kw))
                                    );
                                    return equipOk && muscleOk;
                                  });
                                  return (
                                    <div className="space-y-1.5">
                                      <div className="flex items-center gap-1 mb-1">
                                        <button
                                          type="button"
                                          onClick={() => { setExMuscleFilter(null); setNewExForm(p => ({ ...p, exerciseId: '' })); }}
                                          className="text-[11px] text-primary underline"
                                        >
                                          ← חזרה
                                        </button>
                                        <span className="text-[11px] text-muted-foreground">
                                          · {equipCat.label} · {muscleCat.label}
                                        </span>
                                      </div>
                                      {filtered.length === 0 ? (
                                        <p className="text-xs text-muted-foreground py-2 text-center">אין תרגילים מתאימים</p>
                                      ) : (
                                        <Select value={newExForm.exerciseId} onValueChange={v => setNewExForm(p => ({ ...p, exerciseId: v }))}>
                                          <SelectTrigger className="text-sm">
                                            <SelectValue placeholder="בחר תרגיל..." />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {filtered.map(e => (
                                              <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      )}
                                    </div>
                                  );
                                })()
                              )}
                              {/* Type toggle: reps / duration */}
                              <div className="flex gap-1">
                                <button type="button"
                                  onClick={() => setNewExForm(p => ({ ...p, useType: 'reps' }))}
                                  className={`flex-1 text-xs py-1 rounded-md transition-colors ${newExForm.useType === 'reps' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                  חזרות
                                </button>
                                <button type="button"
                                  onClick={() => setNewExForm(p => ({ ...p, useType: 'duration' }))}
                                  className={`flex-1 text-xs py-1 rounded-md transition-colors ${newExForm.useType === 'duration' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                  שניות
                                </button>
                              </div>
                              <div className={`grid gap-1.5 text-xs ${newExForm.useType === 'duration' ? 'grid-cols-3' : 'grid-cols-4'}`}>
                                {[
                                  { key: 'sets', label: 'סטים' },
                                  ...(newExForm.useType === 'duration'
                                    ? [{ key: 'repsMin', label: 'שנ׳' }]
                                    : [{ key: 'repsMin', label: 'חז׳ מינ' }, { key: 'repsMax', label: 'חז׳ מקס' }]
                                  ),
                                  { key: 'rest', label: 'מנוחה שנ׳' },
                                ].map(f => (
                                  <div key={f.key} className="space-y-0.5">
                                    <label className="text-muted-foreground">{f.label}</label>
                                    <Input type="number" className="h-7 text-xs text-center" dir="ltr"
                                      value={(newExForm as any)[f.key]}
                                      onChange={e => setNewExForm(p => ({ ...p, [f.key]: e.target.value }))} />
                                  </div>
                                ))}
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" className="flex-1 text-xs h-8" onClick={() => handleAddExercise(day.id)}>הוסף</Button>
                                <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => { setAddExerciseDayId(null); setExEquipFilter(null); setExMuscleFilter(null); }}>ביטול</Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full text-xs h-7 text-primary mt-1"
                              onClick={() => { setAddExerciseDayId(day.id); setNewExForm({ exerciseId: '', sets: '3', repsMin: '8', repsMax: '12', rest: '60', useType: 'reps' }); setExEquipFilter(null); setExMuscleFilter(null); setEditingExercise(null); }}
                            >
                              <Plus className="h-3 w-3 ml-1" />הוסף תרגיל
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Add day */}
                  {isAddingDay ? (
                    <div className="flex gap-2">
                      <Input
                        className="flex-1"
                        placeholder="שם היום (למשל: חזה וטריצפס)"
                        value={newDayName}
                        onChange={e => setNewDayName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddDay()}
                      />
                      <Button size="sm" onClick={handleAddDay}>הוסף</Button>
                      <Button size="sm" variant="outline" onClick={() => setIsAddingDay(false)}>X</Button>
                    </div>
                  ) : (
                    <Button variant="outline" className="w-full gap-1.5" onClick={() => setIsAddingDay(true)}>
                      <Plus className="h-4 w-4" />הוסף יום אימון
                    </Button>
                  )}
                </div>
              )}
              {/* ── Walking Schedule ── */}
              <div className="border-t border-border pt-4 mt-2">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <Footprints className="h-4 w-4 text-primary" />
                    הליכות שבועיות
                  </p>
                  {!adminWalks.find(w => w.walk_number === 1) && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                      onClick={async () => {
                        await (supabase as any).from('user_walking_schedule')
                          .insert({ user_id: editingUser!.id, walk_number: 1, week_start: 1 });
                        loadAdminWalks(editingUser!.id);
                      }}>
                      <Plus className="h-3 w-3" />הוסף הליכה
                    </Button>
                  )}
                  {adminWalks.find(w => w.walk_number === 1) && !adminWalks.find(w => w.walk_number === 2) && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                      onClick={async () => {
                        await (supabase as any).from('user_walking_schedule')
                          .insert({ user_id: editingUser!.id, walk_number: 2, week_start: 4 });
                        loadAdminWalks(editingUser!.id);
                      }}>
                      <Plus className="h-3 w-3" />הוסף הליכה שנייה
                    </Button>
                  )}
                </div>
                {adminWalks.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">לא הוגדרו הליכות</p>
                ) : (
                  <div className="space-y-3">
                    {adminWalks.map(walk => (
                      <div key={walk.id} className="border border-border rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">
                            הליכה {walk.walk_number === 1 ? 'ראשונה' : 'שנייה'}
                            <span className="text-xs text-muted-foreground font-normal mr-2">
                              {walk.day_of_week !== null ? `יום ${WEEKDAY_LABELS[walk.day_of_week]}` : 'יום לא נקבע'}
                            </span>
                          </p>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{walk.is_active ? 'פעיל' : 'מושבת'}</span>
                            <Switch
                              checked={walk.is_active}
                              onCheckedChange={async (val) => {
                                await (supabase as any).from('user_walking_schedule')
                                  .update({ is_active: val }).eq('id', walk.id);
                                loadAdminWalks(editingUser!.id);
                              }}
                            />
                          </div>
                        </div>
                        {walk.is_active && (
                          <div className="flex gap-1">
                            {WEEKDAY_LABELS.map((label, wd) => (
                              <button
                                key={wd}
                                onClick={async () => {
                                  const newDay = walk.day_of_week === wd ? null : wd;
                                  await (supabase as any).from('user_walking_schedule')
                                    .update({ day_of_week: newDay }).eq('id', walk.id);
                                  loadAdminWalks(editingUser!.id);
                                }}
                                className={cn(
                                  'flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all',
                                  walk.day_of_week === wd
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                )}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        )}
                        {walk.is_active && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full text-xs h-7 gap-1 text-green-600 border-green-500/40 hover:bg-success/10"
                            onClick={async () => {
                              const today = new Date().toISOString().split('T')[0];
                              const { data: existing } = await (supabase as any)
                                .from('activity_log')
                                .select('id')
                                .eq('user_id', editingUser!.id)
                                .eq('activity_type', 'walk')
                                .eq('completed_at', today);
                              if (existing && existing.length > 0) {
                                toast({ title: 'כבר סומן', description: 'הליכה כבר נרשמה היום' });
                                return;
                              }
                              await (supabase as any).from('activity_log').insert({
                                user_id: editingUser!.id,
                                activity_type: 'walk',
                                completed_at: today,
                              });
                              const { data: walkData } = await (supabase as any)
                                .from('activity_log')
                                .select('id, completed_at')
                                .eq('user_id', editingUser!.id)
                                .eq('activity_type', 'walk')
                                .order('completed_at', { ascending: false })
                                .limit(30);
                              setWalkHistory((walkData || []) as { id: string; completed_at: string }[]);
                              toast({ title: 'הליכה נרשמה ✓', description: `נרשמה עבור ${editingUser!.full_name || editingUser!.email}` });
                            }}
                          >
                            <Check className="h-3 w-3" />
                            סמן כהושלמה היום
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── What the trainee added on their own (planned + logged) ── */}
              <OwnActivitiesSection userId={editingUser.id} />

              {/* ── Workout History ── */}
              <div className="border-t border-border pt-4 mt-2">
                <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  היסטוריית אימונים והליכות
                  <span className="text-xs font-normal text-muted-foreground mr-auto">
                    {workoutSessions.length} אימונים · {walkHistory.length} הליכות
                  </span>
                </p>

                {workoutSessions.length === 0 && walkHistory.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-4">לא בוצעו אימונים או הליכות עדיין</p>
                ) : (
                  <div className="space-y-2">
                    {/* Walks */}
                    {walkHistory.map(w => (
                      <div key={w.id} className="border border-green-500/25 rounded-xl">
                        <div className="flex items-center gap-2.5 px-3 py-2.5 bg-success/5">
                          <div className="w-7 h-7 rounded-lg bg-success/20 flex items-center justify-center flex-shrink-0">
                            <Footprints className="h-3.5 w-3.5 text-success" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">הליכה</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(w.completed_at), 'EEEE, d בMMMM yyyy', { locale: he })}
                            </p>
                          </div>
                          <Badge className="mr-auto bg-success/15 text-green-600 border-0 text-xs">הושלם ✓</Badge>
                        </div>
                      </div>
                    ))}
                    {/* Workouts */}
                    {workoutSessions.map(ws => {
                      const isExpanded = expandedSessionId === ws.id;
                      const logs = sessionLogsMap[ws.id];
                      const dateStr = format(new Date(ws.completed_at), 'dd/MM/yy HH:mm', { locale: he });
                      const dayName = ws.workout_plan_days?.name ?? 'אימון';

                      const byExercise: Record<string, AdminExerciseLog[]> = {};
                      if (logs) {
                        logs.forEach(l => {
                          if (!byExercise[l.exercise_id]) byExercise[l.exercise_id] = [];
                          byExercise[l.exercise_id].push(l);
                        });
                      }

                      return (
                        <div key={ws.id} className="border border-border rounded-xl overflow-hidden">
                          <div
                            className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => {
                              if (isExpanded) {
                                setExpandedSessionId(null);
                              } else {
                                setExpandedSessionId(ws.id);
                                loadSessionLogs(ws.id);
                              }
                            }}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                                <Dumbbell className="h-3.5 w-3.5 text-primary" />
                              </div>
                              <div>
                                <p className="text-sm font-medium">{dayName}</p>
                                <p className="text-xs text-muted-foreground">{dateStr}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {ws.duration_minutes != null && ws.duration_minutes > 0 && (
                                <Badge variant="outline" className="text-xs gap-1">
                                  <Clock className="h-2.5 w-2.5" />
                                  {ws.duration_minutes} דק'
                                </Badge>
                              )}
                              {isExpanded
                                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              }
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="px-3 pb-3 pt-2 border-t border-border bg-muted/20">
                              {logs === undefined ? (
                                <div className="flex justify-center py-3">
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                </div>
                              ) : Object.keys(byExercise).length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-2">אין פרטי תרגילים</p>
                              ) : (
                                <div className="space-y-3">
                                  {Object.entries(byExercise).map(([exerciseId, sets]) => {
                                    const exerciseName = sets[0]?.exercises?.name ?? 'תרגיל';
                                    return (
                                      <div key={exerciseId}>
                                        <p className="text-xs font-semibold mb-1.5">{exerciseName}</p>
                                        <div className="grid grid-cols-4 gap-1.5">
                                          {sets.map(s => (
                                            <div
                                              key={s.set_number}
                                              className="bg-card border border-border/60 rounded-lg px-1.5 py-2 text-center"
                                            >
                                              <p className="text-xs text-muted-foreground mb-0.5">סט {s.set_number}</p>
                                              <p className="text-sm font-bold">{s.reps}</p>
                                              <p className="text-xs text-muted-foreground">חז'</p>
                                              {s.weight_kg > 0 && (
                                                <p className="text-xs text-primary font-medium mt-0.5">{s.weight_kg}ק"ג</p>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Tab 5: Questionnaires: the opening one, then the weekly ones ── */}
            <TabsContent value="survey" className="mt-0 space-y-6 px-4 pb-6 pt-4 sm:px-6 sm:pt-5">
              <section className="space-y-3">
                <h3 className="text-card-title">שאלון פתיחה</h3>
                <OnboardingAnswersTab userId={editingUser.id} />
              </section>
              <section className="space-y-3">
                <h3 className="text-card-title">שאלונים שבועיים</h3>
              {isLoadingCheckins ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                </div>
              ) : checkins.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">לא נמצאו שאלונים שמולאו עדיין</p>
              ) : (
                <Accordion type="single" collapsible className="space-y-2">
                  {checkins.map(ci => (
                    <AccordionItem key={ci.week_number} value={String(ci.week_number)} className="border border-border rounded-xl px-4">
                      <AccordionTrigger className="text-sm py-3 hover:no-underline">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline">שבוע {ci.week_number}</Badge>
                          <span className="text-muted-foreground text-xs">
                            {format(new Date(ci.submitted_at), 'dd/MM/yyyy', { locale: he })}
                          </span>
                          {ci.weight_today && (
                            <span className="text-xs font-medium">{ci.weight_today} ק"ג</span>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        {ci.answers?.items?.length ? (
                          // Survey v2: the questions as asked, with their answers.
                          <div className="space-y-2 pb-2 text-sm">
                            {ci.answers.workouts && <Badge variant="secondary">כולל שאלות התקדמות באימונים</Badge>}
                            {ci.answers.items.map((it) => {
                              const habit = it.key.startsWith('habit:');
                              return (
                                <div key={it.key} className="rounded-lg bg-muted/40 px-3 py-2">
                                  <p className="text-muted-foreground">{it.question}</p>
                                  <p className={`mt-0.5 font-medium ${habit ? scoreColor(Number(it.answer)) : ''}`}>
                                    {it.key === 'weight' ? `${it.answer} ק"ג` : habit ? `${it.answer}/10` : it.answer}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm pb-2">
                          {ci.last_weigh_in &&<div><span className="text-muted-foreground">שקילה קודמת:</span> {ci.last_weigh_in} ק"ג</div>}
                          {ci.weight_today && <div><span className="text-muted-foreground">משקל היום:</span> {ci.weight_today} ק"ג</div>}
                          {ci.sleep_hours != null && <div><span className="text-muted-foreground">שינה:</span> {ci.sleep_hours} שעות</div>}
                          {ci.had_bowel_issues != null && <div><span className="text-muted-foreground">תקיעות:</span> {ci.had_bowel_issues ? 'כן' : 'לא'}</div>}
                          {ci.met_last_goal != null && <div><span className="text-muted-foreground">עמד ביעד:</span> {ci.met_last_goal ? 'כן ✓' : 'לא ✗'}</div>}
                          {[
                            { key: 'habits_score', label: 'הרגלים' },
                            { key: 'walking_score', label: 'הליכות' },
                            { key: 'hunger_score', label: 'רעב' },
                            { key: 'energy_score', label: 'אנרגיה' },
                            { key: 'water_score', label: 'מים' },
                          ].map(s => {
                            const val = (ci as any)[s.key] as number | null;
                            return val != null ? (
                              <div key={s.key}>
                                <span className="text-muted-foreground">{s.label}:</span>{' '}
                                <span className={`font-semibold ${scoreColor(val)}`}>{val}/10</span>
                              </div>
                            ) : null;
                          })}
                          {ci.proud_of && (
                            <div className="col-span-2">
                              <span className="text-muted-foreground">גאה ב:</span>
                              <p className="mt-0.5">{ci.proud_of}</p>
                            </div>
                          )}
                          {ci.to_improve && (
                            <div className="col-span-2">
                              <span className="text-muted-foreground">לשיפור:</span>
                              <p className="mt-0.5">{ci.to_improve}</p>
                            </div>
                          )}
                        </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
              </section>
            </TabsContent>
            </div>
          </Tabs>
        )}
      </ClientDrawer>

      {/* ── Delete Workout Day Confirmation ── */}
      <AlertDialog open={!!deletingDay} onOpenChange={(o) => { if (!o) setDeletingDay(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת יום אימון</AlertDialogTitle>
            <AlertDialogDescription>
              למחוק את <span className="font-semibold text-foreground">{deletingDay?.name}</span>
              {deletingDay ? ` (${(planExercisesMap[deletingDay.id] || []).length} תרגילים)` : ''}?<br />
              כל התרגילים של היום יימחקו והוא יורד מהלו"ז של המתאמן. אי אפשר לבטל.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deletingDay) handleDeleteDay(deletingDay.id); setDeletingDay(null); }}
            >
              <Trash2 className="h-4 w-4 ml-1" />
              מחק יום
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete User Confirmation Dialog ── */}
      <AlertDialog open={!!deletingUser} onOpenChange={(o) => { if (!o) setDeletingUser(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת משתמש</AlertDialogTitle>
            <AlertDialogDescription>
              האם אתה בטוח שברצונך למחוק את{' '}
              <span className="font-semibold text-foreground">
                {deletingUser?.full_name || deletingUser?.email}
              </span>
              ?<br />
              פעולה זו תמחק את כל הנתונים שלו ולא ניתנת לביטול.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel disabled={isDeleting}>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={handleDeleteUser}
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Trash2 className="h-4 w-4 ml-1" />}
              מחק משתמש
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
