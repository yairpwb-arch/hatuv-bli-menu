import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

// The marketing pages on the web don't get the app's opening animation.
const WEB_SKIP = new Set(['/', '/join', '/pricing', '/account-deletion']);

// Once per app launch (a module flag survives route changes; a full reload
// is a new launch and plays it again).
let hasPlayed = !Capacitor.isNativePlatform() && WEB_SKIP.has(window.location.pathname);

const RISE_MS = 600;
const HOLD_MS = 500;
const FADE_MS = 400; // total 1.5s, under the 1.8s budget

/**
 * Opening animation over whatever route is underneath: the logo rises with a
 * fade and a slight scale-up, holds, then the whole overlay fades out to the
 * login screen — or straight to home for a signed-in trainee, since routing
 * already happened underneath.
 */
export function LaunchSplash() {
  const [phase, setPhase] = useState<'in' | 'out' | 'gone'>(hasPlayed ? 'gone' : 'in');

  useEffect(() => {
    if (phase === 'gone') return;
    hasPlayed = true;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const hold = reduced ? 300 : RISE_MS + HOLD_MS;
    const t1 = window.setTimeout(() => setPhase('out'), hold);
    const t2 = window.setTimeout(() => setPhase('gone'), hold + FADE_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
    // Runs once per launch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'gone') return null;

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background transition-opacity ease-out"
      style={{ opacity: phase === 'out' ? 0 : 1, transitionDuration: `${FADE_MS}ms` }}
    >
      <img
        src="/logo.png"
        alt=""
        className="h-28 w-28 rounded-[28px] motion-safe:animate-splash-rise"
      />
    </div>
  );
}
