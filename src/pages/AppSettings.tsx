import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Sun, Moon, Bell, BellOff, Info, LogOut, User, Loader2, BookOpen, ExternalLink, CheckCircle2, XCircle, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { Capacitor } from '@capacitor/core';
import { useNotificationSetup } from '@/hooks/useNotificationSetup';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">
        {title}
      </p>
      <div className="card-elevated overflow-hidden divide-y divide-border/50">
        {children}
      </div>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────
function Row({
  icon: Icon,
  label,
  description,
  right,
  onClick,
  danger,
}: {
  icon: React.ElementType;
  label: string;
  description?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3.5 ${onClick ? 'cursor-pointer hover:bg-secondary/50 active:bg-secondary transition-colors' : ''}`}
      onClick={onClick}
    >
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${danger ? 'bg-destructive/10' : 'bg-primary/10'}`}>
        <Icon className={`h-4 w-4 ${danger ? 'text-destructive' : 'text-primary'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${danger ? 'text-destructive' : ''}`}>{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {right}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AppSettings() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { profile, user, refreshProfile, signOut } = useAuth();

  const isNative = Capacitor.isNativePlatform();

  // Notification hook (MASSAI pattern — no auto permission request)
  const {
    enableNotifications,
    disableNotifications,
    getPermissionStatus,
    permissionStatus,
    isLoading: notifLoading,
  } = useNotificationSetup();

  // Notifications state — driven by profile.notifications_enabled
  const [notifEnabled, setNotifEnabled] = useState<boolean>(false);
  const [showSources, setShowSources] = useState(false);

  // Test notification state
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [testLog, setTestLog] = useState<string | null>(null);

  // Sync from profile — re-run whenever notifications_enabled changes (not just on id change)
  const profileNotifEnabled = (profile as any)?.notifications_enabled;
  useEffect(() => {
    if (profile) {
      setNotifEnabled(profileNotifEnabled ?? false);
    }
  }, [profile?.id, profileNotifEnabled]);

  // Check OS permission state on mount; re-check when app comes back to foreground
  useEffect(() => {
    getPermissionStatus();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') getPermissionStatus();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [getPermissionStatus]);

  const handleNotifToggle = async (enabled: boolean) => {
    if (!user) return;

    if (enabled) {
      if (isNative && permissionStatus === 'denied') {
        toast({
          title: 'הרשאות חסומות',
          description: 'יש לאפשר התראות בהגדרות המכשיר ידנית',
          variant: 'destructive',
        });
        return;
      }
      const success = await enableNotifications(user.id);
      if (success) {
        setNotifEnabled(true);
        await refreshProfile();
        toast({ title: 'התראות הופעלו ✓', description: 'תקבל תזכורות יומיות ושבועיות מהאפליקציה' });
      } else if (permissionStatus === 'denied') {
        toast({ title: 'הרשאות חסומות', description: 'יש לאפשר התראות בהגדרות המכשיר ידנית', variant: 'destructive' });
      } else if (isNative) {
        // OS permission was granted but token hasn't arrived yet — mark enabled in DB
        // so the background registration listener saves the token when it arrives
        await supabase
          .from('notification_settings' as any)
          .upsert({ user_id: user.id, notifications_enabled: true }, { onConflict: 'user_id' });
        setNotifEnabled(true);
        toast({ title: 'התראות הופעלו', description: 'יתכן שיידרשו מספר שניות עד שההתראות יופעלו במלואן' });
      }
    } else {
      const success = await disableNotifications(user.id);
      if (success) {
        setNotifEnabled(false);
        await refreshProfile();
        toast({ title: 'התראות כובו', description: 'לא תקבל יותר התראות מהאפליקציה' });
      }
    }
  };

  const handleTestNotification = async () => {
    if (!user) return;
    setTestStatus('loading');
    setTestLog(null);
    try {
      const { data, error } = await supabase.functions.invoke('push-notification', {
        body: { type: 'send_test' },
      });
      if (error) {
        // Try to extract the actual body from the Edge Function error
        let detail = error.message;
        try {
          const body = await (error as any).context?.json?.();
          if (body?.detail) detail = body.detail;
          else if (body?.error) detail = body.error;
        } catch { /* ignore */ }
        setTestStatus('error');
        setTestLog(detail);
        return;
      }
      if (data?.ok) {
        setTestStatus('success');
      } else {
        setTestStatus('error');
        const detail = data?.detail ?? data?.error ?? JSON.stringify(data);
        setTestLog(detail);
      }
    } catch (err) {
      setTestStatus('error');
      setTestLog(String(err));
    }
  };

  // Description based on permission state and platform
  const notifDescription = () => {
    if (!isNative) return 'זמין רק באפליקציה הנייד (iOS / Android)';
    if (permissionStatus === 'denied') return 'הרשאה נדחתה — אפשר ידנית בהגדרות המכשיר';
    if (!notifEnabled) return 'לחץ להפעלת התראות';
    return 'תקבל תזכורות: משפט יומי, שקילה, שאלון ועוד';
  };

  // Account deletion state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (!user) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.functions.invoke('delete-account', {});
      if (error) {
        toast({ title: 'שגיאה במחיקת החשבון', description: error.message, variant: 'destructive' });
        return;
      }
      await signOut();
      navigate('/auth');
    } catch (err) {
      toast({ title: 'שגיאה', description: String(err), variant: 'destructive' });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const doSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen pb-24 pt-2 px-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full w-9 h-9"
          onClick={() => navigate(-1)}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">הגדרות</h1>
          <p className="text-xs text-muted-foreground">התאמה אישית של האפליקציה</p>
        </div>
      </div>

      <div className="space-y-6 max-w-lg mx-auto">

        {/* Account */}
        <Section title="חשבון">
          <Row
            icon={User}
            label={profile?.full_name || 'הפרופיל שלי'}
            description={profile?.email || ''}
            onClick={() => navigate('/app/profile')}
            right={<ChevronLeft className="h-4 w-4 text-muted-foreground" />}
          />
        </Section>

        {/* Appearance */}
        <Section title="מראה">
          <Row
            icon={theme === 'dark' ? Moon : Sun}
            label="ערכת נושא"
            description={theme === 'dark' ? 'מצב לילה פעיל' : 'מצב יום פעיל'}
            right={
              <div dir="ltr">
                <Switch
                  checked={theme === 'dark'}
                  onCheckedChange={toggleTheme}
                />
              </div>
            }
          />
        </Section>

        {/* Notifications */}
        <Section title="התראות">
          <Row
            icon={notifEnabled && isNative ? Bell : BellOff}
            label="התראות אפליקציה"
            description={notifDescription()}
            right={
              <div dir="ltr" className="flex items-center gap-2">
                {notifLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                <Switch
                  checked={notifEnabled && isNative}
                  onCheckedChange={handleNotifToggle}
                  disabled={!isNative || notifLoading}
                />
              </div>
            }
          />

          {/* Test notification button — only when notifications are active on native */}
          {notifEnabled && isNative && (
            <div className="px-4 py-3 space-y-2">
              <Button
                size="sm"
                variant="outline"
                className="w-full h-9 text-sm gap-2"
                onClick={handleTestNotification}
                disabled={testStatus === 'loading'}
              >
                {testStatus === 'loading' ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" />שולח...</>
                ) : testStatus === 'success' ? (
                  <><CheckCircle2 className="h-3.5 w-3.5 text-green-500" />נשלחה! בדוק את המכשיר</>
                ) : (
                  <><Send className="h-3.5 w-3.5" />שלח התראת בדיקה</>
                )}
              </Button>
              {testStatus === 'error' && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive" dir="rtl">
                  <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold mb-0.5">שגיאה בשליחה:</p>
                    <p className="break-all opacity-80">{testLog}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* About */}
        <Section title="אודות">
          <Row
            icon={Info}
            label="חטוב בלי תפריט"
            description="גרסה 2.4 — © 2026"
          />
          <Row
            icon={BookOpen}
            label="מקורות ומחקרים"
            description="המלצות הבריאות מבוססות על מחקר מדעי"
            onClick={() => setShowSources((v) => !v)}
            right={
              <ChevronLeft
                className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${showSources ? '-rotate-90' : ''}`}
              />
            }
          />
          {showSources && (
            <div className="px-4 py-4 bg-muted/30 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground mb-3">
                תוכן האפליקציה מבוסס על המקורות הבאים:
              </p>
              {[
                {
                  label: 'ארגון הבריאות העולמי — המלצות פעילות גופנית',
                  url: 'https://www.who.int/publications/i/item/9789240015128',
                },
                {
                  label: 'ארגון הבריאות העולמי — תזונה בריאה',
                  url: 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet',
                },
                {
                  label: 'משרד הבריאות הישראלי — המלצות תזונה',
                  url: 'https://www.health.gov.il/subjects/fitness/nutrition/Pages/nutrition_recommendations.aspx',
                },
                {
                  label: 'National Institutes of Health — ניהול משקל בריא',
                  url: 'https://www.nhlbi.nih.gov/health/educational/lose_wt/',
                },
                {
                  label: 'James Clear, Atomic Habits (2018) — מחקר יצירת הרגלים',
                  url: 'https://jamesclear.com/atomic-habits',
                },
              ].map(({ label, url }) => (
                <button
                  key={url}
                  className="w-full text-right flex items-start gap-2.5"
                  onClick={() => window.open(url, '_blank')}
                >
                  <ExternalLink className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <span className="text-xs text-primary leading-relaxed">{label}</span>
                </button>
              ))}
            </div>
          )}
        </Section>

        {/* Logout + Delete */}
        <Section title="חשבון">
          <Row
            icon={LogOut}
            label="התנתקות"
            description="יציאה מהחשבון"
            onClick={doSignOut}
            danger
          />
          <Row
            icon={Trash2}
            label="מחיקת חשבון"
            description="מחיקה מלאה ובלתי הפיכה של הנתונים"
            onClick={() => setShowDeleteDialog(true)}
            danger
          />
        </Section>

      </div>

      {/* Delete account confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={(open) => { setShowDeleteDialog(open); if (!open) setDeleteConfirmText(''); }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-destructive">מחיקת חשבון</DialogTitle>
            <DialogDescription>
              פעולה זו תמחק לצמיתות את כל הנתונים שלך ולא ניתן לבטלה.
              כדי לאשר, הקלד <strong>מחק</strong> בשדה למטה.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              placeholder="הקלד מחק לאישור"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              dir="rtl"
            />
            <Button
              variant="destructive"
              className="w-full"
              disabled={deleteConfirmText !== 'מחק' || isDeleting}
              onClick={handleDeleteAccount}
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
              מחק את החשבון לצמיתות
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
