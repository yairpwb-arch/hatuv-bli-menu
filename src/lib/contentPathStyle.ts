import { Play, FileText, Lightbulb, type LucideIcon } from 'lucide-react';

export type ContentKind = 'video' | 'content' | 'guide';

export interface NodeVisual {
  Icon: LucideIcon;
}

/** ▶ video · document for a guide · light bulb for a tip. */
export function getNodeVisual(contentType: ContentKind): NodeVisual {
  const Icon = contentType === 'video' ? Play : contentType === 'guide' ? FileText : Lightbulb;
  return { Icon };
}

/** Weeks a part-4 period lasts: the last content item's period ends this long after it opens. */
const LAST_PERIOD_DAYS = 28;

/**
 * The program day the final "שלב סיכום" opens (once everything is done): after
 * the last content item's period ends, so it never opens before the stage
 * leading to it. 168 when there's no content.
 */
export const milestoneDay = (items: { unlock_day: number }[]) =>
  items.length ? Math.max(...items.map((i) => i.unlock_day)) + LAST_PERIOD_DAYS : 168;
