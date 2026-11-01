import type { CSSProperties, ReactNode } from 'react';

/**
 * The app's flat illustrations, in the home plate's style: solid colours, a
 * soft shadow, no black outlines. Each is drawn on a 100×100 box.
 */
const Shadow = ({ rx = 30, cy = 91 }: { rx?: number; cy?: number }) => <ellipse cx="50" cy={cy} rx={rx} ry="5" fill="#FFFFFF" opacity="0.1" />;

const glass = (x: number, w: number, level = 0.62) => {
  const top = 22;
  const bottom = 86;
  const inset = w * 0.1;
  const water = bottom - (bottom - top) * level;
  return (
    <g key={x}>
      <path d={`M${x} ${top}h${w}l-${inset} ${bottom - top}h-${w - inset * 2}z`} fill="#3A4A5E" />
      <path d={`M${x + inset * (water - top) / (bottom - top)} ${water}h${w - (2 * inset * (water - top)) / (bottom - top)}L${x + w - inset} ${bottom}h-${w - inset * 2}z`} fill="#56B7F0" />
      <path d={`M${x + 4} ${top + 5}l2 ${bottom - top - 14}`} stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </g>
  );
};

const plate = (r: number, food: ReactNode) => (
  <>
    <circle cx="50" cy="50" r={r} fill="#E9E6DE" />
    <circle cx="50" cy="50" r={r * 0.76} fill="#F7F5EF" />
    {food}
  </>
);

