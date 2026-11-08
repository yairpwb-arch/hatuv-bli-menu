import { useEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Card } from '@/components/ds';
import type { Habit } from '@/hooks/useHabits';
import { CUTLERY, PLATE, TABLE_H, TABLE_SLOTS, TableKey, hitAreaAt, isTableKey, placeAt, shortLabel } from '@/lib/habitVisuals';
import { selectionHaptic, successHaptic, tapHaptic } from '@/lib/native';
import { cn } from '@/lib/utils';
import { AppleFruit } from './table/AppleFruit';
import { Fork, Knife } from './table/Cutlery';
import { OliveOil } from './table/OliveOil';
import { Plate } from './table/Plate';
import { SauceBowl } from './table/SauceBowl';
import { SmallGlass } from './table/SmallGlass';
import { STATE_TRANSITION, TableObjectProps, objectState } from './table/shared';
import { useLongPress } from './table/useLongPress';
import { WaterGlasses } from './table/WaterGlasses';

type SlotKey = keyof typeof TABLE_SLOTS;

const OBJECTS: Record<SlotKey, (p: TableObjectProps) => JSX.Element> = {
  water_before_meal: WaterGlasses,
  one_sauce: SauceBowl,
  olive_oil: OliveOil,
  fruit_snack: AppleFruit,
  water_before_snack: SmallGlass,
};

/** Tag order under the table follows the table, roughly top to bottom. */
const ORDER: TableKey[] = [
  'water_before_meal', 'one_sauce', 'one_plate', 'plate_thirds', 'plate_protein', 'plate_veggies',
  'fruit_snack', 'water_before_snack', 'olive_oil',
];

/** One object placed on the table, centred on its slot. */
function TableItem({ habit, slot, appear, onTap, onExplain }: { habit: Habit; slot: SlotKey; appear: boolean; onTap: (h: Habit) => void; onExplain: (h: Habit) => void }) {
  const press = useLongPress(() => onTap(habit), () => onExplain(habit));
  const { cx, cy, w, ratio } = TABLE_SLOTS[slot];
  const Obj = OBJECTS[slot];
  // The drawing keeps its exact size; a separate, invisible button gives a 44px+ tap area.
  return (
    <>
    <div aria-hidden className={cn('pointer-events-none absolute -translate-x-1/2 -translate-y-1/2', STATE_TRANSITION, objectState(habit.completed))} style={placeAt(cx, cy, w)}>
      <div className={cn(appear && 'motion-safe:animate-node-reveal')}>
        <Obj done={habit.completed} />
      </div>
    </div>
    <button
      type="button"
      aria-pressed={habit.completed}
      aria-label={`${habit.name}${habit.completed ? ', בוצע היום' : ''}. לחיצה ארוכה להסבר`}
      style={hitAreaAt(cx, cy, w, ratio)}
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-inner select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      {...press}
    />
    </>
  );
}

/** Fork/knife width: their drawings are 24×124, scaled to the cutlery length. */
const CUTLERY_W = (CUTLERY.length * 24) / 124;

/** A short-named tag; tap ticks it, long press shows the full name and why. */
function HabitTag({ habit, onTap, onExplain }: { habit: Habit; onTap: (h: Habit) => void; onExplain: (h: Habit) => void }) {
  const press = useLongPress(() => onTap(habit), () => onExplain(habit));
  return (
    <button
      type="button"
      aria-pressed={habit.completed}
      aria-label={`${habit.name}${habit.completed ? ', בוצע היום' : ''}`}
      // 30px pill, 44px hit area via an invisible extension
      className="relative flex select-none items-center after:absolute after:inset-x-0 after:-inset-y-[7px] after:content-['']"
      {...press}
    >
      <span
        className={cn(
          'inline-flex h-[30px] items-center whitespace-nowrap rounded-pill px-[10px] text-[13px] font-semibold leading-none transition-colors',
          habit.completed ? 'bg-primary text-primary-foreground' : 'bg-card-inner text-muted-foreground',
        )}
      >
        {shortLabel(habit)}
      </span>
    </button>
  );
}

interface HabitTableProps {
  /** Today's habits that sit on the table. */
  habits: Habit[];
  onToggle: (habit: Habit) => Promise<void>;
  /** Fired once when the last habit of the day gets ticked. */
  onPerfectDay: () => void;
  /** When the first habit opens, for the empty table ("מחר", "בעוד 3 ימים"). */
  firstOpens?: string | null;
}

