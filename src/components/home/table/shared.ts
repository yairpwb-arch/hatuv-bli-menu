/**
 * Shared look for the table objects. Each object is plain SVG drawn in full
 * colour, so any illustration can be swapped on its own. "Not done" is a
 * faded version (35% opacity, greyscale) applied around it — never a dashed
 * outline — so the table always reads as a real table.
 */

export interface TableObjectProps {
  /** Only objects that change their drawing when done use it (the glasses fill up). */
  done: boolean;
  className?: string;
}

/** Wrapper classes for an object's state; the switch animates. */
export const objectState = (done: boolean) =>
  done ? 'opacity-100 grayscale-0' : 'opacity-[0.35] grayscale';

export const STATE_TRANSITION = 'transition-[opacity,filter] duration-300 ease-out';
