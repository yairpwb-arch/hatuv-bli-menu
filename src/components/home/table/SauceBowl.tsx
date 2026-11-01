import { cn } from '@/lib/utils';
import { TableObjectProps } from './shared';

/** "רוטב אחד בארוחה" — a small bowl of sauce, from above. */
export function SauceBowl({ className }: TableObjectProps) {
  return (
    <svg viewBox="0 0 100 100" className={cn('h-auto w-full', className)} aria-hidden>
      <circle cx="50" cy="50" r="46" fill="#ECE8E1" />
      <circle cx="50" cy="50" r="31" fill="#C8463D" />
      <path d="M36 46 C44 38 56 40 60 48 C63 55 56 60 50 57" fill="none" stroke="#E2776B" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
