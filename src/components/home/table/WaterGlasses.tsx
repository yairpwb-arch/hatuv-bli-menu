import { cn } from '@/lib/utils';
import { Glass3D } from './Glass3D';
import { TableObjectProps } from './shared';

/** "2 כוסות מים לפני הארוחה" — two glasses side by side. */
export function WaterGlasses({ done, className }: TableObjectProps) {
  return (
    <svg viewBox="0 0 122 80" className={cn('h-auto w-full overflow-visible', className)} aria-hidden>
      <Glass3D x={0} full={done} />
      <Glass3D x={58} full={done} />
    </svg>
  );
}
