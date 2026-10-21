const KEY_PREFIX = 'contentPathUnlocked:';

export function readPreviouslyUnlocked(userId: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + userId);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : null;
  } catch {
    return null;
  }
}

export function persistUnlocked(userId: string, ids: Set<string>) {
  try {
    localStorage.setItem(KEY_PREFIX + userId, JSON.stringify([...ids]));
  } catch {
    // storage unavailable — degrade silently, celebration just won't persist across visits
  }
}
