import { cn } from '@/lib/utils';

/*
 * Fork and knife, lying vertically either side of the plate. Decoration only:
 * always full colour (silver-grey #C9C9D1 with a light highlight), not tappable,
 * not a habit. Each is drawn in a 24×124 box.
 */

const SILVER = '#C9C9D1';
const SHADE = '#A6A6B0';
const LIGHT = '#F2F2F6';
const TABLE = '#141418';

export function Fork({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 124" className={cn('h-auto w-full', className)} aria-hidden>
      <path d="M2 3 Q2 1 4 1 L20 1 Q22 1 22 3 L22 30 Q22 41 15 43 L15 117 Q15 123 12 123 Q9 123 9 117 L9 43 Q2 41 2 30 Z" fill={SILVER} />
      {/* gaps between the tines */}
      <rect x="6.6" y="0" width="1.8" height="25" rx="0.9" fill={TABLE} />
      <rect x="11.1" y="0" width="1.8" height="25" rx="0.9" fill={TABLE} />
      <rect x="15.6" y="0" width="1.8" height="25" rx="0.9" fill={TABLE} />
      <rect x="9" y="80" width="6" height="40" rx="3" fill={SHADE} />
      {/* light along the handle */}
      <path d="M11 46 L11 112" stroke={LIGHT} strokeOpacity="0.8" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function Knife({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 124" className={cn('h-auto w-full', className)} aria-hidden>
      <path d="M9 4 Q9 1 11.5 1.5 Q20 8 20 56 L15 60 L15 117 Q15 123 12 123 Q9 123 9 117 Z" fill={SILVER} />
      <rect x="9" y="80" width="6" height="40" rx="3" fill={SHADE} />
      {/* light along the edge of the blade */}
      <path d="M13 8 Q17.5 18 17.5 52" fill="none" stroke={LIGHT} strokeOpacity="0.85" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