export function HabitTable({ habits, onToggle, onPerfectDay, firstOpens }: HabitTableProps) {
  const [explain, setExplain] = useState<Habit | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  const byKey = new Map<TableKey, Habit>();
  for (const h of habits) if (isTableKey(h.visual_key) && !byKey.has(h.visual_key)) byKey.set(h.visual_key, h);

  const done = habits.filter((h) => h.completed).length;
  const allDone = habits.length > 0 && done === habits.length;

  // Celebrate on the transition to all-done, not on every render while done.
  const wasAllDone = useRef(allDone);
  useEffect(() => {
    if (!allDone) setCelebrate(false);
    if (allDone && !wasAllDone.current) {
      successHaptic();
      setCelebrate(true);
      onPerfectDay();
      const t = window.setTimeout(() => setCelebrate(false), 2200);
      wasAllDone.current = allDone;
      return () => window.clearTimeout(t);
    }
    wasAllDone.current = allDone;
  }, [allDone, onPerfectDay]);

  const tap = (h: Habit) => {
    if (h.completed) selectionHaptic();
    else tapHaptic();
    setExplain(null);
    onToggle(h);
  };

  // No habits yet: the table is still set — an empty plate, fork and knife.
  const empty = habits.length === 0;

  // A habit's object pops onto the table the first time it shows up (once per device).
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const idsKey = habits.map((h) => h.id).sort().join(',');
  useEffect(() => {
    if (!idsKey) return;
    const KEY = 'tableSeenHabits';
    let seen: string[] | null = null;
    try {
      seen = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    } catch {
      seen = null;
    }
    const ids = idsKey.split(',');
    // First visit ever: nothing to announce, just remember what's there.
    if (seen) setFresh(new Set(ids.filter((id) => !seen!.includes(id))));
    try {
      localStorage.setItem(KEY, JSON.stringify(Array.from(new Set([...(seen ?? []), ...ids]))));
    } catch {
      /* storage unavailable: no animation, nothing else lost */
    }
  }, [idsKey]);

  const keyed = (h: Habit) => (isTableKey(h.visual_key) ? ORDER.indexOf(h.visual_key) : ORDER.length);
  const tags = [...habits].sort((a, b) => keyed(a) - keyed(b));

  return (
    <Card className="space-y-2.5 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-card-title">השולחן של היום</h3>
        {!empty && <span className={cn('text-label font-semibold tabular-nums', allDone ? 'text-success' : 'text-muted-foreground')}>
          {done} מתוך {habits.length}
        </span>}
      </div>

      {/* The table, seen from above */}
      <div
        className={cn('relative mx-auto w-[80%] rounded-inner bg-[hsl(var(--table))] transition-shadow duration-500', celebrate && 'shadow-[0_0_0_3px_hsl(var(--primary))]')}
        style={{ aspectRatio: String(1 / TABLE_H) }}
      >
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={placeAt(PLATE.cx, PLATE.cy, PLATE.d)}
        >
          <Plate
            thirds={byKey.get('plate_thirds')}
            veggies={byKey.get('plate_veggies')}
            protein={byKey.get('plate_protein')}
            rim={byKey.get('one_plate')}
            onTap={tap}
            onExplain={setExplain}
          />
        </div>

        {/* Fork left, knife right, ~10px off the rim: decoration, not a habit */}
        {([
          { key: 'fork', Part: Fork, cx: PLATE.cx - PLATE.d / 2 - CUTLERY.gap - CUTLERY_W / 2 },
          { key: 'knife', Part: Knife, cx: PLATE.cx + PLATE.d / 2 + CUTLERY.gap + CUTLERY_W / 2 },
        ] as const).map(({ key, Part, cx }) => (
          <div key={key} aria-hidden className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={placeAt(cx, PLATE.cy, CUTLERY_W)}>
            <Part />
          </div>
        ))}

        {(Object.keys(TABLE_SLOTS) as SlotKey[]).map((slot) => {
          const h = byKey.get(slot);
          return h ? <TableItem key={h.id} habit={h} slot={slot} appear={fresh.has(h.id)} onTap={tap} onExplain={setExplain} /> : null;
        })}

        {celebrate && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" role="status">
            <span className="flex items-center gap-2 rounded-pill bg-primary px-5 py-3 text-card-title text-primary-foreground animate-bounce-in">
              <Sparkles className="h-5 w-5" strokeWidth={2} />
              יום מושלם
            </span>
          </div>
        )}
      </div>

      {empty && (
        <p className="px-2 text-center text-body text-muted-foreground">
          ההרגלים שלך יופיעו כאן אחד אחד.
          {firstOpens ? ` הראשון נפתח ${firstOpens}.` : ''}
        </p>
      )}

      {/* Habit tags: 30px pills inside 44px tap rows, centred */}
      {!empty && <ul className="flex flex-wrap justify-center gap-2" aria-label="ההרגלים של היום">
        {tags.map((h) => (
          <li key={h.id}>
            <HabitTag habit={h} onTap={tap} onExplain={setExplain} />
          </li>
        ))}
      </ul>}

      {empty ? null : explain ? (
        <div role="dialog" aria-label={explain.name} className="flex items-start gap-3 rounded-inner bg-primary-tint p-3 animate-scale-in">
          <p className="flex-1 text-body">
            <span className="font-bold text-primary-soft">{explain.name}</span>
            {explain.explanation ? ` – ${explain.explanation}` : ''}
          </p>
          <button type="button" onClick={() => setExplain(null)} aria-label="סגירה" className="-m-2 inline-flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      ) : (
        <p className="text-center text-[12px] text-muted-foreground">לחיצה מסמנת · לחיצה ארוכה מסבירה למה</p>
      )}

    </Card>
  );
}
