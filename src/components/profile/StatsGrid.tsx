import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Scale, Ruler, Activity, Target, TrendingDown, ArrowDown, ArrowUp,
  Flame, BookOpen, UserCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatsGridProps {
  currentWeight: number | null;
  initialWeight: number | null;
  targetWeight: number | null;
  height: number | null;
  currentDay: number;
  totalStreak: number;
  lessonsCompleted: number;
  totalLessons: number;
  gender?: string | null;
}

const GENDER_LABELS: Record<string, string> = {
  male: 'זכר',
  female: 'נקבה',
  other: 'אחר',
};

export function StatsGrid({
  currentWeight,
  initialWeight,
  targetWeight,
  height,
  currentDay,
  totalStreak,
  lessonsCompleted,
  totalLessons,
  gender,
}: StatsGridProps) {
  const calculateBMI = () => {
    if (!currentWeight || !height || height === 0) return null;
    const heightInMeters = height / 100;
    return (currentWeight / (heightInMeters * heightInMeters)).toFixed(1);
  };

  const getBMIStatus = (bmi: number) => {
    if (bmi < 18.5) return { label: 'תת משקל', color: 'text-warning' };
    if (bmi < 25) return { label: 'תקין', color: 'text-success' };
    if (bmi < 30) return { label: 'עודף משקל', color: 'text-warning' };
    return { label: 'השמנה', color: 'text-destructive' };
  };

  const weightDiff = initialWeight && currentWeight 
    ? (currentWeight - initialWeight) 
    : null;

  const weightToGoal = targetWeight && currentWeight 
    ? (currentWeight - targetWeight) 
    : null;

  const bmi = calculateBMI();
  const bmiStatus = bmi ? getBMIStatus(parseFloat(bmi)) : null;

  const lessonProgress = totalLessons > 0 ? Math.round((lessonsCompleted / totalLessons) * 100) : 0;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Current Weight */}
        <Card className="glass-card">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Scale className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">משקל נוכחי</p>
                <p className="text-lg font-bold">
                  {currentWeight ? `${currentWeight} ק"ג` : '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Height */}
        <Card className="glass-card">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Ruler className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">גובה</p>
                <p className="text-lg font-bold">
                  {height ? `${height} ס"מ` : '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* BMI */}
        <Card className="glass-card">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">BMI</p>
                <p className="text-lg font-bold">{bmi || '-'}</p>
                {bmiStatus && (
                  <p className={cn('text-xs', bmiStatus.color)}>{bmiStatus.label}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Target Weight */}
        <Card className="glass-card">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">משקל יעד</p>
                <p className="text-lg font-bold">
                  {targetWeight ? `${targetWeight} ק"ג` : '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Gender */}
        <Card className="glass-card">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <UserCircle2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">מגדר</p>
                <p className="text-lg font-bold">
                  {gender ? (GENDER_LABELS[gender] ?? gender) : '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Weight Change & Goal Cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Total Weight Change */}
        {weightDiff !== null && (
          <Card className={cn(
            'glass-card',
            weightDiff < 0 && 'bg-success/5 border-success/20'
          )}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center',
                  weightDiff < 0 ? 'bg-success/10' : 'bg-destructive/10'
                )}>
                  {weightDiff < 0 ? (
                    <ArrowDown className="h-5 w-5 text-success" />
                  ) : (
                    <ArrowUp className="h-5 w-5 text-destructive" />
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">סה"כ שינוי</p>
                  <p className={cn(
                    'text-lg font-bold',
                    weightDiff < 0 ? 'text-success' : 'text-destructive'
                  )}>
                    {weightDiff > 0 ? '+' : ''}{weightDiff.toFixed(1)} ק"ג
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Weight to Goal */}
        {weightToGoal !== null && (
          <Card className="glass-card">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <TrendingDown className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">עד היעד</p>
                  <p className="text-lg font-bold">
                    {weightToGoal <= 0 ? (
                      <span className="text-success">הגעת! 🎉</span>
                    ) : (
                      `${weightToGoal.toFixed(1)} ק"ג`
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Streak & Lessons Progress */}
      <div className="grid grid-cols-2 gap-3">
        {/* Total Streak */}
        <Card className="glass-card">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
                <Flame className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">רצף כולל</p>
                <p className="text-lg font-bold">{totalStreak} ימים</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lessons Progress */}
        <Card className="glass-card">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center relative">
                <BookOpen className="h-5 w-5 text-primary" />
                <svg className="absolute inset-0" viewBox="0 0 40 40">
                  <circle
                    cx="20"
                    cy="20"
                    r="18"
                    fill="none"
                    stroke="hsl(var(--primary) / 0.2)"
                    strokeWidth="3"
                  />
                  <circle
                    cx="20"
                    cy="20"
                    r="18"
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="3"
                    strokeDasharray={`${lessonProgress * 1.13} 113`}
                    strokeLinecap="round"
                    transform="rotate(-90 20 20)"
                  />
                </svg>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">שיעורים</p>
                <p className="text-lg font-bold">{lessonsCompleted}/{totalLessons}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
