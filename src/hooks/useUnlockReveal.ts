import { useEffect, useState } from 'react';
import { Preferences } from '@capacitor/preferences';

interface Seen {
  unlocked: string[];
  parts: number[];
}

const key = (userId: string) => `contentSeen:${userId}`;

/**
 * What opened since the last visit, so each unlock animation (the lock
 * opening, the road filling up to it) and each finished-part trophy plays
 * exactly once. Stored with Capacitor Preferences per user. The first visit
 * ever just records the current state — nothing to celebrate yet.
 */
export function useUnlockReveal(userId: string | undefined, unlockedIds: string[], completedParts: number[], ready: boolean) {
  const [revealIds, setRevealIds] = useState<Set<string>>(new Set());
  const [trophyParts, setTrophyParts] = useState<Set<number>>(new Set());
  const signature = `${unlockedIds.join(',')}|${completedParts.join(',')}`;

  useEffect(() => {
    if (!userId || !ready) return;
    let cancelled = false;
    (async () => {
      let seen: Seen | null = null;
      try {
        const { value } = await Preferences.get({ key: key(userId) });
        seen = value ? (JSON.parse(value) as Seen) : null;
      } catch {
        seen = null;
      }
      const now: Seen = { unlocked: unlockedIds, parts: completedParts };
      if (seen && !cancelled) {
        const prevUnlocked = new Set(seen.unlocked);
        const prevParts = new Set(seen.parts);
        setRevealIds(new Set(unlockedIds.filter((id) => !prevUnlocked.has(id))));
        setTrophyParts(new Set(completedParts.filter((p) => !prevParts.has(p))));
      }
      Preferences.set({ key: key(userId), value: JSON.stringify(now) }).catch(() => undefined);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, ready, signature]);

  return { revealIds, trophyParts };
}
