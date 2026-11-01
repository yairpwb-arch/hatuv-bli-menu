/**
 * The guide pages' backdrop: brown-orange hexagons (filled and outlined) in
 * two corners and a small grey dot grid on one side. Three layouts take turns
 * page by page, so the pages don't all look the same.
 */
const FILL = '#7A4A12';
const LINE = '#5A5A62';

/** A pointy-top hexagon around (cx, cy). */
function hex(cx: number, cy: number, r: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90);
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

type Hex = { x: number; y: number; r: number; filled: boolean };

/** One corner cluster, drawn in a 160×160 box. */
function Cluster({ hexes, className }: { hexes: Hex[]; className: string }) {
  return (
    <svg viewBox="0 0 160 160" className={`absolute h-40 w-40 ${className}`} aria-hidden>
      {hexes.map((h, i) =>
        h.filled ? (
          <polygon key={i} points={hex(h.x, h.y, h.r)} fill={FILL} fillOpacity={0.7} />
        ) : (
          <polygon key={i} points={hex(h.x, h.y, h.r)} fill="none" stroke={LINE} strokeWidth={2} />
        ),
      )}
    </svg>
  );
}

function Dots({ className }: { className: string }) {
  const dots = [];
  for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) dots.push(<circle key={`${r}-${c}`} cx={6 + c * 14} cy={6 + r * 14} r={2} fill={LINE} />);
  return (
    <svg viewBox="0 0 54 82" className={`absolute h-[82px] w-[54px] ${className}`} aria-hidden>
      {dots}
    </svg>
  );
}

const A: Hex[] = [{ x: 40, y: 40, r: 34, filled: true }, { x: 98, y: 22, r: 20, filled: false }, { x: 84, y: 88, r: 16, filled: true }];
const B: Hex[] = [{ x: 120, y: 120, r: 32, filled: true }, { x: 60, y: 136, r: 18, filled: false }, { x: 132, y: 58, r: 15, filled: false }];
const C: Hex[] = [{ x: 50, y: 110, r: 28, filled: false }, { x: 104, y: 120, r: 22, filled: true }, { x: 70, y: 50, r: 14, filled: true }];

export function StoryDecor({ variant }: { variant: number }) {
  switch (variant % 3) {
    case 0:
      return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <Cluster hexes={A} className="-left-6 -top-4" />
          <Cluster hexes={B} className="-bottom-6 -right-6" />
          <Dots className="left-4 top-[76px]" />
        </div>
      );
    case 1:
      return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <Cluster hexes={C} className="-right-8 -top-10" />
          <Cluster hexes={A} className="-bottom-8 -left-4" />
          <Dots className="left-[38%] top-[84px]" />
        </div>
      );
    default:
      return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <Cluster hexes={B} className="-left-10 -top-12" />
          <Cluster hexes={C} className="-bottom-4 -right-4" />
          <Dots className="left-[18%] top-[70px]" />
        </div>
      );
  }
}
