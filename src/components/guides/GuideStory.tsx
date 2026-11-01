import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Illustration } from '@/components/illustrations/Illustration';
import { StoryDecor } from '@/components/guides/StoryDecor';
import { itemIcon, itemText, type GuideListItem } from '@/lib/guideBlocks';
import { pageVisual, splitQuote, splitTitle, type GuidePage } from '@/lib/guidePages';
import { selectionHaptic } from '@/lib/native';
import { cn } from '@/lib/utils';

const ORANGE = '#FF8A2A';
const SOFT = '#FFB070';

const MARK = {
  do: { word: 'כן', color: '#5BE38F', bg: '#0F2A1A' },
  dont: { word: 'לא', color: '#FF7A7A', bg: '#2A1414' },
};

/**
 * Numbers like "2–3", "80/20", "80%" or "1%–5%" kept left-to-right inside the
 * Hebrew, so they don't flip. The text itself is shown exactly as written.
 */
function Ltr({ text }: { text: string }) {
  const parts = text.split(/(\d+%?(?:[-–/.,:]\d+%?)*)/);
  return <>{parts.map((p, i) => (i % 2 ? <bdi key={i} dir="ltr">{p}</bdi> : <Fragment key={i}>{p}</Fragment>))}</>;
}

/**
 * A text with its marks: **bold** stands out against what's around it (orange
 * on white text, white on orange text), ==marker== gets an orange highlight.
 */
function Rich({ text, on = 'white' }: { text: string; on?: 'white' | 'orange' }) {
  const parts = text.split(/(\*\*.+?\*\*|==.+?==)/);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**') && p.length > 4) {
          return <strong key={i} className="font-extrabold" style={{ color: on === 'white' ? ORANGE : '#FFFFFF' }}><Ltr text={p.slice(2, -2)} /></strong>;
        }
        if (p.startsWith('==') && p.endsWith('==') && p.length > 4) {
          return <mark key={i} className="rounded px-1" style={{ background: 'rgba(255,138,42,0.25)', color: 'inherit' }}><Ltr text={p.slice(2, -2)} /></mark>;
        }
        return <Ltr key={i} text={p} />;
      })}
    </>
  );
}

/* Each page's text comes in one piece after another: title, then body 80ms later. */
const IN = 'motion-safe:animate-story-in';
const delay = (step: number) => ({ animationDelay: `${step * 80}ms` });

const Title = ({ text, step = 0, size }: { text: string; step?: number; size?: string }) => (
  <h2 className={cn(IN, 'font-extrabold leading-[1.15] text-white', size ?? (text.length > 38 ? 'text-[32px]' : 'text-[38px]'))} style={delay(step)}>
    <Rich text={text} />
  </h2>
);

const Body = ({ text, step = 1, className }: { text: string; step?: number; className?: string }) => (
  <p className={cn(IN, 'text-[18px] font-semibold leading-[1.5]', className)} style={{ color: SOFT, ...delay(step) }}>
    <Rich text={text} on="orange" />
  </p>
);

/** A small label: "העיקרון:", "מה עושים בפועל:", "למשל:". */
const Tag = ({ text, tone = 'orange' }: { text: string; tone?: 'orange' | 'plain' | 'solid' }) => (
  <span
    className={cn('inline-block rounded-full px-3 py-1 text-[13px] font-bold', tone === 'plain' && 'bg-white/10 text-white/85', tone === 'orange' && 'bg-[#22160C]', tone === 'solid' && 'text-black')}
    style={tone === 'orange' ? { color: ORANGE } : tone === 'solid' ? { background: ORANGE } : undefined}
  >
    <Ltr text={text} />
  </span>
);

/** A row with its icon: a small illustration in a dark circle, on the right. */
const Rows = ({ items, firstStep = 1, on = 'orange' }: { items: GuideListItem[]; firstStep?: number; on?: 'white' | 'orange' }) => (
  <ul className="space-y-2.5">
    {items.map((it, i) => (
      <li key={i} className={cn(IN, 'flex items-start gap-3')} style={delay(i + firstStep)}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
          <Illustration name={itemIcon(it) ?? 'check_big'} size={24} />
        </span>
        <span className={cn('min-w-0 pt-1 text-[17px] font-semibold leading-[1.45]', on === 'white' && 'text-white')} style={on === 'orange' ? { color: SOFT } : undefined}>
          <Rich text={itemText(it)} on={on} />
        </span>
      </li>
    ))}
  </ul>
);

