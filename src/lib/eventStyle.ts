import type { CalEvent } from '@/hooks/useCalendar';

/**
 * The eating window's two moments look different on purpose, not just by
 * colour (green "kitchen opens" / red "kitchen closes" with a lock), so they
 * read the same for anyone who can't tell the colours apart.
 */
export const EAT_START = { card: 'border border-[#1F5A36] bg-[#0F2A1A]', tint: 'text-[#5BE38F]', line: 'bg-[#5BE38F]' };
export const EAT_STOP = { card: 'border border-[#5A2626] bg-[#2A1414]', tint: 'text-[#FF7A7A]', line: 'bg-[#FF7A7A]' };

export const eatStyle = (e: CalEvent) =>
  e.source !== 'habit' ? null : e.type === 'eat_start' ? EAT_START : e.type === 'eat_stop' ? EAT_STOP : null;
