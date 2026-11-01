import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { addDays, format } from 'date-fns';
import { Check, ChevronDown, Lock, Play } from 'lucide-react';
import { getNodeVisual } from '@/lib/contentPathStyle';
import { ContentItem, PartGroup, kindOf, metaLine, stateOf } from '@/lib/contentModel';
import { cn } from '@/lib/utils';
import { PartBanner } from './PartBanner';
import type { ContentMapHandle } from './ContentMap';

type Filter = 'all' | 'todo' | 'done';
const CHIPS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'הכל' },
  { value: 'todo', label: 'לצפייה' },
  { value: 'done', label: 'הושלמו' },
];

const passes = (f: Filter, item: ContentItem) => {
  switch (f) {
    case 'todo':
      return item.isUnlocked && !item.isCompleted;
    case 'done':
      return item.isCompleted;
    default:
      return true;
  }
};

const WEEKDAY_LETTER = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

/** A real opening date: "נפתח ביום ג׳ 10/11" (or after the current stage, when the day is here). */
function opensOn(item: ContentItem): string {
  if (item.daysUntilUnlock <= 0) return 'נפתח אחרי השלב הנוכחי';
  const d = addDays(new Date(), item.daysUntilUnlock);
  return `נפתח ביום ${WEEKDAY_LETTER[d.getDay()]} ${format(d, 'd/M')}`;
}

const doneCount = (n: number) => (n === 1 ? 'תוכן אחד הושלם' : `${n} תכנים הושלמו`);

interface Props {
  parts: PartGroup[];
  currentId: string | null;
  soonId: string | null;
  initialFilter?: Filter;
  currentDay: number;
  onSelect: (item: ContentItem) => void;
  onOpen: (item: ContentItem) => void;
}

/**
 * The list view, read as a journey: a thin timeline on the right joins every
 * icon (orange up to the current stage, grey after). Finished items fold into
 * one line per part, the current item is a hero card, locked ones show the
 * real date they open. Same handle as the map, so the page jumps alike.
 */
