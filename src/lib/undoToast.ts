import { toast } from 'sonner';

/**
 * "ההליכה סומנה כבוצעה · ביטול" — a 5-second toast above the tab bar after
 * every "done" mark. Tapping ביטול puts everything back, no confirmation.
 */
export function showUndo(message: string, undo: () => unknown) {
  return toast(message, {
    duration: 5000,
    action: { label: 'ביטול', onClick: () => void undo() },
  });
}
