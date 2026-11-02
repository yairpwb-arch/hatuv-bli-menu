import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { recordSleepChange } from '@/lib/sleepSchedule';
import { MealTimesGroup, useTodayPlan } from '@/components/settings/MealTimesGroup';
import {
  AlertTriangle, BellRing, BookOpen, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, FileText,
  HeartPulse, KeyRound, Loader2, LogOut, Mail, MessageCircle, Moon, Send, Shield, Sunrise, Trash2, Type, User, Watch, XCircle,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Card, PrimaryButton, SecondaryButton } from '@/components/ds';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { Capacitor } from '@capacitor/core';
import { useNotificationSetup } from '@/hooks/useNotificationSetup';
import { useAppLinks } from '@/hooks/useAppLinks';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { openAppSystemSettings, openExternal } from '@/lib/systemSettings';
import { TextSize, getTextSize, setTextSize } from '@/lib/textSize';
import { connectWatch, isWatchConnected, syncWatchWorkouts } from '@/lib/watchWorkouts';
import { useSleepSchedule } from '@/hooks/useSleepSchedule';
import { resyncSleepToDevice } from '@/lib/deviceCalendar';
import type { SleepSchedule } from '@/lib/sleepSchedule';

// ── Grouped card with divided rows ────────────────────────────────────────────
function Group({ title, children, danger }: { title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <section className="space-y-2">
      <h2 className={cn('px-1 text-label font-semibold', danger ? 'text-destructive' : 'text-muted-foreground')}>{title}</h2>
      <Card className={cn('divide-y divide-border p-0', danger && 'border-destructive/40')}>{children}</Card>
    </section>
  );
}

function Row({
  icon: Icon, label, description, right, onClick, danger, chevron,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  chevron?: boolean;
}) {
  const body = (
    <>
      <Icon className={cn('h-5 w-5 shrink-0', danger ? 'text-destructive' : 'text-primary')} strokeWidth={2} />
      <div className="min-w-0 flex-1 text-right">
        <p className={cn('text-body', danger && 'text-destructive')}>{label}</p>
        {description && <p className="truncate text-label text-muted-foreground">{description}</p>}
      </div>
      {right}
      {chevron && <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />}
    </>
  );
  const cls = 'flex min-h-[56px] w-full items-center gap-3 px-4 py-2';
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, 'transition-colors active:bg-card-inner')}>{body}</button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

type PrefKey = 'habits' | 'steps' | 'weigh' | 'workout_walk' | 'weekly_summary' | 'new_content';
const PREF_ROWS: { key: PrefKey; label: string; description?: string }[] = [
  { key: 'habits', label: 'תזכורת הרגלים יומית' },
  { key: 'workout_walk', label: 'תזכורות אימון והליכה', description: 'שעתיים לפני השעה ביומן' },
  { key: 'steps', label: 'תזכורת צעדים', description: '4 שעות לפני השינה, כשחסר ליעד' },
  { key: 'weigh', label: 'תזכורת שקילה', description: 'יום שישי בבוקר' },
  { key: 'weekly_summary', label: 'שאלון שבועי', description: 'יום שישי' },
  { key: 'new_content', label: 'שבוע או חלק חדש', description: 'כשנפתח תוכן חדש' },
];

const TEXT_SIZES: { value: TextSize; label: string }[] = [
  { value: 'small', label: 'קטן' },
  { value: 'normal', label: 'רגיל' },
  { value: 'large', label: 'גדול' },
];

