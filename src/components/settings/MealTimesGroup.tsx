import { useMemo } from 'react';
import { Utensils } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useHabitSchedule } from '@/hooks/useHabitSchedule';
import { DayPlan, minutesFromWake, planDay, programDay, windowBounds } from '@/lib/habitSchedule';
import type { SleepSchedule } from '@/lib/sleepSchedule';
import { format } from 'date-fns';

/** Today's timed-habit plan (eating window, meals) for the trainee's current hours. */
export function useTodayPlan(userId: string | undefined, hours: SleepSchedule): { plan: DayPlan | null; mealTimes: Record<string, string>; saveMealTimes: (t: Record<string, string>) => Promise<boolean> } {
  const { data, saveMealTimes } = useHabitSchedule(userId);
  const plan = useMemo(() => {
    if (!data?.startDate) return null;
    const today = new Date();
    return planDay(today, programDay(data.startDate, today), hours, data.habits, data.mealTimes);
  }, [data, hours]);
  return { plan, mealTimes: data?.mealTimes ?? {}, saveMealTimes };
}

/**
 * "סידור הארוחות שלי": one time per meal, shown only while a meal-layout
 * habit is active. A time the trainee set stays put when the sleep hours
 * change; the rest follow the recommended times.
 */
export function MealTimesGroup({ hours, Group, Row }: {
  hours: SleepSchedule;
  Group: (p: { title: string; children: React.ReactNode }) => JSX.Element;
  Row: (p: { icon: typeof Utensils; label: string; description?: string; right?: React.ReactNode }) => JSX.Element;
}) {
  const { user } = useAuth();
  const { plan, mealTimes, saveMealTimes } = useTodayPlan(user?.id, hours);
  const meals = plan?.moments.filter((m) => m.kind === 'meal') ?? [];
  if (!plan || meals.length === 0) return null;

  const bounds = windowBounds(plan);
  const edited = Object.keys(mealTimes).length > 0;

  const change = async (key: string, value: string) => {
    if (!value) return;
    if (bounds) {
      const t = minutesFromWake(value, hours);
      if (t < minutesFromWake(bounds.open, hours) || t > minutesFromWake(bounds.close, hours)) {
        toast.error(`הארוחה צריכה להיות בין ${bounds.open} ל-${bounds.close}`);
        return;
      }
    }
    if (!(await saveMealTimes({ ...mealTimes, [key]: value }))) toast.error('לא נשמר, נסו שוב');
  };

  return (
    <Group title="סידור הארוחות שלי">
      {meals.map((m) => (
        <Row
          key={m.meal!.key}
          icon={Utensils}
          label={m.label}
          description={m.meal!.optional ? 'לא חובה' : mealTimes[m.meal!.key] ? 'השעה שלך' : 'שעה מומלצת'}
          right={
            <input
              type="time"
              step={900}
              value={format(m.at, 'HH:mm')}
              aria-label={m.label}
              onChange={(e) => change(m.meal!.key, e.target.value)}
              className="h-11 rounded-button bg-card-inner px-2 text-body tabular-nums"
            />
          }
        />
      ))}
      {edited && (
        <button
          type="button"
          onClick={async () => {
            if (await saveMealTimes({})) toast('חזרנו לשעות המומלצות');
          }}
          className="min-h-[48px] w-full px-4 text-right text-body font-semibold text-primary-soft"
        >
          חזרה לשעות המומלצות
        </button>
      )}
      <p className="px-4 py-3 text-label text-muted-foreground">
        {bounds ? `כל הארוחות בתוך חלון האכילה: ${bounds.open}–${bounds.close}.` : 'השעות המומלצות זזות יחד עם שעות השינה.'}
      </p>
    </Group>
  );
}
