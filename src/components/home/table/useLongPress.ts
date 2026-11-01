import { useRef } from 'react';
import { selectionHaptic } from '@/lib/native';

const LONG_PRESS_MS = 450;

/**
 * Tap → onTap, hold → onLongPress (and the tap that ends the hold is swallowed).
 * Works on HTML buttons and on SVG shapes alike; Enter/Space count as a tap.
 */
export function useLongPress(onTap: () => void, onLongPress: () => void) {
  const timer = useRef<number>();
  const longPressed = useRef(false);
  const cancel = () => window.clearTimeout(timer.current);

  return {
    onPointerDown: () => {
      longPressed.current = false;
      timer.current = window.setTimeout(() => {
        longPressed.current = true;
        selectionHaptic();
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    onClick: () => {
      if (longPressed.current) return;
      onTap();
    },
    onKeyDown: (e: { key: string; preventDefault: () => void }) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onTap();
      }
    },
  };
}
