/**
 * A guide's blocks laid out as story pages, one idea per page. The text is
 * never changed: pages only group blocks, and the "split" helpers return the
 * same text cut in two (joined back, it's identical) for the two-colour titles.
 */
import type { GuideBlock, GuideIconKey } from '@/lib/guideBlocks';

export type GuidePage =
  | { kind: 'cover'; title: string; subtitle: string }
  | { kind: 'intro'; text: string }
  | { kind: 'chapter'; icon: GuideIconKey; title: string }
  | { kind: 'section'; icon: GuideIconKey; title: string; items: string[] }
  | { kind: 'do' | 'dont'; title: string; text: string }
  | { kind: 'principle'; number: string; title: string; principle: string; practice: string }
  | { kind: 'callout'; title?: string; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'cta'; label: string; to: string };

const ITEMS_PER_PAGE = 3;

export function guidePages(blocks: GuideBlock[]): GuidePage[] {
  const pages: GuidePage[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case 'hero': pages.push({ kind: 'cover', title: b.title, subtitle: b.subtitle }); break;
      case 'intro': pages.push({ kind: 'intro', text: b.text }); break;
      case 'do': case 'dont': pages.push({ kind: b.type, title: b.title, text: b.text }); break;
      case 'principle': pages.push({ kind: 'principle', number: b.number, title: b.title, principle: b.principle, practice: b.practice }); break;
      case 'callout': pages.push({ kind: 'callout', title: b.title, text: b.text }); break;
      case 'quote': pages.push({ kind: 'quote', text: b.text }); break;
      case 'cta': pages.push({ kind: 'cta', label: b.label, to: b.to }); break;
      case 'section': {
        const items = b.items ?? [];
        // A heading with no list opens the do / don't pages after it.
        if (items.length === 0) pages.push({ kind: 'chapter', icon: b.icon, title: b.title });
        for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
          pages.push({ kind: 'section', icon: b.icon, title: b.title, items: items.slice(i, i + ITEMS_PER_PAGE) });
        }
        break;
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
