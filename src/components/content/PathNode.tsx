import { Lock, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getNodeVisual, TRACK_COLORS, type ContentKind } from '@/lib/contentPathStyle';

interface PathNodeProps {
  title: string;
  tag: string;
  contentType: ContentKind;
  isUnlocked: boolean;
  isCompleted: boolean;
  isBonus: boolean;
  isFrontier: boolean;
  isCelebrating: boolean;
  daysUntilUnlock: number;
  /** px to shift ONLY the label horizontally so it stays on-screen — the
   * circle itself never moves off the track point for this. */
  labelShiftX: number;
  circleRef: (el: HTMLDivElement | null) => void;
  labelRef: (el: HTMLDivElement | null) => void;
  onClick: () => void;
}

// One station = one vertical stack: circle on top, label directly beneath it
// (never beside, never on top of it). The circle always paints above the
// label (z-index), so nothing can ever visually cover its icon.
export default function PathNode({
  title,
  tag,
  contentType,
  isUnlocked,
  isCompleted,
  isBonus,
  isFrontier,
  isCelebrating,
  daysUntilUnlock,
  labelShiftX,
  circleRef,
  labelRef,
  onClick,
}: PathNodeProps) {
  const { Icon } = getNodeVisual(contentType);
  const handleClick = () => isUnlocked && onClick();

  return (
    <div className="flex flex-col items-center" style={{ width: 180 }}>
      <div ref={circleRef} className="relative" style={{ zIndex: 4 }}>
        <button
          type="button"
          onClick={handleClick}
          disabled={!isUnlocked}
          className={cn(
            'relative rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all',
            isFrontier ? 'w-16 h-16 animate-pulse-glow' : 'w-14 h-14',
            isCelebrating && 'animate-scale-in animate-bounce-in'
          )}
          style={
            !isUnlocked
              ? { backgroundColor: TRACK_COLORS.lockedBg, borderColor: TRACK_COLORS.lockedBorder }
              : isCompleted
              ? { backgroundColor: TRACK_COLORS.accent, borderColor: TRACK_COLORS.accent }
              : { backgroundColor: TRACK_COLORS.lockedBg, borderColor: TRACK_COLORS.accent, borderWidth: 3 }
          }
        >
          {!isUnlocked ? (
            <Lock className="h-5 w-5 text-muted-foreground" />
          ) : (
            <Icon className={cn(isFrontier ? 'h-7 w-7' : 'h-6 w-6')} style={{ color: isCompleted ? '#1C1C22' : TRACK_COLORS.accent }} />
          )}

          {isUnlocked && isCompleted && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#1C1C22] border-2 border-background flex items-center justify-center">
              <Check className="h-3 w-3" style={{ color: TRACK_COLORS.accent }} />
            </span>
          )}

          {isUnlocked && isBonus && (
            <span
              className="absolute -top-1 -left-1 w-5 h-5 rounded-full border-2 border-background flex items-center justify-center text-[10px] font-bold"
              style={{ backgroundColor: TRACK_COLORS.accent, color: '#1C1C22' }}
            >
              ★
            </span>
          )}
        </button>
      </div>

      <div
        ref={labelRef}
        role="button"
        tabIndex={isUnlocked ? 0 : -1}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleClick();
        }}
        className={cn('mt-2 rounded-xl px-3 py-1.5 text-center', isUnlocked && 'cursor-pointer')}
        style={{
          zIndex: 3,
          maxWidth: 170,
          transform: labelShiftX ? `translateX(${labelShiftX}px)` : undefined,
          backgroundColor: '#141418',
          border: '1px solid #2A2A33',
          borderRadius: 12,
        }}
      >
        {tag && (
          <div
            className="text-[10px] font-bold uppercase tracking-wide"
            style={{ color: !isUnlocked ? 'rgba(255,255,255,0.45)' : TRACK_COLORS.accent }}
          >
            {tag}
          </div>
        )}
        <div
          className="text-[12px] leading-tight font-medium line-clamp-2"
          style={{
            color: isUnlocked && isCompleted ? 'rgba(255,255,255,0.6)' : '#fff',
            textDecoration: isUnlocked && isCompleted ? 'line-through' : undefined,
          }}
        >
          {isUnlocked ? title : 'תוכן נעול'}
        </div>
        {!isUnlocked && (
          <div className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
            {daysUntilUnlock > 0 ? `נפתח בעוד ${daysUntilUnlock} ימים` : 'נפתח בקרוב'}
          </div>
        )}
      </div>
    </div>
  );
}
