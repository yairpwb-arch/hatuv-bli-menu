import { useEffect, useRef, useState } from 'react';
import { readPreviouslyUnlocked, persistUnlocked } from '@/lib/contentUnlockTracking';

export type CardPhase = 'idle' | 'intro' | 'hold' | 'exit';

export interface CelebrationItem {
  id: string;
}

interface CelebrationResult {
  cardPhase: CardPhase;
  cardTargetId: string | null;
  /** what ContentPath's boatStationId prop should be right now */
  boatStationId: string | null;
  isFirstVisit: boolean;
  /** jump straight to the settled end-state (tap-to-skip) */
  skip: () => void;
}

const INTRO_MS = 700;
const HOLD_MS = 1200;
const EXIT_MS = 600;

function readDebugTarget(items: CelebrationItem[]): { from: string | null; to: string } | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('debugUnlock');
  if (!raw) return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  const to = items[n - 1]?.id;
  if (!to) return null;
  // Spec's own example: simulate the user currently sitting at stage 2.
  const from = items[Math.min(1, items.length - 1)]?.id ?? null;
  return { from: from === to ? null : from, to };
}

/**
 * Runs once per mount: if a stage unlocked since the user's last visit (or a
 * ?debugUnlock=N override is present), plays the "stage unlocked" card
 * sequence (intro → hold → exit) holding the boat at the OLD frontier the
 * whole time, then hands control of `boatStationId` to the live current
 * frontier so ContentPath's own sail animation carries the boat there.
 * Completing a stage live (no card involved) just means `currentFrontierId`
 * changes on its own — ContentPath reacts to that the same way either way.
 */
export function useContentCelebration(
  items: CelebrationItem[],
  userId: string | undefined,
  currentFrontierId: string | null
): CelebrationResult {
  const [cardPhase, setCardPhase] = useState<CardPhase>('idle');
  const [cardTargetId, setCardTargetId] = useState<string | null>(null);
  const [heldBoatId, setHeldBoatId] = useState<string | null>(null);
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const timeoutsRef = useRef<number[]>([]);
  const ranRef = useRef(false);

  const clearTimers = () => {
    timeoutsRef.current.forEach((t) => window.clearTimeout(t));
    timeoutsRef.current = [];
  };

  useEffect(() => {
    if (!userId || items.length === 0 || currentFrontierId === null || ranRef.current) return;
    ranRef.current = true;

    const ids = new Set(items.map((i) => i.id));
    const debug = readDebugTarget(items);

    if (debug) {
      setHeldBoatId(debug.from);
      setCardTargetId(debug.to);
      setCardPhase('intro');
      return;
    }

    const prev = readPreviouslyUnlocked(userId);
    if (prev === null) {
      // First-ever visit (or storage unavailable) — no celebration.
      setIsFirstVisit(true);
      persistUnlocked(userId, ids);
      return;
    }

    if (prev.has(currentFrontierId) || !ids.has(currentFrontierId)) {
      // Nothing new since last time (or frontier id vanished, e.g. deleted content).
      persistUnlocked(userId, ids);
      return;
    }

    if (prev.size === 0) {
      // Looks like a reset rather than real progress — don't celebrate.
      persistUnlocked(userId, ids);
      return;
    }

    persistUnlocked(userId, ids);
    // The boat should appear to be coming FROM the last place the user actually
    // saw it — the previous frontier, if it's still a real station.
    const orderedIds = items.map((i) => i.id);
    const lastSeenIndex = Math.max(
      ...[...prev].map((id) => orderedIds.indexOf(id)).filter((i) => i >= 0),
      -1
    );
    const fromId = lastSeenIndex >= 0 ? orderedIds[lastSeenIndex] : null;
    setHeldBoatId(fromId);
    setCardTargetId(currentFrontierId);
    setCardPhase('intro');
  }, [userId, items, currentFrontierId]);

  useEffect(() => {
    if (cardPhase === 'idle') return;
    if (cardPhase === 'intro') {
      timeoutsRef.current.push(window.setTimeout(() => setCardPhase('hold'), INTRO_MS));
    } else if (cardPhase === 'hold') {
      timeoutsRef.current.push(window.setTimeout(() => setCardPhase('exit'), HOLD_MS));
    } else if (cardPhase === 'exit') {
      timeoutsRef.current.push(
        window.setTimeout(() => {
          setCardPhase('idle');
          setHeldBoatId(null);
          setCardTargetId(null);
        }, EXIT_MS)
      );
    }
    return clearTimers;
  }, [cardPhase]);

  const skip = () => {
    clearTimers();
    setCardPhase('idle');
    setHeldBoatId(null);
    setCardTargetId(null);
  };

  return {
    cardPhase,
    cardTargetId,
    boatStationId: cardPhase === 'idle' ? currentFrontierId : heldBoatId ?? currentFrontierId,
    isFirstVisit,
    skip,
  };
}
