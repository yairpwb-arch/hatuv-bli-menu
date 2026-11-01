// In-app guides: the text lives in supabase/guides/guides-source.txt, exactly
// as it should appear, and goes to program_content.body as an array of blocks.
//
//   node scripts/guides.mjs build            → supabase/run_guides.sql (+ guides.json)
//   node scripts/guides.mjs compare <file>   → every difference between the source
//                                               and <file>: the SQL file, or the JSON
//                                               returned by the SQL's last query.
//
// The comparison turns the blocks back into the source's own line format and
// compares line by line, character by character — punctuation included.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const SOURCE = path.join(ROOT, 'supabase/guides/guides-source.txt');

/** Which program_content row each guide fills (matched by title). */
const ROWS = [
  { title: 'מדריך: איך להישקל' },
  { title: 'מדריך: חו"ל ונופש', insert: { part: 1, week: 'שבוע 3', day: 15, sort: 41, category: 'events' } },
  { title: 'מדריך: למקסם את האימון' },
  { title: 'מדריך: מנטליות הרגלים', insert: { part: 1, week: 'פתיחה', day: 1, sort: 5, category: 'sleep' } },
  { title: 'מדריך: אני חולה, מה עושים?' },
];

const ICONS = { V: 'check', X: 'x', 'מטוס': 'plane', 'צלחת': 'plate', 'סכו"ם': 'cutlery', 'כוס': 'glass', 'הליכה': 'walk', 'בית': 'home', 'שעון': 'clock', 'משקולת': 'dumbbell' };
const CTA = { 'דף ההתקדמות, חלונית הוספת שקילה': '/app/progress?weigh=1' };
const PRINCIPLE = 'העיקרון: ';
const PRACTICE = "בתכל'ס: ";
const SEP = ' | ';

const invert = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));

