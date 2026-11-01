// In-app guides: the text lives in supabase/guides/guides-source*.txt, exactly
// as it should appear, and goes to program_content.body as an array of blocks.
//
//   node scripts/guides.mjs build            → supabase/run_guides_3.sql: all the guides with their
//                                               illustrations and emphasis, and the shopping list
//                                               (+ guides.json, emphasis-report.txt)
//   node scripts/guides.mjs compare <file>   → every difference between the source
//                                               and <file>: a SQL file, or the JSON
//                                               returned by a SQL file's last query.
//                                               Compares the guides found in <file>.
//
// The comparison turns the blocks back into the source's own line format and
// compares line by line, character by character — punctuation included.
import fs from 'node:fs';
import path from 'node:path';
import { decorate, stripMarks } from '../supabase/guides/presentation.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const SOURCES = ['supabase/guides/guides-source.txt', 'supabase/guides/guides-source-2.txt'].map((f) => path.join(ROOT, f));

/** Which program_content row each guide fills (matched by title). */
const ROWS = [
  { title: 'מדריך: איך להישקל' },
  { title: 'מדריך: חו"ל ונופש', insert: { part: 1, week: 'שבוע 3', day: 15, sort: 41, category: 'events' } },
  { title: 'מדריך: למקסם את האימון' },
  { title: 'מדריך: מנטליות הרגלים', insert: { part: 1, week: 'פתיחה', day: 1, sort: 5, category: 'sleep' } },
  { title: 'מדריך: אני חולה, מה עושים?' },
  // Second batch: placed in the path (after the video it goes with), updating an
  // existing row (`was` = its title until now) or creating one.
  { batch: 2, title: 'מדריך: סופ"שים, אירועים ומסעדות', was: 'מדריך: ארוחות שישי, מסעדות ואירועים', place: { part: 2, week: 'שבועות 5–6', day: 29, sort: 56, category: 'events' } },
  { batch: 2, title: 'מדריך: על האש עם חברים', place: { part: 2, week: 'שבועות 5–6', day: 29, sort: 57, category: 'events' } },
  { batch: 2, title: 'מדריך: רגעים לא צפויים', existing: true, place: { part: 2, week: 'שבועות 5–6', day: 29, sort: 64, category: 'events' } },
  { batch: 2, title: 'מדריך: סידור הארוחות בצורה נכונה', place: { part: 2, week: 'שבועות 5–6', day: 29, sort: 65, category: 'nutrition' } },
  { batch: 2, title: 'מדריך: תזונה בריאה', existing: true, place: { part: 2, week: 'שבועות 11–12', day: 71, sort: 91, category: 'nutrition' } },
  { batch: 2, title: 'מדריך: איך להיות המאמן של עצמכם', was: 'מסמך בניית האימונים', place: { part: 4, week: 'שבועות 29–32', day: 197, sort: 151, category: 'training' } },
];

const ICONS = { V: 'check', X: 'x', 'מטוס': 'plane', 'צלחת': 'plate', 'סכו"ם': 'cutlery', 'כוס': 'glass', 'הליכה': 'walk', 'בית': 'home', 'שעון': 'clock', 'משקולת': 'dumbbell', 'לוח שנה': 'calendar', 'כוכב': 'star', 'ספל': 'cup', 'טיפה': 'drop', 'ברק': 'bolt', 'חצים': 'arrows', 'גרף': 'chart', 'מגן': 'shield', 'שרשרת': 'chain', 'ירח': 'moon' };
const CTA = { 'דף ההתקדמות, חלונית הוספת שקילה': '/app/progress?weigh=1' };
const LINKS = { 'ספר נשנושים': 'snacks_book' };
const EXAMPLES = 'למשל: ';
const DOT = ' · ';
/** Text still waiting for the owner's decision: "[ממתין…]", "[שורת הכשל: …]". Never written to the database. */
const isHeld = (text) => text.startsWith('[');
const PRINCIPLE = 'העיקרון: ';
const PRACTICE = "בתכל'ס: ";
const SEP = ' | ';

const invert = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));

