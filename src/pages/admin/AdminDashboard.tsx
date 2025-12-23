import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Users, BookOpen, Quote, TrendingUp } from 'lucide-react';

interface Stats {
  totalUsers: number;
  activeUsers: number;
  totalContent: number;
  totalQuotes: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    activeUsers: 0,
    totalContent: 0,
    totalQuotes: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setIsLoading(true);

      const [usersRes, contentRes, quotesRes] = await Promise.all([
        supabase.from('profiles').select('id, is_active', { count: 'exact' }),
        supabase.from('program_content').select('id', { count: 'exact' }),
        supabase.from('daily_quotes').select('id', { count: 'exact' }),
      ]);

      setStats({
        totalUsers: usersRes.count || 0,
        activeUsers: usersRes.data?.filter((u) => u.is_active).length || 0,
        totalContent: contentRes.count || 0,
        totalQuotes: quotesRes.count || 0,
      });

      setIsLoading(false);
    };

    fetchStats();
  }, []);

  const statCards = [
    { label: 'סה"כ משתמשים', value: stats.totalUsers, icon: Users, color: 'text-blue-500' },
    { label: 'משתמשים פעילים', value: stats.activeUsers, icon: TrendingUp, color: 'text-green-500' },
    { label: 'פריטי תוכן', value: stats.totalContent, icon: BookOpen, color: 'text-purple-500' },
    { label: 'ציטוטים יומיים', value: stats.totalQuotes, icon: Quote, color: 'text-orange-500' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">סקירה כללית</h2>
        <p className="text-muted-foreground">ברוך הבא ללוח הניהול</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <Card key={i} className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-3xl font-bold">
                    {isLoading ? '-' : stat.value}
                  </p>
                </div>
                <stat.icon className={`h-8 w-8 ${stat.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