/** Source text → [{ heading, lines, blocks }] per guide. */
function parseSource(text) {
  const guides = [];
  let cur = null;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^=+$/.test(line)) {
      if (lines[i + 2] !== undefined && /^=+$/.test(lines[i + 2])) {
        cur = { heading: lines[i + 1], lines: [], blocks: [] };
        guides.push(cur);
        i += 2;
      }
      continue;
    }
    if (!cur || line.trim() === '') continue;
    cur.lines.push(line);
    const fail = (why) => { throw new Error(`${cur.heading}: ${why}\n  ${line}`); };
    if (line.startsWith('- ')) {
      const sec = cur.blocks[cur.blocks.length - 1];
      if (sec?.type !== 'section') fail('a list item outside a section');
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

/** Blocks → the source's line format (for the comparison). */
function toLines(blocks) {
  const icons = invert(ICONS);
  const ctas = invert(CTA);
  const out = [];
  for (const b of blocks) {
    switch (b.type) {
      case 'hero': out.push(`[hero] ${b.title}${SEP}${b.subtitle}`); break;
      case 'intro': case 'quote': out.push(`[${b.type}] ${b.text}`); break;
      case 'do': case 'dont': out.push(`[${b.type}] ${b.title}${SEP}${b.text}`); break;
      case 'callout': out.push(b.title != null ? `[callout] ${b.title}${SEP}${b.text}` : `[callout] ${b.text}`); break;
      case 'principle': out.push(`[principle] ${b.number}${SEP}${b.title}${SEP}${PRINCIPLE}${b.principle}${SEP}${PRACTICE}${b.practice}`); break;
      case 'cta': out.push(`[cta] ${b.label} → ${ctas[b.to] ?? b.to}`); break;
      case 'section':
        out.push(`[section, אייקון ${icons[b.icon] ?? b.icon}] ${b.title}`);
        for (const it of b.items ?? []) out.push(`- ${it}`);
        break;
      default: out.push(`[??? ${b.type}]`);
    }
  }
  return out;
}

const sqlText = (s) => `'${s.replace(/'/g, "''")}'`;

function build() {
  const guides = parseSource(fs.readFileSync(SOURCE, 'utf8'));
  if (guides.length !== ROWS.length) throw new Error(`expected ${ROWS.length} guides, found ${guides.length}`);
  const sql = [
    '-- =============================================================================',
    '-- In-app guides: the 5 guides\' text into program_content.body (blocks).',
    '-- Generated by scripts/guides.mjs from supabase/guides/guides-source.txt —',
    '-- edit the source and rebuild, not this file. Safe to run more than once.',
    '-- =============================================================================',
    '',
    'BEGIN;',
    '',
    'ALTER TABLE public.program_content ADD COLUMN IF NOT EXISTS body JSONB;',
    "COMMENT ON COLUMN public.program_content.body IS 'An in-app guide: an array of blocks (hero, intro, do, dont, section, principle, callout, quote, cta).';",
    '',
  ];
  guides.forEach((g, i) => {
    const row = ROWS[i];
    const hero = g.blocks.find((b) => b.type === 'hero');
    sql.push(`-- ${g.heading}  →  "${row.title}"`);
    if (row.insert) {
      const r = row.insert;
      sql.push(
        'INSERT INTO public.program_content (part_number, week_range, unlock_day, title, description, content_type, is_bonus, sort_order, category)',
        `SELECT ${r.part}, ${sqlText(r.week)}, ${r.day}, ${sqlText(row.title)}, ${sqlText(hero.subtitle)}, 'guide', false, ${r.sort}, ${sqlText(r.category)}`,
        `WHERE NOT EXISTS (SELECT 1 FROM public.program_content WHERE title = ${sqlText(row.title)} AND archived_at IS NULL);`,
      );
    }
    const json = JSON.stringify(g.blocks, null, 2);
    if (json.includes('$guide$')) throw new Error('text contains the SQL quote marker');
    sql.push(
      `UPDATE public.program_content SET body = $guide$${json}$guide$::jsonb, content_type = 'guide'`,
      `WHERE title = ${sqlText(row.title)} AND archived_at IS NULL;`,
      '',
    );
  });
  sql.push(
    '-- Trainees already more than a week past a newly added guide: it counts as read,',
    "-- so the step-by-step gate doesn't send them back.",
    'INSERT INTO public.content_progress (user_id, content_id)',
    'SELECT p.id, c.id',
    'FROM public.profiles p',
    `JOIN public.program_content c ON c.archived_at IS NULL AND c.title IN (${ROWS.filter((r) => r.insert).map((r) => sqlText(r.title)).join(', ')})`,
    'WHERE p.start_date IS NOT NULL',
    '  AND c.unlock_day + 7 <= (CURRENT_DATE - p.start_date) + 1',
    '  AND NOT EXISTS (SELECT 1 FROM public.content_progress cp WHERE cp.user_id = p.id AND cp.content_id = c.id);',
    '',
    'COMMIT;',
    '',
    '-- Check: copy the result (JSON) back for the comparison. 5 rows.',
    `SELECT title, body FROM public.program_content WHERE archived_at IS NULL AND title IN (${ROWS.map((r) => sqlText(r.title)).join(', ')}) ORDER BY title;`,
    '',
  );
  fs.writeFileSync(path.join(ROOT, 'supabase/run_guides.sql'), sql.join('\n'));
  fs.writeFileSync(path.join(ROOT, 'supabase/guides/guides.json'), JSON.stringify(guides.map((g, i) => ({ title: ROWS[i].title, body: g.blocks })), null, 2));
  console.log(`built: ${guides.length} guides, ${guides.reduce((n, g) => n + g.blocks.length, 0)} blocks`);
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

function compare(file) {
  const guides = parseSource(fs.readFileSync(SOURCE, 'utf8'));
  const target = readTarget(file);
  let diffs = 0;
  guides.forEach((g, i) => {
    const title = ROWS[i].title;
    const body = target[title];
    if (!body) { console.log(`✗ ${g.heading}: no row "${title}" in ${path.basename(file)}`); diffs++; return; }
    const want = g.lines;
    const got = toLines(body);
    let local = 0;
    for (let k = 0; k < Math.max(want.length, got.length); k++) {
      if (want[k] === got[k]) continue;
      local++;
      if (want[k] === undefined) console.log(`  line ${k + 1}: extra in target: ${got[k]}`);
      else if (got[k] === undefined) console.log(`  line ${k + 1}: missing in target: ${want[k]}`);
      else console.log(`  line ${k + 1}: ${firstDiff(want[k], got[k])}`);
    }
    const chars = want.join('\n').length;
    console.log(`${local ? '✗' : '✓'} ${g.heading}: ${want.length} lines, ${chars} characters, ${local} differences`);
    diffs += local;
  });
  console.log(diffs ? `\n${diffs} differences.` : '\nNo differences: identical, character for character.');
  process.exitCode = diffs ? 1 : 0;
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'build') build();
else if (cmd === 'compare' && arg) compare(path.resolve(arg));
else console.log('usage: node scripts/guides.mjs build | compare <file.sql | result.json>');