const SOURCES = [
  { label: 'ארגון הבריאות העולמי — המלצות פעילות גופנית', url: 'https://www.who.int/publications/i/item/9789240015128' },
  { label: 'ארגון הבריאות העולמי — תזונה בריאה', url: 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet' },
  { label: 'משרד הבריאות — המלצות תזונה', url: 'https://www.health.gov.il/subjects/fitness/nutrition/Pages/nutrition_recommendations.aspx' },
  { label: 'National Institutes of Health — ניהול משקל בריא', url: 'https://www.nhlbi.nih.gov/health/educational/lose_wt/' },
  { label: 'James Clear, Atomic Habits (2018) — יצירת הרגלים', url: 'https://jamesclear.com/atomic-habits' },
];

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
    retryRegistration,
    permissionStatus,
    isLoading: notifLoading,
  } = useNotificationSetup();

  // Notifications state — driven by notification_settings table
  const [notifEnabled, setNotifEnabled] = useState<boolean>(false);
  const [hasToken, setHasToken] = useState<boolean>(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);

  // Test notification state
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [testLog, setTestLog] = useState<string | null>(null);

  // ── Read notification_settings directly (source of truth) ──────────────────
  useEffect(() => {
    if (!user) return;

    // Initial fetch
    const fetchNS = async () => {
      const { data } = await supabase
        .from('notification_settings' as any)
        .select('notifications_enabled, player_id, registration_error')
        .eq('user_id', user.id)
        .maybeSingle();
      setNotifEnabled((data as any)?.notifications_enabled ?? false);
      setHasToken(!!((data as any)?.player_id));
      setRegistrationError((data as any)?.registration_error ?? null);
    };
    fetchNS();

    // Realtime subscription — updates toggle + token state when FCM token arrives
    const channel = supabase
      .channel(`ns_${user.id}`)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'notification_settings', filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          const row = payload.new ?? payload.old;
          if (row) {
            setNotifEnabled(!!row.notifications_enabled);
            setHasToken(!!row.player_id);
            setRegistrationError(row.registration_error ?? null);
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

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
      const success = await enableNotifications(user.id);
      if (success) {
        setNotifEnabled(true);
        await refreshProfile();
        toast({ title: 'התראות הופעלו', description: 'תקבל תזכורות יומיות ושבועיות מהאפליקציה' });
      } else {
        // MassAI fallback: if OS permission was granted but token timed out,
        // still mark as enabled so the user can retry registration later.
        const osGranted = await getPermissionStatus();
        if (osGranted) {
          const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jerusalem'; } catch { return 'Asia/Jerusalem'; } })();
          await (supabase as any)
            .from('notification_settings')
            .upsert({ user_id: user.id, notifications_enabled: true, timezone: tz }, { onConflict: 'user_id' });
          setNotifEnabled(true);
          await refreshProfile();
          toast({ title: 'התראות הופעלו', description: 'ממתין לרישום המכשיר — לחץ "נסה לרשום מחדש" אם לא מגיע' });
        } else {
          toast({ title: 'הרשאות חסומות', description: 'יש לאפשר התראות בהגדרות המכשיר ידנית', variant: 'destructive' });
        }
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
        // Check delivery: OneSignal returns `recipients`, FCM direct returns `sent`
        const batches: any[] = Array.isArray(data?.onesignal) ? data.onesignal : [];
        const totalSuccess = batches.reduce(
          (sum: number, batch: any) => sum + (batch?.recipients ?? 0) + (batch?.sent ?? 0),
          0,
        );
        const errors = batches.flatMap((batch: any) => batch?.errors ?? []);

        if (totalSuccess > 0) {
          setTestStatus('success');
        } else {
          setTestStatus('error');
          const rawResponse = JSON.stringify(batches, null, 2);
          setTestLog(
            errors.length > 0
              ? `שגיאה: ${errors.join(' | ')}\n\n${rawResponse}`
              : `לא נשלח — בדוק שה-push token תקין\n\n${rawResponse}`,
          );
        }
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
    if (!hasToken && registrationError) return 'שגיאת רישום FCM — לחץ "נסה שוב" למטה';
    if (!hasToken) return 'ממתין לרישום המכשיר... לחץ "נסה שוב" אם תקוע';
    return 'תקבל תזכורות: שקילה, הליכה, סיכום יומי ועוד';
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


  const links = useAppLinks();

  // ── Per-type notification switches (notification_settings.prefs) ──────────
  const [prefs, setPrefs] = useState<Partial<Record<PrefKey, boolean>>>({});
  const [habitTime, setHabitTime] = useState('20:00');
  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('notification_settings')
      .select('prefs, habit_reminder_time')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }: { data: { prefs?: Record<PrefKey, boolean>; habit_reminder_time?: string } | null }) => {
        setPrefs(data?.prefs ?? {});
        if (data?.habit_reminder_time) setHabitTime(data.habit_reminder_time.slice(0, 5));
      });
  }, [user?.id]);

  const savePrefs = async (patch: { prefs?: Partial<Record<PrefKey, boolean>>; habit_reminder_time?: string }) => {
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('notification_settings')
      .upsert({ user_id: user.id, ...patch }, { onConflict: 'user_id' });
    if (error) toast({ title: 'לא נשמר', description: 'נסו שוב', variant: 'destructive' });
  };
  const togglePref = (key: PrefKey, on: boolean) => {
    const next = { ...prefs, [key]: on };
    setPrefs(next);
    savePrefs({ prefs: next });
  };

  // ── Sleep hours (profiles.sleep_time / wake_time) ──────────────────────────
  const sleep = useSleepSchedule(user?.id);
  const [sleepDraft, setSleepDraft] = useState<SleepSchedule | null>(null);
  const sleepShown = sleepDraft ?? sleep.schedule;
  // Late wake-up + early bedtime can leave no eating window at all.
  const { plan: todayPlan } = useTodayPlan(user?.id, sleep.schedule);
  const saveSleep = async () => {
    if (!user || !sleepDraft) return;
    if (sleepDraft.bed === sleep.schedule.bed && sleepDraft.wake === sleep.schedule.wake) return;
    if (!sleepDraft.bed || !sleepDraft.wake) return;
    const ok = await sleep.save(sleepDraft);
    if (!ok) {
      toast({ title: 'לא נשמר', description: 'נסו שוב', variant: 'destructive' });
      return;
    }
    // The new hours apply from today on; past days in the calendar keep theirs.
    recordSleepChange(user.id, sleep.schedule, sleepDraft);
    setSleepDraft(null);
    toast({ title: 'שעות השינה עודכנו' });
    resyncSleepToDevice(user.id, sleepDraft);
  };

  // ── Account edits ──────────────────────────────────────────────────────────
  const [editing, setEditing] = useState<'name' | 'email' | 'password' | null>(null);
  const [draft, setDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const openEdit = (field: 'name' | 'email' | 'password') => {
    setDraft(field === 'name' ? profile?.full_name ?? '' : field === 'email' ? profile?.email ?? '' : '');
    setEditing(field);
  };
  const saveAccount = async () => {
    if (!user || !editing) return;
    setIsSaving(true);
    let error: { message: string } | null = null;
    if (editing === 'name') {
      ({ error } = await supabase.from('profiles').update({ full_name: draft.trim() }).eq('id', user.id));
      if (!error) await refreshProfile();
    } else if (editing === 'email') {
      ({ error } = await supabase.auth.updateUser({ email: draft.trim() }));
    } else {
      ({ error } = await supabase.auth.updateUser({ password: draft }));
    }
    setIsSaving(false);
    if (error) {
      toast({ title: 'לא נשמר', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: 'נשמר',
      description: editing === 'email' ? 'שלחנו קישור אישור לכתובת החדשה' : undefined,
    });
    setEditing(null);
  };
  const draftValid =
    editing === 'name' ? draft.trim().length >= 2
      : editing === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.trim())
      : draft.length >= 8;

  // ── Connections ────────────────────────────────────────────────────────────
  const platform = Capacitor.getPlatform();
  const healthName = platform === 'ios' ? 'Apple Health' : 'Health Connect';
  const [stepsConnected, setStepsConnected] = useState<boolean | null>(null);
  const [watchOn, setWatchOn] = useState(() => (user ? isWatchConnected(user.id) : false));
  const [calendarOn, setCalendarOn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isNative) return;
    (async () => {
      try {
        if (platform === 'android') {
          const { StepCounter } = await import('@/plugins/StepCounterPlugin');
          setStepsConnected((await StepCounter.checkPermission()).activityRecognition === 'granted');
        } else {
          setStepsConnected(true); // iOS never reveals HealthKit read access
        }
        const { CapacitorCalendar, CalendarPermissionScope } = await import('@ebarooni/capacitor-calendar');
        const { result } = await CapacitorCalendar.checkPermission({ scope: CalendarPermissionScope.WRITE_CALENDAR });
        setCalendarOn(result === 'granted');
      } catch {
        // statuses stay unknown
      }
    })();
  }, [isNative, platform]);

  const connectSteps = async () => {
    if (platform === 'android') {
      const { StepCounter } = await import('@/plugins/StepCounterPlugin');
      const res = await StepCounter.requestPermission();
      if (res.activityRecognition === 'granted') setStepsConnected(true);
      else await openAppSystemSettings();
    } else {
      await openAppSystemSettings();
    }
  };
  const connectWatchRow = async () => {
    if (!user) return;
    const res = await connectWatch(user.id);
    if (res === 'connected') {
      setWatchOn(true);
      syncWatchWorkouts(user.id).catch(() => undefined);
      toast({ title: 'השעון חובר' });
    } else if (res === 'denied') {
      toast({ title: 'לא ניתנה הרשאה', description: `אפשר לאשר בהגדרות ${healthName}` });
    }
  };
  const connectCalendar = async () => {
    const { CapacitorCalendar } = await import('@ebarooni/capacitor-calendar');
    const { result } = platform === 'ios'
      ? await CapacitorCalendar.requestWriteOnlyCalendarAccess()
      : await CapacitorCalendar.requestFullCalendarAccess();
    if (result === 'granted') setCalendarOn(true);
    else await openAppSystemSettings();
  };

  // ── Appearance / about ─────────────────────────────────────────────────────
  const [textSize, setTextSizeState] = useState<TextSize>(getTextSize);
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    if (!isNative) return;
    import('@capacitor/app').then(({ App }) => App.getInfo()).then((i) => setVersion(`${i.version} (${i.build})`)).catch(() => undefined);
  }, [isNative]);

  // ── Danger zone ────────────────────────────────────────────────────────────
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);

  const osNotificationsOff = isNative && permissionStatus === 'denied';
  const statusText = (on: boolean | null) => (on == null ? '' : on ? 'מחובר' : 'לא מחובר');

  return (
    <div className="min-h-screen px-4 pb-24 pt-4">
      <header className="mb-card-gap flex items-center gap-1">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="חזרה"
          className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-pill text-muted-foreground"
        >
          <ChevronRight className="h-6 w-6" strokeWidth={2} />
        </button>
        <h1 className="text-screen-title">הגדרות</h1>
      </header>

      <div className="mx-auto max-w-lg space-y-6">
        {/* Account */}
        <Group title="חשבון">
          <Row icon={User} label="שם" description={profile?.full_name || 'להוספה'} onClick={() => openEdit('name')} chevron />
          <Row icon={Mail} label="אימייל" description={profile?.email || ''} onClick={() => openEdit('email')} chevron />
          <Row icon={KeyRound} label="שינוי סיסמה" onClick={() => openEdit('password')} chevron />
        </Group>

        {/* Notifications */}
        <Group title="שעות שינה">
          {([
            { field: 'bed', icon: Moon, label: 'שעת שינה' },
            { field: 'wake', icon: Sunrise, label: 'שעת קימה' },
          ] as const).map((r) => (
            <Row
              key={r.field}
              icon={r.icon}
              label={r.label}
              right={
                <input
                  type="time"
                  value={sleepShown[r.field]}
                  aria-label={r.label}
                  onChange={(e) => setSleepDraft({ ...sleepShown, [r.field]: e.target.value })}
                  onBlur={saveSleep}
                  className="h-11 rounded-button bg-card-inner px-2 text-body tabular-nums"
                />
              }
            />
          ))}
          <p className="px-4 py-3 text-label text-muted-foreground">
            לפי השעות האלה: סיכום היום נפתח שעה לפני השינה, ובלילה אין התראות.
          </p>
          {todayPlan?.noWindow && (
            <p className="flex items-start gap-2 bg-primary-tint px-4 py-3 text-label font-semibold text-primary-soft">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              שעות השינה שלך לא משאירות חלון אכילה. כדאי לבדוק אותן
            </p>
          )}
        </Group>

        <MealTimesGroup hours={sleep.schedule} Group={Group} Row={Row} />

        <Group title="התראות">
          {osNotificationsOff && (
            <div className="flex items-center gap-3 bg-destructive/10 px-4 py-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" strokeWidth={2} />
              <p className="flex-1 text-body font-semibold text-destructive">ההתראות כבויות בטלפון</p>
              <SecondaryButton size="sm" onClick={() => openAppSystemSettings()}>להגדרות</SecondaryButton>
            </div>
          )}
          <Row
            icon={BellRing}
            label="התראות"
            description={notifDescription()}
            right={
              <div dir="ltr" className="flex items-center gap-2">
                {notifLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <Switch checked={notifEnabled && isNative} onCheckedChange={handleNotifToggle} disabled={!isNative || notifLoading} aria-label="התראות" />
              </div>
            }
          />
          {notifEnabled && isNative && PREF_ROWS.map((p) => (
            <div key={p.key} className="flex min-h-[56px] items-center gap-3 px-4 py-2 pr-12">
              <div className="min-w-0 flex-1">
                <p className="text-body">{p.label}</p>
                {p.description && <p className="text-label text-muted-foreground">{p.description}</p>}
              </div>
              {p.key === 'habits' && prefs.habits !== false && (
                <input
                  type="time"
                  value={habitTime}
                  aria-label="שעת התזכורת"
                  onChange={(e) => setHabitTime(e.target.value)}
                  onBlur={() => savePrefs({ habit_reminder_time: habitTime })}
                  className="h-11 rounded-button bg-card-inner px-2 text-body tabular-nums"
                />
              )}
              <div dir="ltr">
                <Switch checked={prefs[p.key] !== false} onCheckedChange={(on) => togglePref(p.key, on)} aria-label={p.label} />
              </div>
            </div>
          ))}
          {notifEnabled && !hasToken && isNative && (
            <div className="space-y-2 px-4 py-3">
              {registrationError && (
                <div className="flex items-start gap-2 rounded-inner bg-destructive/10 px-3 py-2 text-label text-destructive">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="break-all">{registrationError}</p>
                </div>
              )}
              <SecondaryButton className="w-full" onClick={() => user && retryRegistration(user.id)}>נסה לרשום מחדש</SecondaryButton>
            </div>
          )}
          {notifEnabled && hasToken && isNative && (
            <div className="space-y-2 px-4 py-3">
              <SecondaryButton className="w-full" icon={testStatus === 'success' ? CheckCircle2 : Send} onClick={handleTestNotification} disabled={testStatus === 'loading'}>
                {testStatus === 'loading' ? 'שולח...' : testStatus === 'success' ? 'נשלחה, בדקו את הטלפון' : 'שלח התראת בדיקה'}
              </SecondaryButton>
              {testStatus === 'error' && (
                <p className="break-all rounded-inner bg-destructive/10 px-3 py-2 text-label text-destructive">{testLog}</p>
              )}
            </div>
          )}
        </Group>

        {/* Connections */}
        {isNative && (
          <Group title="חיבורים">
            <Row
              icon={HeartPulse}
              label={platform === 'ios' ? 'Apple Health' : 'ספירת צעדים'}
              description={statusText(stepsConnected)}
              right={!stepsConnected && <SecondaryButton size="sm" onClick={connectSteps}>חיבור</SecondaryButton>}
            />
            <Row
              icon={Watch}
              label="שעון חכם"
              description={watchOn ? `מחובר דרך ${healthName}` : 'לא מחובר'}
              right={!watchOn && <SecondaryButton size="sm" onClick={connectWatchRow}>חבר שעון</SecondaryButton>}
            />
            <Row
              icon={CalendarDays}
              label="יומן הטלפון"
              description={statusText(calendarOn)}
              right={calendarOn === false && <SecondaryButton size="sm" onClick={connectCalendar}>חיבור</SecondaryButton>}
            />
          </Group>
        )}

        {/* Appearance */}
        <Group title="מראה">
          <Row
            icon={Moon}
            label="מצב כהה"
            right={<div dir="ltr"><Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} aria-label="מצב כהה" /></div>}
          />
          <div className="flex min-h-[56px] items-center gap-3 px-4 py-2">
            <Type className="h-5 w-5 shrink-0 text-primary" strokeWidth={2} />
            <p className="flex-1 text-body">גודל טקסט</p>
            <div role="radiogroup" aria-label="גודל טקסט" className="flex gap-1 rounded-button bg-card-inner p-1">
              {TEXT_SIZES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={textSize === s.value}
                  onClick={() => {
                    setTextSizeState(s.value);
                    setTextSize(s.value);
                  }}
                  className={cn(
                    'min-h-[40px] min-w-[52px] rounded-[12px] px-2 text-label font-semibold',
                    textSize === s.value ? 'bg-card text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </Group>

        {/* Help */}
        <Group title="עזרה">
          {links?.support_whatsapp_url && (
            <Row icon={MessageCircle} label="צור קשר" description="וואטסאפ" onClick={() => openExternal(links.support_whatsapp_url)} chevron />
          )}
          <Row
            icon={BookOpen}
            label="מקורות ומחקרים"
            onClick={() => setShowSources((v) => !v)}
            right={<ChevronLeft className={cn('h-4 w-4 text-muted-foreground transition-transform', showSources && '-rotate-90')} strokeWidth={2} />}
          />
          {showSources && (
            <div className="space-y-1 px-4 py-2">
              {SOURCES.map(({ label, url }) => (
                <button key={url} type="button" onClick={() => openExternal(url)} className="flex min-h-[44px] w-full items-center gap-2 text-right">
                  <ExternalLink className="h-4 w-4 shrink-0 text-primary" strokeWidth={2} />
                  <span className="text-label text-primary-soft">{label}</span>
                </button>
              ))}
            </div>
          )}
          {links?.privacy_policy_url && (
            <Row icon={Shield} label="מדיניות פרטיות" onClick={() => openExternal(links.privacy_policy_url)} chevron />
          )}
          {links?.terms_url && (
            <Row icon={FileText} label="תנאי שימוש" onClick={() => openExternal(links.terms_url)} chevron />
          )}
        </Group>

        <p className="text-center text-label text-muted-foreground">
          חטוב בלי תפריט{version ? ` · גרסה ${version}` : ''}
        </p>

        {/* Danger zone */}
        <Group title="אזור מסוכן" danger>
          <Row icon={LogOut} label="התנתקות" onClick={() => setConfirmSignOut(true)} danger />
          <Row icon={Trash2} label="מחיקת חשבון" description="מחיקה מלאה ובלתי הפיכה" onClick={() => setDeleteStep(1)} danger />
        </Group>
      </div>

      {/* Account edit */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing === 'name' ? 'שם' : editing === 'email' ? 'אימייל' : 'סיסמה חדשה'}</DialogTitle>
            {editing === 'email' && <DialogDescription>נשלח קישור אישור לכתובת החדשה. השינוי ייכנס לתוקף אחרי האישור.</DialogDescription>}
            {editing === 'password' && <DialogDescription>לפחות 8 תווים.</DialogDescription>}
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              autoFocus
              type={editing === 'password' ? 'password' : editing === 'email' ? 'email' : 'text'}
              dir={editing === 'name' ? 'rtl' : 'ltr'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-12"
            />
            <PrimaryButton onClick={saveAccount} disabled={!draftValid || isSaving}>{isSaving ? 'שומר...' : 'שמירה'}</PrimaryButton>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sign out */}
      <AlertDialog open={confirmSignOut} onOpenChange={setConfirmSignOut}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>להתנתק?</AlertDialogTitle>
            <AlertDialogDescription>הנתונים שלך שמורים. אפשר להתחבר שוב בכל רגע.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={doSignOut} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">התנתק</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete account — step 1: what gets deleted */}
      <AlertDialog open={deleteStep === 1} onOpenChange={(o) => !o && setDeleteStep(0)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">מחיקת חשבון</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-right">
                <p>המחיקה סופית ולא ניתן לשחזר. יימחקו:</p>
                <ul className="list-disc space-y-1 pr-5">
                  <li>הפרופיל, השקילות והמדידות</li>
                  <li>התמונות שהעלית</li>
                  <li>ההרגלים, הצעדים, האימונים והיומן</li>
                  <li>תשובות השאלונים וההתקדמות בתכנים</li>
                </ul>
                <button type="button" onClick={() => navigate('/account-deletion')} className="min-h-[44px] text-primary-soft underline-offset-4 hover:underline">
                  מדיניות מחיקת חשבון
                </button>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <Button variant="destructive" onClick={() => setDeleteStep(2)}>המשך</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete account — step 2: type to confirm */}
      <Dialog open={deleteStep === 2} onOpenChange={(open) => { if (!open) { setDeleteStep(0); setDeleteConfirmText(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">אישור אחרון</DialogTitle>
            <DialogDescription>כדי למחוק, הקלידו <strong>מחק</strong>.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input placeholder="מחק" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} className="h-12" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteStep(0); setDeleteConfirmText(''); }}>ביטול</Button>
            <Button
              variant="destructive"
              disabled={deleteConfirmText !== 'מחק' || isDeleting}
              onClick={handleDeleteAccount}
            >
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
              מחיקה לצמיתות
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