const Chips = ({ items, step = 1 }: { items: string[]; step?: number }) => (
  <ul className={cn(IN, 'flex flex-wrap gap-2')} style={delay(step)}>
    {items.map((it, i) => (
      <li key={i} className="rounded-full bg-white/10 px-3 py-1.5 text-[15px] font-semibold leading-snug text-white">
        <Ltr text={it} />
      </li>
    ))}
  </ul>
);

/** Examples as small cards, scrolled sideways (the story's own swipe stays out of it). */
const ExampleCards = ({ items, step = 2 }: { items: string[]; step?: number }) => (
  <ul
    className={cn(IN, 'pointer-events-auto -mx-6 flex gap-2 overflow-x-auto px-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden')}
    style={delay(step)}
    onPointerDown={(e) => e.stopPropagation()}
    onPointerUp={(e) => e.stopPropagation()}
  >
    {items.map((it, i) => (
      <li key={i} className="w-[148px] shrink-0 rounded-2xl bg-white/10 p-3 text-[14px] font-semibold leading-snug text-white">
        <Ltr text={it} />
      </li>
    ))}
  </ul>
);

const SecondaryAction = ({ label, onClick, step = 3 }: { label: string; onClick: () => void; step?: number }) => (
  <button
    type="button"
    onClick={onClick}
    onPointerDown={(e) => e.stopPropagation()}
    onPointerUp={(e) => e.stopPropagation()}
    className={cn(IN, 'pointer-events-auto min-h-[44px] w-full rounded-full border px-4 py-2 text-[15px] font-bold text-white')}
    style={{ borderColor: ORANGE, ...delay(step) }}
  >
    <Ltr text={label} />
  </button>
);

/** Three sweets given up = one junk meal. */
const JunkEquation = () => (
  <div className={cn(IN, 'flex items-center justify-center gap-1.5')} dir="rtl" role="img" aria-label="שלוש ארוחות מתוקות שווה ארוחת ג'אנק אחת">
    <div className="flex flex-col items-center gap-1">
      <span className="text-[13px] font-bold" style={{ color: MARK.dont.color }}>מוותרים</span>
      <div className="flex items-center gap-0.5">
        {[0, 1, 2].map((i) => (
          <Fragment key={i}>
            {i > 0 && <span className="text-[20px] font-extrabold text-white">+</span>}
            <span className="relative">
              <Illustration name="chocolate" size={52} />
              <span className="absolute -top-1 left-0 flex h-5 w-5 items-center justify-center rounded-full" style={{ background: MARK.dont.bg, color: MARK.dont.color }}>
                <X className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
            </span>
          </Fragment>
        ))}
      </div>
    </div>
    <span className="mt-5 text-[32px] font-extrabold" style={{ color: ORANGE }}>=</span>
    <span className="mt-5"><Illustration name="burger" size={76} /></span>
  </div>
);

interface PageProps {
  page: GuidePage;
  avatar: string;
  mealTimes: Record<string, string>;
  onCta: (to: string) => void;
  onDone: () => void;
  onLink: (target: string) => void;
}

