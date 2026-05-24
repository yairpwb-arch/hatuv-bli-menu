import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// On native (iOS/Android) use Capacitor Preferences (native secure storage)
// so sessions survive app restarts and OS memory pressure clearing localStorage.
// On web, fall back to standard localStorage.
const capacitorStorage = {
  getItem: async (key: string): Promise<string | null> => {
    const { value } = await Preferences.get({ key });
    return value;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    await Preferences.set({ key, value });
  },
  removeItem: async (key: string): Promise<void> => {
    await Preferences.remove({ key });
  },
};

const isNative = Capacitor.isNativePlatform();
const storage = isNative ? capacitorStorage : localStorage;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage,
    persistSession: true,
    autoRefreshToken: true,
    // On web: detect session from URL hash (email confirmation links)
    // On native: disable — deep links handled separately
    detectSessionInUrl: !isNative,
  }
});
