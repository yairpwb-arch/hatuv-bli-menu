import { useState, useEffect } from 'react';
import { Dumbbell, Timer, ChevronUp } from 'lucide-react';
import { useActiveWorkout } from '@/contexts/ActiveWorkoutContext';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function WorkoutMiniBar() {
  const { params, isVisible, maximize, sessionKey } = useActiveWorkout();
  const [elapsed, setElapsed] = useState(0);

  // Reset elapsed when a new session starts
  useEffect(() => {
    setElapsed(0);
  }, [sessionKey]);

  // Tick only when session is minimized (visible = false but params exist)
  useEffect(() => {
    if (!params || isVisible) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [params, isVisible]);

  if (!params || isVisible) return null;

  return (
    <button
      onClick={maximize}
      dir="rtl"
      className="fixed bottom-[72px] inset-x-3 z-40 flex items-center justify-between px-4 py-3 rounded-2xl shadow-2xl text-white"
      style={{
        background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
      }}
    >
      {/* Right: icon + name */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
          <Dumbbell className="h-4.5 w-4.5" />
        </div>
        <div className="text-right">
          <p className="text-[11px] opacity-75 leading-none mb-0.5">אימון פעיל — לחץ לחזור</p>
          <p className="font-bold text-sm leading-none">{params.planDay.name}</p>
        </div>
      </div>

      {/* Left: timer + arrow */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 font-mono text-sm font-semibold">
          <Timer className="h-3.5 w-3.5 opacity-80" />
          {formatTime(elapsed)}
        </div>
        <ChevronUp className="h-4 w-4 opacity-70" />
      </div>
    </button>
  );
}