/** Source text → [{ heading, lines, blocks, held }] per guide. */
function parseSource(text) {
  const guides = [];
  let cur = null;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^=+$/.test(line)) {
      if (lines[i + 2] !== undefined && /^=+$/.test(lines[i + 2])) {
        cur = { heading: lines[i + 1], lines: [], blocks: [], held: [] };
        guides.push(cur);
        i += 2;
      }
      continue;
    }
    if (!cur || line.trim() === '') continue;
    // A section whose whole text is still held back isn't written at all.
    if (line.startsWith('[section') && lines[i + 1]?.startsWith('- [')) {
      cur.held.push(line);
      while (lines[i + 1]?.startsWith('- [')) cur.held.push(lines[++i]);
      continue;
    }
    if (line.startsWith('[checklist]') && line.split(SEP).some(isHeld)) {
      const kept = line.split(SEP).filter((part, n) => {
        if (n === 0 || !isHeld(part)) return true;
        cur.held.push(part);
        return false;
      }).join(SEP);
      cur.lines.push(kept);
      const parts = kept.replace('[checklist] ', '').split(SEP);
      cur.blocks.push({ type: 'checklist', title: parts[0], items: parts.slice(1) });
      continue;
    }
    cur.lines.push(line);
    const fail = (why) => { throw new Error(`${cur.heading}: ${why}\n  ${line}`); };
    if (line.startsWith('- ')) {
      const sec = cur.blocks[cur.blocks.length - 1];
      if (sec?.type !== 'section' && sec?.type !== 'scenario') fail('a list item outside a section');
      (sec.items ??= []).push(line.slice(2));
      continue;
    }
    const m = line.match(/^\[([^\]]+)\] (.*)$/);
    if (!m) fail('unknown line');
    const [tag, rest] = [m[1], m[2]];
    const parts = rest.split(SEP);
    if (tag.startsWith('section')) {
      const icon = tag.match(/^section, אייקון (.+)$/)?.[1];
      if (!icon || !ICONS[icon]) fail(`unknown icon "${icon}"`);
      cur.blocks.push({ type: 'section', icon: ICONS[icon], title: rest });
    } else if (tag === 'scenario') {
      cur.blocks.push({ type: 'scenario', title: rest, items: [] });
    } else if (tag === 'compare') {
      if (parts.length !== 3) fail('compare needs category | instead | choose');
      cur.blocks.push({ type: 'compare', category: parts[0], instead: parts[1], choose: parts[2] });
    } else if (tag === 'meal') {
      if (parts.length !== 4 || !parts[3].startsWith(EXAMPLES)) fail('meal: name | size | rules | למשל: …');
      cur.blocks.push({ type: 'meal', name: parts[0], size: parts[1], rules: parts[2].split(DOT), examples: parts[3].slice(EXAMPLES.length).split(DOT) });
    } else if (tag === 'chips') {
      if (parts.length !== 2) fail('chips needs title | items');
      cur.blocks.push({ type: 'chips', title: parts[0], items: parts[1].split(DOT) });
    } else if (tag === 'faq') {
      if (parts.length !== 2) fail('faq needs question | answer');
      cur.blocks.push({ type: 'faq', question: parts[0], answer: parts[1] });
    } else if (tag === 'checklist') {
      cur.blocks.push({ type: 'checklist', title: parts[0], items: parts.slice(1) });
    } else if (tag === 'link') {
      const [label, target] = rest.split(' → ');
      if (!LINKS[target]) fail(`unknown link target "${target}"`);
      cur.blocks.push({ type: 'link', label, target: LINKS[target] });
    } else if (tag === 'hero') {
      if (parts.length !== 2) fail('hero needs title | subtitle');
      cur.blocks.push({ type: 'hero', title: parts[0], subtitle: parts[1] });
    } else if (tag === 'intro' || tag === 'quote') {
      cur.blocks.push({ type: tag, text: rest });
    } else if (tag === 'do' || tag === 'dont') {
      if (parts.length !== 2) fail(`${tag} needs title | text`);
      cur.blocks.push({ type: tag, title: parts[0], text: parts[1] });
    } else if (tag === 'callout') {
      if (parts.length > 2) fail('callout: at most title | text');
      cur.blocks.push(parts.length === 2 ? { type: 'callout', title: parts[0], text: parts[1] } : { type: 'callout', text: rest });
    } else if (tag === 'principle') {
      if (parts.length !== 4 || !parts[2].startsWith(PRINCIPLE) || !parts[3].startsWith(PRACTICE)) fail('principle: n | title | העיקרון: … | בתכל\'ס: …');
      cur.blocks.push({ type: 'principle', number: parts[0], title: parts[1], principle: parts[2].slice(PRINCIPLE.length), practice: parts[3].slice(PRACTICE.length) });
    } else if (tag === 'cta') {
      const [label, target] = rest.split(' → ');
      if (!CTA[target]) fail(`unknown cta target "${target}"`);
      cur.blocks.push({ type: 'cta', label, to: CTA[target] });
    } else fail(`unknown block [${tag}]`);
  }
  return guides;
}

const textOf = (item) => (typeof item === 'string' ? item : item.text);

