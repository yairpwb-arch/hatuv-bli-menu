import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Sun, Moon, Bell, BellOff, Info, LogOut, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { Capacitor } from '@capacitor/core';
import { setNotificationsEnabled, getPermissionState } from '@/lib/notifications';
import { toast } from '@/hooks/use-toast';

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
  const { profile, user, refreshProfile } = useAuth();

  const isNative = Capacitor.isNativePlatform();

  // Notifications state — driven by profile.notifications_enabled
  const [notifEnabled, setNotifEnabled] = useState<boolean>(true);
  const [permState, setPermState] = useState<'granted' | 'denied' | 'prompt' | 'unavailable'>('unavailable');
  const [isTogglingNotif, setIsTogglingNotif] = useState(false);

  // Sync from profile
  useEffect(() => {
    if (profile) {
      setNotifEnabled((profile as any).notifications_enabled ?? true);
    }
  }, [profile?.id]);

  // Check OS permission state
  useEffect(() => {
    getPermissionState().then(setPermState);
  }, []);

  const handleNotifToggle = async (enabled: boolean) => {
    if (!user) return;

    // If trying to enable but OS permission is denied, redirect to device settings
    if (enabled && isNative && permState === 'denied') {
      toast({
        title: 'הרשאות חסומות',
        description: 'יש לאפשר התראות בהגדרות המכשיר ידנית',
        variant: 'destructive',
      });
      return;
    }

    setIsTogglingNotif(true);
    try {
      await setNotificationsEnabled(user.id, enabled);
      setNotifEnabled(enabled);
      await refreshProfile();
      toast({
        title: enabled ? 'התראות הופעלו ✓' : 'התראות כובו',
        description: enabled
          ? 'תקבל תזכורות יומיות ושבועיות מהאפליקציה'
          : 'לא תקבל יותר התראות מהאפליקציה',
      });
    } catch (err) {
      toast({ title: 'שגיאה', description: 'לא ניתן לשנות הגדרת התראות', variant: 'destructive' });
    } finally {
      setIsTogglingNotif(false);
    }
  };

  // Description based on permission state and platform
  const notifDescription = () => {
    if (!isNative) return 'זמין רק באפליקציה הנייד (iOS / Android)';
    if (permState === 'denied') return 'הרשאה נדחתה — אפשר ידנית בהגדרות המכשיר';
    if (!notifEnabled) return 'לחץ להפעלת התראות';
    return 'תקבל תזכורות: משפט יומי, שקילה, שאלון ועוד';
  };

  // Alias for sign out since hooks can't be called inside handlers
  const { signOut } = useAuth();
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
                {isTogglingNotif && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                <Switch
                  checked={notifEnabled && isNative}
                  onCheckedChange={handleNotifToggle}
                  disabled={!isNative || isTogglingNotif}
                />
              </div>
            }
          />

          {/* Show reminder types only when enabled */}
          {isNative && notifEnabled && permState === 'granted' && (
            <div className="px-4 py-3 bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground mb-2">התראות פעילות:</p>
              <div className="space-y-1 text-xs text-muted-foreground">
                {[
                  '💬 משפט יומי — כל יום בשעה 10:00',
                  '🎉 מעבר שלב — כל שבת בשעה 19:00',
                  '🔥 הרגלים חדשים — כל ראשון בשעה 9:00',
                  '⚖️ שקילה + שאלון — כל חמישי בשעה 20:00',
                  '📋 תזכורת שאלון — שישי 12:00 / שבת 16:00',
                ].map((t) => (
                  <p key={t}>{t}</p>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* About */}
        <Section title="אודות">
          <Row
            icon={Info}
            label="חטוב בלי תפריט"
            description="גרסה 1.0 — © 2025"
          />
        </Section>

        {/* Logout */}
        <Section title="חשבון">
          <Row
            icon={LogOut}
            label="התנתקות"
            description="יציאה מהחשבון"
            onClick={doSignOut}
            danger
          />
        </Section>

      </div>
    </div>
  );
}
