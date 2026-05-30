import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
  User as UserIcon, Scale, Repeat2, ClipboardList, X, Sparkles, Footprints,
  History, Clock,
} from 'lucide-react';
import { format, differenceInDays, startOfWeek, addDays } from 'date-fns';
import { he } from 'date-fns/locale';

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
}

interface WeightEntry {
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
}

interface Exercise {
  id: string;
  name: string;
  muscle_groups: string[] | null;
  equipment: string | null;
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
  { id: 'triceps',   label: 'יד אחורית',    match: ['tricep', 'יד אחורית', 'טרייספס'] },
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

function nextSaturdayStr(): string {
  const today = new Date();
  const daysUntilSat = (6 - today.getDay() + 7) % 7;
  const sat = new Date(today);
  sat.setDate(today.getDate() + daysUntilSat);
  return `${sat.getFullYear()}-${String(sat.getMonth() + 1).padStart(2, '0')}-${String(sat.getDate()).padStart(2, '0')}`;
}
const GENDER_LABELS: Record<string, string> = { male: 'זכר', female: 'נקבה', other: 'אחר' };

function calcCurrentDay(startDate: string | null): string {
  if (!startDate) return '-';
  const days = differenceInDays(new Date(), new Date(startDate)) + 1;
  return days > 0 ? String(days) : '-';
}

function calcAge(birthdate: string | null): string {
  if (!birthdate) return '-';
  const age = Math.floor((Date.now() - new Date(birthdate).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return isNaN(age) || age < 0 ? '-' : String(age);
}

function scoreColor(score: number | null): string {
  if (score == null) return '';
  if (score <= 4) return 'text-red-500';
  if (score <= 7) return 'text-yellow-500';
  return 'text-green-500';
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [adminUserIds, setAdminUserIds] = useState<string[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Add-user form
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', fullName: '', startDate: '', height: '', initialWeight: '', gender: '', phoneNumber: '', age: '', targetWeight: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Tab-specific data
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
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
  const [newExForm, setNewExForm] = useState({ exerciseId: '', sets: '3', repsMin: '8', repsMax: '12', rest: '60' });
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
      is_active: user.is_active,
      initial_weight: user.initial_weight ?? undefined,
      current_weight: user.current_weight ?? undefined,
      target_weight: user.target_weight ?? undefined,
    });

    // Weight history
    const { data: wh } = await (supabase as any)
      .from('weight_log')
      .select('weight, recorded_at')
      .eq('user_id', user.id)
      .order('recorded_at', { ascending: true })
      .limit(30);
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

  const loadWorkoutPlan = async (userId: string) => {
    const { data: assignment } = await (supabase as any)
      .from('user_workout_assignments')
      .select('id, plan_id, is_active')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (assignment) {
      setCurrentAssignmentId(assignment.id);
      setCurrentPlanId(assignment.plan_id);
      setPlanActive(true);
      await loadPlanDays(assignment.plan_id);
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
      // Create a new personal plan for this user
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
    } else {
      // Deactivate
      if (currentAssignmentId) {
        await (supabase as any)
          .from('user_workout_assignments')
          .update({ is_active: false })
          .eq('id', currentAssignmentId);
      }
      setCurrentAssignmentId(null);
      setCurrentPlanId(null);
      setPlanActive(false);
      setPlanDays([]);
      setPlanExercisesMap({});
      toast({ title: 'הצלחה', description: 'תוכנית האימון הושבתה' });
    }
    setIsTogglingPlan(false);
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
    await (supabase as any).from('workout_plan_days').delete().eq('id', dayId);
    setPlanDays(prev => prev.filter(d => d.id !== dayId));
    setPlanExercisesMap(prev => { const next = { ...prev }; delete next[dayId]; return next; });
  };

  const handleAddExercise = async (dayId: string) => {
    if (!newExForm.exerciseId) return;
    const existing = planExercisesMap[dayId] || [];
    const { data, error } = await (supabase as any)
      .from('workout_plan_exercises')
      .insert({
        plan_day_id: dayId,
        exercise_id: newExForm.exerciseId,
        sets: parseInt(newExForm.sets) || 3,
        reps_min: parseInt(newExForm.repsMin) || 8,
        reps_max: parseInt(newExForm.repsMax) || 12,
        rest_seconds: parseInt(newExForm.rest) || 60,
        sort_order: existing.length,
      })
      .select('*, exercises(id, name, muscle_groups)')
      .single();

    if (error) { toast({ title: 'שגיאה', description: error.message, variant: 'destructive' }); return; }
    setPlanExercisesMap(prev => ({ ...prev, [dayId]: [...(prev[dayId] || []), data as PlanExercise] }));
    setNewExForm({ exerciseId: '', sets: '3', repsMin: '8', repsMax: '12', rest: '60' });
    setAddExerciseDayId(null);
  };

  const handleDeleteExercise = async (dayId: string, exId: string) => {
    await (supabase as any).from('workout_plan_exercises').delete().eq('id', exId);
    setPlanExercisesMap(prev => ({ ...prev, [dayId]: (prev[dayId] || []).filter(e => e.id !== exId) }));
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

  const handleSavePersonal = async () => {
    if (!editingUser) return;
    setIsSavingPersonal(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: editPersonal.full_name || null,
        birthdate: editPersonal.birthdate || null,
        gender: editPersonal.gender || null,
        height: editPersonal.height ?? null,
        phone_number: (editPersonal as any).phone_number || null,
        start_date: editPersonal.start_date || null,
        is_active: editPersonal.is_active ?? true,
        initial_weight: editPersonal.initial_weight ?? null,
        current_weight: editPersonal.current_weight ?? null,
        target_weight: editPersonal.target_weight ?? null,
      })
      .eq('id', editingUser.id);

    if (error) { toast({ title: 'שגיאה', description: error.message, variant: 'destructive' }); }
    else {
      toast({ title: 'הצלחה', description: 'הנתונים עודכנו' });
      fetchUsers();
    }
    setIsSavingPersonal(false);
  };

  const handleResetStartDate = async () => {
    if (!editingUser) return;
    const sat = nextSaturdayStr();
    await supabase.from('profiles').update({ start_date: sat }).eq('id', editingUser.id);
    setEditPersonal(p => ({ ...p, start_date: sat }));
    setEditingUser(u => u ? { ...u, start_date: sat } : null);
    toast({ title: 'הצלחה', description: 'יום ההתחלה אופס לשבת הקרובה' });
    fetchUsers();
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
    if (!newUser.email || !newUser.password) {
      toast({ title: 'שגיאה', description: 'אנא מלא את כל השדות', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);

    // Convert age → birthdate approximation
    const ageNum = parseInt(newUser.age);
    const birthdate = !isNaN(ageNum) && ageNum > 0
      ? `${new Date().getFullYear() - ageNum}-01-01`
      : undefined;

    const { data: fnData, error: fnError } = await supabase.functions.invoke('admin-create-user', {
      body: {
        email: newUser.email,
        password: newUser.password,
        full_name: newUser.fullName || undefined,
        start_date: newUser.startDate || undefined,
        height: newUser.height || undefined,
        initial_weight: newUser.initialWeight || undefined,
        gender: newUser.gender || undefined,
        phone_number: newUser.phoneNumber || undefined,
        birthdate,
        target_weight: newUser.targetWeight || undefined,
      },
    });
    if (fnError || fnData?.error) {
      const msg = fnData?.error || fnError?.message || 'שגיאה ביצירת משתמש';
      toast({ title: 'שגיאה', description: msg, variant: 'destructive' });
    } else {
      toast({ title: 'הצלחה', description: 'המשתמש נוסף בהצלחה' });
      setNewUser({ email: '', password: '', fullName: '', startDate: '', height: '', initialWeight: '', gender: '', phoneNumber: '', age: '', targetWeight: '' });
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
                <Label>שם מלא</Label>
                <Input placeholder="ישראל ישראלי" value={newUser.fullName} onChange={e => setNewUser(p => ({ ...p, fullName: e.target.value }))} />
              </div>
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
                <Input
                  type="date"
                  dir="ltr"
                  className="text-left"
                  value={newUser.startDate || nextSaturdayStr()}
                  onChange={e => setNewUser(p => ({ ...p, startDate: e.target.value }))}
                />
                {newUser.startDate && (() => {
                  const d = differenceInDays(new Date(), new Date(newUser.startDate)) + 1;
                  return (
                    <p className={`text-xs font-medium ${d > 0 ? 'text-green-500' : 'text-destructive'}`}>
                      {d > 0 ? `יום ${d} בתוכנית` : 'תאריך עתידי — תוכן יהיה נעול'}
                    </p>
                  );
                })()}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>גיל</Label>
                  <Input type="number" min={10} max={120} placeholder="30" dir="ltr" className="text-left" value={newUser.age} onChange={e => setNewUser(p => ({ ...p, age: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>מגדר</Label>
                  <Select value={newUser.gender} onValueChange={v => setNewUser(p => ({ ...p, gender: v }))}>
                    <SelectTrigger><SelectValue placeholder="בחר" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">זכר</SelectItem>
                      <SelectItem value="female">נקבה</SelectItem>
                      <SelectItem value="other">אחר</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>גובה (ס"מ)</Label>
                  <Input type="number" placeholder="170" dir="ltr" className="text-left" value={newUser.height} onChange={e => setNewUser(p => ({ ...p, height: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>טלפון</Label>
                  <Input placeholder="050-000-0000" dir="ltr" className="text-left" value={newUser.phoneNumber} onChange={e => setNewUser(p => ({ ...p, phoneNumber: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>משקל התחלתי (ק"ג)</Label>
                  <Input type="number" step="0.1" placeholder="75.5" dir="ltr" className="text-left" value={newUser.initialWeight} onChange={e => setNewUser(p => ({ ...p, initialWeight: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>משקל יעד (ק"ג)</Label>
                  <Input type="number" step="0.1" placeholder="65.0" dir="ltr" className="text-left" value={newUser.targetWeight} onChange={e => setNewUser(p => ({ ...p, targetWeight: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>תוכנית</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[{ label: '4 חודשים (120 ימים)', value: '120' }, { label: '6 חודשים (168 ימים)', value: '168' }].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setNewUser(p => ({ ...p, planDuration: opt.value }))}
                      className={`rounded-xl border py-2.5 px-3 text-sm font-medium transition-colors text-right ${
                        newUser.planDuration === opt.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card text-muted-foreground hover:border-primary/50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <Button onClick={handleAddUser} className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}הוסף מתאמן
              </Button>
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
                  <TableHead className="text-right">משקל</TableHead>
                  <TableHead className="text-right">סטטוס</TableHead>
                  <TableHead className="text-right">עריכה</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(user => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.full_name || '-'}</TableCell>
                    <TableCell dir="ltr" className="text-left text-sm">{user.email}</TableCell>
                    <TableCell>{calcCurrentDay(user.start_date)}</TableCell>
                    <TableCell>{user.current_weight ? `${user.current_weight} ק"ג` : '-'}</TableCell>
                    <TableCell>
                      <Badge variant={user.is_active ? 'default' : 'secondary'}>{user.is_active ? 'פעיל' : 'לא פעיל'}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(user)}>
                          <Edit className="h-4 w-4 ml-1" />ערוך
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

      {/* ── 5-Tab Edit Dialog ── */}
      <Dialog open={!!editingUser} onOpenChange={(o) => { if (!o) closeEdit(); }}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[92vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-5 pb-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-lg">{editingUser?.full_name || editingUser?.email}</DialogTitle>
              <button onClick={closeEdit} className="p-1.5 rounded-full hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          </DialogHeader>

          <Tabs defaultValue="personal" dir="rtl" className="w-full">
            <TabsList className="w-full grid grid-cols-5 mx-6 mt-3" style={{ width: 'calc(100% - 3rem)' }}>
              <TabsTrigger value="personal" className="text-xs gap-1"><UserIcon className="h-3.5 w-3.5" />פרטים</TabsTrigger>
              <TabsTrigger value="body" className="text-xs gap-1"><Scale className="h-3.5 w-3.5" />נתונים</TabsTrigger>
              <TabsTrigger value="habits" className="text-xs gap-1"><Repeat2 className="h-3.5 w-3.5" />הרגלים</TabsTrigger>
              <TabsTrigger value="workout" className="text-xs gap-1"><Dumbbell className="h-3.5 w-3.5" />אימון</TabsTrigger>
              <TabsTrigger value="survey" className="text-xs gap-1"><ClipboardList className="h-3.5 w-3.5" />שאלון</TabsTrigger>
            </TabsList>

            {/* ── Tab 1: Personal ── */}
            <TabsContent value="personal" className="px-6 pb-6 pt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2">
                  <Label>שם מלא</Label>
                  <Input value={editPersonal.full_name || ''} onChange={e => setEditPersonal(p => ({ ...p, full_name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>גיל</Label>
                  <Input
                    type="number"
                    min={10}
                    max={120}
                    dir="ltr"
                    className="text-left"
                    placeholder="30"
                    value={calcAge(editPersonal.birthdate || null) !== '-' ? calcAge(editPersonal.birthdate || null) : ''}
                    onChange={e => {
                      const age = parseInt(e.target.value);
                      if (!isNaN(age) && age > 0) {
                        setEditPersonal(p => ({ ...p, birthdate: `${new Date().getFullYear() - age}-01-01` }));
                      } else {
                        setEditPersonal(p => ({ ...p, birthdate: '' }));
                      }
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label>מגדר</Label>
                  <Select value={editPersonal.gender || ''} onValueChange={v => setEditPersonal(p => ({ ...p, gender: v }))}>
                    <SelectTrigger><SelectValue placeholder="בחר" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">זכר</SelectItem>
                      <SelectItem value="female">נקבה</SelectItem>
                      <SelectItem value="other">אחר</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>גובה (ס"מ)</Label>
                  <Input type="number" dir="ltr" className="text-left" value={editPersonal.height ?? ''} onChange={e => setEditPersonal(p => ({ ...p, height: parseFloat(e.target.value) || undefined }))} placeholder="170" />
                </div>
                <div className="space-y-1">
                  <Label>טלפון</Label>
                  <Input dir="ltr" className="text-left" value={(editPersonal as any).phone_number || ''} onChange={e => setEditPersonal(p => ({ ...p, phone_number: e.target.value } as any))} placeholder="050-000-0000" />
                </div>
                <div className="space-y-1">
                  <Label>תאריך התחלה</Label>
                  <Input
                    type="date"
                    dir="ltr"
                    className="text-left"
                    value={editPersonal.start_date || ''}
                    onChange={e => setEditPersonal(p => ({ ...p, start_date: e.target.value || '' }))}
                  />
                  {editPersonal.start_date && (() => {
                    const d = differenceInDays(new Date(), new Date(editPersonal.start_date)) + 1;
                    return (
                      <p className={`text-xs font-medium ${d > 0 ? 'text-green-500' : 'text-destructive'}`}>
                        {d > 0 ? `יום ${d} בתוכנית` : 'תאריך עתידי — תוכן יהיה נעול'}
                      </p>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-3 col-span-2 pt-1">
                  <Switch
                    checked={editPersonal.is_active ?? true}
                    onCheckedChange={v => setEditPersonal(p => ({ ...p, is_active: v }))}
                  />
                  <Label>מתאמן פעיל</Label>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={handleSavePersonal} disabled={isSavingPersonal} className="flex-1">
                  {isSavingPersonal && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}שמור
                </Button>
                <Button variant="outline" onClick={handleResetStartDate} className="gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" />אפס יום התחלה
                </Button>
              </div>
            </TabsContent>

            {/* ── Tab 2: Body / Weight ── */}
            <TabsContent value="body" className="px-6 pb-6 pt-4 space-y-4">
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
              <Button onClick={handleSavePersonal} disabled={isSavingPersonal} size="sm">
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

              {/* Steps section */}
              {(() => {
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                const last7 = stepsData.filter(s => s.date >= sevenDaysAgo);
                const avg7 = last7.length ? Math.round(last7.reduce((a, b) => a + b.steps, 0) / last7.length) : null;
                const avg30 = stepsData.length ? Math.round(stepsData.reduce((a, b) => a + b.steps, 0) / stepsData.length) : null;
                return (
                  <div className="border-t border-border pt-4 space-y-3">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Footprints className="h-4 w-4 text-primary" />
                      נתוני צעדים (30 יום אחרונים)
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
                          <BarChart data={stepsData.map(s => ({
                            date: format(new Date(s.date), 'dd/MM', { locale: he }),
                            steps: s.steps,
                          }))}>
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
            </TabsContent>

            {/* ── Tab 3: Habits ── */}
            <TabsContent value="habits" className="px-6 pb-6 pt-4 space-y-4">
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
            <TabsContent value="workout" className="px-6 pb-6 pt-4 space-y-4">
              {/* Toggle */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                <div>
                  <p className="font-medium text-sm">תוכנית אימון פעילה</p>
                  <p className="text-xs text-muted-foreground">
                    {planActive ? 'תוכנית קיימת — ערוך ימים ותרגילים למטה' : 'אין תוכנית — הפעל כדי ליצור'}
                  </p>
                </div>
                <Switch
                  checked={planActive}
                  onCheckedChange={handleTogglePlan}
                  disabled={isTogglingPlan}
                />
              </div>

              {planActive && (
                <div className="space-y-3">
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
                          <Badge variant="secondary" className="text-xs">
                            {(planExercisesMap[day.id] || []).length} תרגילים
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={e => { e.stopPropagation(); handleDeleteDay(day.id); }}
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
                          {(planExercisesMap[day.id] || []).map(pe => (
                            <div key={pe.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
                              <div>
                                <span className="font-medium">{pe.exercises?.name}</span>
                                <span className="text-muted-foreground text-xs mr-2">
                                  {pe.sets}×{pe.reps_min}–{pe.reps_max} · {pe.rest_seconds}שנ'
                                </span>
                              </div>
                              <button
                                onClick={() => handleDeleteExercise(day.id, pe.id)}
                                className="p-1 text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}

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
                              <div className="grid grid-cols-4 gap-1.5 text-xs">
                                {[
                                  { key: 'sets', label: 'סטים' },
                                  { key: 'repsMin', label: 'חז׳ מינ' },
                                  { key: 'repsMax', label: 'חז׳ מקס' },
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
                              onClick={() => { setAddExerciseDayId(day.id); setNewExForm({ exerciseId: '', sets: '3', repsMin: '8', repsMax: '12', rest: '60' }); setExEquipFilter(null); setExMuscleFilter(null); }}
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
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Workout History ── */}
              <div className="border-t border-border pt-4 mt-2">
                <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  היסטוריית אימונים
                  <span className="text-xs font-normal text-muted-foreground mr-auto">
                    {workoutSessions.length} אימונים אחרונים
                  </span>
                </p>
                {workoutSessions.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-4">לא בוצעו אימונים עדיין</p>
                ) : (
                  <div className="space-y-2">
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
                              <div className="w-7 h-7 rounded-lg bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                                <Dumbbell className="h-3.5 w-3.5 text-orange-500" />
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
                                                <p className="text-xs text-orange-500 font-medium mt-0.5">{s.weight_kg}ק"ג</p>
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

            {/* ── Tab 5: Survey ── */}
            <TabsContent value="survey" className="px-6 pb-6 pt-4">
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
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm pb-2">
                          {ci.last_weigh_in && <div><span className="text-muted-foreground">שקילה קודמת:</span> {ci.last_weigh_in} ק"ג</div>}
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
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

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