const ContentCards = forwardRef<ContentMapHandle, Props>(function ContentCards(
  { parts, currentId, soonId, initialFilter = 'all', onSelect, onOpen },
  ref,
) {
  const [filter, setFilter] = useState<Filter>(initialFilter);
  useEffect(() => setFilter(initialFilter), [initialFilter]);
  const currentPart = parts.find((p) => p.items.some((i) => i.id === currentId))?.number ?? parts.find((p) => !p.locked)?.number;
  const [openParts, setOpenParts] = useState<Set<number>>(() => new Set(currentPart != null ? [currentPart] : []));
  const [openDone, setOpenDone] = useState<Set<number>>(new Set());
  const [spotId, setSpotId] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const sections = useRef(new Map<number, HTMLElement>());

  // Everything up to the current stage is "travelled" (orange on the timeline).
  const order = parts.flatMap((p) => p.items.map((i) => i.id));
  const reach = order.indexOf(currentId ?? soonId ?? '');
  const travelled = (id: string) => reach >= 0 && order.indexOf(id) <= reach;

  useImperativeHandle(ref, () => ({
    nodeY: (id) => {
      const el = rows.current.get(id);
      return el ? el.getBoundingClientRect().top + window.scrollY + el.offsetHeight / 2 : null;
    },
    partY: (n) => {
      const el = sections.current.get(n);
      return el ? el.getBoundingClientRect().top + window.scrollY : null;
    },
    nodeEl: (id) => rows.current.get(id) ?? null,
    spotlight: (id) => {
      setSpotId(id);
      window.setTimeout(() => setSpotId((cur) => (cur === id ? null : cur)), 1300);
    },
  }));

  const toggleIn = (set: (f: (s: Set<number>) => Set<number>) => void) => (n: number) =>
    set((s) => {
      const next = new Set(s);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  const togglePart = toggleIn(setOpenParts);
  const toggleDone = toggleIn(setOpenDone);
  const rowRef = (id: string) => (el: HTMLElement | null) => (el ? rows.current.set(id, el) : rows.current.delete(id));

  const filtering = filter !== 'all';

  /** The timeline column: icon on a thin vertical line. */
  const Rail = ({ id, children, first, last }: { id: string; children: React.ReactNode; first?: boolean; last?: boolean }) => {
    const on = travelled(id);
    return (
      <div className="relative flex w-10 shrink-0 justify-center self-stretch">
        {!first && <span aria-hidden className={cn('absolute top-0 h-1/2 w-0.5', on ? 'bg-primary' : 'bg-[#2A2A31]')} />}
        {!last && <span aria-hidden className={cn('absolute bottom-0 h-1/2 w-0.5', on && order.indexOf(id) < reach ? 'bg-primary' : 'bg-[#2A2A31]')} />}
        <span className="relative flex items-center">{children}</span>
      </div>
    );
  };

  const renderItem = (item: ContentItem, i: number, list: ContentItem[]) => {
    const state = stateOf(item, currentId, soonId);
    const { Icon } = getNodeVisual(kindOf(item));
    const first = i === 0;
    const last = i === list.length - 1;
    const spot = spotId === item.id && 'animate-spot-ping-box';

    if (state === 'current') {
      return (
        <li key={item.id} ref={rowRef(item.id)} className="flex gap-2">
          <Rail id={item.id} first={first} last={last}>
            <span className="flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-primary bg-[#22160C] text-primary">
              <Icon className="h-5 w-5" strokeWidth={2} />
            </span>
          </Rail>
          <div className={cn('my-1.5 min-w-0 flex-1 space-y-3 rounded-card border border-primary bg-[#22160C] p-4', spot)}>
            <button type="button" onClick={() => onSelect(item)} className="block w-full text-right">
              <span className="block text-label font-semibold text-primary-soft">{metaLine(item)}</span>
              <span className="mt-0.5 block text-[18px] font-bold leading-snug text-foreground">{item.title}</span>
            </button>
            <button
              type="button"
              onClick={() => onOpen(item)}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-button bg-primary text-body font-bold text-primary-foreground"
            >
              <Play className="h-5 w-5" strokeWidth={2} fill="currentColor" aria-hidden />
              צפה עכשיו
            </button>
          </div>
        </li>
      );
    }

    if (state === 'done') {
      return (
        <li key={item.id} ref={rowRef(item.id)} className="flex min-h-[56px] gap-2">
          <Rail id={item.id} first={first} last={last}>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white">
              <Check className="h-4 w-4" strokeWidth={3} />
            </span>
          </Rail>
          <button type="button" onClick={() => onSelect(item)} className={cn('min-w-0 flex-1 py-2 text-right', spot)}>
            <span className="block truncate text-[11px] text-muted-foreground">{metaLine(item)}</span>
            <span className="block truncate text-body text-muted-foreground">{item.title}</span>
          </button>
        </li>
      );
    }

    const locked = state === 'soon' || state === 'locked';
    return (
      <li key={item.id} ref={rowRef(item.id)} className="flex min-h-[64px] gap-2">
        <Rail id={item.id} first={first} last={last}>
          <span className={cn('flex h-9 w-9 items-center justify-center rounded-full', locked ? 'bg-[#1F1F25] text-[#6E6E76]' : 'border-2 border-primary text-primary')}>
            {locked ? <Lock className="h-4 w-4" strokeWidth={2} /> : <Icon className="h-4 w-4" strokeWidth={2} />}
          </span>
        </Rail>
        <button
          type="button"
          disabled={locked}
          onClick={() => onSelect(item)}
          className={cn('min-w-0 flex-1 py-2 text-right', spot)}
        >
          {/* Locked: no title yet — only when it opens. */}
          {locked ? (
            <span className="block text-body text-[#6E6E76]">{opensOn(item)}</span>
          ) : (
            <>
              <span className="block truncate text-[11px] text-muted-foreground">{metaLine(item)}</span>
              <span className="block text-body leading-snug line-clamp-2 text-foreground">{item.title}</span>
            </>
          )}
        </button>
        {!locked && (
          <button
            type="button"
            onClick={() => onOpen(item)}
            aria-label={`צפייה ב${item.title}`}
            className="my-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            <Play className="h-4 w-4" strokeWidth={2} fill="currentColor" />
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-card-gap px-4 pt-3">
      <div role="radiogroup" aria-label="סינון" className="flex gap-2">
          {CHIPS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'relative h-9 shrink-0 rounded-pill px-4 text-label font-semibold transition-colors after:absolute after:inset-x-0 after:-inset-y-1 after:content-[""]',
                filter === f.value ? 'bg-primary text-primary-foreground' : 'bg-card-inner text-muted-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

      {parts.map((part) => {
        const items = part.items.filter((i) => passes(filter, i));
        if (filtering && items.length === 0) return null;
        const open = filtering || openParts.has(part.number);
        // Finished items fold into one line (unless the filter is about them).
        const fold = !filtering || filter === 'todo';
        const finished = fold ? items.filter((i) => i.isCompleted) : [];
        const showDone = openDone.has(part.number);
        const rest = fold ? items.filter((i) => !i.isCompleted) : items;
        return (
          <section key={part.number} ref={(el) => (el ? sections.current.set(part.number, el) : sections.current.delete(part.number))} data-part={part.number} className="space-y-1">
            <PartBanner part={part} collapsible={!filtering} open={open} onToggle={() => togglePart(part.number)} />
            {open && (
              <>
                {finished.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleDone(part.number)}
                      aria-expanded={showDone}
                      className="flex min-h-[48px] w-full items-center gap-2 px-1 text-label font-semibold text-muted-foreground"
                    >
                      <span className="flex w-10 justify-center">
                        <Check className="h-4 w-4 text-primary" strokeWidth={3} aria-hidden />
                      </span>
                      <span className="flex-1 text-right">{doneCount(finished.length)}</span>
                      <ChevronDown className={cn('h-4 w-4 transition-transform', showDone && 'rotate-180')} strokeWidth={2} aria-hidden />
                    </button>
                    {showDone && <ul>{finished.map((it, i, l) => renderItem(it, i, l))}</ul>}
                  </>
                )}
                {rest.length > 0 && <ul>{rest.map((it, i, l) => renderItem(it, i, l))}</ul>}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
});

export default ContentCards;
export type { Filter as CardsFilter };