function PageView({ page, avatar, mealTimes, onCta, onDone, onLink }: PageProps): ReactNode {
  switch (page.kind) {
    case 'unknown':
      return (
        <div className="rounded-2xl border-2 border-red-500 bg-red-950 p-4 text-white">
          <p className="text-[20px] font-extrabold">בלוק לא מוכר</p>
          <p className="mt-1 font-mono text-[15px]" dir="ltr">{page.type}</p>
          <p className="mt-2 text-[14px]">האפליקציה לא יודעת להציג את הבלוק הזה. הוא נרשם ללוג.</p>
        </div>
      );
    case 'cover': {
      const [first, second] = splitTitle(page.title);
      return (
        <div className="space-y-5">
          <div className={IN}>
            <img src={avatar} alt="" className="h-[72px] w-[72px] shrink-0 rounded-full object-cover" style={{ border: `3px solid ${ORANGE}` }} />
          </div>
          <h1 className={cn(IN, 'text-[44px] font-extrabold leading-[1.1] text-white')} style={delay(0)}>
            {first && <span className="block"><Ltr text={first} /></span>}
            <span className="block" style={{ color: ORANGE }}><Ltr text={second} /></span>
          </h1>
          {page.visuals.length > 0 && (
            <div className={cn(IN, 'flex items-center gap-2')} style={delay(1)}>
              {page.visuals.map((v, i) => <Illustration key={`${v}${i}`} name={v} size={page.visuals.length > 2 ? 64 : 84} />)}
            </div>
          )}
          <Body text={page.subtitle} step={2} />
        </div>
      );
    }
    case 'day':
      return (
        <div className="space-y-6">
          <Title text={page.title} />
          <ol className="relative space-y-4">
            <span className="absolute bottom-6 right-[27px] top-6 w-0.5 bg-white/15" aria-hidden />
            {page.meals.map((m, i) => (
              <li key={m.name} className={cn(IN, 'relative flex items-center gap-3')} style={delay(i + 1)}>
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#1A1A20]">
                  <Illustration name={m.visual ?? 'plate_big'} size={40} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[18px] font-bold leading-snug text-white">{m.name}</p>
                  {mealTimes[m.name] && <p className="text-[14px] tabular-nums text-white/70" dir="ltr" style={{ textAlign: 'right' }}>{mealTimes[m.name]}</p>}
                </div>
                <span
                  className={cn('shrink-0 rounded-full border px-3 py-1 text-[13px] font-bold', m.size === 'גדולה' ? 'text-black' : '')}
                  style={m.size === 'גדולה' ? { background: ORANGE, borderColor: ORANGE } : { borderColor: ORANGE, color: ORANGE }}
                >
                  {m.size}
                </span>
              </li>
            ))}
          </ol>
        </div>
      );
    case 'intro':
      return <p className={cn(IN, 'text-[26px] font-bold leading-[1.4] text-white')}><Rich text={page.text} /></p>;
    case 'chapter':
      return <Title text={page.title} size="text-[44px]" />;
    case 'section':
      return (
        <div className="space-y-5">
          <Title text={page.title} />
          <Rows items={page.items} />
        </div>
      );
    case 'do':
    case 'dont':
      return (
        <div className="space-y-4">
          <Title text={page.title} />
          <Body text={page.text} />
        </div>
      );
    case 'principle':
      return (
        <div className="space-y-5">
          <div className="relative pt-8">
            <span className="pointer-events-none absolute right-0 top-0 select-none text-[96px] font-extrabold leading-none" style={{ color: ORANGE, opacity: 0.25 }} aria-hidden>
              <Ltr text={page.number} />
            </span>
            <span className="sr-only">{page.number}</span>
            <div className="relative"><Title text={page.title} /></div>
          </div>
          {([['העיקרון:', page.principle], ["בתכל'ס:", page.practice]] as const).map(([tag, text], i) => (
            <div key={tag} className={cn(IN, 'space-y-2')} style={delay(i + 1)}>
              <Tag text={tag} />
              <p className="text-[17px] font-semibold leading-[1.5]" style={{ color: SOFT }}><Rich text={text} on="orange" /></p>
            </div>
          ))}
        </div>
      );
    case 'callout':
      return (
        <div className={cn(IN, 'space-y-3 rounded-2xl border p-6')} style={{ borderColor: ORANGE }}>
          {page.title ? (
            <>
              <p className="text-[28px] font-extrabold leading-[1.2] text-white"><Rich text={page.title} /></p>
              <p className="text-[18px] font-semibold leading-[1.5]" style={{ color: SOFT }}><Rich text={page.text} on="orange" /></p>
            </>
          ) : (
            <p className="text-[26px] font-bold leading-[1.35] text-white"><Rich text={page.text} /></p>
          )}
        </div>
      );
    case 'quote': {
      const [lead, tail] = splitQuote(page.text);
      return (
        <p className={cn(IN, 'font-extrabold leading-[1.2] text-white', page.text.length > 110 ? 'text-[28px]' : 'text-[38px]')}>
          {lead && <Ltr text={lead} />}
          <span style={{ color: ORANGE }}><Ltr text={tail} /></span>
        </p>
      );
    }
    case 'cta':
      return (
        <div className={cn(IN, 'pointer-events-auto flex flex-col items-center gap-4')}>
          <Illustration name="scale" size={160} />
          <Button size="lg" className="h-14 w-full max-w-xs rounded-full text-[17px] font-bold" onClick={() => onCta(page.to)}>
            {page.label}
          </Button>
          <button type="button" onClick={onDone} className="h-11 px-4 text-[15px] font-semibold text-white/80 underline underline-offset-4">
            סיימתי לקרוא
          </button>
        </div>
      );
    case 'scenario':
      return (
        <div className="space-y-4">
          <div className={IN}><Tag tone="plain" text={`מצב ${page.index} מתוך ${page.total}`} /></div>
          <Title text={page.title} />
          <div className={IN} style={delay(1)}><Tag text="מה עושים בפועל:" /></div>
          <Rows items={page.items} />
        </div>
      );
    case 'compare':
      return (
        <div className="space-y-6">
          {page.rows.map((r, i) => (
            <div key={i} className={cn(IN, 'space-y-2.5')} style={delay(i)}>
              <h2 className="text-[26px] font-extrabold leading-tight text-white"><Ltr text={r.category} /></h2>
              {/* RTL: first = right = what to choose, and it stands out. */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5 rounded-2xl border p-3" style={{ background: MARK.do.bg, borderColor: MARK.do.color }}>
                  <p className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: MARK.do.color }}>
                    <Check className="h-4 w-4 shrink-0" strokeWidth={3} aria-hidden />
                    בוחרים
                  </p>
                  <p className="text-[17px] font-bold leading-snug text-white"><Ltr text={r.choose} /></p>
                </div>
                <div className="space-y-1.5 rounded-2xl bg-white/5 p-3">
                  <p className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: MARK.dont.color }}>
                    <X className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
                    במקום
                  </p>
                  <p className="text-[15px] font-medium leading-snug text-white/70"><Ltr text={r.instead} /></p>
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    case 'meal':
      return (
        <div className="space-y-4">
          <Title text={page.name} size="text-[40px]" />
          <Rows items={page.rules} />
          {page.examples.length > 0 && (
            <div className="space-y-2">
              <div className={IN} style={delay(2)}><Tag text="למשל:" /></div>
              <ExampleCards items={page.examples} />
            </div>
          )}
          {page.link && <SecondaryAction label={page.link.label} onClick={() => onLink(page.link!.target)} />}
        </div>
      );
    case 'chips':
      return (
        <div className="space-y-5">
          <Title text={page.title} />
          <Chips items={page.items} />
        </div>
      );
    case 'faq':
      return (
        <div className="space-y-3">
          {page.items.map((q, i) => (
            <div key={i} className={cn(IN, 'space-y-2')} style={delay(i)}>
              {q.equation === 'junk' && <div className="pb-3"><JunkEquation /></div>}
              <div className={cn('space-y-2 rounded-2xl bg-white/5 p-4', q.equation && 'bg-transparent p-0')}>
                {!pageVisual(page) && q.visual && <Illustration name={q.visual} size={64} />}
                <h2 className="text-[20px] font-extrabold leading-tight" style={{ color: ORANGE }}><Ltr text={q.question} /></h2>
                <p className="text-[16px] font-medium leading-[1.45] text-white"><Rich text={q.answer} /></p>
                {q.action && <SecondaryAction label={q.action.label} onClick={() => onCta(q.action!.to)} step={0} />}
              </div>
            </div>
          ))}
        </div>
      );
    case 'checklist':
      return (
        <div className="space-y-5">
          <Title text={page.title} />
          <ul className="space-y-2.5">
            {page.items.map((it, i) => (
              <li key={i} className={cn(IN, 'flex items-start gap-3')} style={delay(i + 1)}>
                <Check className="mt-0.5 h-6 w-6 shrink-0" style={{ color: ORANGE }} strokeWidth={3} aria-hidden />
                <span className="text-[17px] font-semibold leading-[1.4] text-white"><Rich text={itemText(it)} /></span>
              </li>
            ))}
          </ul>
        </div>
      );
    case 'link':
      return <SecondaryAction label={page.label} onClick={() => onLink(page.target)} step={0} />;
  }
}

/** Above the illustration: a meal's size, "כן" / "לא". */
function PageHead({ page }: { page: GuidePage }) {
  if (page.kind === 'meal') return <div className={cn(IN, 'mb-2')}><Tag tone={page.size === 'גדולה' ? 'solid' : 'orange'} text={`ארוחה ${page.size}`} /></div>;
  if (page.kind === 'do' || page.kind === 'dont') {
    return <p className={cn(IN, 'mb-1 text-[15px] font-bold')} style={{ color: MARK[page.kind].color }}>{MARK[page.kind].word}</p>;
  }
  return null;
}

/** After the last page: a short "done" moment. */
function Finished({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="flex h-28 w-28 items-center justify-center rounded-full motion-safe:animate-scale-in" style={{ background: ORANGE }}>
        <svg viewBox="0 0 24 24" className="h-14 w-14" fill="none" stroke="#000" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} strokeDasharray={1} className="motion-safe:animate-check-draw" />
        </svg>
      </span>
      <h2 className={cn(IN, 'text-[32px] font-extrabold text-white')} style={delay(3)}>סיימת את המדריך</h2>
      <Button size="lg" className={cn(IN, 'h-14 w-full max-w-xs rounded-full text-[17px] font-bold')} style={delay(4)} onClick={onBack}>
        חזרה לתכנים
      </Button>
    </div>
  );
}

