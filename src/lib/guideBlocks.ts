/**
 * An in-app guide is program_content.body: an array of these blocks, written
 * in Supabase (from supabase/guides/ via scripts/guides.mjs), so a text fix
 * needs no new app version.
 *
 * Text may hold marks: **bold**, ==marker==, and {male form|female form}.
 * `visual` / `icon` name an illustration (components/illustrations).
 */
export type GuideIconKey =
  | 'check' | 'x' | 'plane' | 'plate' | 'cutlery' | 'glass' | 'walk' | 'home' | 'clock' | 'dumbbell'
  | 'calendar' | 'star' | 'cup' | 'drop' | 'bolt' | 'arrows' | 'chart' | 'shield' | 'chain' | 'moon';

/** A row in a list: its text and its small icon (older bodies hold plain text). */
export type GuideListItem = string | { text: string; icon?: string };

export const itemText = (item: GuideListItem) => (typeof item === 'string' ? item : item.text);
export const itemIcon = (item: GuideListItem) => (typeof item === 'string' ? undefined : item.icon);

export type GuideBlock =
  | { type: 'hero'; title: string; subtitle: string; visuals?: string[] }
  | { type: 'intro'; text: string; visual?: string }
  | { type: 'do'; title: string; text: string; visual?: string }
  | { type: 'dont'; title: string; text: string; visual?: string }
  | { type: 'section'; icon: GuideIconKey; title: string; items?: GuideListItem[]; visual?: string }
  | { type: 'principle'; number: string; title: string; principle: string; practice: string; visual?: string }
  | { type: 'callout'; title?: string; text: string; visual?: string }
  | { type: 'quote'; text: string; visual?: string }
  | { type: 'cta'; label: string; to: string }
  | { type: 'scenario'; title: string; items: GuideListItem[]; visual?: string }
  | { type: 'compare'; category: string; instead: string; choose: string; visual?: string }
  | { type: 'meal'; name: string; size: string; rules: GuideListItem[]; examples: string[]; visual?: string }
  | { type: 'chips'; title: string; items: string[]; visual?: string }
  | {
      type: 'faq';
      question: string;
      answer: string;
      visual?: string;
      /** A page of its own. */
      solo?: boolean;
      /** A drawing explaining the answer ("junk": three sweets = one burger). */
      equation?: string;
      /** A button under the answer. */
      action?: { label: string; to: string };
    }
  | { type: 'checklist'; title: string; items: GuideListItem[]; visual?: string }
  | { type: 'link'; label: string; target: string; button?: string }
  /** Not story pages: an interactive screen of its own (AppShoppingList). */
  | { type: 'shopping_list'; title: string; subtitle: string; categories: ShoppingCategory[] };

export interface ShoppingCategory {
  title: string;
  visual: string;
  items: string[];
  link?: { label: string; target: string };
}

/** The shopping list, when this body is one. */
export function shoppingList(body: unknown) {
  const first = guideBody(body)?.[0];
  return first?.type === 'shopping_list' ? first : null;
}

/** The body when it's a usable guide, else null (no body yet → the old link / sheet). */
export function guideBody(body: unknown): GuideBlock[] | null {
  return Array.isArray(body) && body.length > 0 ? (body as GuideBlock[]) : null;
}

/**
 * Text may hold {male form|female form}: picks by the profile's gender, the
 * first form when it isn't known.
 */
export function pickGender(text: string, gender: string | null | undefined): string {
  return text.replace(/\{([^{}|]*)\|([^{}|]*)\}/g, (_, male: string, female: string) => (gender === 'female' ? female : male));
}

/** A guide's blocks with every text in the trainee's gender. */
export function blocksForGender(blocks: GuideBlock[], gender: string | null | undefined): GuideBlock[] {
  const walk = <T,>(v: T): T => {
    if (typeof v === 'string') return pickGender(v, gender) as T;
    if (Array.isArray(v)) return v.map(walk) as T;
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) as T;
    return v;
  };
  return blocks.map(walk);
}
