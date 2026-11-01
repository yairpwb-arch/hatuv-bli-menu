import { useId } from 'react';

/*
 * A clear glass in perspective (elliptic rim and base), drawn in a 60×80 box:
 * light reflection on the side, a soft shadow on the table, and — when done —
 * blue water with a rounded surface that rises in 300ms.
 */

const RIM_Y = 12;
const BASE_Y = 66;
const RIM_RX = 22;
const BASE_RX = 17;
const WATER_Y = 28;

/** Half-width of the glass at height y (straight taper rim → base). */
const halfWidth = (y: number) => RIM_RX - ((RIM_RX - BASE_RX) * (y - RIM_Y)) / (BASE_Y - RIM_Y);

const BODY = `M${30 - RIM_RX} ${RIM_Y} L${30 - BASE_RX} ${BASE_Y} A${BASE_RX} 4 0 0 0 ${30 + BASE_RX} ${BASE_Y} L${30 + RIM_RX} ${RIM_Y} A${RIM_RX} 5 0 0 0 ${30 - RIM_RX} ${RIM_Y} Z`;

export function Glass3D({ x = 0, full }: { x?: number; full: boolean }) {
  const id = useId().replace(/:/g, '');
  const ww = halfWidth(WATER_Y);
  return (
    <g transform={`translate(${x} 0)`}>
      <defs>
        <clipPath id={`${id}-in`}>
          <path d={BODY} />
        </clipPath>
        <filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
      </defs>

      {/* Soft shadow on the table */}
      <ellipse cx="33" cy={BASE_Y + 6} rx="21" ry="5" fill="#000" opacity="0.45" filter={`url(#${id}-blur)`} />

      {/* Glass body */}
      <path d={BODY} fill="#FFFFFF" fillOpacity="0.07" />

      {full && (
        <g clipPath={`url(#${id}-in)`}>
          <g className="animate-water-rise" style={{ transformBox: 'fill-box', transformOrigin: 'bottom' }}>
            <rect x="0" y={WATER_Y} width="60" height={BASE_Y + 6 - WATER_Y} fill="#3D9BE0" fillOpacity="0.85" />
            {/* Rounded water surface */}
            <ellipse cx="30" cy={WATER_Y} rx={ww} ry="4.2" fill="#7CC6F4" />
            <ellipse cx="30" cy={WATER_Y - 0.6} rx={ww - 6} ry="2" fill="#B9E2FA" fillOpacity="0.6" />
          </g>
        </g>
      )}

      {/* Base, a little thicker */}
      <ellipse cx="30" cy={BASE_Y - 1} rx={BASE_RX - 1} ry="3.2" fill="#FFFFFF" fillOpacity="0.1" />

      {/* Outline */}
      <path d={BODY} fill="none" stroke="#D5E2EE" strokeOpacity="0.55" strokeWidth="1.3" strokeLinejoin="round" />
      {/* Front of the rim */}
      <path d={`M${30 - RIM_RX} ${RIM_Y} A${RIM_RX} 5 0 0 0 ${30 + RIM_RX} ${RIM_Y}`} fill="none" stroke="#FFFFFF" strokeOpacity="0.75" strokeWidth="1.4" />

      {/* Light reflection on the side */}
      <path d={`M${30 - RIM_RX + 5} ${RIM_Y + 6} L${30 - BASE_RX + 4} ${BASE_Y - 8}`} stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="2.6" strokeLinecap="round" />
      <path d={`M${30 + RIM_RX - 6} ${RIM_Y + 9} L${30 + RIM_RX - 7} ${RIM_Y + 18}`} stroke="#FFFFFF" strokeOpacity="0.3" strokeWidth="1.6" strokeLinecap="round" />
    </g>
  );
}
