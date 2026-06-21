import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Users, BookOpen, Quote, TrendingUp, UserPlus, Link, Pencil, Check, X, ExternalLink, Gift, Phone, MessageSquare } from 'lucide-react';

const ADMIN_EMAIL = 'yairpwb@gmail.com';

interface Referral {
  id: string;
  friend_name: string;
  friend_phone: string;
  notes: string | null;
  status: string;
  created_at: string;
  profiles: { full_name: string | null; email: string } | null;
}

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

  // Links state
  const [snacksLink, setSnacksLink] = useState('');
  const [weighingLink, setWeighingLink] = useState('');
  const [editingSnacks, setEditingSnacks] = useState(false);
  const [editingWeighing, setEditingWeighing] = useState(false);
  const [snacksDraft, setSnacksDraft] = useState('');
  const [weighingDraft, setWeighingDraft] = useState('');
  const [isSavingLinks, setIsSavingLinks] = useState(false);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [isLoadingReferrals, setIsLoadingReferrals] = useState(true);

  const saveLink = async (key: string, value: string) => {
    setIsSavingLinks(true);
    const { error } = await (supabase as any)
      .from('app_settings')
      .upsert({ key, value }, { onConflict: 'key' });
    if (error) {
      toast({ title: 'שגיאה', description: 'לא ניתן לשמור', variant: 'destructive' });
    } else {
      if (key === 'snacks_book_link') { setSnacksLink(value); setEditingSnacks(false); }
      if (key === 'weighing_guide_link') { setWeighingLink(value); setEditingWeighing(false); }
      toast({ title: 'נשמר ✓' });
    }
    setIsSavingLinks(false);
  };

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [usersRes, contentRes, quotesRes, mealsRes, linksRes] = await Promise.all([
        supabase.from('profiles').select('id, is_active, email', { count: 'exact' }),
        supabase.from('program_content').select('id', { count: 'exact' }),
        supabase.from('daily_quotes').select('id', { count: 'exact' }),
        supabase.from('nutrition_log').select('id', { count: 'exact' }).gte('recorded_at', today.toISOString()),
        (supabase as any).from('app_settings').select('key, value').in('key', ['snacks_book_link', 'weighing_guide_link']),
      ]);

      const linkMap: Record<string, string> = {};
      (linksRes.data || []).forEach((r: { key: string; value: string }) => { linkMap[r.key] = r.value; });
      setSnacksLink(linkMap['snacks_book_link'] || '');
      setWeighingLink(linkMap['weighing_guide_link'] || '');

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

    fetchData();

    // Load referrals
    const loadReferrals = async () => {
      const { data } = await (supabase as any)
        .from('referrals')
        .select('*, profiles(full_name, email)')
        .order('created_at', { ascending: false });
      setReferrals((data || []) as Referral[]);
      setIsLoadingReferrals(false);
    };
    loadReferrals();
  }, []);

  const statCards = [
    { label: 'סה"כ מתאמנים', value: stats.totalUsers, icon: Users, color: 'text-primary' },
    { label: 'פעילים', value: stats.activeUsers, icon: TrendingUp, color: 'text-green-500' },
    { label: 'פריטי תוכן', value: stats.totalContent, icon: BookOpen, color: 'text-accent' },
    { label: 'ציטוטים', value: stats.totalQuotes, icon: Quote, color: 'text-primary' },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h2 className="text-2xl font-bold">סקירה כללית</h2>
        <p className="text-muted-foreground">ברוך הבא ללוח הניהול</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <Card key={i} className="card-elevated">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-3xl font-bold">{isLoading ? '-' : stat.value}</p>
                </div>
                <stat.icon className={`h-8 w-8 ${stat.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <Card className="card-elevated">
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold mb-4">פעולות מהירות</h3>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => navigate('/admin/users')} className="gradient-primary">
              <UserPlus className="h-4 w-4 ml-2" />
              הוסף מתאמן
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

      {/* Resource Links */}
      <Card className="card-elevated">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2">
            <Link className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">לינקים למשאבים</h3>
          </div>

          {/* Snacks Book */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">ספר נשנושים</p>
            {editingSnacks ? (
              <div className="flex gap-2">
                <Input
                  dir="ltr"
                  className="text-left flex-1"
                  placeholder="https://..."
                  value={snacksDraft}
                  onChange={e => setSnacksDraft(e.target.value)}
                  autoFocus
                />
                <Button size="icon" variant="ghost" disabled={isSavingLinks}
                  onClick={() => saveLink('snacks_book_link', snacksDraft)}>
                  <Check className="h-4 w-4 text-green-500" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setEditingSnacks(false)}>
                  <X className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {snacksLink ? (
                  <a href={snacksLink} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1 truncate max-w-xs">
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    {snacksLink}
                  </a>
                ) : (
                  <span className="text-sm text-muted-foreground italic">לא הוגדר לינק</span>
                )}
                <Button size="icon" variant="ghost" className="shrink-0 h-7 w-7"
                  onClick={() => { setSnacksDraft(snacksLink); setEditingSnacks(true); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          {/* Weighing Guide */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">מדריך שקילות</p>
            {editingWeighing ? (
              <div className="flex gap-2">
                <Input
                  dir="ltr"
                  className="text-left flex-1"
                  placeholder="https://..."
                  value={weighingDraft}
                  onChange={e => setWeighingDraft(e.target.value)}
                  autoFocus
                />
                <Button size="icon" variant="ghost" disabled={isSavingLinks}
                  onClick={() => saveLink('weighing_guide_link', weighingDraft)}>
                  <Check className="h-4 w-4 text-green-500" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setEditingWeighing(false)}>
                  <X className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {weighingLink ? (
                  <a href={weighingLink} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1 truncate max-w-xs">
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    {weighingLink}
                  </a>
                ) : (
                  <span className="text-sm text-muted-foreground italic">לא הוגדר לינק</span>
                )}
                <Button size="icon" variant="ghost" className="shrink-0 h-7 w-7"
                  onClick={() => { setWeighingDraft(weighingLink); setEditingWeighing(true); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Referrals */}
      <Card className="card-elevated">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">חבר מביא חבר — לידים</h3>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {referrals.length}
            </span>
          </div>

          {isLoadingReferrals ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
            </div>
          ) : referrals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">עדיין לא נשלחו הפנייות</p>
          ) : (
            <div className="space-y-3">
              {referrals.map(r => (
                <div key={r.id} className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">{r.friend_name}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <Phone className="h-3 w-3" />
                        <span dir="ltr">{r.friend_phone}</span>
                      </div>
                    </div>
                    <div className="text-left shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                        r.status === 'converted'
                          ? 'bg-green-500/15 text-green-500 border-green-500/30'
                          : r.status === 'contacted'
                          ? 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30'
                          : 'bg-muted text-muted-foreground border-border'
                      }`}>
                        {r.status === 'converted' ? 'הצטרף' : r.status === 'contacted' ? 'בטיפול' : 'חדש'}
                      </span>
                    </div>
                  </div>

                  {r.notes && (
                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>{r.notes}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-border/50">
                    <p className="text-xs text-muted-foreground">
                      נשלח ע"י{' '}
                      <span className="text-foreground font-medium">
                        {r.profiles?.full_name || r.profiles?.email || 'משתמש'}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString('he-IL')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