/** A body without its emphasis marks: what must equal the source. */
const unmarked = (v) => {
  if (typeof v === 'string') return stripMarks(v);
  if (Array.isArray(v)) return v.map(unmarked);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unmarked(x)]));
  return v;
};

/** Blocks → the source's line format (for the comparison). */
function toLines(blocks) {
  const icons = invert(ICONS);
  const ctas = invert(CTA);
  const links = invert(LINKS);
  const out = [];
  for (const b of blocks) {
    switch (b.type) {
      case 'hero': out.push(`[hero] ${b.title}${SEP}${b.subtitle}`); break;
      case 'intro': case 'quote': out.push(`[${b.type}] ${b.text}`); break;
      case 'do': case 'dont': out.push(`[${b.type}] ${b.title}${SEP}${b.text}`); break;
      case 'callout': out.push(b.title != null ? `[callout] ${b.title}${SEP}${b.text}` : `[callout] ${b.text}`); break;
      case 'principle': out.push(`[principle] ${b.number}${SEP}${b.title}${SEP}${PRINCIPLE}${b.principle}${SEP}${PRACTICE}${b.practice}`); break;
      case 'cta': out.push(`[cta] ${b.label} → ${ctas[b.to] ?? b.to}`); break;
      case 'link': out.push(`[link] ${b.label} → ${links[b.target] ?? b.target}`); break;
      case 'compare': out.push(`[compare] ${b.category}${SEP}${b.instead}${SEP}${b.choose}`); break;
      case 'meal': out.push(`[meal] ${b.name}${SEP}${b.size}${SEP}${b.rules.map(textOf).join(DOT)}${SEP}${EXAMPLES}${b.examples.join(DOT)}`); break;
      case 'chips': out.push(`[chips] ${b.title}${SEP}${b.items.join(DOT)}`); break;
      case 'faq': out.push(`[faq] ${b.question}${SEP}${b.answer}`); break;
      case 'checklist': out.push(`[checklist] ${b.title}${SEP}${b.items.map(textOf).join(SEP)}`); break;
      case 'scenario':
        out.push(`[scenario] ${b.title}`);
        for (const it of b.items ?? []) out.push(`- ${textOf(it)}`);
        break;
      case 'section':
        out.push(`[section, אייקון ${icons[b.icon] ?? b.icon}] ${b.title}`);
        for (const it of b.items ?? []) out.push(`- ${textOf(it)}`);
        break;
      default: out.push(`[??? ${b.type}]`);
    }
  }
  return out;
}

const sqlText = (s) => `'${s.replace(/'/g, "''")}'`;

const allGuides = () => SOURCES.flatMap((f) => parseSource(fs.readFileSync(f, 'utf8')));

