/**
 * The content page's model: items grouped into parts, each item's state on
 * the map, and the small "שבוע 5–6 · סרטון · 4 דק'" line. Opening and locking
 * rules live elsewhere (contentGate); this only describes what to show.
 */
import { inDays } from '@/lib/hebrewDays';
import type { ContentKind } from '@/lib/contentPathStyle';

export interface ContentItem {
  id: string;
  part_number: number;
  week_range: string;
  unlock_day: number;
  title: string;
  description: string | null;
  video_url: string | null;
  resource_link: string | null;
  is_bonus: boolean;
  content_type?: ContentKind | null;
  duration_minutes?: number | null;
  /** An in-app guide's blocks (see guideBlocks); null → opened by its link. */
  body?: unknown;
  /** date gate only — currentDay has reached unlock_day */
  dateUnlocked: boolean;
  /** final gate: dateUnlocked AND the previous stage in the path was completed */
  isUnlocked: boolean;
  isCompleted: boolean;
  daysUntilUnlock: number;
}

export interface PartMeta {
  part_number: number;
  name: string | null;
  subtitle: string | null;
}

/**
 * done: completed · current: "הבא בתור" · open: unlocked, not done, not next ·
 * soon: the locked one right after the current · locked: further ahead.
 */
export type NodeState = 'done' | 'current' | 'open' | 'soon' | 'locked';

export const kindOf = (item: ContentItem): ContentKind => item.content_type ?? (item.video_url ? 'video' : 'content');

const TYPE_LABEL: Record<ContentKind, string> = { video: 'סרטון', guide: 'מדריך', content: 'טיפ' };

/** "שבוע 5–6 · סרטון · 4 דק'" (each piece only when known). */
export function metaLine(item: ContentItem): string {
  return [item.week_range?.trim(), TYPE_LABEL[kindOf(item)], item.duration_minutes ? `${item.duration_minutes} דק'` : null]
    .filter(Boolean)
    .join(' · ');
}

/** "עוד 3 ימים" / "מחר" / "אחרי השלב הנוכחי" for a locked item. */
export function countdown(item: ContentItem): string {
  if (item.daysUntilUnlock <= 0) return 'אחרי השלב הנוכחי';
  if (item.daysUntilUnlock === 1) return 'מחר';
  if (item.daysUntilUnlock === 2) return 'עוד יומיים';
  return `עוד ${item.daysUntilUnlock} ימים`;
}

export function stateOf(item: ContentItem, currentId: string | null, soonId: string | null): NodeState {
  if (item.isCompleted && item.isUnlocked) return 'done';
  if (item.id === currentId) return 'current';
  if (item.isUnlocked) return 'open';
  return item.id === soonId ? 'soon' : 'locked';
}

export interface PartGroup {
  number: number;
  /** "חלק 2 · בניית הבסיס" */
  title: string;
  /** "שבועות 5–12 · תוכן חדש כל שבועיים" */
  subtitle: string;
  items: ContentItem[];
  done: number;
  total: number;
  /** Nothing in it has opened yet. */
  locked: boolean;
  /** "נפתח בעוד 45 ימים" for a locked part. */
  opensLabel: string | null;
  complete: boolean;
}

const weekOf = (day: number) => Math.max(1, Math.ceil(day / 7));

/** Weeks the part spans, and how often something new opens in it. */
function computedSubtitle(items: ContentItem[]): string {
  const days = [...new Set(items.map((i) => i.unlock_day))].sort((a, b) => a - b);
  if (days.length === 0) return '';
  const from = weekOf(days[0]);
  const to = weekOf(days[days.length - 1]);
  const weeks = from === to ? `שבוע ${from}` : `שבועות ⁦${from}–${to}⁩`;
  if (days.length < 2) return weeks;
  const gap = (days[days.length - 1] - days[0]) / (days.length - 1);
  const cadence = gap >= 12 ? 'תוכן חדש כל שבועיים' : gap >= 5 ? 'תוכן חדש כל שבוע' : 'תוכן חדש כמה פעמים בשבוע';
  return `${weeks} · ${cadence}`;
}

export function buildParts(items: ContentItem[], metas: PartMeta[]): PartGroup[] {
  const byPart = new Map<number, ContentItem[]>();
  for (const it of items) byPart.set(it.part_number, [...(byPart.get(it.part_number) ?? []), it]);
  return [...byPart.entries()]
    .sort(([a], [b]) => a - b)
    .map(([number, list]) => {
      const meta = metas.find((m) => m.part_number === number);
      const done = list.filter((i) => i.isCompleted).length;
      const locked = !list.some((i) => i.isUnlocked);
      const firstDays = Math.min(...list.map((i) => i.daysUntilUnlock));
      return {
        number,
        title: meta?.name ? `חלק ${number} · ${meta.name}` : `חלק ${number}`,
        subtitle: meta?.subtitle || computedSubtitle(list),
        items: list,
        done,
        total: list.length,
        locked,
        opensLabel: locked ? (firstDays > 0 ? `נפתח ${inDays(firstDays)}` : 'נפתח אחרי החלק הקודם') : null,
        complete: done === list.length,
      };
    });
}
