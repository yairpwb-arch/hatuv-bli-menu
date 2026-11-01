import { cn } from '@/lib/utils';
import { Glass3D } from './Glass3D';
import { TableObjectProps } from './shared';

/** "כוס מים לפני נשנוש / שתייה מתוקה" — one small glass by the apple. */
export function SmallGlass({ done, className }: TableObjectProps) {
  return (
    <svg viewBox="0 0 64 80" className={cn('h-auto w-full overflow-visible', className)} aria-hidden>
      <Glass3D full={done} />
    </svg>
  );
}
