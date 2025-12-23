import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Calendar, Scale, TrendingDown, Activity, Ruler } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface WeightEntry {
  recorded_at: string;
  weight: number;
}

interface ProfileData {
  start_date: string | null;
  current_weight: number | null;
  initial_weight: number | null;
  height: number | null;
}

export default function AppProfile() {
  const { profile, user, currentDay } = useAuth();
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      setIsLoading(true);

      // Fetch profile data with new fields
      const { data: profileRes } = await supabase
        .from('profiles')
        .select('start_date, current_weight, initial_weight, height')
        .eq('id', user.id)
        .single();

      if (profileRes) {
        setProfileData(profileRes);
      }

      // Fetch weight history
      const { data: weightData } = await supabase
        .from('weight_log')
        .select('recorded_at, weight')
        .eq('user_id', user.id)
        .order('recorded_at', { ascending: true });

      setWeightHistory(weightData || []);
      setIsLoading(false);
    };

    fetchData();
  }, [user]);

  const calculateBMI = (weight: number | null, height: number | null) => {
    if (!weight || !height || height === 0) return null;
    const heightInMeters = height / 100;
    return (weight / (heightInMeters * heightInMeters)).toFixed(1);
  };

  const weightDifference = profileData?.initial_weight && profileData?.current_weight
    ? (profileData.current_weight - profileData.initial_weight).toFixed(1)
    : null;

  const chartData = weightHistory.map((entry) => ({
    date: format(new Date(entry.recorded_at), 'dd/MM', { locale: he }),
    weight: entry.weight,
  }));

  if (isLoading) {
    return (
      <div className="min-h-screen pb-20 pt-4 px-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 pt-4 px-4 space-y-6">
      <div className="animate-slide-up">
        <h2 className="text-2xl font-bold text-foreground">הפרופיל שלי</h2>
        <p className="text-muted-foreground">מעקב אחר ההתקדמות שלך</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="glass-card animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">תאריך התחלה</p>
                <p className="font-bold">
                  {profileData?.start_date
                    ? format(new Date(profileData.start_date), 'dd/MM/yyyy', { locale: he })
                    : 'לא נקבע'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card animate-slide-up" style={{ animationDelay: '0.15s' }}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">יום נוכחי</p>
                <p className="font-bold">יום {currentDay}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Scale className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">משקל נוכחי</p>
                <p className="font-bold">
                  {profileData?.current_weight ? `${profileData.current_weight} ק"ג` : '-'}
                </p>
                {weightDifference && (
                  <p className={`text-xs ${Number(weightDifference) < 0 ? 'text-success' : 'text-destructive'}`}>
                    {Number(weightDifference) > 0 ? '+' : ''}{weightDifference} ק"ג
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card animate-slide-up" style={{ animationDelay: '0.25s' }}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">משקל התחלתי</p>
                <p className="font-bold">
                  {profileData?.initial_weight ? `${profileData.initial_weight} ק"ג` : '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {profileData?.height && (
          <Card className="glass-card animate-slide-up" style={{ animationDelay: '0.3s' }}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Ruler className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">גובה</p>
                  <p className="font-bold">{profileData.height} ס"מ</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {profileData?.height && profileData?.current_weight && (
          <Card className="glass-card animate-slide-up" style={{ animationDelay: '0.35s' }}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">BMI</p>
                  <p className="font-bold">{calculateBMI(profileData.current_weight, profileData.height)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Weight Progress Chart */}
      <Card className="glass-card animate-slide-up" style={{ animationDelay: '0.4s' }}>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            מעקב משקל
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    domain={['dataMin - 2', 'dataMax + 2']}
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      direction: 'rtl',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => [`${value} ק"ג`, 'משקל']}
                  />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="hsl(var(--primary))"
                    strokeWidth={3}
                    dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, fill: 'hsl(var(--primary))' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              <p>עדיין אין נתוני שקילה. השקילה הראשונה תופיע כאן.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}