const DRAWINGS = {
  plate_big: () => (
    <>
      <Shadow rx={38} cy={93} />
      {plate(42, (
        <>
          <path d="M50 50 L50 19 A31 31 0 0 1 77 66 Z" fill="#D9A066" />
          <path d="M50 50 L77 66 A31 31 0 0 1 23 66 Z" fill="#3FA65F" />
          <path d="M50 50 L23 66 A31 31 0 0 1 50 19 Z" fill="#F0E2BF" />
          <circle cx="44" cy="68" r="4" fill="#E5484D" />
          <circle cx="58" cy="70" r="3.4" fill="#5BE38F" />
        </>
      ))}
    </>
  ),
  plate_small: () => (
    <>
      <Shadow rx={26} cy={84} />
      {plate(30, (
        <>
          <circle cx="44" cy="46" r="8" fill="#D9A066" />
          <circle cx="58" cy="52" r="7" fill="#3FA65F" />
          <circle cx="46" cy="60" r="4" fill="#F0E2BF" />
        </>
      ))}
    </>
  ),
  bowl: () => (
    <>
      <Shadow rx={30} />
      <ellipse cx="50" cy="44" rx="36" ry="10" fill="#FFE9C9" />
      <circle cx="38" cy="42" r="6" fill="#E5484D" />
      <circle cx="52" cy="40" r="6" fill="#F2B84B" />
      <circle cx="64" cy="43" r="5" fill="#5BE38F" />
      <path d="M14 46h72c0 22-14 40-36 40S14 68 14 46z" fill="#FF8A2A" />
      <path d="M22 54c3 12 10 21 20 26" stroke="#FFFFFF" strokeOpacity="0.3" strokeWidth="4" strokeLinecap="round" fill="none" />
    </>
  ),
  water_glass: () => (
    <>
      <Shadow rx={22} />
      {glass(30, 40)}
    </>
  ),
  water_glass_x2: () => (
    <>
      <Shadow rx={38} />
      {glass(10, 36)}
      {glass(54, 36)}
    </>
  ),
  water_bottle: () => (
    <>
      <Shadow rx={20} cy={94} />
      <rect x="40" y="6" width="20" height="10" rx="3" fill="#FF8A2A" />
      <path d="M38 16h24l6 14v52a8 8 0 0 1-8 8H40a8 8 0 0 1-8-8V30z" fill="#3A4A5E" />
      <path d="M32 44h36v38a8 8 0 0 1-8 8H40a8 8 0 0 1-8-8z" fill="#56B7F0" />
      <rect x="38" y="30" width="5" height="50" rx="2.5" fill="#FFFFFF" opacity="0.28" />
    </>
  ),
  chocolate: () => (
    <>
      <Shadow rx={30} />
      <rect x="20" y="10" width="60" height="78" rx="6" fill="#7A4A25" />
      {[0, 1, 2].map((r) => [0, 1].map((c) => (
        <rect key={`${r}${c}`} x={25 + c * 26} y={15 + r * 24} width="24" height="21" rx="3" fill="#945C31" />
      )))}
      <path d="M20 58h60v24a6 6 0 0 1-6 6H26a6 6 0 0 1-6-6z" fill="#FF8A2A" />
      <rect x="20" y="58" width="60" height="6" fill="#FFB070" />
    </>
  ),
  cookie: () => (
    <>
      <Shadow rx={32} />
      <circle cx="50" cy="48" r="38" fill="#D49A5B" />
      <circle cx="50" cy="48" r="38" fill="none" stroke="#E6B57C" strokeWidth="3" />
      {[[36, 34, 6], [58, 28, 5], [68, 50, 6], [46, 54, 7], [30, 60, 5], [58, 70, 6]].map(([x, y, r]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r={r} fill="#5C3419" />
      ))}
    </>
  ),
  burger: () => (
    <>
      <Shadow rx={36} />
      <path d="M12 42c0-20 17-30 38-30s38 10 38 30z" fill="#E8A24E" />
      {[[30, 24], [48, 20], [64, 27], [42, 32]].map(([x, y]) => <ellipse key={`${x}`} cx={x} cy={y} rx="3" ry="1.8" fill="#FFE9C9" />)}
      <path d="M8 48c6-6 12 5 20 0s12 5 20 0 14 5 22 0 14 5 22 0v6H8z" fill="#5BE38F" />
      <rect x="11" y="54" width="78" height="10" rx="5" fill="#E5484D" />
      <rect x="9" y="62" width="82" height="9" rx="4.5" fill="#7A4A25" />
      <path d="M12 72h76c0 10-6 16-14 16H26c-8 0-14-6-14-16z" fill="#D9913F" />
    </>
  ),
  fruit: () => (
    <>
      <Shadow rx={30} />
      <path d="M50 26c-12-8-34-5-34 22 0 22 15 41 26 41 4 0 5-2 8-2s4 2 8 2c11 0 26-19 26-41 0-27-22-30-34-22z" fill="#E5484D" />
      <path d="M26 42c-2 10 1 22 6 30" stroke="#FFFFFF" strokeOpacity="0.3" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M50 26c0-8 2-13 6-18" stroke="#7A4A25" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M54 18c8-8 18-6 22-3-5 7-14 9-22 3z" fill="#5BE38F" />
    </>
  ),
  veggies: () => (
    <>
      <Shadow rx={34} />
      <path d="M36 62l-6 26h20l-4-26z" fill="#BDE6A8" />
      <circle cx="28" cy="40" r="15" fill="#2F8F4E" />
      <circle cx="48" cy="30" r="17" fill="#3FA65F" />
      <circle cx="56" cy="50" r="14" fill="#2F8F4E" />
      <circle cx="38" cy="54" r="14" fill="#3FA65F" />
      <path d="M86 44L66 88c-2 4-8 2-7-3l9-40z" fill="#FF8A2A" />
      <path d="M72 44c0-8 3-14 6-18 3 4 4 8 4 12 3-3 7-4 10-3-2 6-6 10-12 11z" fill="#5BE38F" />
    </>
  ),
  chicken: () => (
    <>
      <Shadow rx={34} />
      <path d="M62 14c16 0 28 12 28 28 0 18-16 28-34 26L34 66c-8-2-12-10-8-18 6-14 18-34 36-34z" fill="#D9913F" />
      <path d="M70 26c6 3 9 9 8 15" stroke="#FFE9C9" strokeOpacity="0.55" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M36 60L18 78" stroke="#F2E6D0" strokeWidth="9" strokeLinecap="round" />
      <circle cx="13" cy="76" r="6" fill="#F2E6D0" />
      <circle cx="20" cy="84" r="6" fill="#F2E6D0" />
    </>
  ),
  rice: () => (
    <>
      <Shadow rx={32} />
      <path d="M18 46c0-20 14-32 32-32s32 12 32 32z" fill="#F7F5EF" />
      {[[34, 30, 20], [48, 22, -30], [62, 32, 50], [42, 38, 80], [56, 40, 10], [30, 42, -20], [70, 42, 30]].map(([x, y, a]) => (
        <ellipse key={`${x}${y}`} cx={x} cy={y} rx="4" ry="1.8" fill="#DDD6C2" transform={`rotate(${a} ${x} ${y})`} />
      ))}
      <path d="M12 46h76c0 22-15 40-38 40S12 68 12 46z" fill="#56B7F0" />
      <path d="M20 54c3 12 10 21 20 26" stroke="#FFFFFF" strokeOpacity="0.3" strokeWidth="4" strokeLinecap="round" fill="none" />
    </>
  ),
  cheese: () => (
    <>
      <Shadow rx={36} />
      <path d="M8 56L66 18c14 4 24 16 26 38z" fill="#FFD76A" />
      <path d="M8 56h84v28H8z" fill="#F2B84B" />
      <circle cx="30" cy="70" r="6" fill="#D9963A" />
      <circle cx="60" cy="74" r="4.5" fill="#D9963A" />
      <circle cx="78" cy="66" r="5" fill="#D9963A" />
      <ellipse cx="62" cy="42" rx="6" ry="4" fill="#F2B84B" />
    </>
  ),
  egg: () => (
    <>
      <Shadow rx={36} />
      <path d="M50 12c18-4 28 8 34 22 6 16 8 30-6 40-14 12-36 14-52 4C12 70 8 52 18 38c8-12 16-24 32-26z" fill="#F7F5EF" />
      <circle cx="50" cy="48" r="18" fill="#F2B84B" />
      <circle cx="44" cy="42" r="5" fill="#FFE9A8" />
    </>
  ),
  scale: () => (
    <>
      <Shadow rx={38} />
      <rect x="10" y="20" width="80" height="70" rx="16" fill="#E9E6DE" />
      <path d="M26 46a24 24 0 0 1 48 0z" fill="#2A2A31" />
      <path d="M50 46L60 28" stroke="#FF8A2A" strokeWidth="4" strokeLinecap="round" />
      <circle cx="50" cy="46" r="4" fill="#FF8A2A" />
      <rect x="24" y="58" width="22" height="24" rx="8" fill="#CFCBC0" />
      <rect x="54" y="58" width="22" height="24" rx="8" fill="#CFCBC0" />
    </>
  ),
  clock: () => (
    <>
      <Shadow rx={32} />
      <circle cx="50" cy="48" r="40" fill="#FF8A2A" />
      <circle cx="50" cy="48" r="31" fill="#F7F5EF" />
      <path d="M50 28v21l14 9" stroke="#2A2A31" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  calendar: () => (
    <>
      <Shadow rx={36} />
      <rect x="12" y="16" width="76" height="72" rx="10" fill="#F7F5EF" />
      <path d="M12 26a10 10 0 0 1 10-10h56a10 10 0 0 1 10 10v12H12z" fill="#FF8A2A" />
      <rect x="28" y="8" width="8" height="18" rx="4" fill="#7A4A12" />
      <rect x="64" y="8" width="8" height="18" rx="4" fill="#7A4A12" />
      {[0, 1, 2].map((r) => [0, 1, 2].map((c) => (
        <rect key={`${r}${c}`} x={23 + c * 20} y={45 + r * 13} width="14" height="9" rx="2.5" fill={r === 1 && c === 1 ? '#FF8A2A' : '#D5D1C6'} />
      )))}
    </>
  ),
  phone: () => (
    <>
      <Shadow rx={24} cy={95} />
      <rect x="26" y="4" width="48" height="88" rx="10" fill="#3A3A44" />
      <rect x="31" y="12" width="38" height="70" rx="4" fill="#56B7F0" />
      <rect x="37" y="22" width="26" height="9" rx="4.5" fill="#FFFFFF" />
      <rect x="37" y="36" width="20" height="9" rx="4.5" fill="#5BE38F" />
      <rect x="37" y="50" width="26" height="9" rx="4.5" fill="#FFFFFF" />
      <circle cx="50" cy="87" r="2.5" fill="#6A6A74" />
    </>
  ),
  tv_couch: () => (
    <>
      <Shadow rx={40} cy={93} />
      <rect x="20" y="4" width="60" height="38" rx="5" fill="#3A3A44" />
      <rect x="25" y="9" width="50" height="28" rx="2" fill="#56B7F0" />
      <path d="M45 16l14 7-14 7z" fill="#FFFFFF" />
      <rect x="44" y="42" width="12" height="5" fill="#3A3A44" />
      <rect x="16" y="54" width="68" height="26" rx="9" fill="#C76A1E" />
      <rect x="6" y="60" width="18" height="24" rx="7" fill="#FF8A2A" />
      <rect x="76" y="60" width="18" height="24" rx="7" fill="#FF8A2A" />
      <rect x="20" y="70" width="60" height="16" rx="5" fill="#FF8A2A" />
    </>
  ),
  fridge: () => (
    <>
      <Shadow rx={30} cy={95} />
      <rect x="22" y="4" width="56" height="88" rx="9" fill="#E9E6DE" />
      <rect x="22" y="36" width="56" height="3" fill="#BDB9AE" />
      <rect x="31" y="14" width="5" height="14" rx="2.5" fill="#8E8E96" />
      <rect x="31" y="46" width="5" height="22" rx="2.5" fill="#8E8E96" />
      <circle cx="60" cy="58" r="6" fill="#E5484D" />
      <rect x="50" y="68" width="18" height="6" rx="3" fill="#FF8A2A" />
    </>
  ),
  plane: () => (
    <>
      <Shadow rx={34} />
      <path d="M92 14c-4-4-12-2-18 4L58 34 20 22l-8 8 30 20-16 16-12-2-6 6 18 10 10 18 6-6-2-12 16-16 20 30 8-8-12-38 16-16c6-6 8-14 4-18z" fill="#F7F5EF" transform="translate(4 -4) scale(.92)" />
      <path d="M52 40l22-22c5-5 10-6 13-5l-44 47z" fill="#56B7F0" transform="translate(4 -4) scale(.92)" />
    </>
  ),
  suitcase: () => (
    <>
      <Shadow rx={32} cy={94} />
      <path d="M38 24v-10a4 4 0 0 1 4-4h16a4 4 0 0 1 4 4v10" fill="none" stroke="#7A4A12" strokeWidth="6" />
      <rect x="18" y="24" width="64" height="64" rx="10" fill="#FF8A2A" />
      <rect x="32" y="24" width="7" height="64" fill="#FFB070" />
      <rect x="61" y="24" width="7" height="64" fill="#FFB070" />
    </>
  ),
  grill: () => (
    <>
      <Shadow rx={32} cy={95} />
      <path d="M30 30c-4-6 4-10 0-18M50 28c-4-7 4-11 0-20M70 30c-4-6 4-10 0-18" stroke="#8E8E96" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M12 38h76c0 20-16 34-38 34S12 58 12 38z" fill="#3A3A44" />
      <rect x="8" y="34" width="84" height="7" rx="3.5" fill="#6A6A74" />
      <ellipse cx="32" cy="30" rx="12" ry="5" fill="#A8562B" />
      <ellipse cx="66" cy="30" rx="12" ry="5" fill="#C76A1E" />
      <path d="M34 72L26 92M66 72l8 20" stroke="#6A6A74" strokeWidth="6" strokeLinecap="round" />
    </>
  ),
  beer: () => (
    <>
      <Shadow rx={28} cy={94} />
      <path d="M68 38h10a8 8 0 0 1 8 8v18a8 8 0 0 1-8 8H68" fill="none" stroke="#E9E6DE" strokeWidth="7" />
      <rect x="20" y="24" width="50" height="66" rx="7" fill="#F2B84B" />
      <path d="M16 24c0-10 10-14 16-10 4-8 18-8 22-1 6-3 20 0 18 11 0 7-8 8-12 4-4 6-12 6-16 1-5 5-14 4-16-1-3 3-12 3-12-4z" fill="#F7F5EF" />
      <rect x="30" y="42" width="5" height="38" rx="2.5" fill="#FFE29A" />
      <rect x="50" y="42" width="5" height="38" rx="2.5" fill="#FFE29A" />
    </>
  ),
  wine: () => (
    <>
      <Shadow rx={22} cy={94} />
      <path d="M26 8h48c2 24-4 44-24 44S24 32 26 8z" fill="#3A3A44" />
      <path d="M27 24h46c-1 16-8 28-23 28S28 40 27 24z" fill="#B3263D" />
      <rect x="47" y="50" width="6" height="34" fill="#BDB9AE" />
      <rect x="32" y="84" width="36" height="6" rx="3" fill="#BDB9AE" />
    </>
  ),
  coffee: () => (
    <>
      <Shadow rx={34} cy={93} />
      <path d="M38 20c-4-6 4-8 0-16M56 20c-4-6 4-8 0-16" stroke="#8E8E96" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M74 38h6a10 10 0 0 1 0 22h-8" fill="none" stroke="#F7F5EF" strokeWidth="7" />
      <path d="M16 28h60v36a18 18 0 0 1-18 18H34a18 18 0 0 1-18-18z" fill="#F7F5EF" />
      <ellipse cx="46" cy="30" rx="30" ry="6" fill="#7A4A25" />
      <ellipse cx="46" cy="87" rx="38" ry="4" fill="#BDB9AE" />
    </>
  ),
  dumbbell: () => (
    <>
      <Shadow rx={38} cy={80} />
      <rect x="30" y="42" width="40" height="12" rx="4" fill="#BDB9AE" />
      <rect x="6" y="28" width="12" height="40" rx="4" fill="#C76A1E" />
      <rect x="18" y="20" width="14" height="56" rx="5" fill="#FF8A2A" />
      <rect x="82" y="28" width="12" height="40" rx="4" fill="#C76A1E" />
      <rect x="68" y="20" width="14" height="56" rx="5" fill="#FF8A2A" />
    </>
  ),
  running_shoe: () => (
    <>
      <Shadow rx={42} cy={84} />
      <path d="M8 44c8 2 16 0 22-10 4-6 12-4 14 2l6 10c8 10 22 12 34 14 8 2 10 8 10 14H8z" fill="#FF8A2A" />
      <path d="M8 74h86v3a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6z" fill="#F7F5EF" />
      <path d="M40 40l-8 6M46 48l-8 6M52 54l-8 6" stroke="#F7F5EF" strokeWidth="4" strokeLinecap="round" />
      <path d="M62 60c10 2 22 2 32 12" stroke="#FFB070" strokeWidth="5" strokeLinecap="round" fill="none" />
    </>
  ),
  moon: () => (
    <>
      <Shadow rx={28} />
      <path d="M62 8a40 40 0 1 0 30 58A34 34 0 0 1 62 8z" fill="#F2D27C" />
      <circle cx="40" cy="46" r="5" fill="#DDB95E" />
      <circle cx="50" cy="68" r="4" fill="#DDB95E" />
      <circle cx="78" cy="22" r="3" fill="#F7F5EF" />
      <circle cx="88" cy="40" r="2" fill="#F7F5EF" />
    </>
  ),
  bed: () => (
    <>
      <Shadow rx={42} cy={90} />
      <rect x="8" y="22" width="9" height="62" rx="4" fill="#A8562B" />
      <rect x="83" y="44" width="9" height="40" rx="4" fill="#A8562B" />
      <rect x="14" y="54" width="72" height="22" fill="#56B7F0" />
      <rect x="18" y="42" width="26" height="14" rx="6" fill="#F7F5EF" />
      <path d="M42 46h44v30H42z" fill="#3B82C4" />
    </>
  ),
  thermometer: () => (
    <>
      <Shadow rx={22} cy={94} />
      <rect x="39" y="6" width="22" height="64" rx="11" fill="#E9E6DE" />
      <circle cx="50" cy="72" r="19" fill="#E9E6DE" />
      <rect x="45" y="26" width="10" height="46" fill="#E5484D" />
      <circle cx="50" cy="72" r="13" fill="#E5484D" />
      <path d="M62 18h8M62 30h8M62 42h8" stroke="#8E8E96" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  shopping_cart: () => (
    <>
      <Shadow rx={38} cy={94} />
      <path d="M6 14h12l4 12" stroke="#BDB9AE" strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M20 26h70l-8 38H30z" fill="#FF8A2A" />
      <path d="M36 26v38M54 26v38M72 26v38M24 44h62" stroke="#FFB070" strokeWidth="2.5" />
      <path d="M30 64l-3 10h56" stroke="#BDB9AE" strokeWidth="6" strokeLinecap="round" fill="none" />
      <circle cx="36" cy="86" r="6.5" fill="#6A6A74" />
      <circle cx="74" cy="86" r="6.5" fill="#6A6A74" />
    </>
  ),
  brain: () => (
    <>
      <Shadow rx={34} />
      <path d="M48 12c-10-4-20 2-20 10-10 0-16 10-12 18-8 6-6 20 4 24 0 12 14 20 28 12z" fill="#F29BB2" />
      <path d="M52 12c10-4 20 2 20 10 10 0 16 10 12 18 8 6 6 20-4 24 0 12-14 20-28 12z" fill="#EE86A3" />
      <path d="M30 30c6 2 8 8 6 14M24 54c6 0 10 4 12 8M70 30c-6 2-8 8-6 14M76 54c-6 0-10 4-12 8" stroke="#C95F7E" strokeWidth="3.5" strokeLinecap="round" fill="none" />
    </>
  ),
  heart: () => (
    <>
      <Shadow rx={30} />
      <path d="M50 86C20 66 8 50 8 32 8 18 19 10 30 10c9 0 16 5 20 13 4-8 11-13 20-13 11 0 22 8 22 22 0 18-12 34-42 54z" fill="#FF8A2A" />
      <path d="M22 26c-3 3-4 8-3 13" stroke="#FFFFFF" strokeOpacity="0.45" strokeWidth="5" strokeLinecap="round" fill="none" />
    </>
  ),
  check_big: () => (
    <>
      <Shadow rx={32} />
      <circle cx="50" cy="48" r="40" fill="#163D27" />
      <path d="M30 49l14 15 27-30" stroke="#5BE38F" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  x_big: () => (
    <>
      <Shadow rx={32} />
      <circle cx="50" cy="48" r="40" fill="#3D1A1A" />
      <path d="M34 32l32 32M66 32L34 64" stroke="#FF7A7A" strokeWidth="10" strokeLinecap="round" fill="none" />
    </>
  ),
  lightbulb: () => (
    <>
      <Shadow rx={24} cy={95} />
      <path d="M50 6a30 30 0 0 0-17 54c4 3 5 7 5 11h24c0-4 1-8 5-11A30 30 0 0 0 50 6z" fill="#F2D27C" />
      <path d="M34 24c-4 5-5 11-4 16" stroke="#FFFFFF" strokeOpacity="0.5" strokeWidth="5" strokeLinecap="round" fill="none" />
      <rect x="38" y="72" width="24" height="7" rx="2" fill="#BDB9AE" />
      <rect x="40" y="80" width="20" height="7" rx="3" fill="#8E8E96" />
    </>
  ),
  trophy: () => (
    <>
      <Shadow rx={28} cy={95} />
      <path d="M24 16H10c0 18 6 28 18 30M76 16h14c0 18-6 28-18 30" fill="none" stroke="#DDB95E" strokeWidth="7" />
      <path d="M24 8h52v26c0 16-10 28-26 28S24 50 24 34z" fill="#F2B84B" />
      <path d="M34 16v18c0 6 2 11 5 15" stroke="#FFE29A" strokeWidth="5" strokeLinecap="round" fill="none" />
      <rect x="44" y="60" width="12" height="16" fill="#DDB95E" />
      <rect x="28" y="76" width="44" height="13" rx="4" fill="#7A4A12" />
    </>
  ),
  drop: () => (
    <>
      <Shadow rx={22} />
      <path d="M50 6c14 20 30 36 30 54a30 30 0 0 1-60 0C20 42 36 26 50 6z" fill="#56B7F0" />
      <path d="M34 60c0 9 6 16 14 18" stroke="#FFFFFF" strokeOpacity="0.5" strokeWidth="5" strokeLinecap="round" fill="none" />
    </>
  ),
} as const;

export type IllustrationName = keyof typeof DRAWINGS;

export const isIllustration = (name: unknown): name is IllustrationName => typeof name === 'string' && name in DRAWINGS;

/** One illustration. `size` is in px, or any CSS length. */
export function Illustration({ name, size = 120, className, style }: { name: string; size?: number | string; className?: string; style?: CSSProperties }) {
  if (!isIllustration(name)) return null;
  const Draw = DRAWINGS[name];
  return (
    <svg viewBox="0 0 100 100" className={className} style={{ width: size, height: size, ...style }} aria-hidden>
      <Draw />
    </svg>
  );
}
