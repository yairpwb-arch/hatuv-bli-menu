import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { format, subMonths } from 'date-fns';
import { TrendingDown } from 'lucide-react';
import { Card } from '@/components/ds';
import { cn } from '@/lib/utils';
import { WeightEntry, dayLabel, formatKg } from './format';

type Range = 'month' | 'quarter' | 'all';

const RANGES: { key: Range; label: string }[] = [
  { key: 'month', label: 'חודש' },
  { key: 'quarter', label: '3 חודשים' },
  { key: 'all', label: 'הכל' },
];

interface WeightTrendCardProps {
  /** Sorted oldest → newest. */
  weights: WeightEntry[];
  targetWeight: number | null;
  onOpenAll: () => void;
}

export function WeightTrendCard({ weights, targetWeight, onOpenAll }: WeightTrendCardProps) {
  const [range, setRange] = useState<Range>('all');

  const data = useMemo(() => {
    const from =
      range === 'all' ? '' : format(subMonths(new Date(), range === 'month' ? 1 : 3), 'yyyy-MM-dd');
    return weights
      .filter((w) => w.recorded_at.slice(0, 10) >= from)
      .map((w) => ({ id: w.id, label: dayLabel(w.recorded_at), weight: w.weight }));
  }, [weights, range]);

  const domain = useMemo(() => {
    const values = data.map((d) => d.weight);
    if (targetWeight != null) values.push(targetWeight);
    if (values.length === 0) return [0, 1];
    return [Math.floor(Math.min(...values) - 1), Math.ceil(Math.max(...values) + 1)];
  }, [data, targetWeight]);

  const lastIndex = data.length - 1;

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-primary" strokeWidth={2} />
          מגמת משקל
        </h3>
      </div>

      <div role="tablist" aria-label="טווח זמן" className="grid grid-cols-3 gap-1 rounded-2xl p-1 bg-card-inner">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            role="tab"
            aria-selected={range === r.key}
            onClick={() => setRange(r.key)}
            className={cn(
              'min-h-[44px] rounded-xl text-sm font-semibold transition-colors',
              range === r.key ? 'bg-card text-foreground' : 'text-muted-foreground',
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {data.length < 2 ? (
        <div className="flex flex-col items-center justify-center text-center gap-2 py-10">
          <TrendingDown className="h-8 w-8 text-muted-foreground" strokeWidth={2} />
          <p className="text-sm text-muted-foreground">
            {weights.length < 2
              ? 'המגמה תופיע אחרי שתי שקילות'
              : 'אין מספיק שקילות בטווח הזה. נסו "הכל"'}
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 h-[3px] rounded-full bg-primary" />
              משקל
            </span>
            {targetWeight != null && (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: 'hsl(var(--success))' }} />
                יעד {formatKg(targetWeight)} ק"ג
              </span>
            )}
          </div>

          {/* Charts read left → right (oldest → newest) even on an RTL page. */}
          <div dir="ltr" className="h-56 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={16}
                />
                <YAxis
                  domain={domain}
                  width={36}
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ stroke: 'hsl(var(--border))' }}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 12,
                    direction: 'rtl',
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [`${formatKg(value)} ק"ג`, 'משקל']}
                />
                {targetWeight != null && (
                  <ReferenceLine y={targetWeight} stroke="hsl(var(--success))" strokeDasharray="6 5" strokeWidth={2} />
                )}
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  isAnimationActive={false}
                  dot={(props: { cx?: number; cy?: number; index?: number }) => {
                    const { cx, cy, index } = props;
                    if (cx == null || cy == null) return <g key={`d-${index}`} />;
                    const isLast = index === lastIndex;
                    return (
                      <circle
                        key={`d-${index}`}
                        cx={cx}
                        cy={cy}
                        r={isLast ? 6 : 3}
                        fill={isLast ? 'hsl(var(--primary))' : 'hsl(var(--card))'}
                        stroke={isLast ? 'hsl(var(--card))' : 'hsl(var(--primary))'}
                        strokeWidth={isLast ? 3 : 1.5}
                      />
                    );
                  }}
                  activeDot={{ r: 6, fill: 'hsl(var(--primary))' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        תנודה של כמה מאות גרם בין שקילות זה מים, לא שומן. מסתכלים על המגמה של החודש.
      </p>

      {weights.length > 0 && (
        <button
          type="button"
          onClick={onOpenAll}
          className="min-h-[44px] text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          כל השקילות ({weights.length})
        </button>
      )}
    </Card>
  );
}
