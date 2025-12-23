import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Users, BookOpen, Quote, TrendingUp, UtensilsCrossed, UserPlus, LogOut } from 'lucide-react';

const ADMIN_EMAIL = 'yairpwb@gmail.com';

interface Stats {
  totalUsers: number;
  activeUsers: number;
  totalContent: number;
  totalQuotes: number;
  mealsLoggedToday: number;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    activeUsers: 0,
    totalContent: 0,
    totalQuotes: 0,
    mealsLoggedToday: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setIsLoading(true);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [usersRes, contentRes, quotesRes, mealsRes] = await Promise.all([
        supabase.from('profiles').select('id, is_active, email', { count: 'exact' }),
        supabase.from('program_content').select('id', { count: 'exact' }),
        supabase.from('daily_quotes').select('id', { count: 'exact' }),
        supabase.from('nutrition_log').select('id', { count: 'exact' }).gte('recorded_at', today.toISOString()),
      ]);

      // Filter out admin from user counts
      const nonAdminUsers = usersRes.data?.filter((u) => u.email.toLowerCase() !== ADMIN_EMAIL) || [];

      setStats({
        totalUsers: nonAdminUsers.length,
        activeUsers: nonAdminUsers.filter((u) => u.is_active).length,
        totalContent: contentRes.count || 0,
        totalQuotes: quotesRes.count || 0,
        mealsLoggedToday: mealsRes.count || 0,
      });

      setIsLoading(false);
    };

    fetchStats();
  }, []);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast({ title: 'להתראות!', description: 'התנתקת בהצלחה' });
      navigate('/auth');
    } catch (error) {
      console.error('Logout error:', error);
      toast({ title: 'שגיאה', description: 'לא ניתן להתנתק', variant: 'destructive' });
    }
  };

  const statCards = [
    { label: 'סה"כ משתמשים', value: stats.totalUsers, icon: Users, color: 'text-primary' },
    { label: 'משתמשים פעילים', value: stats.activeUsers, icon: TrendingUp, color: 'text-success' },
    { label: 'פריטי תוכן', value: stats.totalContent, icon: BookOpen, color: 'text-accent' },
    { label: 'ציטוטים יומיים', value: stats.totalQuotes, icon: Quote, color: 'text-primary' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold">סקירה כללית</h2>
          <p className="text-muted-foreground">ברוך הבא ללוח הניהול</p>
        </div>
        
        {/* Logout Button */}
        <Button
          variant="outline"
          onClick={handleLogout}
          className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
        >
          <LogOut className="h-4 w-4 ml-2" />
          התנתקות
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <Card key={i} className="card-elevated">
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

      {/* Today's Activity Widget */}
      <Card className="card-elevated">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <UtensilsCrossed className="h-7 w-7 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">ארוחות שנרשמו היום</p>
              <p className="text-3xl font-bold">{isLoading ? '-' : stats.mealsLoggedToday}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card className="card-elevated">
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold mb-4">פעולות מהירות</h3>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => navigate('/admin/users')} className="gradient-primary">
              <UserPlus className="h-4 w-4 ml-2" />
              הוסף משתמש חדש
            </Button>
            <Button variant="outline" onClick={() => navigate('/admin/content')}>
              <BookOpen className="h-4 w-4 ml-2" />
              נהל תכנים
            </Button>
            <Button variant="outline" onClick={() => navigate('/admin/quotes')}>
              <Quote className="h-4 w-4 ml-2" />
              נהל ציטוטים
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
