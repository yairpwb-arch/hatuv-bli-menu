/**
 * An in-app guide is program_content.body: an array of these blocks, written
 * in Supabase (from supabase/guides/guides-source.txt via scripts/guides.mjs),
 * so a text fix needs no new app version.
 */
export type GuideIconKey = 'check' | 'x' | 'plane' | 'plate' | 'cutlery' | 'glass' | 'walk' | 'home' | 'clock' | 'dumbbell';

export type GuideBlock =
  | { type: 'hero'; title: string; subtitle: string }
  | { type: 'intro'; text: string }
  | { type: 'do'; title: string; text: string }
  | { type: 'dont'; title: string; text: string }
  | { type: 'section'; icon: GuideIconKey; title: string; items?: string[] }
  | { type: 'principle'; number: string; title: string; principle: string; practice: string }
  | { type: 'callout'; title?: string; text: string }
  | { type: 'quote'; text: string }
  | { type: 'cta'; label: string; to: string };

/** The body when it's a usable guide, else null (no body yet → the old link / sheet). */
export function guideBody(body: unknown): GuideBlock[] | null {
  return Array.isArray(body) && body.length > 0 ? (body as GuideBlock[]) : null;
}
