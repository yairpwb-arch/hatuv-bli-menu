import { cn } from '@/lib/utils';
import { TableObjectProps } from './shared';

const BOTTLE = 'M22 4 H38 V18 Q38 24 44 30 Q52 38 52 50 V108 Q52 116 44 116 H16 Q8 116 8 108 V50 Q8 38 16 30 Q22 24 22 18 Z';

/** "שמן זית על קנולה" — an olive-oil bottle. */
export function OliveOil({ className }: TableObjectProps) {
  return (
    <svg viewBox="0 0 60 120" className={cn('h-auto w-full', className)} aria-hidden>
      <path d={BOTTLE} fill="#3E4E22" />
      <path d="M12 60 H48 V106 Q48 112 42 112 H18 Q12 112 12 106 Z" fill="#C9B037" />
      <rect x="12" y="68" width="36" height="22" rx="3" fill="#EDE6D1" />
      <circle cx="30" cy="79" r="5" fill="#6B8E23" />
      <rect x="20" y="0" width="20" height="10" rx="3" fill="#2E2E33" />
    </svg>
  );
}
