/**
 * A guide's blocks laid out as story pages, one idea per page. The text is
 * never changed: pages only group blocks, and the "split" helpers return the
 * same text cut in two (joined back, it's identical) for the two-colour titles.
 */
import type { GuideBlock, GuideIconKey, GuideListItem } from './guideBlocks';

type FaqItem = Extract<GuideBlock, { type: 'faq' }>;

export type GuidePage =
  | { kind: 'cover'; title: string; subtitle: string; visuals: string[] }
  | { kind: 'day'; title: string; meals: { name: string; size: string; visual?: string }[] }
  | { kind: 'intro'; text: string; visual?: string }
  | { kind: 'chapter'; icon: GuideIconKey; title: string; visual?: string }
  | { kind: 'section'; icon: GuideIconKey; title: string; items: GuideListItem[]; visual?: string }
  | { kind: 'do' | 'dont'; title: string; text: string; visual?: string }
  | { kind: 'principle'; number: string; title: string; principle: string; practice: string; visual?: string }
  | { kind: 'callout'; title?: string; text: string; visual?: string }
  | { kind: 'quote'; text: string; visual?: string }
  | { kind: 'cta'; label: string; to: string }
  | { kind: 'scenario'; title: string; items: GuideListItem[]; index: number; total: number; visual?: string }
  | { kind: 'compare'; rows: { category: string; instead: string; choose: string }[]; visual?: string }
  | { kind: 'meal'; name: string; size: string; rules: GuideListItem[]; examples: string[]; link?: { label: string; target: string }; visual?: string }
  | { kind: 'chips'; title: string; items: string[]; visual?: string }
  | { kind: 'faq'; items: FaqItem[]; visual?: string }
  | { kind: 'checklist'; title: string; items: GuideListItem[]; visual?: string }
  | { kind: 'link'; label: string; target: string }
  /** A block this version doesn't know: shown loudly while developing (see guidePages). */
  | { kind: 'unknown'; type: string };

const ITEMS_PER_PAGE = 3;
const COMPARES_PER_PAGE = 2;
const FAQS_PER_PAGE = 2;
const CHIPS_PER_PAGE = 8;

const isDev = () => {
  try {
    return !!import.meta.env?.DEV;
  } catch {
    return false;
  }
};

/** The page's illustration, when the page has one of its own above the text. */
export const pageVisual = (page: GuidePage): string | undefined => ('visual' in page ? page.visual : undefined);

export function guidePages(blocks: GuideBlock[], dev = isDev()): GuidePage[] {
  const pages: GuidePage[] = [];
  const scenarios = blocks.filter((b) => b.type === 'scenario').length;
  const meals = blocks.filter((b): b is Extract<GuideBlock, { type: 'meal' }> => b.type === 'meal');
  let scenario = 0;
  for (const b of blocks) {
    const last = pages[pages.length - 1];
    switch (b.type) {
      case 'hero':
        pages.push({ kind: 'cover', title: b.title, subtitle: b.subtitle, visuals: b.visuals ?? [] });
        // Meals in the guide: their day at a glance, right after the cover (built from the blocks).
        if (meals.length > 1) {
          pages.push({ kind: 'day', title: `היום שלכם ב-${meals.length} ארוחות`, meals: meals.map((m) => ({ name: m.name, size: m.size, visual: m.visual })) });
        }
        break;
      case 'scenario':
        scenario += 1;
        pages.push({ kind: 'scenario', title: b.title, items: b.items, index: scenario, total: scenarios, visual: b.visual });
        break;
      case 'compare': {
        const row = { category: b.category, instead: b.instead, choose: b.choose };
        if (last?.kind === 'compare' && last.rows.length < COMPARES_PER_PAGE) last.rows.push(row);
        else pages.push({ kind: 'compare', rows: [row], visual: b.visual });
        break;
      }
      case 'faq': {
        // Together on a page, unless one is marked to stand alone.
        const open = last?.kind === 'faq' && last.items.length < FAQS_PER_PAGE && !b.solo && !last.items.some((i) => i.solo);
        if (open) {
          last.items.push(b);
          // Each with its own drawing: they go in the cards, not above the page.
          if (b.visual) last.visual = undefined;
        } else pages.push({ kind: 'faq', items: [b], visual: b.equation ? undefined : b.visual });
        break;
      }
      case 'meal':
        pages.push({ kind: 'meal', name: b.name, size: b.size, rules: b.rules, examples: b.examples, visual: b.visual });
        break;
      case 'link':
        // Right after a meal, it belongs on that meal's page.
        if (last?.kind === 'meal' && !last.link) last.link = { label: b.button ?? b.label, target: b.target };
        else pages.push({ kind: 'link', label: b.button ?? b.label, target: b.target });
        break;
      case 'chips':
        for (let i = 0; i < b.items.length; i += CHIPS_PER_PAGE) {
          pages.push({ kind: 'chips', title: b.title, items: b.items.slice(i, i + CHIPS_PER_PAGE), visual: b.visual });
        }
        break;
      case 'checklist':
        pages.push({ kind: 'checklist', title: b.title, items: b.items, visual: b.visual });
        break;
      case 'intro':
        pages.push({ kind: 'intro', text: b.text, visual: b.visual });
        break;
      case 'do':
      case 'dont':
        pages.push({ kind: b.type, title: b.title, text: b.text, visual: b.visual });
        break;
      case 'principle':
        pages.push({ kind: 'principle', number: b.number, title: b.title, principle: b.principle, practice: b.practice, visual: b.visual });
        break;
      case 'callout':
        pages.push({ kind: 'callout', title: b.title, text: b.text, visual: b.visual });
        break;
      case 'quote':
        pages.push({ kind: 'quote', text: b.text, visual: b.visual });
        break;
      case 'cta':
        pages.push({ kind: 'cta', label: b.label, to: b.to });
        break;
      case 'section': {
        const items = b.items ?? [];
        // A heading with no list opens the do / don't pages after it.
        if (items.length === 0) pages.push({ kind: 'chapter', icon: b.icon, title: b.title, visual: b.visual });
        for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
          pages.push({ kind: 'section', icon: b.icon, title: b.title, items: items.slice(i, i + ITEMS_PER_PAGE), visual: b.visual });
        }
        break;
      }
      case 'shopping_list':
        break; // its own screen, not pages
      default: {
        // Never dropped quietly: a block with no page is a guide missing its text.
        const type = String((b as { type?: unknown }).type);
        console.error(`[guides] unknown block type "${type}"`, b);
        if (dev) pages.push({ kind: 'unknown', type });
      }
    }
  }
  return pages;
}

/**
 * The cover title in two lines, the second in orange: after the first sentence
 * when there are two ("אני חולה." / "מה עושים?"), else the last word — or the
 * last two in a long title.
 */
export function splitTitle(title: string): [string, string] {
  const sentence = title.match(/^(.+?[.?!]\s+)(\S.*)$/);
  if (sentence) return [sentence[1], sentence[2]];
  const words = title.split(' ');
  if (words.length < 2) return ['', title];
  const tail = words.length >= 5 ? 2 : 1;
  return [words.slice(0, -tail).join(' ') + ' ', words.slice(-tail).join(' ')];
}

/** The closing line with its last part in orange: the last sentence, or after the last comma. */
export function splitQuote(text: string): [string, string] {
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g);
  if (sentences && sentences.length > 1 && sentences.join('') === text) {
    const last = sentences[sentences.length - 1];
    return [text.slice(0, text.length - last.length), last];
  }
  const comma = text.lastIndexOf(', ');
  return comma > 0 ? [text.slice(0, comma + 2), text.slice(comma + 2)] : ['', text];
}
