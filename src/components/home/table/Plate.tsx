import { useId } from 'react';
import type { Habit } from '@/hooks/useHabits';
import { cn } from '@/lib/utils';
import { useLongPress } from './useLongPress';

const C = 50;
const RIM_OUT = 48;
const RIM_IN = 37;
const FOOD = 34;

/** Point on a circle, angle 0 = top, clockwise. */
function pt(r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return `${(C + r * Math.cos(a)).toFixed(2)} ${(C + r * Math.sin(a)).toFixed(2)}`;
}
function sector(r: number, from: number, to: number) {
  return `M${C} ${C} L${pt(r, from)} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${pt(r, to)} Z`;
}
const RING = `M${C} ${C - RIM_OUT} a${RIM_OUT} ${RIM_OUT} 0 1 1 0 ${RIM_OUT * 2} a${RIM_OUT} ${RIM_OUT} 0 1 1 0 ${-RIM_OUT * 2} Z M${C} ${C - RIM_IN} a${RIM_IN} ${RIM_IN} 0 1 0 0 ${RIM_IN * 2} a${RIM_IN} ${RIM_IN} 0 1 0 0 ${-RIM_IN * 2} Z`;

// Thirds: protein top-right, carbs top-left, vegetables at the bottom.
const PROTEIN = sector(FOOD, 0, 120);
const VEG = sector(FOOD, 120, 240);
const CARBS = sector(FOOD, 240, 360);

/** Full colour when done; the same food in grey at 35% when not — it always reads as a plate of food. */
const TINTS = {
  protein: { done: ['#D9A066', '#A8743F'], idle: ['#8A8A90', '#6A6A70'] },
  carbs: { done: ['#F2EEE4', '#D8D2C4'], idle: ['#B4B4B8', '#8E8E94'] },
  veg: { done: ['#2F8F4E', '#5BE38F', '#E5484D'], idle: ['#6E6E74', '#9C9CA2', '#85858B'] },
} as const;

const fade = (done: boolean) => ({
  opacity: done ? 1 : 0.35,
  transition: 'opacity 300ms ease-out, fill 300ms ease-out, stroke 300ms ease-out',
});

interface RegionProps {
  habit: Habit;
  label: string;
  onTap: (h: Habit) => void;
  onExplain: (h: Habit) => void;
  children: React.ReactNode;
}

/** One tappable part of the plate. */
function Region({ habit, label, onTap, onExplain, children }: RegionProps) {
  const press = useLongPress(() => onTap(habit), () => onExplain(habit));
  return (
    <g
      role="button"
      tabIndex={0}
      aria-pressed={habit.completed}
      aria-label={`${label}${habit.completed ? ', בוצע היום' : ''}. לחיצה ארוכה להסבר`}
      className="cursor-pointer outline-none"
      {...press}
    >
      {children}
    </g>
  );
}

interface PlateProps {
  /** "שליש חלבון/פחמימה/ירק" */
  thirds?: Habit;
  /** "ירקות בכל ארוחה" — takes over the vegetable third when active. */
  veggies?: Habit;
  /** "חלבון בכל ארוחה" — takes over the protein third when active. */
  protein?: Habit;
  /** "צלחת אחת בכל ארוחה" — the rim. */
  rim?: Habit;
  onTap: (h: Habit) => void;
  onExplain: (h: Habit) => void;
  className?: string;
}

/** The plate: rim + three food thirds, each part driven by its own habit. */
export function Plate({ thirds, veggies, protein, rim, onTap, onExplain, className }: PlateProps) {
  const id = useId().replace(/:/g, '');
  const vegHabit = veggies ?? thirds;
  const proteinHabit = protein ?? thirds;
  const proteinDone = !!proteinHabit?.completed;
  const carbsDone = !!thirds?.completed;
  const vegDone = !!vegHabit?.completed;
  const p = TINTS.protein[proteinDone ? 'done' : 'idle'];
  const c = TINTS.carbs[carbsDone ? 'done' : 'idle'];
  const v = TINTS.veg[vegDone ? 'done' : 'idle'];

  return (
    <svg viewBox="0 0 100 100" className={cn('h-auto w-full overflow-visible', className)}>
      <defs>
        <clipPath id={`${id}-p`}><path d={PROTEIN} /></clipPath>
        <clipPath id={`${id}-c`}><path d={CARBS} /></clipPath>
        <clipPath id={`${id}-v`}><path d={VEG} /></clipPath>
      </defs>

      {/* Plate body — always there */}
      <circle cx={C} cy={C} r={RIM_OUT} fill="#24242A" stroke="#34343C" strokeWidth="1" />
      <circle cx={C} cy={C} r={RIM_IN} fill="#2A2A31" stroke="#34343C" strokeWidth="0.8" />

      {rim && (
        <Region habit={rim} label={rim.name} onTap={onTap} onExplain={onExplain}>
          {/* Transparent ring keeps the whole rim tappable */}
          <path d={RING} fill="transparent" fillRule="evenodd" />
          <circle
            cx={C} cy={C} r={(RIM_OUT + RIM_IN) / 2} fill="none"
            stroke={rim.completed ? '#FF8A2A' : '#8E8E96'}
            strokeWidth={RIM_OUT - RIM_IN - 3}
            style={fade(rim.completed)}
            pointerEvents="none"
          />
        </Region>
      )}

      {proteinHabit && (
        <Region habit={proteinHabit} label={protein ? protein.name : `${proteinHabit.name}: חלבון`} onTap={onTap} onExplain={onExplain}>
          <g style={fade(proteinDone)}>
            <path d={PROTEIN} fill={p[0]} stroke="#141418" strokeWidth="1.2" style={fade(true)} />
            <g clipPath={`url(#${id}-p)`} stroke={p[1]} strokeWidth="2.2" strokeLinecap="round" style={fade(true)}>
              <path d="M56 26 L74 34" /><path d="M54 34 L76 44" /><path d="M54 42 L74 52" />
            </g>
          </g>
        </Region>
      )}

      {thirds && (
        <Region habit={thirds} label={`${thirds.name}: פחמימה`} onTap={onTap} onExplain={onExplain}>
          <g style={fade(carbsDone)}>
            <path d={CARBS} fill={c[0]} stroke="#141418" strokeWidth="1.2" style={fade(true)} />
            <g clipPath={`url(#${id}-c)`} fill={c[1]} style={fade(true)}>
              {[[30, 34], [38, 28], [34, 42], [24, 44], [42, 38], [28, 26], [44, 46]].map(([x, y]) => (
                <ellipse key={`${x}-${y}`} cx={x} cy={y} rx="2.4" ry="1.2" transform={`rotate(${x * 7} ${x} ${y})`} />
              ))}
            </g>
          </g>
        </Region>
      )}

      {vegHabit && (
        <Region habit={vegHabit} label={veggies ? veggies.name : `${vegHabit.name}: ירקות`} onTap={onTap} onExplain={onExplain}>
          <g style={fade(vegDone)}>
            <path d={VEG} fill={v[0]} stroke="#141418" strokeWidth="1.2" style={fade(true)} />
            <g clipPath={`url(#${id}-v)`}>
              {[[40, 66], [52, 72], [60, 62], [46, 58], [56, 78]].map(([x, y]) => (
                <circle key={`${x}-${y}`} cx={x} cy={y} r="4.5" fill={v[1]} style={fade(true)} />
              ))}
              {[[44, 74], [62, 70]].map(([x, y]) => (
                <circle key={`t${x}`} cx={x} cy={y} r="3.4" fill={v[2]} style={fade(true)} />
              ))}
            </g>
          </g>
        </Region>
      )}
    </svg>
  );
}
