import { Play, FileText, Lightbulb, Trophy, type LucideIcon } from 'lucide-react';

export type ContentKind = 'video' | 'content' | 'guide';

export interface NodeVisual {
  Icon: LucideIcon;
}

export function getNodeVisual(contentType: ContentKind): NodeVisual {
  const Icon = contentType === 'video' ? Play : contentType === 'guide' ? FileText : Lightbulb;
  return { Icon };
}

export function getMilestoneVisual(): NodeVisual {
  return { Icon: Trophy };
}

export const MILESTONE_ID = '__milestone_168__';
export const MILESTONE_DAY = 168;

// ── Track background tiles ───────────────────────────────────────────────────
// Source art is 1536×2752 and designed to self-connect: the track enters dead
// center-top and exits dead center-bottom, so tiles stack with no flip and no
// horizontal shift between them.
export const TRACK_TILE_SRC_1X = '/track-tile@1x.webp';
export const TRACK_TILE_SRC_2X = '/track-tile.webp';

// ── Layout ───────────────────────────────────────────────────────────────────
// Every "slot" (a station, a part-divider label, or the final milestone) takes
// one evenly-arc-length-spaced position along the track, 5 slots per tile —
// matching "5 stations per tile" from the brief, just generalized to any slot
// kind so labels land ON the track too instead of in fixed pixel gaps.
export const SLOTS_PER_TILE = 5;
export const TILE_SAMPLE_STEPS = 400; // fine sampling of one tile for arc-length accuracy

// ── Marker (replaces the boat) ───────────────────────────────────────────────
export const MARKER_DIAMETER_PX = 18;
export const MARKER_COLOR = '#F5B041';
// The dot itself (and its trailing wake) is white, not orange, so it stays
// clearly visible against the orange glow line and orange track art.
export const MARKER_DOT_COLOR = '#FFFFFF';

// ── Palette (dark track theme) ──────────────────────────────────────────────
export const TRACK_COLORS = {
  accent: '#F5B041',
  lockedBg: '#1C1C22',
  lockedBorder: '#3A3A45',
  labelBg: 'rgba(20,20,26,0.9)',
  labelBorder: '#2A2A33',
  weekBadgeBg: 'rgba(245,176,65,0.15)',
} as const;
