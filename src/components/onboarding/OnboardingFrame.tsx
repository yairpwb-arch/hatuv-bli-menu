import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

interface OnboardingFrameProps {
  /** 0…1; omit to hide the progress bar. */
  progress?: number;
  onBack?: () => void;
  children: ReactNode;
  /** Pinned to the bottom: the main action (and an optional skip link). */
  footer: ReactNode;
}

/** Full-screen step layout shared by every onboarding screen. */
export function OnboardingFrame({ progress, onBack, children, footer }: OnboardingFrameProps) {
  return (
    <div
      className="min-h-[100dvh] flex flex-col bg-background"
      style={{ paddingTop: 'var(--app-safe-top)', paddingBottom: 'var(--app-safe-bottom)' }}
    >
      <header className="flex h-14 items-center gap-2 px-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="חזרה"
            className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-pill text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="h-6 w-6" strokeWidth={2} />
          </button>
        ) : (
          <span className="w-11 shrink-0" />
        )}
        {progress != null && (
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className="h-1.5 flex-1 overflow-hidden rounded-pill bg-card-inner"
          >
            <div
              className="h-full rounded-pill bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${Math.max(progress, 0.03) * 100}%` }}
            />
          </div>
        )}
        <span className="w-11 shrink-0" />
      </header>

      <main className="flex-1 overflow-y-auto px-5 pb-6 pt-4">{children}</main>

      <footer className="space-y-1 px-5 pb-4 pt-2">{footer}</footer>
    </div>
  );
}
