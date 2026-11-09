import { cn } from '@/lib/utils';
import { TableObjectProps } from './shared';

/*
 * "חצי מהסוכר בקפה" / "בלי סוכר בקפה" — a cup of coffee on its saucer, in the
 * same perspective as the glasses (elliptic rim). Done: a little steam rises.
 */
export function CoffeeCup({ done, className }: TableObjectProps) {
  return (
    <svg viewBox="0 0 80 64" className={cn('h-auto w-full overflow-visible', className)} aria-hidden>
      {/* Saucer with its shadow */}
      <ellipse cx="41" cy="53" rx="34" ry="9" fill="#000" opacity="0.18" />
      <ellipse cx="40" cy="50" rx="34" ry="9" fill="#F4EFE8" />
      <ellipse cx="40" cy="49" rx="24" ry="5.5" fill="#E2DACD" />

      {/* Handle (right) */}
      <path d="M57 24 Q70 24 69 33 Q68 41 55 41" fill="none" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
      <path d="M57 24 Q70 24 69 33 Q68 41 55 41" fill="none" stroke="#D9D1C4" strokeWidth="1.2" strokeLinecap="round" />

      {/* Cup body */}
      <path d="M20 18 L24 44 A16 5 0 0 0 56 44 L60 18 Z" fill="#FFFFFF" />
      <path d="M20 18 L24 44 A16 5 0 0 0 56 44 L60 18" fill="none" stroke="#D9D1C4" strokeWidth="1.2" strokeLinejoin="round" />
      {/* Shade on the side */}
      <path d="M50 20 L53 43" stroke="#E9E2D7" strokeWidth="5" strokeLinecap="round" />

      {/* Rim and the coffee inside */}
      <ellipse cx="40" cy="18" rx="20" ry="6" fill="#FFFFFF" stroke="#D9D1C4" strokeWidth="1.2" />
      <ellipse cx="40" cy="19" rx="16.5" ry="4.4" fill="#5A3A22" />
      <ellipse cx="38" cy="18.4" rx="10" ry="2.4" fill="#8A5A35" />

      {/* Steam when done */}
      {done && (
        <g fill="none" stroke="#B9B2A7" strokeWidth="2" strokeLinecap="round" opacity="0.85">
          <path d="M33 10 Q30 5 33 1 Q36 -3 33 -7" />
          <path d="M43 10 Q40 5 43 1 Q46 -3 43 -7" />
        </g>
      )}
    </svg>
  );
}
