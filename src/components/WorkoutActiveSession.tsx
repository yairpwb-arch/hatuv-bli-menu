import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  X, CheckCircle2, Timer, Dumbbell, ChevronLeft, ChevronRight,
  Trophy, SkipForward, Pause, Play as PlayIcon, Minimize2, Maximize2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkoutPlanDay, WorkoutPlanExercise } from '@/hooks/useWorkoutPlan';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExerciseLog {
  exerciseId: string;
  sets: { reps: string; weightKg: string }[];
}

interface Props {
  planDay: WorkoutPlanDay;
  exercises: WorkoutPlanExercise[];
  onMinimize: () => void;
  onFinish: (durationMinutes: number, logs: ExerciseLog[]) => void;
}

// ── Utilities ────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|avi)$/i.test(url) || url.includes('/videos/');
}

// ── Rest Timer ────────────────────────────────────────────────────────────────

function RestTimer({
  seconds, onDone, onSkip, paused,
}: {
  seconds: number; onDone: () => void; onSkip: () => void; paused: boolean;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const pct = ((seconds - remaining) / seconds) * 100;

  useEffect(() => {
    if (paused || remaining <= 0) {
      if (remaining <= 0) onDone();
      return;
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, onDone, paused]);

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
          <circle
            cx="50" cy="50" r="44"
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 44}`}
            strokeDashoffset={`${2 * Math.PI * 44 * (1 - pct / 100)}`}
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Timer className="h-5 w-5 text-primary mb-1" />
          <span className="text-2xl font-bold tabular-nums">{formatTime(remaining)}</span>
        </div>
      </div>
      <p className="text-muted-foreground font-medium">זמן מנוחה</p>
      <Button variant="outline" size="sm" onClick={onSkip} className="gap-1.5">
        <SkipForward className="h-4 w-4" />
        דלג על המנוחה
      </Button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function WorkoutActiveSession({
  planDay, exercises, onMinimize, onFinish,
}: Props) {
  // Elapsed timer using real time diff so it stays accurate after backgrounding
  const startTimeRef = useRef(Date.now());
  const pauseStartRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [videoFullscreen, setVideoFullscreen] = useState(false);

  // Per-exercise set logs
  const initLogs = (): ExerciseLog[] =>
    exercises.map((ex) => ({
      exerciseId: ex.exercise_id,
      sets: Array.from({ length: ex.sets }, () => ({ reps: '', weightKg: '' })),
    }));

  const [logs, setLogs] = useState<ExerciseLog[]>(initLogs);
  const [exerciseIdx, setExerciseIdx] = useState(0);
  const [setIdx, setSetIdx] = useState(0);
  const [resting, setResting] = useState(false);
  const [finished, setFinished] = useState(false);

  // ── WakeLock — keeps screen on during workout ──
  useEffect(() => {
    let wakeLock: any = null;
    const acquire = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch (_) {}
    };
    acquire();
    const onVisible = () => { if (document.visibilityState === 'visible') acquire(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      wakeLock?.release();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // ── Elapsed timer — stops when paused ──
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [paused]);

  // ── Pause / resume ──
  const handlePause = () => {
    pauseStartRef.current = Date.now();
    setPaused(true);
  };

  const handleResume = () => {
    if (pauseStartRef.current !== null) {
      // Shift the start time forward by pause duration → elapsed stays accurate
      startTimeRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = null;
    }
    setPaused(false);
  };

  // ── Session state ──
  const currentEx = exercises[exerciseIdx];
  const totalExercises = exercises.length;
  const progress =
    totalExercises > 0
      ? ((exerciseIdx + setIdx / (currentEx?.sets || 1)) / totalExercises) * 100
      : 0;

  const updateLog = (field: 'reps' | 'weightKg', value: string) => {
    setLogs((prev) =>
      prev.map((l, i) =>
        i === exerciseIdx
          ? { ...l, sets: l.sets.map((s, j) => (j === setIdx ? { ...s, [field]: value } : s)) }
          : l
      )
    );
  };

  const handleSetDone = useCallback(() => setResting(true), []);

  const afterRest = useCallback(() => {
    setResting(false);
    const totalSets = currentEx?.sets ?? 1;
    if (setIdx + 1 < totalSets) {
      setSetIdx((s) => s + 1);
    } else if (exerciseIdx + 1 < totalExercises) {
      setExerciseIdx((e) => e + 1);
      setSetIdx(0);
    } else {
      setFinished(true);
    }
  }, [currentEx, setIdx, exerciseIdx, totalExercises]);

  const handleFinish = () => {
    onFinish(Math.max(1, Math.round(elapsed / 60)), logs);
  };

  // ── Finished screen ──
  if (finished) {
    const durationMinutes = Math.max(1, Math.round(elapsed / 60));
    return (
      <div
        className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center gap-6 px-6 text-center"
        dir="rtl"
      >
        <div className="w-24 h-24 rounded-full bg-orange-100 dark:bg-orange-950/40 flex items-center justify-center">
          <Trophy className="h-12 w-12 text-orange-500" />
        </div>
        <div>
          <h2 className="text-3xl font-bold mb-1">כל הכבוד!</h2>
          <p className="text-muted-foreground">סיימת את האימון</p>
        </div>
        <div className="flex gap-6 text-center">
          <div>
            <p className="text-3xl font-bold text-primary">{durationMinutes}</p>
            <p className="text-xs text-muted-foreground mt-1">דקות</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-primary">{totalExercises}</p>
            <p className="text-xs text-muted-foreground mt-1">תרגילים</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-primary">
              {exercises.reduce((acc, ex) => acc + ex.sets, 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">סטים</p>
          </div>
        </div>
        <Button size="lg" className="w-full max-w-xs" onClick={handleFinish}>
          <CheckCircle2 className="h-5 w-5 ml-2" />
          שמור אימון
        </Button>
      </div>
    );
  }

  if (!currentEx) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center" dir="rtl">
        <p className="text-muted-foreground">אין תרגילים לאימון זה</p>
      </div>
    );
  }

  const ex = currentEx.exercises;
  const hasMedia = !!ex.media_url;
  const isVideo = hasMedia && isVideoUrl(ex.media_url!);

  return (
    <>
      {/* ── Video fullscreen overlay (9:16 reels style) ── */}
      {videoFullscreen && isVideo && (
        <div
          className="fixed inset-0 z-[70] bg-black flex items-center justify-center"
          onClick={() => setVideoFullscreen(false)}
        >
          <button
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/20 text-white"
            onClick={() => setVideoFullscreen(false)}
          >
            <X className="h-6 w-6" />
          </button>
          <div
            className="relative w-full max-w-sm"
            style={{ aspectRatio: '9/16', maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <video
              src={ex.media_url!}
              controls
              autoPlay
              playsInline
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      )}

      {/* ── Pause overlay ── */}
      {paused && (
        <div
          className="fixed inset-0 z-[60] bg-black/75 flex flex-col items-center justify-center gap-5"
          dir="rtl"
        >
          <div className="w-20 h-20 rounded-full bg-orange-500/20 flex items-center justify-center">
            <Pause className="h-10 w-10 text-orange-500" />
          </div>
          <div className="text-center">
            <p className="text-white text-2xl font-bold">מושהה</p>
            <p className="text-white/60 text-base font-mono mt-1">{formatTime(elapsed)}</p>
          </div>
          <div className="flex flex-col gap-3 w-52">
            <Button
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold h-12 rounded-xl gap-2"
              onClick={handleResume}
            >
              <PlayIcon className="h-5 w-5" />
              המשך אימון
            </Button>
            <Button
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10 h-10 rounded-xl gap-2 bg-transparent"
              onClick={() => { handleResume(); setFinished(true); }}
            >
              סיים ושמור
            </Button>
          </div>
        </div>
      )}

      {/* ── Main session UI ── */}
      <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden" dir="rtl">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
          {/* Minimize button */}
          <button
            onClick={onMinimize}
            className="p-2 rounded-full hover:bg-muted transition-colors"
            aria-label="מזער"
          >
            <Minimize2 className="h-5 w-5 text-muted-foreground" />
          </button>

          <div className="text-center">
            <p className="font-semibold text-sm">{planDay.name}</p>
            <p className="text-xs text-muted-foreground">
              תרגיל {exerciseIdx + 1} מתוך {totalExercises}
            </p>
          </div>

          {/* Timer + pause */}
          <div className="flex items-center gap-1">
            <span className="text-sm font-mono text-muted-foreground">{formatTime(elapsed)}</span>
            <button
              onClick={handlePause}
              className="p-2 rounded-full hover:bg-muted transition-colors"
              aria-label="השהה"
            >
              <Pause className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <Progress value={progress} className="h-1 rounded-none shrink-0" />

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto pb-4">
          {resting ? (
            <RestTimer
              seconds={currentEx.rest_seconds ?? 60}
              onDone={afterRest}
              onSkip={afterRest}
              paused={paused}
            />
          ) : (
            <div className="flex flex-col">
              {/* Media */}
              {hasMedia ? (
                <div
                  className={cn(
                    'w-full bg-muted overflow-hidden flex items-center justify-center relative',
                    isVideo && 'cursor-pointer'
                  )}
                  onClick={() => isVideo && setVideoFullscreen(true)}
                >
                  {isVideo ? (
                    <>
                      <video
                        src={ex.media_url!}
                        className="w-full max-h-56 object-contain"
                        autoPlay muted loop playsInline
                      />
                      {/* Tap-to-fullscreen hint */}
                      <div className="absolute inset-0 flex items-end justify-center pb-2 pointer-events-none">
                        <div className="bg-black/50 rounded-full px-2.5 py-1 flex items-center gap-1">
                          <Maximize2 className="h-3.5 w-3.5 text-white" />
                          <span className="text-white text-xs">הגדל</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <img src={ex.media_url!} alt={ex.name} className="w-full max-h-56 object-contain" />
                  )}
                </div>
              ) : (
                <div className="w-full h-32 bg-muted flex items-center justify-center">
                  <Dumbbell className="h-12 w-12 text-muted-foreground/30" />
                </div>
              )}

              <div className="px-4 pt-4 space-y-4">
                {/* Exercise info */}
                <div>
                  <h2 className="text-xl font-bold">{ex.name}</h2>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {(ex.muscle_groups || []).map((g) => (
                      <Badge key={g} variant="secondary" className="text-xs">{g}</Badge>
                    ))}
                    {ex.equipment && (
                      <Badge variant="outline" className="text-xs">{ex.equipment}</Badge>
                    )}
                  </div>
                  {ex.description && (
                    <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
                      {ex.description}
                    </p>
                  )}
                  {currentEx.notes && (
                    <p className="text-primary text-sm mt-1 font-medium">💡 {currentEx.notes}</p>
                  )}
                </div>

                {/* Set card */}
                <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">סט {setIdx + 1} מתוך {currentEx.sets}</span>
                    <span className="text-sm text-muted-foreground">
                      {currentEx.reps_min}–{currentEx.reps_max} חזרות
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">משקל (ק"ג)</label>
                      <Input
                        type="number" inputMode="decimal" placeholder="0"
                        value={logs[exerciseIdx]?.sets[setIdx]?.weightKg ?? ''}
                        onChange={(e) => updateLog('weightKg', e.target.value)}
                        className="text-center text-lg font-semibold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">חזרות</label>
                      <Input
                        type="number" inputMode="numeric" placeholder="0"
                        value={logs[exerciseIdx]?.sets[setIdx]?.reps ?? ''}
                        onChange={(e) => updateLog('reps', e.target.value)}
                        className="text-center text-lg font-semibold"
                      />
                    </div>
                  </div>
                  <Button className="w-full" onClick={handleSetDone}>
                    <CheckCircle2 className="h-4 w-4 ml-2" />
                    בצעתי סט זה
                  </Button>
                </div>

                {/* Sets overview dots */}
                <div className="flex gap-2 flex-wrap">
                  {Array.from({ length: currentEx.sets }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium border',
                        i < setIdx
                          ? 'bg-primary text-primary-foreground border-primary'
                          : i === setIdx
                          ? 'bg-primary/20 text-primary border-primary'
                          : 'bg-muted text-muted-foreground border-border'
                      )}
                    >
                      {i + 1}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom nav */}
        {!resting && (
          <div className="shrink-0 border-t border-border bg-card px-4 py-3 flex items-center justify-between gap-3">
            <Button
              variant="outline" size="sm"
              disabled={exerciseIdx === 0 && setIdx === 0}
              onClick={() => {
                if (setIdx > 0) {
                  setSetIdx((s) => s - 1);
                } else if (exerciseIdx > 0) {
                  const prevEx = exercises[exerciseIdx - 1];
                  setExerciseIdx((e) => e - 1);
                  setSetIdx(prevEx.sets - 1);
                }
              }}
            >
              <ChevronRight className="h-4 w-4 ml-1" />
              קודם
            </Button>

            <Button
              variant="ghost" size="sm"
              onClick={() => {
                const totalSets = currentEx.sets;
                if (setIdx + 1 < totalSets) {
                  setSetIdx((s) => s + 1);
                } else if (exerciseIdx + 1 < totalExercises) {
                  setExerciseIdx((e) => e + 1);
                  setSetIdx(0);
                } else {
                  setFinished(true);
                }
              }}
            >
              <SkipForward className="h-4 w-4 ml-1" />
              דלג
            </Button>

            <Button size="sm" variant="destructive" onClick={() => setFinished(true)}>
              סיים אימון
              <ChevronLeft className="h-4 w-4 mr-1" />
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
