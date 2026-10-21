import { Play, FileText, Lightbulb, Trophy, type LucideIcon } from 'lucide-react';

export type ContentKind = 'video' | 'content' | 'guide';

export interface NodeVisual {
  Icon: LucideIcon;
  fillClass: string;
  ringClass: string;
}

const PART_THEME: Record<number, Pick<NodeVisual, 'fillClass' | 'ringClass'>> = {
  1: { fillClass: 'gradient-primary', ringClass: 'border-primary/40' },
  2: { fillClass: 'gradient-success', ringClass: 'border-success/40' },
  3: { fillClass: 'bg-gradient-to-br from-warning to-destructive', ringClass: 'border-warning/40' },
};

export function getNodeVisual(contentType: ContentKind, partNumber: number): NodeVisual {
  const theme = PART_THEME[partNumber] ?? PART_THEME[1];
  const Icon = contentType === 'video' ? Play : contentType === 'guide' ? FileText : Lightbulb;
  return { Icon, ...theme };
}

export function getMilestoneVisual(): NodeVisual {
  return {
    Icon: Trophy,
    fillClass: 'gradient-gold',
    ringClass: 'border-yellow-500/50',
  };
}

export const MILESTONE_ID = '__milestone_168__';
export const MILESTONE_DAY = 168;

// ── River background tiles ──────────────────────────────────────────────────
// Source art is 1536×2752 (one tile design — river-1 only was supplied).
export const RIVER_TILE_ASPECT = 2752 / 1536; // height / width
export const RIVER_TILE_SRC_1X = '/river-1@1x.webp';
export const RIVER_TILE_SRC_2X = '/river-1.webp';

// ── Sine center-line ─────────────────────────────────────────────────────────
// x(y) = width/2 + AMPLITUDE_FRACTION*width * sin(y * 2π / period), period = one
// tile's rendered height, so the line is periodic with the art and always stays
// inside the painted water regardless of how many tiles are stacked.
export const SINE_AMPLITUDE_FRACTION = 0.16; // fraction of container width

// ── Stations ─────────────────────────────────────────────────────────────────
export const STATION_SPACING_PX = 150;
export const BANK_OFFSET_PX = 64; // how far a station sits off the river center, onto the bank
export const LABEL_HEIGHT_PX = 56; // "חלק X" wooden signpost slot
export const MILESTONE_GAP_PX = 170;
export const TOP_PADDING_PX = 40; // breathing room between the sticky header and the first label

// ── Boat ─────────────────────────────────────────────────────────────────────
export const BOAT_WIDTH_FRACTION = 0.13; // of container width
export const BOAT_SAIL_DURATION_MS = 1500;
