import { ChevronDown, Lock } from 'lucide-react';
import type { PartGroup } from '@/lib/contentModel';
import { cn } from '@/lib/utils';

/** Small "X מתוך Y" ring. */
export function ProgressRing({ done, total, size = 36, className }: { done: number; total: number; size?: number; className?: string }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const ratio = total > 0 ? done / total : 0;
  return (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={r} fill="none" stroke="#2A2A31" strokeWidth="3.5" />
        <circle
          cx="18" cy="18" r={r} fill="none" stroke="#FF8A2A" strokeWidth="3.5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - ratio)}
        />
      </svg>
      <span className="relative text-[10px] font-bold tabular-nums" dir="ltr">{done}/{total}</span>
    </span>
  );
}

/**
 * A part's title strip: "חלק 2 · בניית הבסיס", a secondary line, and its
 * progress ring — or, while locked, grey with when it opens. Used across the
 * full width of the map (the road runs underneath) and as the cards view's
 * section header (collapsible there).
 */
export function PartBanner({
  part, collapsible, open, onToggle, className,
}: {
  part: PartGroup;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  className?: string;
}) {
  const body = (
    <>
      {part.locked ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-[#1F1F25]">
          <Lock className="h-4 w-4 text-muted-foreground" strokeWidth={2} aria-hidden />
        </span>
      ) : (
        <ProgressRing done={part.done} total={part.total} />
      )}
      <span className="min-w-0 flex-1 text-right">
        <span className={cn('block truncate text-body font-bold', part.locked ? 'text-muted-foreground' : 'text-foreground')}>{part.title}</span>
        <span className="block truncate text-label text-muted-foreground">{part.locked ? part.opensLabel : part.subtitle}</span>
      </span>
      {collapsible && (
        <ChevronDown className={cn('h-5 w-5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} strokeWidth={2} aria-hidden />
      )}
    </>
  );
  const cls = cn(
    'flex min-h-[64px] w-full items-center gap-3 rounded-inner border px-4 py-2',
    part.locked ? 'border-[#26262D] bg-[#141418]' : 'border-[#2A2A31] bg-card',
    className,
  );
  return collapsible ? (
    <button type="button" onClick={onToggle} aria-expanded={open} className={cls}>{body}</button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
