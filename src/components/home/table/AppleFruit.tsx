import { cn } from '@/lib/utils';
import { TableObjectProps } from './shared';

const APPLE = 'M50 30 C38 18 12 20 12 50 C12 78 32 94 50 86 C68 94 88 78 88 50 C88 20 62 18 50 30 Z';
const LEAF = 'M54 22 C60 8 76 6 82 10 C76 22 64 26 54 22 Z';

/** "מאכלים בריאים / פרי במקום נשנוש" — an apple. */
export function AppleFruit({ className }: TableObjectProps) {
  return (
    <svg viewBox="0 0 100 100" className={cn('h-auto w-full', className)} aria-hidden>
      <path d={APPLE} fill="#E5484D" />
      <ellipse cx="32" cy="46" rx="7" ry="12" fill="#F08A8D" transform="rotate(20 32 46)" />
      <path d="M50 30 L53 14" stroke="#8B5A2B" strokeWidth="4" strokeLinecap="round" />
      <path d={LEAF} fill="#5BE38F" />
    </svg>
  );
}
