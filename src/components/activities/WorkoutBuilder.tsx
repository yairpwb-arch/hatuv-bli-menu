import { useEffect, useMemo, useState } from 'react';
import { Minus, Play, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SheetActions } from '@/components/ds';
import { supabase } from '@/integrations/supabase/client';
import { muscleTags } from '@/lib/exerciseLabels';
import type { Exercise } from '@/hooks/useWorkoutPlan';
import { cn } from '@/lib/utils';

// my_workouts isn't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface BuiltExercise {
  exercise: Exercise;
  sets: number;
  reps: number;
  weightKg: number | null;
}

interface MyWorkout {
  id: string;
  name: string;
  my_workout_exercises: { exercise_id: string; position: number; sets: number; reps: number | null; weight_kg: number | null }[];
}

/**
 * "בנה אימון": exercises from the library (search + muscle filter), sets /
 * reps / weight each. Can be saved as "האימון שלי" and reused, or run in the
 * workout player.
 */
export function WorkoutBuilder({ userId, onRun }: { userId: string; onRun: (name: string, items: BuiltExercise[], myWorkoutId: string | null) => void }) {
  const [library, setLibrary] = useState<Exercise[]>([]);
  const [mine, setMine] = useState<MyWorkout[]>([]);
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<string | null>(null);
  const [items, setItems] = useState<BuiltExercise[]>([]);
  const [name, setName] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);
  const [picking, setPicking] = useState(true);

  useEffect(() => {
    (async () => {
      const [ex, my] = await Promise.all([
        db.from('exercises').select('id, name, description, muscle_groups, equipment, media_url, difficulty').order('name'),
        db.from('my_workouts').select('id, name, my_workout_exercises(exercise_id, position, sets, reps, weight_kg)').eq('user_id', userId).order('created_at', { ascending: false }),
      ]);
      setLibrary((ex.data ?? []) as Exercise[]);
      setMine((my.data ?? []) as MyWorkout[]);
    })();
  }, [userId]);

  const muscles = useMemo(() => [...new Set(library.flatMap((e) => muscleTags(e.muscle_groups)))].sort(), [library]);
  const shown = library.filter(
    (e) => (!query || e.name.includes(query.trim())) && (!muscle || muscleTags(e.muscle_groups).includes(muscle)),
  );
  const chosen = new Set(items.map((i) => i.exercise.id));

  const add = (e: Exercise) => setItems((list) => (chosen.has(e.id) ? list : [...list, { exercise: e, sets: 3, reps: 10, weightKg: null }]));
  const patch = (id: string, p: Partial<BuiltExercise>) => setItems((list) => list.map((i) => (i.exercise.id === id ? { ...i, ...p } : i)));

  const loadMine = (w: MyWorkout) => {
    const byId = new Map(library.map((e) => [e.id, e]));
    setItems(
      [...w.my_workout_exercises]
        .sort((a, b) => a.position - b.position)
        .filter((x) => byId.has(x.exercise_id))
        .map((x) => ({ exercise: byId.get(x.exercise_id)!, sets: x.sets, reps: x.reps ?? 10, weightKg: x.weight_kg })),
    );
    setName(w.name);
    setSavedId(w.id);
    setPicking(false);
  };

  const saveMine = async () => {
    if (!name.trim() || items.length === 0) return;
    const { data, error } = savedId
      ? await db.from('my_workouts').update({ name: name.trim(), updated_at: new Date().toISOString() }).eq('id', savedId).select('id').single()
      : await db.from('my_workouts').insert({ user_id: userId, name: name.trim() }).select('id').single();
    if (error) return toast.error('לא נשמר, נסו שוב');
    const id = data.id as string;
    await db.from('my_workout_exercises').delete().eq('workout_id', id);
    const ins = await db.from('my_workout_exercises').insert(
      items.map((i, position) => ({ workout_id: id, exercise_id: i.exercise.id, position, sets: i.sets, reps: i.reps, weight_kg: i.weightKg })),
    );
    if (ins.error) return toast.error('לא נשמר, נסו שוב');
    setSavedId(id);
    toast('נשמר ב"האימונים שלי"');
  };

  const stepper = (value: number, onChange: (v: number) => void, label: string, min = 1) => (
    <div className="flex items-center gap-1" aria-label={label}>
      <button type="button" aria-label={`פחות ${label}`} onClick={() => onChange(Math.max(min, value - 1))} className="flex h-11 w-9 items-center justify-center rounded-inner bg-card text-muted-foreground">
        <Minus className="h-4 w-4" strokeWidth={2} />
      </button>
      <span className="w-7 text-center text-body font-bold tabular-nums">{value}</span>
      <button type="button" aria-label={`עוד ${label}`} onClick={() => onChange(value + 1)} className="flex h-11 w-9 items-center justify-center rounded-inner bg-card text-muted-foreground">
        <Plus className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  );

  return (
    <div className="space-y-4 pb-2">
      {mine.length > 0 && items.length === 0 && (
        <div className="space-y-2">
          <p className="text-label font-semibold text-muted-foreground">האימונים שלי</p>
          <div className="flex flex-wrap gap-2">
            {mine.map((w) => (
              <button key={w.id} type="button" onClick={() => loadMine(w)} className="min-h-[44px] rounded-pill border border-border px-4 text-label font-semibold">
                {w.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chosen exercises */}
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.exercise.id} className="space-y-2 rounded-inner bg-card-inner p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-body font-semibold">{i.exercise.name}</p>
                <button type="button" aria-label={`הסרת ${i.exercise.name}`} onClick={() => setItems((l) => l.filter((x) => x.exercise.id !== i.exercise.id))} className="flex h-11 w-11 items-center justify-center text-muted-foreground">
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-label text-muted-foreground">
                <span className="flex items-center gap-1">סטים {stepper(i.sets, (v) => patch(i.exercise.id, { sets: v }), 'סטים')}</span>
                <span className="flex items-center gap-1">חזרות {stepper(i.reps, (v) => patch(i.exercise.id, { reps: v }), 'חזרות')}</span>
                <label className="flex items-center gap-1">
                  ק״ג
                  <Input
                    inputMode="decimal"
                    dir="ltr"
                    value={i.weightKg ?? ''}
                    placeholder="—"
                    onChange={(e) => {
                      const v = Number(e.target.value.replace(',', '.'));
                      patch(i.exercise.id, { weightKg: e.target.value === '' || Number.isNaN(v) ? null : v });
                    }}
                    className="h-11 w-20 text-center"
                  />
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}

      {picking ? (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2} aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש תרגיל" className="h-12 pr-9" />
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {[null, ...muscles].map((m) => (
              <button
                key={m ?? 'all'}
                type="button"
                onClick={() => setMuscle(m)}
                className={cn('h-9 shrink-0 rounded-pill px-3 text-label font-semibold', muscle === m ? 'bg-primary text-primary-foreground' : 'bg-card-inner text-muted-foreground')}
              >
                {m ?? 'הכל'}
              </button>
            ))}
          </div>
          <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-inner bg-card-inner">
            {shown.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => add(e)} disabled={chosen.has(e.id)} className="flex min-h-[48px] w-full items-center gap-2 px-3 text-right disabled:opacity-40">
                  <span className="min-w-0 flex-1 truncate text-body">{e.name}</span>
                  <span className="shrink-0 text-label text-muted-foreground">{muscleTags(e.muscle_groups)[0] ?? ''}</span>
                  <Plus className="h-4 w-4 shrink-0 text-primary" strokeWidth={2} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          {items.length > 0 && (
            <button type="button" onClick={() => setPicking(false)} className="min-h-[44px] w-full text-label font-semibold text-primary-soft">
              סיימתי לבחור ({items.length})
            </button>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => setPicking(true)} className="min-h-[44px] w-full text-label font-semibold text-primary-soft">
          + הוספת תרגיל
        </button>
      )}

      {items.length > 0 && (
        <>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='שם לאימון (למשל "גב וכתפיים")' className="h-12" />
          <SheetActions>
            <Button onClick={() => onRun(name.trim() || 'האימון שלי', items, savedId)}>
              <Play className="h-4 w-4" strokeWidth={2} />
              התחל בנגן
            </Button>
            <Button variant="outline" disabled={!name.trim()} onClick={saveMine}>
              שמור כ"אימון שלי"
            </Button>
          </SheetActions>
        </>
      )}
    </div>
  );
}
