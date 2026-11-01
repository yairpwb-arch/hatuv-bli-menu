import { useEffect, useState } from 'react';
import { Preferences } from '@capacitor/preferences';

export type ContentView = 'map' | 'cards';

const key = (userId: string) => `contentView:${userId}`;

/**
 * Map or cards on the content page. Saved per user with Capacitor Preferences,
 * so it survives tab switches and app restarts until changed. Default: map.
 */
export function useContentView(userId: string | undefined) {
  const [view, setView] = useState<ContentView>('map');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!userId) return;
    Preferences.get({ key: key(userId) })
      .then(({ value }) => {
        if (value === 'map' || value === 'cards') setView(value);
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, [userId]);

  const choose = (next: ContentView) => {
    setView(next);
    if (userId) Preferences.set({ key: key(userId), value: next }).catch(() => undefined);
  };

  return { view, ready, choose };
}
