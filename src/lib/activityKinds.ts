import {
  Activity, Bike, CircleDot, Dumbbell, Flame, Flower2, Footprints, Goal, Home, Mountain, Music, PersonStanding, Swords,
  Users, Volleyball, Waves, Zap, type LucideIcon,
} from 'lucide-react';

/** activities.kind — English keys in the database, Hebrew names here. */
export type ActivityKind =
  | 'strength_gym' | 'strength_home' | 'walk' | 'run' | 'cycling' | 'spinning' | 'swim' | 'football' | 'basketball'
  | 'racket' | 'martial_arts' | 'yoga_pilates' | 'hiit' | 'studio_class' | 'hike' | 'dance' | 'other';

export interface KindInfo {
  kind: ActivityKind;
  label: string;
  Icon: LucideIcon;
  /** Distance is asked for (km; meters for swimming). */
  distance?: 'km' | 'm';
  strength?: boolean;
}

export const ACTIVITY_KINDS: KindInfo[] = [
  { kind: 'strength_gym', label: 'כוח בחדר כושר', Icon: Dumbbell, strength: true },
  { kind: 'strength_home', label: 'כוח בבית', Icon: Home, strength: true },
  { kind: 'walk', label: 'הליכה', Icon: Footprints, distance: 'km' },
  { kind: 'run', label: 'ריצה', Icon: PersonStanding, distance: 'km' },
  { kind: 'cycling', label: 'אופניים', Icon: Bike, distance: 'km' },
  { kind: 'spinning', label: 'ספינינג', Icon: Activity },
  { kind: 'swim', label: 'שחייה', Icon: Waves, distance: 'm' },
  { kind: 'football', label: 'כדורגל', Icon: Goal },
  { kind: 'basketball', label: 'כדורסל', Icon: CircleDot },
  { kind: 'racket', label: 'טניס / פאדל', Icon: Volleyball },
  { kind: 'martial_arts', label: 'לחימה / אגרוף', Icon: Swords },
  { kind: 'yoga_pilates', label: 'יוגה / פילאטיס', Icon: Flower2 },
  { kind: 'hiit', label: 'HIIT / פונקציונלי', Icon: Flame },
  { kind: 'studio_class', label: 'שיעור בסטודיו', Icon: Users },
  { kind: 'hike', label: 'טיול רגלי', Icon: Mountain, distance: 'km' },
  { kind: 'dance', label: 'ריקוד', Icon: Music },
  { kind: 'other', label: 'אחר', Icon: Zap },
];

export const kindInfo = (k: string): KindInfo => ACTIVITY_KINDS.find((x) => x.kind === k) ?? ACTIVITY_KINDS[ACTIVITY_KINDS.length - 1];

/** How an activity counts in the existing walk/workout tallies (streak, week strip). */
export const tallyType = (k: string): 'walk' | 'workout' => (k === 'walk' || k === 'hike' ? 'walk' : 'workout');

export const INTENSITY: { value: 'easy' | 'medium' | 'hard'; label: string }[] = [
  { value: 'easy', label: 'קל' },
  { value: 'medium', label: 'בינוני' },
  { value: 'hard', label: 'קשה' },
];