function buildSql(guides, batch, intro) {
  const sql = [
    '-- =============================================================================',
    ...intro.map((l) => `-- ${l}`),
    '-- Generated by scripts/guides.mjs from supabase/guides/guides-source*.txt —',
    '-- edit the source and rebuild, not this file. Safe to run more than once.',
    '-- =============================================================================',
    '',
    'BEGIN;',
    '',
    'ALTER TABLE public.program_content ADD COLUMN IF NOT EXISTS body JSONB;',
    "COMMENT ON COLUMN public.program_content.body IS 'An in-app guide: an array of blocks (hero, intro, do, dont, section, principle, callout, quote, cta, scenario, compare, meal, chips, faq, checklist, link).';",
    '',
  ];
  const rows = [];
  guides.forEach((g, i) => {
    const row = ROWS[i];
    if ((row.batch ?? 1) !== batch) return;
    rows.push(row);
    const hero = g.blocks.find((x) => x.type === 'hero');
    sql.push(`-- ${g.heading}  →  "${row.title}"`);
    if (row.was) {
      sql.push(
        `UPDATE public.program_content SET title = ${sqlText(row.title)}`,
        `WHERE title = ${sqlText(row.was)} AND archived_at IS NULL`,
        `  AND NOT EXISTS (SELECT 1 FROM public.program_content WHERE title = ${sqlText(row.title)} AND archived_at IS NULL);`,
      );
    }
    const r = row.insert ?? row.place;
    if (r) {
      sql.push(
        'INSERT INTO public.program_content (part_number, week_range, unlock_day, title, description, content_type, is_bonus, sort_order, category)',
        `SELECT ${r.part}, ${sqlText(r.week)}, ${r.day}, ${sqlText(row.title)}, ${sqlText(hero.subtitle)}, 'guide', false, ${r.sort}, ${sqlText(r.category)}`,
        `WHERE NOT EXISTS (SELECT 1 FROM public.program_content WHERE title = ${sqlText(row.title)} AND archived_at IS NULL);`,
      );
    }
    const json = JSON.stringify(g.blocks, null, 2);
    if (json.includes('$guide$')) throw new Error('text contains the SQL quote marker');
    const placed = row.place
      ? `, part_number = ${row.place.part}, week_range = ${sqlText(row.place.week)}, unlock_day = ${row.place.day}, sort_order = ${row.place.sort}, category = ${sqlText(row.place.category)}, description = ${sqlText(hero.subtitle)}`
      : '';
    sql.push(
      `UPDATE public.program_content SET body = $guide$${json}$guide$::jsonb, content_type = 'guide'${placed}`,
      `WHERE title = ${sqlText(row.title)} AND archived_at IS NULL;`,
      '',
    );
  });
  const created = rows.filter((r) => r.insert || (r.place && !r.was && !r.existing));
  sql.push(
    '-- Trainees already more than a week past a guide added now: it counts as read,',
    "-- so the step-by-step gate doesn't send them back.",
    'INSERT INTO public.content_progress (user_id, content_id)',
    'SELECT p.id, c.id',
    'FROM public.profiles p',
    `JOIN public.program_content c ON c.archived_at IS NULL AND c.title IN (${created.map((r) => sqlText(r.title)).join(', ')})`,
    'WHERE p.start_date IS NOT NULL',
    '  AND c.unlock_day + 7 <= (CURRENT_DATE - p.start_date) + 1',
    '  AND NOT EXISTS (SELECT 1 FROM public.content_progress cp WHERE cp.user_id = p.id AND cp.content_id = c.id);',
    '',
    'COMMIT;',
    '',
    `-- Check: copy the result (JSON) back for the comparison. ${rows.length} rows.`,
    `SELECT title, unlock_day, sort_order, category, body FROM public.program_content WHERE archived_at IS NULL AND title IN (${rows.map((r) => sqlText(r.title)).join(', ')}) ORDER BY sort_order;`,
    '',
  );
  return sql.join('\n');
}

const SHOPPING = path.join(ROOT, 'supabase/guides/shopping-list.json');
const SHOPPING_ROW = 'מדריך: רשימת קניות';

function build() {
  const guides = allGuides();
  if (guides.length !== ROWS.length) throw new Error(`expected ${ROWS.length} guides, found ${guides.length}`);
  const report = [];
  const decorated = guides.map((g, i) => {
    const marks = [];
    const plain = [];
    const body = decorate(ROWS[i].title, g.blocks, marks, plain);
    report.push(`${g.heading} — ${marks.length} הדגשות`, ...marks.map((m) => `  ${m}`));
    if (plain.length) report.push('  ללא הדגשה:', ...plain.map((t) => `    ${t}`));
    report.push('');
    return { title: ROWS[i].title, body };
  });
  const shopping = fs.readFileSync(SHOPPING, 'utf8').trim();
  if (shopping.includes('$guide$')) throw new Error('text contains the SQL quote marker');
  const sql = [
    '-- =============================================================================',
    '-- In-app guides: all 11 with their illustrations, icons and emphasis (body only:',
    '-- opening days, order and topics stay as they are), and the shopping list.',
    '-- Generated by scripts/guides.mjs from supabase/guides/ — edit there and rebuild.',
    '-- Safe to run more than once.',
    '-- =============================================================================',
    '',
    'BEGIN;',
    '',
    ...decorated.flatMap(({ title, body }) => {
      const json = JSON.stringify(body, null, 2);
      if (json.includes('$guide$')) throw new Error('text contains the SQL quote marker');
      return [`UPDATE public.program_content SET body = $guide$${json}$guide$::jsonb`, `WHERE title = ${sqlText(title)} AND archived_at IS NULL;`, ''];
    }),
    '-- The shopping list: a stage on the map (weeks 11–12) that opens its own screen.',
    'INSERT INTO public.program_content (part_number, week_range, unlock_day, title, description, content_type, is_bonus, sort_order, category)',
    `SELECT 2, 'שבועות 11–12', 71, ${sqlText(SHOPPING_ROW)}, ${sqlText(JSON.parse(shopping).subtitle)}, 'guide', false, 92, 'nutrition'`,
    `WHERE NOT EXISTS (SELECT 1 FROM public.program_content WHERE title = ${sqlText(SHOPPING_ROW)} AND archived_at IS NULL);`,
    `UPDATE public.program_content SET body = $guide$${JSON.stringify([{ type: 'shopping_list', ...JSON.parse(shopping) }], null, 2)}$guide$::jsonb, description = ${sqlText(JSON.parse(shopping).subtitle)}`,
    `WHERE title = ${sqlText(SHOPPING_ROW)} AND archived_at IS NULL;`,
    '',
    'COMMIT;',
    '',
    '-- Check: copy the result (JSON) back for the comparison. 12 rows.',
    `SELECT title, body FROM public.program_content WHERE archived_at IS NULL AND title IN (${[...ROWS.map((r) => r.title), SHOPPING_ROW].map(sqlText).join(', ')});`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(ROOT, 'supabase/run_guides_3.sql'), sql);
  fs.writeFileSync(path.join(ROOT, 'supabase/guides/guides.json'), JSON.stringify(decorated, null, 2));
  fs.writeFileSync(path.join(ROOT, 'supabase/guides/emphasis-report.txt'), report.join('\n'));
  console.log(`built: ${guides.length} guides, ${guides.reduce((n, g) => n + g.blocks.length, 0)} blocks`);
  for (const g of guides) if (g.held.length) console.log(`held back (${g.heading}): ${g.held.length} lines`);
}

