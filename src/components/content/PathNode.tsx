import { CSSProperties, forwardRef } from 'react';
import { Lock, Check, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getNodeVisual, type ContentKind } from '@/lib/contentPathStyle';

interface PathNodeProps {
  title: string;
  weekRange: string;
  contentType: ContentKind;
  partNumber: number;
  isUnlocked: boolean;
  isCompleted: boolean;
  isBonus: boolean;
  isFrontier: boolean;
  isCelebrating: boolean;
  daysUntilUnlock: number;
  style: CSSProperties;
  /** seconds; when set, the node fades in with this delay (first-visit stagger) */
  fadeInDelay?: number;
  onClick: () => void;
}

// Two layers on purpose: the outer div only ever carries the (optional)
// fade-in entrance animation (opacity + its own translateY keyframe); the
// inner div owns the absolute position + horizontal centering transform.
// Keeping them separate avoids the fade-in keyframe's `transform` end-state
// from clobbering the inner translateX(-50%) centering. `ref` points at the
// inner element so scroll-into-view and any geometry reads reflect the
// node's real on-screen position regardless of the outer wrapper.
const PathNode = forwardRef<HTMLDivElement, PathNodeProps>(function PathNode(
  {
    title,
    weekRange,
    contentType,
    partNumber,
    isUnlocked,
    isCompleted,
    isBonus,
    isFrontier,
    isCelebrating,
    daysUntilUnlock,
    style,
    fadeInDelay,
    onClick,
  },
  ref
) {
  const { Icon, fillClass, ringClass } = getNodeVisual(contentType, partNumber);

  const node = (
    <div ref={ref} className="absolute flex flex-col items-center" style={{ ...style, transform: 'translateX(-50%)' }}>
      {weekRange && (
        <span
          className={cn(
            'mb-1 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow',
            isUnlocked ? 'bg-primary text-primary-foreground' : 'bg-black/80 text-white/80'
          )}
        >
          {weekRange}
        </span>
      )}

      <button
        type="button"
        onClick={onClick}
        disabled={!isUnlocked}
        className={cn(
          'relative w-16 h-16 rounded-full border-2 flex items-center justify-center transition-transform',
          'ring-[3px] ring-black ring-offset-0 shadow-[0_3px_10px_rgba(0,0,0,0.6)]',
          !isUnlocked && 'bg-muted border-border opacity-70 cursor-not-allowed',
          isUnlocked && !isCompleted && cn(ringClass, fillClass),
          isUnlocked && isCompleted && cn('opacity-90 border-success/50', fillClass),
          isFrontier && 'animate-pulse-glow',
          isCelebrating && 'animate-scale-in animate-bounce-in'
        )}
      >
        {!isUnlocked ? (
          <Lock className="h-5 w-5 text-muted-foreground" />
        ) : (
          <Icon className="h-6 w-6 text-white" />
        )}

        {isUnlocked && isCompleted && (
          <span className="absolute -top-1 -left-1 w-6 h-6 rounded-full bg-success text-success-foreground border-2 border-background flex items-center justify-center">
            <Check className="h-3.5 w-3.5" />
          </span>
        )}

        {isUnlocked && isBonus && (
          <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-br from-warning to-destructive border-2 border-background flex items-center justify-center">
            <Star className="h-3.5 w-3.5 text-white" />
          </span>
        )}
      </button>

      <p
        className={cn(
          'w-28 mt-1.5 text-center text-[11px] leading-tight line-clamp-2 bg-black/75 text-white rounded-lg px-1.5 py-1 shadow',
          isUnlocked && isCompleted && 'line-through text-white/70',
          isFrontier && 'font-semibold'
        )}
      >
        {isUnlocked ? title : 'תוכן נעול'}
      </p>
      {!isUnlocked && (
        <p className="w-28 mt-1 text-center text-[10px] text-white/80 bg-black/75 rounded-lg px-1.5 py-0.5">
          {daysUntilUnlock > 0 ? `נפתח בעוד ${daysUntilUnlock} ימים` : 'נפתח בקרוב'}
        </p>
      )}
    </div>
  );

  if (fadeInDelay === undefined) return node;

  return (
    <div className="animate-fade-in" style={{ animationDelay: `${fadeInDelay}s` }}>
      {node}
    </div>
  );
});

export default PathNode;
