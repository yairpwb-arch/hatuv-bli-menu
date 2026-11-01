// For each guide: blocks in the body against the pages shown, and proof no text
// is lost on the way: every string in the body has to appear on some page.
//
//   node scripts/guides-report.mts [file]     (default: supabase/guides/guides.json)
//
// The file can also be the JSON returned by run_guides_3.sql's last query.
import fs from 'node:fs';
import { guidePages } from '../src/lib/guidePages.ts';
import type { GuideBlock } from '../src/lib/guideBlocks.ts';

const file = process.argv[2] ?? 'supabase/guides/guides.json';
const rows = JSON.parse(fs.readFileSync(file, 'utf8')) as { title: string; body: GuideBlock[] }[];

/** Display-only fields: names of drawings and routes, not text a reader needs. */
const NOT_TEXT = new Set(['type', 'visual', 'visuals', 'icon', 'equation', 'solo', 'to', 'target', 'button', 'size']);

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!NOT_TEXT.has(k)) strings(x, out);
  return out;
}

let failed = 0;
console.log('מדריך | בלוקים | עמודים | לא מוכרים | טקסט שלא מוצג');
for (const { title, body } of rows) {
  if (body[0]?.type === 'shopping_list') {
    console.log(`${title} | 1 | מסך אינטראקטיבי | 0 | 0`);
    continue;
  }
  const pages = guidePages(body, true);
  const shown = JSON.stringify(pages);
  const unknown = pages.filter((p) => p.kind === 'unknown').length;
  // `label` of a link is replaced by its button on screen when it has one.
  const lost = body.flatMap((b) => strings(b.type === 'link' && b.button ? { ...b, label: b.button } : b)).filter((s) => !shown.includes(JSON.stringify(s).slice(1, -1)));
  if (unknown || lost.length) failed += 1;
  console.log(`${title} | ${body.length} | ${pages.length} | ${unknown} | ${lost.length}`);
  for (const s of lost) console.log(`    לא מוצג: ${s}`);
}
console.log(failed ? `\n${failed} מדריכים עם בעיה.` : '\nכל הבלוקים מוצגים, ושום טקסט לא הלך לאיבוד.');
process.exitCode = failed ? 1 : 0;
