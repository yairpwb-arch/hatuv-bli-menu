import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Users, BookOpen, Quote, TrendingUp, UtensilsCrossed, UserPlus, LogOut, Link2, Save, Loader2 } from 'lucide-react';

const ADMIN_EMAIL = 'yairpwb@gmail.com';

interface Stats {
  totalUsers: number;
  activeUsers: number;
  totalContent: number;
  totalQuotes: number;
  mealsLoggedToday: number;
}

interface GlobalSettings {
  weekly_survey_link: string;
  snacks_book_link: string;
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
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    weekly_survey_link: '',
    snacks_book_link: '',
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [usersRes, contentRes, quotesRes, mealsRes, settingsRes] = await Promise.all([
        supabase.from('profiles').select('id, is_active, email', { count: 'exact' }),
        supabase.from('program_content').select('id', { count: 'exact' }),
        supabase.from('daily_quotes').select('id', { count: 'exact' }),
        supabase.from('nutrition_log').select('id', { count: 'exact' }).gte('recorded_at', today.toISOString()),
        supabase.from('app_settings').select('key, value'),
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

      // Parse settings
      if (settingsRes.data) {
        const settings: GlobalSettings = {
          weekly_survey_link: '',
          snacks_book_link: '',
        };
        settingsRes.data.forEach((s: { key: string; value: string | null }) => {
          if (s.key === 'weekly_survey_link') settings.weekly_survey_link = s.value || '';
          if (s.key === 'snacks_book_link') settings.snacks_book_link = s.value || '';
        });
        setGlobalSettings(settings);
      }

      setIsLoading(false);
    };

    fetchData();
  }, []);

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      // Update both settings
      await Promise.all([
        supabase
          .from('app_settings')
          .update({ value: globalSettings.weekly_survey_link })
          .eq('key', 'weekly_survey_link'),
        supabase
          .from('app_settings')
          .update({ value: globalSettings.snacks_book_link })
          .eq('key', 'snacks_book_link'),
      ]);
      toast({ title: 'נשמר!', description: 'ההגדרות עודכנו בהצלחה' });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({ title: 'שגיאה', description: 'לא ניתן לשמור את ההגדרות', variant: 'destructive' });
    } finally {
      setIsSavingSettings(false);
    }
  };

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

      {/* Global Settings - Links Management */}
      <Card className="card-elevated">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <Link2 className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">ניהול קישורים גלובליים</h3>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="weekly-survey" className="text-sm font-medium">
                קישור לשאלון מעקב שבועי
              </Label>
              <Input
                id="weekly-survey"
                value={globalSettings.weekly_survey_link}
                onChange={(e) =>
                  setGlobalSettings({ ...globalSettings, weekly_survey_link: e.target.value })
                }
                placeholder="https://forms.google.com/..."
                dir="ltr"
                className="text-left"
              />
              <p className="text-xs text-muted-foreground">
                קישור זה יופיע בכפתור הצף בתחתית עמוד התוכן
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="snacks-book" className="text-sm font-medium">
                קישור לספר נשנושים
              </Label>
              <Input
                id="snacks-book"
                value={globalSettings.snacks_book_link}
                onChange={(e) =>
                  setGlobalSettings({ ...globalSettings, snacks_book_link: e.target.value })
                }
                placeholder="https://drive.google.com/..."
                dir="ltr"
                className="text-left"
              />
              <p className="text-xs text-muted-foreground">
                קישור זה יופיע ככפתור נפרד בעמוד התוכן
              </p>
            </div>
            <Button
              onClick={handleSaveSettings}
              disabled={isSavingSettings}
              className="gradient-primary"
            >
              {isSavingSettings ? (
                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 ml-2" />
              )}
              שמור הגדרות
            </Button>
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
