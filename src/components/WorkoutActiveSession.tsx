import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Check, CheckCircle2, ChevronLeft, ChevronRight, Dumbbell, Maximize2, Minimize2, Minus, Pause,
  Play as PlayIcon, Plus, Timer, TrendingUp, Trophy, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BottomSheet, Card, Pill, PrimaryButton, SecondaryButton, SheetActions } from '@/components/ds';
import { useAuth } from '@/hooks/useAuth';
import { saveSet, useExerciseHistory, type SetRecord } from '@/hooks/useExerciseHistory';
import { equipmentTag, muscleTags } from '@/lib/exerciseLabels';
import { restLabel } from '@/lib/hebrewTime';
import { selectionHaptic, successHaptic, tapHaptic } from '@/lib/native';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { WorkoutPlanDay, WorkoutPlanExercise } from '@/hooks/useWorkoutPlan';

// ── Types ────────────────────────────────────────────────────────────────────

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface WorkoutResult {
  clientSessionId: string;
  durationMinutes: number;
  difficulty: Difficulty | null;
  logs: { exerciseId: string; sets: { setNumber: number; reps: number; weightKg: number }[] }[];
  setsDone: number;
  totalVolumeKg: number;
}

interface Props {
  planDay: WorkoutPlanDay;
  exercises: WorkoutPlanExercise[];
  onMinimize: () => void;
  onFinish: (result: WorkoutResult) => Promise<void>;
  /** Leave without saving a session (nothing was done). */
  onDiscard: () => void;
}

type SetStatus = 'pending' | 'done' | 'skipped';
interface SetEntry {
  weight: string;
  reps: string;
  status: SetStatus;
}
interface Pointer {
  ex: number;
  set: number;
}

// ── Utilities ────────────────────────────────────────────────────────────────

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|avi)$/i.test(url) || url.includes('/videos/');
}

function newSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const num = (v: string): number | null => {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const fmtKg = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function performanceLabel(r: { weightKg: number | null; reps: number | null }): string {
  if (r.weightKg && r.reps != null) return `${fmtKg(r.weightKg)} ק"ג × ${r.reps}`;
  if (r.reps != null) return `${r.reps} חזרות`;
  if (r.weightKg) return `${fmtKg(r.weightKg)} ק"ג`;
  return '';
}

function vibrate() {
  successHaptic();
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* not supported */
  }
}

// ── Stepper field ─────────────────────────────────────────────────────────────

function Stepper({
  label, value, onChange, step, decimals, placeholder, id,
}: {
  label: string; value: string; onChange: (v: string) => void; step: number; decimals: boolean; placeholder: string; id: string;
}) {
  const bump = (dir: 1 | -1) => {
    tapHaptic();
    const cur = num(value) ?? 0;
    const next = Math.max(0, Math.round((cur + dir * step) * 2) / 2);
    onChange(decimals ? fmtKg(next) : String(Math.round(next)));
  };
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-center text-label text-muted-foreground">{label}</label>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => bump(-1)} aria-label={`הורדת ${label}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-button bg-card text-foreground active:scale-95">
          <Minus className="h-4 w-4" strokeWidth={2} />
        </button>
        <input
          id={id}
          type="text"
          inputMode={decimals ? 'decimal' : 'numeric'}
          dir="ltr"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
          onFocus={(e) => e.target.select()}
          className="h-11 w-full min-w-0 rounded-button border border-border bg-background text-center text-card-title font-bold tabular-nums placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button type="button" onClick={() => bump(1)} aria-label={`הוספת ${label}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-button bg-card text-foreground active:scale-95">
          <Plus className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

// ── Rest timer ────────────────────────────────────────────────────────────────

function RestTimer({
  endsAt, total, paused, onAdd, onDone, nextLabel,
}: {
  endsAt: number; total: number; paused: boolean; onAdd: () => void; onDone: (natural: boolean) => void; nextLabel: string | null;
}) {
  const [now, setNow] = useState(Date.now());
  const remaining = Math.max(0, (endsAt - now) / 1000);
  const doneRef = useRef(false);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [paused]);

  useEffect(() => {
    if (!paused && remaining <= 0 && !doneRef.current) {
      doneRef.current = true;
      onDone(true);
    }
  }, [remaining, paused, onDone]);

  const R = 44;
  const C = 2 * Math.PI * R;
  const ratio = total > 0 ? Math.min(remaining / total, 1) : 0;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-6">
      <p className="text-card-title text-muted-foreground">מנוחה</p>
      <div className="relative h-64 w-64">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r={R} fill="none" stroke="hsl(var(--card-inner))" strokeWidth="7" />
          <circle
            cx="50" cy="50" r={R} fill="none" stroke="hsl(var(--primary))" strokeWidth="7" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - ratio)}
            style={{ transition: 'stroke-dashoffset 0.25s linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[3.5rem] font-bold leading-none tabular-nums" role="timer" aria-live="off">{formatClock(Math.ceil(remaining))}</span>
        </div>
      </div>
      {nextLabel && <p className="text-center text-body text-muted-foreground">הבא: {nextLabel}</p>}
      <div className="grid w-full max-w-xs grid-cols-2 gap-3">
        <SecondaryButton size="lg" onClick={onAdd}>+15 שניות</SecondaryButton>
        <PrimaryButton onClick={() => onDone(false)}>דלג</PrimaryButton>
      </div>
    </div>
  );
}

