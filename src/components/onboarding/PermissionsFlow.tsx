import { useState } from 'react';
import { Bell, Footprints, RefreshCw, type LucideIcon } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { PrimaryButton } from '@/components/ds';
import { requestHealthKitStepsPermission } from '@/hooks/useStepCounter';
import { useNotificationSetup } from '@/hooks/useNotificationSetup';
import type { PermissionKey, PermissionResult } from '@/lib/onboarding';
import { OnboardingFrame } from './OnboardingFrame';

interface Screen {
  key: PermissionKey;
  icon: LucideIcon;
  title: string;
  why: string;
}

const SCREENS: Screen[] = [
  {
    key: 'steps',
    icon: Footprints,
    title: 'ספירת צעדים',
    why: Capacitor.getPlatform() === 'ios'
      ? 'כדי לספור את הצעדים שלך אוטומטית מ-Apple Health, בלי שתצטרכו לרשום כלום.'
      : 'כדי לספור את הצעדים שלך אוטומטית מחיישן התנועה של הטלפון, בלי שתצטרכו לרשום כלום.',
  },
  {
    key: 'notifications',
    icon: Bell,
    title: 'התראות',
    why: 'תזכורת קצרה כשיש סרטון חדש, שקילה שבועית או אימון שמחכה לך.',
  },
  {
    key: 'background',
    icon: RefreshCw,
    title: 'פעילות ברקע',
    why: 'כדי שהצעדים ייספרו לאורך כל היום, גם כשהאפליקציה סגורה.',
  },
];

interface PermissionsFlowProps {
  userId: string;
  initial: Partial<Record<PermissionKey, PermissionResult>>;
  /** Called after each answer, and once more with done=true after the last. */
  onSave: (permissions: Partial<Record<PermissionKey, PermissionResult>>, done: boolean) => Promise<void>;
}

export function PermissionsFlow({ userId, initial, onSave }: PermissionsFlowProps) {
  const { enableNotifications } = useNotificationSetup();
  const [results, setResults] = useState(initial);
  const [index, setIndex] = useState(() => {
    const i = SCREENS.findIndex((s) => !initial[s.key]);
    return i >= 0 ? i : 0;
  });
  const [isAsking, setIsAsking] = useState(false);
  const screen = SCREENS[index];

  const ask = async (key: PermissionKey): Promise<PermissionResult> => {
    if (!Capacitor.isNativePlatform()) return 'unavailable';
    const platform = Capacitor.getPlatform();
    switch (key) {
      case 'steps': {
        // Called directly (not via useStepCounter, which prompts on mount on
        // iOS) so the system dialog only appears after this explanation.
        if (platform === 'android') {
          const { StepCounter } = await import('@/plugins/StepCounterPlugin');
          const perm = await StepCounter.requestPermission();
          return perm.activityRecognition === 'granted' ? 'granted' : 'denied';
        }
        await requestHealthKitStepsPermission();
        // Motion & Fitness prompt comes from the first pedometer query.
        const { CapacitorPedometer } = await import('@capgo/capacitor-pedometer');
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        await CapacitorPedometer.getMeasurement({ start: start.getTime(), end: Date.now() }).catch(() => undefined);
        return 'granted'; // HealthKit never reveals whether read access was given
      }
      case 'notifications':
        return (await enableNotifications(userId)) ? 'granted' : 'denied';
      case 'background': {
        // Neither OS has a separate prompt for this. Android: background
        // counting is the step foreground service, which starts as soon as the
        // app opens with step access granted. iOS: HealthKit background
        // delivery comes with step access. So this needs step access and
        // otherwise records the trainee's consent.
        if (platform === 'android') {
          const { StepCounter } = await import('@/plugins/StepCounterPlugin');
          const perm = await StepCounter.checkPermission();
          if (perm.activityRecognition !== 'granted') return 'denied';
        }
        return 'granted';
      }
    }
  };

  const answer = async (result: PermissionResult | 'ask') => {
    if (isAsking) return;
    setIsAsking(true);
    let value: PermissionResult = result === 'ask' ? 'denied' : result;
    try {
      if (result === 'ask') value = await ask(screen.key);
    } catch (err) {
      console.warn('[onboarding] permission request failed', screen.key, err);
    }
    const next = { ...results, [screen.key]: value };
    setResults(next);
    const done = index >= SCREENS.length - 1;
    await onSave(next, done);
    setIsAsking(false);
    if (!done) setIndex(index + 1);
  };

  const Icon = screen.icon;
  return (
    <OnboardingFrame
      progress={(index + 1) / SCREENS.length}
      onBack={index > 0 ? () => setIndex(index - 1) : undefined}
      footer={
        <>
          <PrimaryButton className="h-14" onClick={() => answer('ask')} disabled={isAsking}>
            אישור
          </PrimaryButton>
          <button
            type="button"
            onClick={() => answer('skipped')}
            disabled={isAsking}
            className="h-11 w-full text-label font-semibold text-muted-foreground"
          >
            לא עכשיו
          </button>
        </>
      }
    >
      <div key={screen.key} className="flex flex-col items-center pt-16 text-center motion-safe:animate-page-enter">
        <span className="flex h-24 w-24 items-center justify-center rounded-pill bg-primary-tint">
          <Icon className="h-11 w-11 text-primary" strokeWidth={2} />
        </span>
        <h1 className="mt-8 text-screen-title">{screen.title}</h1>
        <p className="mt-3 max-w-xs text-body text-muted-foreground">{screen.why}</p>
      </div>
    </OnboardingFrame>
  );
}
