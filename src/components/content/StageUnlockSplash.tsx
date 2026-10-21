import { useEffect, useMemo, useState } from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import type { CardPhase } from '@/hooks/useContentCelebration';

interface StageUnlockSplashProps {
  title: string;
  stageLabel: string;
  Icon: LucideIcon;
  fillClass: string;
  phase: CardPhase;
  onSkip: () => void;
}

function useCountUp(target: string, active: boolean, reduced: boolean): string {
  const targetNum = parseInt(target, 10);
  const [n, setN] = useState(Number.isFinite(targetNum) ? 0 : NaN);

  useEffect(() => {
    if (!active || !Number.isFinite(targetNum) || reduced) {
      if (Number.isFinite(targetNum)) setN(targetNum);
      return;
    }
    const start = performance.now();
    const duration = 450;
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setN(Math.round(targetNum * t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, targetNum, reduced]);

  return Number.isFinite(targetNum) ? String(n) : target;
}

export default function StageUnlockSplash({ title, stageLabel, Icon, fillClass, phase, onSkip }: StageUnlockSplashProps) {
  const reduced = usePrefersReducedMotion();
  const [shake, setShake] = useState(false);
  const displayLabel = useCountUp(stageLabel, phase === 'hold', reduced);

  useEffect(() => {
    if (phase !== 'hold' || reduced) return;
    setShake(true);
    const t = window.setTimeout(() => setShake(false), 160);
    if (navigator.vibrate) navigator.vibrate(30);
    return () => window.clearTimeout(t);
  }, [phase, reduced]);

  const sparkles = useMemo(
    () =>
      Array.from({ length: 14 }).map((_, i) => {
        const angle = (i / 14) * Math.PI * 2;
        const dist = 80 + Math.random() * 60;
        return {
          id: i,
          sx: Math.cos(angle) * dist,
          sy: Math.sin(angle) * dist,
          delay: Math.random() * 0.3,
        };
      }),
    []
  );

  const overlayOpacity = phase === 'hold' ? 0.5 : phase === 'intro' ? 0.5 : 0;

  return (
    <div
      className={cn('fixed inset-0 z-[60] flex items-center justify-center', shake && 'animate-screen-shake')}
      style={{
        backgroundColor: `rgba(0,0,0,${overlayOpacity})`,
        backdropFilter: phase === 'exit' ? 'blur(0px)' : 'blur(4px)',
        transition: 'background-color 0.3s ease, backdrop-filter 0.3s ease',
      }}
      onClick={onSkip}
      role="button"
      aria-label="דלג"
    >
      <div
        className={cn(
          'flex flex-col items-center gap-4 px-6',
          reduced ? 'animate-fade-in' : phase === 'exit' ? 'animate-splash-out' : 'animate-splash-in'
        )}
      >
        <div className="relative">
          {phase === 'hold' && !reduced && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {sparkles.map((s) => (
                <span
                  key={s.id}
                  className="absolute w-1.5 h-1.5 rounded-full bg-yellow-300 animate-sparkle"
                  style={
                    {
                      '--sx': `${s.sx}px`,
                      '--sy': `${s.sy}px`,
                      animationDelay: `${s.delay}s`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </div>
          )}
          <div className={cn('w-32 h-32 rounded-full flex items-center justify-center shadow-glow-lg', fillClass)}>
            <Icon className="h-16 w-16 text-white" />
          </div>
        </div>
        <p className="text-sm font-semibold text-primary tracking-wide">שלב חדש נפתח!</p>
        <h2 className="text-4xl font-extrabold text-foreground">שלב {displayLabel}</h2>
        <p className="text-lg text-muted-foreground text-center max-w-xs">{title}</p>
      </div>
    </div>
  );
}