// ── Summary ───────────────────────────────────────────────────────────────────

const DIFFICULTY: { value: Difficulty; label: string }[] = [
  { value: 'easy', label: 'קל' },
  { value: 'medium', label: 'בינוני' },
  { value: 'hard', label: 'קשה' },
];

function Summary({
  durationMinutes, setsDone, totalSets, volume, prs, onSave,
}: {
  durationMinutes: number; setsDone: number; totalSets: number; volume: number;
  prs: { name: string; weight: number }[];
  onSave: (d: Difficulty | null) => Promise<void>;
}) {
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [saving, setSaving] = useState(false);

  const stat = (value: string, label: string) => (
    <div className="rounded-inner bg-card-inner px-2 py-3 text-center">
      <p className="text-stat tabular-nums">{value}</p>
      <p className="text-label text-muted-foreground">{label}</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-background safe-top" dir="rtl">
      <div className="flex flex-1 flex-col justify-center overflow-y-auto px-4 py-6">
        <div className="mx-auto w-full max-w-md space-y-card-gap">
          <div className="space-y-2 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-pill bg-primary-tint">
              <Trophy className="h-8 w-8 text-primary" strokeWidth={2} />
            </span>
            <h2 className="text-screen-title">כל הכבוד!</h2>
            <p className="text-body text-muted-foreground">סיכום האימון</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {stat(String(durationMinutes), durationMinutes === 1 ? 'דקה' : 'דקות')}
            {stat(`${setsDone}/${totalSets}`, 'סטים')}
            {stat(volume > 0 ? Math.round(volume).toLocaleString('he-IL') : '0', 'נפח (ק"ג)')}
          </div>

          {prs.length > 0 && (
            <Card className="space-y-2">
              <h3 className="flex items-center gap-2 text-card-title">
                <TrendingUp className="h-5 w-5 text-primary" strokeWidth={2} />
                {prs.length === 1 ? 'שיא אישי חדש' : 'שיאים אישיים חדשים'}
              </h3>
              <ul className="space-y-1">
                {prs.map((p) => (
                  <li key={p.name} className="flex items-center justify-between text-body">
                    <span>{p.name}</span>
                    <span className="font-bold tabular-nums text-primary-soft">{fmtKg(p.weight)} ק"ג</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="space-y-3">
            <h3 className="text-card-title">איך היה?</h3>
            <div role="radiogroup" aria-label="איך היה האימון" className="grid grid-cols-3 gap-3">
              {DIFFICULTY.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  role="radio"
                  aria-checked={difficulty === d.value}
                  onClick={() => {
                    selectionHaptic();
                    setDifficulty(d.value);
                  }}
                  className={cn(
                    'h-12 rounded-button text-body font-semibold transition-colors',
                    difficulty === d.value ? 'bg-primary text-primary-foreground' : 'bg-card-inner text-muted-foreground',
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="shrink-0 px-4 pt-3" style={{ paddingBottom: 'calc(1rem + var(--app-safe-bottom))' }}>
        <PrimaryButton
          icon={CheckCircle2}
          className="mx-auto max-w-md"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await onSave(difficulty);
            setSaving(false);
          }}
        >
          {saving ? 'שומר...' : 'שמור וסיים'}
        </PrimaryButton>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WorkoutActiveSession({ planDay, exercises, onMinimize, onFinish, onDiscard }: Props) {
  const { user } = useAuth();
  const clientSessionId = useRef(newSessionId()).current;

  // Elapsed timer using real time diff so it stays accurate after backgrounding
  const startTimeRef = useRef(Date.now());
  const pauseStartRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [videoFullscreen, setVideoFullscreen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [phase, setPhase] = useState<'workout' | 'summary'>('workout');

  const [entries, setEntries] = useState<SetEntry[][]>(() =>
    exercises.map((ex) => Array.from({ length: ex.sets }, () => ({ weight: '', reps: '', status: 'pending' as SetStatus }))),
  );
  const [ptr, setPtr] = useState<Pointer>({ ex: 0, set: 0 });
  const [rest, setRest] = useState<{ endsAt: number; total: number } | null>(null);

  const exerciseIds = useMemo(() => exercises.map((e) => e.exercise_id), [exercises]);
  const { history } = useExerciseHistory(user?.id, exerciseIds);

  const previousFor = useCallback(
    (exIdx: number, setIdx: number): SetRecord | null => {
      const last = history[exercises[exIdx]?.exercise_id]?.last ?? [];
      return last.find((s) => s.setNumber === setIdx + 1) ?? null;
    },
    [history, exercises],
  );

  // Pre-fill untouched sets from last time, once history arrives.
  useEffect(() => {
    setEntries((prev) =>
      prev.map((sets, ei) =>
        sets.map((s, si) => {
          if (s.status !== 'pending' || s.weight || s.reps) return s;
          const p = previousFor(ei, si);
          if (!p) return s;
          return { ...s, weight: p.weightKg ? fmtKg(p.weightKg) : '', reps: p.reps != null ? String(p.reps) : '' };
        }),
      ),
    );
  }, [previousFor]);

  // ── WakeLock — keeps screen on during workout ──
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let wakeLock: any = null;
    const acquire = async () => {
      try {
        if ('wakeLock' in navigator) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch {
        /* not available */
      }
    };
    acquire();
    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      wakeLock?.release();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // ── Elapsed timer — stops when paused ──
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [paused]);

  const handlePause = () => {
    pauseStartRef.current = Date.now();
    setPaused(true);
  };
  const handleResume = () => {
    if (pauseStartRef.current !== null) {
      const pausedFor = Date.now() - pauseStartRef.current;
      // Shift the start (and any running rest) forward by the pause → both stay accurate
      startTimeRef.current += pausedFor;
      setRest((r) => (r ? { ...r, endsAt: r.endsAt + pausedFor } : r));
      pauseStartRef.current = null;
    }
    setPaused(false);
  };

  // ── Derived ──
  const totalSets = entries.reduce((n, s) => n + s.length, 0);
  const setsDone = entries.reduce((n, s) => n + s.filter((x) => x.status === 'done').length, 0);
  const progress = totalSets > 0 ? (setsDone / totalSets) * 100 : 0;
  const durationMinutes = Math.max(1, Math.round(elapsed / 60));

  const volume = entries.reduce(
    (sum, sets) => sum + sets.reduce((s, x) => (x.status === 'done' ? s + (num(x.weight) ?? 0) * (num(x.reps) ?? 0) : s), 0),
    0,
  );

  const prs = exercises.flatMap((ex, i) => {
    const best = history[ex.exercise_id]?.bestWeight ?? 0;
    const today = Math.max(0, ...entries[i].filter((s) => s.status === 'done').map((s) => num(s.weight) ?? 0));
    return best > 0 && today > best ? [{ name: ex.exercises.name, weight: today }] : [];
  });

  /** First set still pending after `from` (wrapping to the start), or null when all are resolved. */
  const nextPending = (list: SetEntry[][], from: Pointer): Pointer | null => {
    const flat: Pointer[] = list.flatMap((sets, ex) => sets.map((_, set) => ({ ex, set })));
    const at = flat.findIndex((p) => p.ex === from.ex && p.set === from.set);
    for (let k = 1; k <= flat.length; k++) {
      const p = flat[(at + k) % flat.length];
      if (list[p.ex][p.set].status === 'pending') return p;
    }
    return null;
  };

  const updateEntry = (field: 'weight' | 'reps', value: string) => {
    setEntries((prev) => prev.map((sets, ei) => (ei !== ptr.ex ? sets : sets.map((s, si) => (si === ptr.set ? { ...s, [field]: value } : s)))));
  };

  const markDone = async () => {
    const ex = exercises[ptr.ex];
    const cur = entries[ptr.ex][ptr.set];
    const reps = num(cur.reps);
    const weight = num(cur.weight);
    successHaptic();

    const next = entries.map((sets, ei) =>
      sets.map((s, si) => {
        if (ei === ptr.ex && si === ptr.set) return { ...s, status: 'done' as SetStatus };
        // Carry today's numbers to the next untouched set of the same exercise.
        if (ei === ptr.ex && si === ptr.set + 1 && s.status === 'pending' && !s.weight && !s.reps) {
          return { ...s, weight: cur.weight, reps: cur.reps };
        }
        return s;
      }),
    );
    setEntries(next);

    const wasDone = cur.status === 'done';
    const following = nextPending(next, ptr);
    if (wasDone) {
      // Editing a finished set: just save the new numbers, stay put.
    } else if (!following) {
      setRest(null);
      setPhase('summary');
    } else {
      setPtr(following);
      const seconds = ex.rest_seconds ?? 60;
      if (seconds > 0) setRest({ endsAt: Date.now() + seconds * 1000, total: seconds });
    }

    if (user) {
      const ok = await saveSet({
        userId: user.id,
        clientSessionId,
        planDayId: planDay.id,
        exerciseId: ex.exercise_id,
        setNumber: ptr.set + 1,
        reps,
        weightKg: weight,
        repsMaxTarget: ex.reps_max,
      });
      if (!ok) toast({ title: 'הסט לא נשמר בשרת', description: 'הוא יישמר יחד עם האימון בסיום', variant: 'destructive' });
    }
  };

  const skipSet = () => {
    selectionHaptic();
    const next = entries.map((sets, ei) =>
      sets.map((s, si) => (ei === ptr.ex && si === ptr.set && s.status === 'pending' ? { ...s, status: 'skipped' as SetStatus } : s)),
    );
    setEntries(next);
    const following = nextPending(next, ptr);
    if (following) setPtr(following);
    else if (setsDone > 0) setPhase('summary');
    else setConfirmFinish(true);
  };

  const goExercise = (dir: 1 | -1) => {
    selectionHaptic();
    const ex = ptr.ex + dir;
    if (ex < 0 || ex >= exercises.length) return;
    const firstPending = entries[ex].findIndex((s) => s.status === 'pending');
    setPtr({ ex, set: firstPending >= 0 ? firstPending : 0 });
    setDescOpen(false);
  };

  const endRest = useCallback((natural: boolean) => {
    if (natural) vibrate();
    setRest(null);
  }, []);

  const save = async (difficulty: Difficulty | null) => {
    await onFinish({
      clientSessionId,
      durationMinutes,
      difficulty,
      setsDone,
      totalVolumeKg: Math.round(volume * 100) / 100,
      logs: exercises
        .map((ex, i) => ({
          exerciseId: ex.exercise_id,
          sets: entries[i]
            .map((s, si) => ({ s, setNumber: si + 1 }))
            .filter(({ s }) => s.status === 'done')
            .map(({ s, setNumber }) => ({ setNumber, reps: num(s.reps) ?? 0, weightKg: num(s.weight) ?? 0 })),
        }))
        .filter((l) => l.sets.length > 0),
    });
  };

  // ── Summary (only reached with at least one set done) ──
  if (phase === 'summary') {
    return (
      <Summary
        durationMinutes={durationMinutes}
        setsDone={setsDone}
        totalSets={totalSets}
        volume={volume}
        prs={prs}
        onSave={save}
      />
    );
  }

  const currentEx = exercises[ptr.ex];
  if (!currentEx) {
    return (
      <div className="fixed inset-0 z-[55] flex flex-col items-center justify-center gap-4 bg-background px-6" dir="rtl">
        <Dumbbell className="h-10 w-10 text-muted-foreground" strokeWidth={2} />
        <p className="text-body text-muted-foreground">אין תרגילים לאימון הזה</p>
        <SecondaryButton onClick={onDiscard}>חזרה</SecondaryButton>
      </div>
    );
  }

  const ex = currentEx.exercises;
  const hasMedia = !!ex.media_url;
  const isVideo = hasMedia && isVideoUrl(ex.media_url!);
  const tags = [...muscleTags(ex.muscle_groups), ...(equipmentTag(ex.equipment) ? [equipmentTag(ex.equipment)!] : [])];
  const sets = entries[ptr.ex];
  const active = sets[ptr.set];
  const prev = previousFor(ptr.ex, ptr.set);
  const weightStep = (num(active.weight) ?? 0) < 20 ? 0.5 : 1;
  // A built workout's timed exercise (running, a plank): a time per set instead of reps.
  const timedSec = currentEx.target_seconds ?? null;
  const rangeLabel =
    timedSec != null
      ? timedSec < 60
        ? `${timedSec} שניות`
        : `${Math.floor(timedSec / 60)}:${String(timedSec % 60).padStart(2, '0')} דקות`
      : currentEx.reps_min === currentEx.reps_max
      ? `${currentEx.reps_min} חזרות`
      : `⁦${currentEx.reps_min}–${currentEx.reps_max}⁩ חזרות`;

  // "You hit the top of the range on every set last time" → suggest more weight.
  const last = history[currentEx.exercise_id]?.last ?? [];
  const readyToProgress = timedSec == null && last.length >= currentEx.sets && last.every((s) => (s.reps ?? 0) >= currentEx.reps_max);

  const nextLabel = (() => {
    if (!rest) return null;
    const nx = exercises[ptr.ex];
    return nx ? `סט ${ptr.set + 1} מתוך ${nx.sets} · ${nx.exercises.name}` : null;
  })();

  return (
    <>
      {/* ── Video fullscreen overlay ── */}
      {videoFullscreen && isVideo && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black" onClick={() => setVideoFullscreen(false)}>
          <button
            type="button"
            aria-label="סגירה"
            className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-pill bg-white/20 text-white safe-top"
            onClick={() => setVideoFullscreen(false)}
          >
            <X className="h-6 w-6" strokeWidth={2} />
          </button>
          <div className="relative w-full max-w-sm" style={{ aspectRatio: '9/16', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <video src={ex.media_url!} controls autoPlay playsInline className="h-full w-full object-contain" />
          </div>
        </div>
      )}

      {/* ── Pause overlay ── */}
      {paused && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-black/80" dir="rtl">
          <span className="flex h-20 w-20 items-center justify-center rounded-pill bg-primary-tint">
            <Pause className="h-10 w-10 text-primary" strokeWidth={2} />
          </span>
          <div className="text-center">
            <p className="text-screen-title text-white">מושהה</p>
            <p className="mt-1 font-mono text-body text-white/70">{formatClock(elapsed)}</p>
          </div>
          <div className="w-56">
            <PrimaryButton icon={PlayIcon} onClick={handleResume}>המשך אימון</PrimaryButton>
          </div>
        </div>
      )}

      {/* ── Finish: bottom sheet ── */}
      <BottomSheet
        open={confirmFinish}
        onOpenChange={setConfirmFinish}
        title="לסיים את האימון?"
        description={`ביצעת ${setsDone} מתוך ${totalSets} סטים`}
      >
        {setsDone === 0 && (
          <p className="mb-4 rounded-inner bg-card-inner px-3 py-2 text-label text-muted-foreground">לא סימנת אף סט, האימון לא יישמר</p>
        )}
        <SheetActions>
          <Button onClick={() => setConfirmFinish(false)}>המשך באימון</Button>
          <Button
            variant="outline"
            onClick={() => {
              setConfirmFinish(false);
              setRest(null);
              if (setsDone > 0) setPhase('summary');
              else onDiscard();
            }}
          >
            {setsDone > 0 ? 'סיים' : 'צא בלי לשמור'}
          </Button>
        </SheetActions>
      </BottomSheet>

      {/* ── Main session UI ── */}
      <div className="fixed inset-0 z-[55] flex flex-col overflow-hidden bg-background" dir="rtl">
        {/* Header */}
        <header className="relative shrink-0 border-b border-[#26262D] bg-[#0E0E11] safe-top">
          <div className="flex h-14 items-center gap-1 px-1">
            <button type="button" onClick={() => setConfirmFinish(true)} aria-label="סגירת האימון" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill text-foreground active:bg-card-inner">
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate text-[16px] font-bold leading-tight">{planDay.name}</p>
              <p className="text-[13px] leading-tight text-muted-foreground">תרגיל {ptr.ex + 1} מתוך {exercises.length}</p>
            </div>
            <div className="flex shrink-0 items-center" dir="ltr">
              <span className="pl-1 text-[16px] font-semibold tabular-nums" aria-label="זמן אימון">{formatClock(elapsed)}</span>
              <button type="button" onClick={handlePause} aria-label="השהיה" className="flex h-11 w-11 items-center justify-center text-muted-foreground">
                <Pause className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </div>
          <div
            className="absolute inset-x-0 -bottom-px h-[3px]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={totalSets}
            aria-valuenow={setsDone}
            aria-label={`${setsDone} מתוך ${totalSets} סטים`}
            dir="rtl"
          >
            <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${progress}%` }} />
          </div>
        </header>

        {rest ? (
          <RestTimer
            endsAt={rest.endsAt}
            total={rest.total}
            paused={paused}
            onAdd={() => {
              tapHaptic();
              setRest((r) => (r ? { endsAt: r.endsAt + 15000, total: r.total + 15 } : r));
            }}
            onDone={endRest}
            nextLabel={nextLabel}
          />
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-card-gap px-4 py-4">
              {/* Media on a dark card — never a white square */}
              <div className="rounded-[16px] bg-[#17171C] p-3">
                {hasMedia ? (
                  isVideo ? (
                    <button type="button" className="relative block w-full" onClick={() => setVideoFullscreen(true)} aria-label="הגדלת הסרטון">
                      <video src={ex.media_url!} className="mx-auto max-h-52 w-full rounded-xl object-contain" autoPlay muted loop playsInline />
                      <span className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-pill bg-black/60 px-2.5 py-1 text-label text-white">
                        <Maximize2 className="h-3.5 w-3.5" strokeWidth={2} />
                        הגדלה
                      </span>
                    </button>
                  ) : (
                    <img src={ex.media_url!} alt={ex.name} className="mx-auto max-h-52 w-full rounded-xl object-contain" />
                  )
                ) : (
                  <div className="flex h-28 items-center justify-center">
                    <Dumbbell className="h-12 w-12 text-muted-foreground/40" strokeWidth={2} />
                  </div>
                )}
              </div>

              {/* Exercise details */}
              <div className="space-y-2">
                <h2 className="text-screen-title leading-tight">{ex.name}</h2>
                {(tags.length > 0 || currentEx.rest_seconds) && (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) => <Pill key={t}>{t}</Pill>)}
                    {restLabel(currentEx.rest_seconds) && <Pill icon={Timer}>{restLabel(currentEx.rest_seconds)}</Pill>}
                  </div>
                )}
                {ex.description && (
                  <div>
                    <p className={cn('text-body text-muted-foreground', !descOpen && 'line-clamp-2')}>{ex.description}</p>
                    <button type="button" onClick={() => setDescOpen((o) => !o)} className="min-h-[44px] text-label font-semibold text-primary-soft">
                      {descOpen ? 'פחות' : 'עוד'}
                    </button>
                  </div>
                )}
                {currentEx.notes && <p className="text-body font-medium text-primary-soft">{currentEx.notes}</p>}
              </div>

              {readyToProgress && (
                <div className="flex items-start gap-2 rounded-inner bg-primary-tint p-3">
                  <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={2} />
                  <p className="text-body">הגעת ל-{currentEx.reps_max} בכל הסטים. נסה להעלות משקל</p>
                </div>
              )}

              {/* Sets of this exercise */}
              <Card className="space-y-2 p-3">
                <h3 className="px-1 text-card-title">
                  סט {ptr.set + 1} מתוך {currentEx.sets} · {rangeLabel}
                </h3>
                <ol className="space-y-2">
                  {sets.map((s, i) =>
                    i === ptr.set ? (
                      <li key={i} className="space-y-3 rounded-inner border-2 border-primary bg-card-inner p-3" aria-current="step">
                        {/* A timed exercise: just mark the set done. */}
                        {timedSec == null && (
                          <div className="grid grid-cols-2 gap-2">
                            <Stepper id="set-weight" label='משקל (ק"ג)' value={active.weight} onChange={(v) => updateEntry('weight', v)} step={weightStep} decimals placeholder="0" />
                            <Stepper id="set-reps" label="חזרות" value={active.reps} onChange={(v) => updateEntry('reps', v)} step={1} decimals={false} placeholder={String(currentEx.reps_min)} />
                          </div>
                        )}
                        {prev && performanceLabel(prev) && (
                          <p className="text-center text-label text-muted-foreground">בפעם הקודמת: {performanceLabel(prev)}</p>
                        )}
                        <PrimaryButton icon={Check} onClick={markDone}>{s.status === 'done' ? 'עדכון הסט' : 'בוצע'}</PrimaryButton>
                      </li>
                    ) : (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => {
                            selectionHaptic();
                            setPtr({ ex: ptr.ex, set: i });
                          }}
                          className={cn(
                            'flex min-h-[48px] w-full items-center gap-3 rounded-inner px-3 text-right',
                            s.status === 'done' ? 'bg-success/10' : 'bg-card-inner',
                          )}
                        >
                          <span className="text-body font-semibold">סט {i + 1}</span>
                          <span className="flex-1 text-label tabular-nums text-muted-foreground">
                            {s.status === 'done'
                              ? performanceLabel({ weightKg: num(s.weight), reps: num(s.reps) })
                              : s.status === 'skipped'
                              ? 'דולג'
                              : 'ממתין'}
                          </span>
                          {s.status === 'done' && <Check className="h-5 w-5 text-success" strokeWidth={2.5} aria-label="בוצע" />}
                        </button>
                      </li>
                    ),
                  )}
                </ol>
              </Card>
            </div>
          </div>
        )}

        {/* Bottom nav */}
        {!rest && (
          <nav className="shrink-0 border-t border-border bg-card px-4 pt-3" style={{ paddingBottom: 'calc(0.75rem + var(--app-safe-bottom))' }}>
            <div className="flex items-center gap-2">
              <SecondaryButton className="h-11 flex-1" disabled={ptr.ex === 0} onClick={() => goExercise(-1)}>
                <ChevronRight className="h-4 w-4" strokeWidth={2} />
                קודם
              </SecondaryButton>
              <button type="button" onClick={skipSet} className="min-h-[44px] px-3 text-body font-semibold text-muted-foreground underline-offset-4 hover:underline">
                דלג
              </button>
              <SecondaryButton className="h-11 flex-1" disabled={ptr.ex >= exercises.length - 1} onClick={() => goExercise(1)}>
                הבא
                <ChevronLeft className="h-4 w-4" strokeWidth={2} />
              </SecondaryButton>
            </div>
          </nav>
        )}
      </div>
    </>
  );
}

