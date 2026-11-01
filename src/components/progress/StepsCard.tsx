import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, ReferenceLine } from 'recharts';
import { format, subDays } from 'date-fns';
import { Footprints } from 'lucide-react';
import { Card } from '@/components/ds';
import { formatNumber } from './format';

const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const STEPS_PER_MINUTE = 100;

interface StepsCardProps {
  todaySteps: number;
  goal: number;
  logs: { date: string; steps: number }[];
  weeklyAverage: number | null;
  fromStartAverage: number | null;
}

interface DayBar {
  label: string;
  steps: number;
  isToday: boolean;
}

export function StepsCard({ todaySteps, goal, logs, weeklyAverage, fromStartAverage }: StepsCardProps) {
  const today = new Date();
  const days: DayBar[] = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(today, 6 - i);
    const key = format(d, 'yyyy-MM-dd');
    const isToday = i === 6;
    return {
      label: format(d, 'd/M'),
      // Today comes from the live counter, which is ahead of the last DB sync.
      steps: isToday ? todaySteps : logs.find((l) => l.date === key)?.steps ?? 0,
      isToday,
    };
  });

  const ratio = Math.min(todaySteps / goal, 1);
  const remaining = Math.max(goal - todaySteps, 0);
  const hasAnySteps = days.some((d) => d.steps > 0);
  const yMax = Math.max(goal * 1.15, ...days.map((d) => d.steps));

  return (
    <Card className="space-y-4">
      <h3 className="font-bold flex items-center gap-2">
        <Footprints className="h-5 w-5 text-primary" strokeWidth={2} />
        צעדים
      </h3>

      <div className="flex items-center gap-4">
        <div className="relative w-24 h-24 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
            <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="hsl(var(--card-inner))" strokeWidth="9" />
            <circle
              cx="50"
              cy="50"
              r={RING_RADIUS}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - ratio)}
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-lg font-bold tabular-nums">
            {Math.round((todaySteps / goal) * 100)}%
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">היום</p>
          <p className="text-3xl font-bold tabular-nums leading-tight">{formatNumber(todaySteps)}</p>
          <p className="text-sm text-muted-foreground">
            {remaining > 0
              ? `עוד ${formatNumber(remaining)} · בערך ${Math.ceil(remaining / STEPS_PER_MINUTE)} דקות הליכה`
              : `עברת את היעד של ${formatNumber(goal)}`}
          </p>
        </div>
      </div>

      {hasAnySteps ? (
        <div dir="ltr" className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={days} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <YAxis hide domain={[0, yMax]} />
              <ReferenceLine y={goal} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeWidth={1} />
              <Bar
                dataKey="steps"
                maxBarSize={28}
                isAnimationActive={false}
                shape={(props: { x?: number; y?: number; width?: number; height?: number; payload?: DayBar }) => {
                  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
                  const h = Math.max(height, 3);
                  const metGoal = (payload?.steps ?? 0) >= goal;
                  return (
                    <rect
                      x={x}
                      y={y + height - h}
                      width={width}
                      height={h}
                      rx={6}
                      fill={metGoal ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.35)'}
                      stroke={payload?.isToday ? 'hsl(var(--primary))' : 'none'}
                      strokeWidth={payload?.isToday ? 1.5 : 0}
                      strokeDasharray={payload?.isToday ? '4 3' : undefined}
                    />
                  );
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="rounded-2xl bg-card-inner px-4 py-5 text-center text-sm text-muted-foreground">
          ברגע שהטלפון יתחיל לספור צעדים, תראו כאן את השבוע שלכם
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'ממוצע שבועי', value: weeklyAverage },
          { label: 'ממוצע מתחילת התהליך', value: fromStartAverage },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-2xl bg-card-inner px-3 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-bold tabular-nums">{value != null ? formatNumber(value) : '—'}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
