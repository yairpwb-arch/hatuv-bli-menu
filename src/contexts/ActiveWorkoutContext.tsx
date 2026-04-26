import { createContext, useContext, useState, ReactNode } from 'react';
import type { WorkoutPlanDay, WorkoutPlanExercise } from '@/hooks/useWorkoutPlan';
import type { ExerciseLog } from '@/components/WorkoutActiveSession';

export interface WorkoutSessionParams {
  planDay: WorkoutPlanDay;
  exercises: WorkoutPlanExercise[];
  onFinish: (durationMinutes: number, logs: ExerciseLog[]) => Promise<void>;
}

interface ActiveWorkoutContextValue {
  params: WorkoutSessionParams | null;
  isVisible: boolean;
  sessionKey: string; // changes when new session starts → forces component reset
  start: (p: WorkoutSessionParams) => void;
  minimize: () => void;
  maximize: () => void;
  end: () => void;
}

const ActiveWorkoutContext = createContext<ActiveWorkoutContextValue | null>(null);

export function ActiveWorkoutProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useState<WorkoutSessionParams | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [sessionKey, setSessionKey] = useState('');

  const start = (p: WorkoutSessionParams) => {
    setParams(p);
    setSessionKey(`${p.planDay.id}-${Date.now()}`);
    setIsVisible(true);
  };

  const minimize = () => setIsVisible(false);
  const maximize = () => setIsVisible(true);
  const end = () => {
    setParams(null);
    setIsVisible(false);
    setSessionKey('');
  };

  return (
    <ActiveWorkoutContext.Provider value={{ params, isVisible, sessionKey, start, minimize, maximize, end }}>
      {children}
    </ActiveWorkoutContext.Provider>
  );
}

export function useActiveWorkout() {
  const ctx = useContext(ActiveWorkoutContext);
  if (!ctx) throw new Error('useActiveWorkout must be used within ActiveWorkoutProvider');
  return ctx;
}