/** Bodies by row title, from the SQL file or from the query's JSON result. */
function readTarget(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.sql')) {
    const found = {};
    for (const m of text.matchAll(/SET body = \$guide\$([\s\S]*?)\$guide\$::jsonb[^\n]*\nWHERE title = '((?:[^']|'')*)'/g)) found[m[2].replace(/''/g, "'")] = JSON.parse(m[1]);
    return found;
  }
  const rows = JSON.parse(text);
  return Object.fromEntries(rows.map((r) => [r.title, typeof r.body === 'string' ? JSON.parse(r.body) : r.body]));
}

function firstDiff(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const show = (s) => JSON.stringify(s.slice(Math.max(0, i - 15), i + 25));
  const code = (s) => (i < s.length ? `U+${s.codePointAt(i).toString(16).toUpperCase().padStart(4, '0')}` : 'end');
  return `at character ${i + 1}: source ${show(a)} (${code(a)}) ≠ target ${show(b)} (${code(b)})`;
}

/** Every key in a JSON value (Postgres reorders them): for a stable comparison. */
function flatKeys(v, keys = {}) {
  if (Array.isArray(v)) v.forEach((x) => flatKeys(x, keys));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { keys[k] = 1; flatKeys(x, keys); }
  return keys;
}

function compare(file) {
  const guides = allGuides();
  const target = readTarget(file);
  let diffs = 0;
  let compared = 0;
  // The shopping list: must equal its source exactly.
  if (target[SHOPPING_ROW]) {
    const { type: _type, ...list } = target[SHOPPING_ROW][0];
    const keys = Object.keys(flatKeys(list)).sort();
    const same = JSON.stringify(list, keys) === JSON.stringify(JSON.parse(fs.readFileSync(SHOPPING, 'utf8')), keys);
    console.log(`${same ? '✓' : '✗'} רשימת קניות: ${same ? '0 הבדלים' : 'יש הבדלים'}`);
    if (!same) diffs++;
    delete target[SHOPPING_ROW];
  }
  const expected = Object.keys(target).length;
  guides.forEach((g, i) => {
    const title = ROWS[i].title;
    const body = target[title];
    if (!body) return; // not in this file (the other batch)
    compared++;
    const want = g.lines;
    const got = toLines(unmarked(body));
    let local = 0;
    for (let k = 0; k < Math.max(want.length, got.length); k++) {
      if (want[k] === got[k]) continue;
      local++;
      if (want[k] === undefined) console.log(`  line ${k + 1}: extra in target: ${got[k]}`);
      else if (got[k] === undefined) console.log(`  line ${k + 1}: missing in target: ${want[k]}`);
      else console.log(`  line ${k + 1}: ${firstDiff(want[k], got[k])}`);
    }
    const chars = want.join('\n').length;
    console.log(`${local ? '✗' : '✓'} ${g.heading}: ${want.length} lines, ${chars} characters, ${local} differences${g.held.length ? ` (${g.held.length} lines held back on purpose)` : ''}`);
    diffs += local;
  });
  if (compared !== expected) { console.log(`✗ ${expected - compared} rows in the file match no guide in the source`); diffs++; }
  if (compared === 0) { console.log('✗ no guides found in the file'); diffs++; }
  console.log(diffs ? `\n${diffs} differences.` : `\nNo differences in ${compared} guides: identical, character for character.`);
  process.exitCode = diffs ? 1 : 0;
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'build') build();
else if (cmd === 'compare' && arg) compare(path.resolve(arg));
else console.log('usage: node scripts/guides.mjs build | compare <file.sql | result.json>');
