import type { CalEvent } from '@/hooks/useCalendar';

/**
 * The eating window's two moments look different on purpose, not just by
 * colour (green "kitchen opens" / red "kitchen closes" with a lock), so they
 * read the same for anyone who can't tell the colours apart.
 */
// Light: a pale card with dark text (AA on it); dark: the deep card with bright text.
export const EAT_START = {
  card: 'border border-[#A9DDBC] bg-[#E9F7EE] text-[#14532D] dark:border-[#1F5A36] dark:bg-[#0F2A1A] dark:text-foreground',
  tint: 'text-[#17703D] dark:text-[#5BE38F]',
  line: 'bg-[#22A35A] dark:bg-[#5BE38F]',
};
export const EAT_STOP = {
  card: 'border border-[#F0B8B8] bg-[#FDEDED] text-[#7F1D1D] dark:border-[#5A2626] dark:bg-[#2A1414] dark:text-foreground',
  tint: 'text-[#B42323] dark:text-[#FF7A7A]',
  line: 'bg-[#E04848] dark:bg-[#FF7A7A]',
};

export const eatStyle = (e: CalEvent) =>
  e.source !== 'habit' ? null : e.type === 'eat_start' ? EAT_START : e.type === 'eat_stop' ? EAT_STOP : null;
