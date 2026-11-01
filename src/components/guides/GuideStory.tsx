import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Check, Clock, Dumbbell, Footprints, House, Plane, Salad, Utensils, Wine, X, type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StoryDecor } from '@/components/guides/StoryDecor';
import type { GuideIconKey } from '@/lib/guideBlocks';
import { splitQuote, splitTitle, type GuidePage } from '@/lib/guidePages';
import { selectionHaptic } from '@/lib/native';
import { cn } from '@/lib/utils';

const ORANGE = '#FF8A2A';
const SOFT = '#FFB070';

const ICONS: Record<GuideIconKey, LucideIcon> = {
  check: Check, x: X, plane: Plane, plate: Salad, cutlery: Utensils, glass: Wine,
  walk: Footprints, home: House, clock: Clock, dumbbell: Dumbbell,
};

const MARK = {
  do: { word: 'כן', color: '#5BE38F', bg: '#0F2A1A', Icon: Check },
  dont: { word: 'לא', color: '#FF7A7A', bg: '#2A1414', Icon: X },
};

/**
 * Numbers like "2–3", "80/20" or "80%" kept left-to-right inside the Hebrew,
 * so they don't flip. The text itself is shown exactly as written.
 */
function Rtl({ text }: { text: string }) {
  const parts = text.split(/(\d+(?:[-–/.,:]\d+)*%?)/);
  return <>{parts.map((p, i) => (i % 2 ? <bdi key={i} dir="ltr">{p}</bdi> : <Fragment key={i}>{p}</Fragment>))}</>;
}

/* Each page's text comes in one piece after another: title, then body 80ms later. */
const IN = 'motion-safe:animate-story-in';
const delay = (step: number) => ({ animationDelay: `${step * 80}ms` });

const Title = ({ text, step = 0, size }: { text: string; step?: number; size?: string }) => (
  <h2 className={cn(IN, 'font-extrabold leading-[1.15] text-white', size ?? (text.length > 38 ? 'text-[34px]' : 'text-[40px]'))} style={delay(step)}>
    <Rtl text={text} />
  </h2>
);

const Body = ({ text, step = 1, className }: { text: string; step?: number; className?: string }) => (
  <p className={cn(IN, 'text-[18px] font-semibold leading-[1.5]', className)} style={{ color: SOFT, ...delay(step) }}>
    <Rtl text={text} />
  </p>
);

function Avatar({ src, size }: { src: string; size: 48 | 72 }) {
  return (
    <img
      src={src}
      alt=""
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size, border: `${size === 72 ? 3 : 2}px solid ${ORANGE}` }}
    />
  );
}

