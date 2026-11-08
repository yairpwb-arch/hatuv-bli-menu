import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RotateCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

/*
 * Full-screen branded loading. Any full-screen loading state renders
 * <FullScreenLoader />, which only registers itself and paints the plain
 * background; one <BrandedLoaderOverlay /> at the app root draws the logo,
 * ring and lines. Keeping the overlay outside the screens is what lets it
 * outlive them: skip loads under 300ms, stay ≥800ms once shown, fade out.
 */

const SHOW_AFTER_MS = 300;
const MIN_VISIBLE_MS = 800;
const FADE_MS = 250;
const LINE_MS = 1800;
const SLOW_MS = 10_000;

type Intent = 'login' | 'new' | null;

let active = 0;
let intent: Intent = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Next loading screen greets for a fresh sign-in or a just-created account. */
export function setLoadingIntent(next: Intent) {
  intent = next;
}

/** Placeholder for a full-screen loading state; the overlay draws on top. */
export function FullScreenLoader() {
  useEffect(() => {
    active += 1;
    emit();
    return () => {
      active -= 1;
      emit();
    };
  }, []);
  return <div className="min-h-[100dvh] bg-background" />;
}

const greeting = () => {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'בוקר טוב';
  if (h >= 12 && h < 17) return 'צהריים טובים';
  return 'ערב טוב';
};

function linesFor(kind: 'login' | 'new' | 'return', name: string): string[] {
  if (kind === 'new') return ['ברוך הבא לחטוב בלי תפריט', 'מכינים לך את המסע', 'בונים את הצלחת הראשונה שלך', 'עוד רגע מתחילים'];
  if (kind === 'login') return [name ? `ברוך שובך, ${name}` : 'ברוך שובך', 'מעדכנים את המסע שלך'];
  return [name ? `${greeting()}, ${name}` : greeting(), 'טוענים את ההרגלים של היום', 'בודקים כמה צעדים עשית'];
}

export function BrandedLoaderOverlay() {
  const loading = useSyncExternalStore(subscribe, () => active > 0);
  const { profile, user } = useAuth();
  const [phase, setPhase] = useState<'hidden' | 'shown' | 'out'>('hidden');
  const shownAt = useRef(0);
  const [lineIndex, setLineIndex] = useState(0);
  const [lineVisible, setLineVisible] = useState(true);
  const [slow, setSlow] = useState(false);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Show only if loading lasts past 300ms; once shown, hold 800ms, then fade.
  useEffect(() => {
    if (loading) {
      if (phase === 'shown') return;
      const t = window.setTimeout(() => {
        shownAt.current = Date.now();
        setLineIndex(0);
        setSlow(false);
        setPhase('shown');
      }, phase === 'out' ? 0 : SHOW_AFTER_MS);
      return () => window.clearTimeout(t);
    }
    // Each phase schedules only its own next step: a timer set in 'shown'
    // would be cleared when the phase changes, leaving the overlay stuck.
    if (phase === 'shown') {
      const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt.current));
      const t = window.setTimeout(() => setPhase('out'), wait);
      return () => window.clearTimeout(t);
    }
    if (phase === 'out') {
      const t = window.setTimeout(() => {
        setPhase('hidden');
        intent = null;
      }, FADE_MS);
      return () => window.clearTimeout(t);
    }
  }, [loading, phase]);

  const isNew = intent === 'new' || (!!profile && profile.height == null && profile.initial_weight == null);
  const name = (profile?.full_name || (user?.user_metadata?.full_name as string | undefined) || '').trim().split(/\s+/)[0] ?? '';
  const kind = isNew ? 'new' : intent === 'login' ? 'login' : 'return';
  const lines = linesFor(kind, name);

  // Rotate lines every 1.8s with a 200ms fade; after 10s, offer a retry.
  useEffect(() => {
    if (phase !== 'shown') return;
    const rotate = window.setInterval(() => {
      setLineVisible(false);
      window.setTimeout(() => {
        setLineIndex((i) => i + 1);
        setLineVisible(true);
      }, 200);
    }, LINE_MS);
    const slowTimer = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => {
      window.clearInterval(rotate);
      window.clearTimeout(slowTimer);
    };
  }, [phase]);

  if (phase === 'hidden') return null;

  const line = slow ? 'משהו לוקח יותר זמן מהרגיל' : lines[Math.min(lineIndex, lines.length - 1)];

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed inset-0 z-[90] flex flex-col items-center justify-center bg-background px-6 transition-opacity ease-out',
        phase === 'out' && 'pointer-events-none',
      )}
      style={{ opacity: phase === 'out' ? 0 : 1, transitionDuration: `${FADE_MS}ms` }}
    >
      <div className="relative flex h-[120px] w-[120px] items-center justify-center">
        {!reduced && (
          <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full animate-loader-spin" aria-hidden>
            <circle cx="60" cy="60" r="58" fill="none" style={{ stroke: 'hsl(var(--line))' }} strokeWidth="4" />
            <circle
              cx="60"
              cy="60"
              r="58"
              fill="none"
              stroke="#FF8A2A"
              strokeWidth="4"
              strokeLinecap="round"
              pathLength={3}
              strokeDasharray="1 2"
            />
          </svg>
        )}
        <img
          src="/logo.png"
          alt="חטוב בלי תפריט"
          className={cn('h-24 w-24 rounded-full object-cover', !reduced && 'animate-loader-breathe')}
        />
      </div>

      {reduced && (
        <div className="mt-4 h-1 w-24 overflow-hidden rounded-pill bg-line" aria-hidden>
          <div className="h-full bg-primary animate-loader-progress" />
        </div>
      )}

      <p
        className="mt-6 min-h-[24px] text-center text-[16px] font-medium text-foreground transition-opacity duration-200"
        style={{ opacity: lineVisible || slow ? 1 : 0 }}
      >
        {line}
      </p>
      <p className="mt-1 text-[14px] text-muted-foreground">חטוב בלי תפריט</p>

      {slow && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex h-12 items-center gap-2 rounded-button border border-line px-6 text-label font-semibold text-foreground"
        >
          <RotateCw className="h-4 w-4" strokeWidth={2} aria-hidden />
          נסה שוב
        </button>
      )}
    </div>
  );
}
