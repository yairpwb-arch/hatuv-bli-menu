import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Scale } from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, ReferenceLine 
} from 'recharts';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

interface WeightEntry {
  recorded_at: string;
  weight: number;
}

interface WeightChartProps {
  weightHistory: WeightEntry[];
  targetWeight: number | null;
}

export function WeightChart({ weightHistory, targetWeight }: WeightChartProps) {
  const chartData = weightHistory.map((entry) => ({
    date: format(new Date(entry.recorded_at), 'dd/MM', { locale: he }),
    fullDate: format(new Date(entry.recorded_at), 'dd/MM/yyyy', { locale: he }),
    weight: entry.weight,
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg" dir="rtl">
          <p className="font-medium">{payload[0].payload.fullDate}</p>
          <p className="text-primary font-bold">{payload[0].value} ק"ג</p>
          {targetWeight && (
            <p className="text-xs text-muted-foreground">
              {payload[0].value > targetWeight 
                ? `${(payload[0].value - targetWeight).toFixed(1)} ק"ג מעל היעד`
                : payload[0].value < targetWeight 
                  ? `${(targetWeight - payload[0].value).toFixed(1)} ק"ג מתחת ליעד`
                  : 'ביעד! 🎯'
              }
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  // Calculate domain with target weight consideration
  const allWeights = weightHistory.map(e => e.weight);
  if (targetWeight) allWeights.push(targetWeight);
  const minWeight = Math.min(...allWeights) - 2;
  const maxWeight = Math.max(...allWeights) + 2;

  return (
    <Card className="glass-card animate-fade-in">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Scale className="h-5 w-5 text-primary" />
          גרף התקדמות
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length > 1 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                />
                <YAxis
                  domain={[minWeight, maxWeight]}
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                />
                <Tooltip content={<CustomTooltip />} />
                
                {/* Goal Line */}
                {targetWeight && (
                  <ReferenceLine 
                    y={targetWeight} 
                    stroke="hsl(var(--success))" 
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    label={{ 
                      value: `יעד: ${targetWeight} ק"ג`, 
                      position: 'right',
                      fill: 'hsl(var(--success))',
                      fontSize: 11,
                    }}
                  />
                )}
                
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="hsl(var(--primary))"
                  strokeWidth={3}
                  dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 8, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--background))', strokeWidth: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-muted-foreground text-center">
            <div>
              <Scale className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>הגרף יוצג לאחר שתי שקילות לפחות</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