function PageView({ page, avatar, onCta, onDone }: { page: GuidePage; avatar: string; onCta: (to: string) => void; onDone: () => void }): ReactNode {
  switch (page.kind) {
    case 'cover': {
      const [first, second] = splitTitle(page.title);
      return (
        <div className="space-y-5">
          <div className={IN}><Avatar src={avatar} size={72} /></div>
          <h1 className={cn(IN, 'text-[44px] font-extrabold leading-[1.1] text-white')} style={delay(0)}>
            {first && <span className="block"><Rtl text={first} /></span>}
            <span className="block" style={{ color: ORANGE }}><Rtl text={second} /></span>
          </h1>
          <Body text={page.subtitle} />
        </div>
      );
    }
    case 'intro':
      return <p className={cn(IN, 'text-[26px] font-bold leading-[1.4] text-white')}><Rtl text={page.text} /></p>;
    case 'chapter': {
      const Icon = ICONS[page.icon] ?? Check;
      const tone = page.icon === 'check' ? MARK.do : page.icon === 'x' ? MARK.dont : { color: ORANGE, bg: '#22160C' };
      return (
        <div className="space-y-5">
          <span className={cn(IN, 'flex h-24 w-24 items-center justify-center rounded-full')} style={{ background: tone.bg, color: tone.color }}>
            <Icon className="h-14 w-14" strokeWidth={2.5} />
          </span>
          <Title text={page.title} size="text-[44px]" />
        </div>
      );
    }
    case 'section': {
      const Icon = ICONS[page.icon] ?? Check;
      return (
        <div className="space-y-6">
          <div className="space-y-4">
            <span className={cn(IN, 'flex h-14 w-14 items-center justify-center rounded-full bg-[#22160C]')} style={{ color: ORANGE }}>
              <Icon className="h-7 w-7" strokeWidth={2} />
            </span>
            <Title text={page.title} />
          </div>
          <ul className="space-y-4">
            {page.items.map((it, i) => (
              <li key={i} className={cn(IN, 'flex gap-3')} style={delay(i + 1)}>
                <span className="mt-[0.6em] h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ORANGE }} aria-hidden />
                <span className="text-[18px] font-semibold leading-[1.5]" style={{ color: SOFT }}><Rtl text={it} /></span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case 'do':
    case 'dont': {
      const m = MARK[page.kind];
      return (
        <div className="space-y-5">
          <div className={cn(IN, 'space-y-2')}>
            <p className="text-[15px] font-bold" style={{ color: m.color }}>{m.word}</p>
            <span className="flex h-24 w-24 items-center justify-center rounded-full" style={{ background: m.bg, color: m.color }}>
              <m.Icon className="h-14 w-14" strokeWidth={2.5} />
            </span>
          </div>
          <Title text={page.title} />
          <Body text={page.text} />
        </div>
      );
    }
    case 'principle':
      return (
        <div className="space-y-6">
          <div className="relative pt-10">
            <span
              className="pointer-events-none absolute right-0 top-0 select-none text-[96px] font-extrabold leading-none"
              style={{ color: ORANGE, opacity: 0.25 }}
              aria-hidden
            >
              <Rtl text={page.number} />
            </span>
            <span className="sr-only">{page.number}</span>
            <div className="relative"><Title text={page.title} /></div>
          </div>
          {([['העיקרון:', page.principle], ["בתכל'ס:", page.practice]] as const).map(([tag, text], i) => (
            <div key={tag} className={cn(IN, 'space-y-2')} style={delay(i + 1)}>
              <span className="inline-block rounded-full bg-[#22160C] px-3 py-1 text-[13px] font-bold" style={{ color: ORANGE }}>{tag}</span>
              <p className="text-[18px] font-semibold leading-[1.5]" style={{ color: SOFT }}><Rtl text={text} /></p>
            </div>
          ))}
        </div>
      );
    case 'callout':
      return (
        <div className={cn(IN, 'space-y-3 rounded-2xl border p-6')} style={{ borderColor: ORANGE }}>
          {page.title ? (
            <>
              <p className="text-[28px] font-extrabold leading-[1.2] text-white"><Rtl text={page.title} /></p>
              <p className="text-[18px] font-semibold leading-[1.5]" style={{ color: SOFT }}><Rtl text={page.text} /></p>
            </>
          ) : (
            <p className="text-[26px] font-bold leading-[1.35] text-white"><Rtl text={page.text} /></p>
          )}
        </div>
      );
    case 'quote': {
      const [lead, tail] = splitQuote(page.text);
      return (
        <p className={cn(IN, 'font-extrabold leading-[1.2] text-white', page.text.length > 110 ? 'text-[30px]' : 'text-[40px]')}>
          {lead && <Rtl text={lead} />}
          <span style={{ color: ORANGE }}><Rtl text={tail} /></span>
        </p>
      );
    }
    case 'cta':
      return (
        <div className={cn(IN, 'pointer-events-auto flex flex-col items-center gap-4')}>
          <Button size="lg" className="h-14 w-full max-w-xs rounded-full text-[17px] font-bold" onClick={() => onCta(page.to)}>
            {page.label}
          </Button>
          <button type="button" onClick={onDone} className="h-11 px-4 text-[15px] font-semibold text-white/80 underline underline-offset-4">
            סיימתי לקרוא
          </button>
        </div>
      );
  }
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

/**
 * A guide as a full-screen story, one idea per page. Tap the left side for the
 * next page and the right side for the previous one (RTL), or swipe. No auto
 * advance: everyone reads at their own pace.
 */
export function GuideStory({ title, pages, avatar, startPage, onPage, onLastPage, onClose, onBack, onCta }: {
  title: string;
  pages: GuidePage[];
  avatar: string;
  startPage: number;
  /** Every page change (to resume there next time). */
  onPage: (index: number) => void;
  /** The last page was reached: the guide counts as read. */
  onLastPage: () => void;
  onClose: () => void;
  /** "חזרה לתכנים" on the finished screen. */
  onBack: () => void;
  onCta: (to: string) => void;
}) {
  const [index, setIndex] = useState(() => Math.min(Math.max(0, startPage), pages.length - 1));
  const [finished, setFinished] = useState(false);
  const swipe = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const last = pages.length - 1;

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

  return createPortal(
    <div
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

      {/* Segments + close */}
      <div className="relative z-30 flex items-center gap-3 px-3 pt-3">
        <div className="flex flex-1 gap-1" aria-hidden>
          {pages.map((_, i) => (
            <span key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
              <span className="block h-full rounded-full transition-colors duration-200" style={{ background: finished || i <= index ? ORANGE : 'transparent' }} />
            </span>
          ))}
        </div>
        <button type="button" onClick={onClose} aria-label="סגירת המדריך" className="flex h-11 w-11 shrink-0 items-center justify-center text-white">
          <X className="h-6 w-6" strokeWidth={2} />
        </button>
      </div>

      {finished ? (
        <Finished onBack={onBack} />
      ) : (
        <>
          {page.kind !== 'cover' && (
            <div className="relative z-20 px-6 pt-2">
              <Avatar src={avatar} size={48} />
            </div>
          )}
          {/* Tap zones (under the text): left = next, right = previous. */}
          <button
            type="button"
            aria-label="העמוד הבא"
            className="absolute bottom-0 left-0 top-16 z-10 w-1/2 opacity-0"
            onClick={() => !swipe.current?.moved && next()}
          />
          <button
            type="button"
            aria-label="העמוד הקודם"
            className="absolute bottom-0 right-0 top-16 z-10 w-1/2 opacity-0"
            onClick={() => !swipe.current?.moved && prev()}
          />
          <div key={index} className="pointer-events-none relative z-20 flex flex-1 flex-col justify-center px-6 pb-16">
            <PageView page={page} avatar={avatar} onCta={onCta} onDone={() => setFinished(true)} />
          </div>
          <p className="sr-only" aria-live="polite">{`עמוד ${index + 1} מתוך ${pages.length}`}</p>
        </>
      )}
    </div>,
    document.body,
  );
}