const ILLUSTRATION_SIZES = [180, 150, 120];
const START_AT = 0.25; // the page's content starts about a quarter of the way down
const MAX_EMPTY = 0.35; // and no more than this much of the screen stays empty below it
const BOTTOM_ROOM = 48;
const MAX_ZOOM_UP = 1.3;
const MIN_ZOOM_DOWN = 0.6;

/**
 * A guide as a full-screen story, one idea per page. Tap the left side for the
 * next page and the right side for the previous one (RTL), or swipe. No auto
 * advance: everyone reads at their own pace.
 */
export function GuideStory({ title, pages, avatar, startPage, mealTimes = {}, onPage, onLastPage, onClose, onBack, onCta, onLink }: {
  title: string;
  pages: GuidePage[];
  avatar: string;
  startPage: number;
  /** Meal name → the time in the trainee's calendar, when known. */
  mealTimes?: Record<string, string>;
  /** Every page change (to resume there next time). */
  onPage: (index: number) => void;
  /** The last page was reached: the guide counts as read. */
  onLastPage: () => void;
  onClose: () => void;
  /** "חזרה לתכנים" on the finished screen. */
  onBack: () => void;
  onCta: (to: string) => void;
  onLink: (target: string) => void;
}) {
  const [index, setIndex] = useState(() => Math.min(Math.max(0, startPage), pages.length - 1));
  const [finished, setFinished] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const spacer = useRef<HTMLDivElement>(null);
  const stack = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const last = pages.length - 1;

  // The page's layout: starts about 25% down with its illustration, the
  // illustration shrinking (180 → 120) and then the start moving up as text grows;
  // a short page's text grows so that no more than 35% of the screen stays empty.
  useLayoutEffect(() => {
    const scr = root.current;
    const box = frame.current;
    const gap = spacer.current;
    const col = stack.current;
    const el = content.current;
    if (!scr || !box || !gap || !col || !el) return;
    const fit = () => {
      const screen = scr.clientHeight;
      const top = box.getBoundingClientRect().top - scr.getBoundingClientRect().top;
      const room = box.clientHeight - BOTTOM_ROOM;
      const start = Math.max(0, screen * START_AT - top);
      el.style.zoom = '1';
      const setIll = (px: number) => col.style.setProperty('--ill', `${px}px`);
      let ill = ILLUSTRATION_SIZES[ILLUSTRATION_SIZES.length - 1];
      for (const size of ILLUSTRATION_SIZES) {
        setIll(size);
        ill = size;
        if (col.offsetHeight <= room - start) break;
      }
      let height = col.offsetHeight;
      let scale = 1;
      if (height > room) {
        // Too tall even from the top: the text gets a little smaller.
        const rest = height - el.offsetHeight;
        scale = Math.max(MIN_ZOOM_DOWN, (room - rest) / el.offsetHeight);
        el.style.zoom = String(scale);
        height = col.offsetHeight;
      }
      let offset = Math.max(0, Math.min(start, room - height));
      const emptyBelow = screen - (top + offset + height);
      if (emptyBelow > screen * MAX_EMPTY) {
        // A short page: bigger text fills it, then it sits a little lower.
        const want = emptyBelow - screen * MAX_EMPTY;
        const h = el.offsetHeight;
        if (h > 0) {
          scale = Math.min(MAX_ZOOM_UP, (h + want) / h);
          el.style.zoom = String(scale);
          height = col.offsetHeight;
        }
        offset = Math.min(room - height, Math.max(offset, screen * (1 - MAX_EMPTY) - top - height));
        offset = Math.max(0, offset);
      }
      gap.style.height = `${offset}px`;
      el.dataset.fit = scale.toFixed(2);
      el.dataset.ill = String(ill);
      el.dataset.empty = String(Math.round(((screen - (top + offset + height)) / screen) * 100));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [index, finished]);

  const go = useCallback((to: number) => {
    if (to > last) {
      setFinished(true);
      return;
    }
    if (to < 0) return;
    selectionHaptic();
    setIndex(to);
  }, [last]);
  const next = useCallback(() => go(index + 1), [go, index]);
  const prev = useCallback(() => go(index - 1), [go, index]);

  useEffect(() => {
    onPage(index);
    if (index === last) onLastPage();
  }, [index, last, onPage, onLastPage]);

  // Arrow keys: ← next, → previous (the story reads right to left).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (finished) return;
      if (e.key === 'ArrowLeft') next();
      else if (e.key === 'ArrowRight') prev();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onClose, finished]);

  // The page behind doesn't scroll while the story is open.
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = before;
    };
  }, []);

  const page = pages[index];
  const visual = pageVisual(page);

  return createPortal(
    <div
      ref={root}
      className="fixed inset-0 z-[90] flex select-none flex-col overflow-hidden bg-black text-white"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY, moved: false })}
      onPointerUp={(e) => {
        const s = swipe.current;
        if (!s || finished) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        // A sideways swipe: finger to the right brings in the next page (it waits on the left).
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
          s.moved = true;
          if (dx > 0) next();
          else prev();
        }
      }}
    >
      {!finished && <StoryDecor variant={index} />}

      {/* Segments, then the close button with our photo beside it */}
      <div className="relative z-30 px-3 pt-3">
        <div className="flex gap-1" aria-hidden>
          {pages.map((_, i) => (
            <span key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
              <span className="block h-full rounded-full transition-colors duration-200" style={{ background: finished || i <= index ? ORANGE : 'transparent' }} />
            </span>
          ))}
        </div>
        <div className="mt-1 flex items-center justify-end gap-1">
          {!finished && page.kind !== 'cover' && (
            <img src={avatar} alt="" className="h-10 w-10 rounded-full object-cover" style={{ border: `2px solid ${ORANGE}` }} />
          )}
          <button type="button" onClick={onClose} aria-label="סגירת המדריך" className="flex h-11 w-11 shrink-0 items-center justify-center text-white">
            <X className="h-6 w-6" strokeWidth={2} />
          </button>
        </div>
      </div>

      {finished ? (
        <Finished onBack={onBack} />
      ) : (
        <>
          {/* Tap zones (under the text): left = next, right = previous. */}
          <button
            type="button"
            aria-label="העמוד הבא"
            className="absolute bottom-0 left-0 top-20 z-10 w-1/2 opacity-0"
            onClick={() => !swipe.current?.moved && next()}
          />
          <button
            type="button"
            aria-label="העמוד הקודם"
            className="absolute bottom-0 right-0 top-20 z-10 w-1/2 opacity-0"
            onClick={() => !swipe.current?.moved && prev()}
          />
          <div ref={frame} key={index} className="pointer-events-none relative z-20 min-h-0 flex-1 overflow-hidden px-6">
            <div ref={spacer} />
            <div ref={stack}>
              <PageHead page={page} />
              {visual && (
                <div className={cn(IN, 'mb-3')}>
                  <Illustration name={visual} size="var(--ill, 150px)" />
                </div>
              )}
              <div ref={content}>
                <PageView page={page} avatar={avatar} mealTimes={mealTimes} onCta={onCta} onDone={() => setFinished(true)} onLink={onLink} />
                {index === last && page.kind !== 'cta' && (
                  <Button
                    size="lg"
                    className={cn(IN, 'pointer-events-auto mt-5 h-12 w-full rounded-full text-[16px] font-bold')}
                    style={delay(3)}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                    onClick={() => setFinished(true)}
                  >
                    סיימתי
                  </Button>
                )}
              </div>
            </div>
          </div>
          <p className="sr-only" aria-live="polite">{`עמוד ${index + 1} מתוך ${pages.length}`}</p>
        </>
      )}
    </div>,
    document.body,
  );
}
