/**
 * Push notifications via onesignal-cordova-plugin (OneSignal SDK v5).
 *
 * HOW IT WORKS:
 *  1. OneSignal.initialize() registers the app with OneSignal on first launch
 *  2. OneSignal.Notifications.requestPermission() shows the OS permission prompt
 *  3. OneSignal.login(userId) links this device's subscription to the Supabase user
 *  4. OneSignal handles all token management, delivery, and analytics internally
 */

import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import type { OneSignalPlugin } from 'onesignal-cordova-plugin';

export const ONESIGNAL_APP_ID = '80006c7a-5f60-4057-b42d-0f561a008014';

let _initialized = false;

// Lazy-load the SDK — only available on native platforms
async function getOneSignal(): Promise<OneSignalPlugin | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const mod = await import('onesignal-cordova-plugin');
    return mod.default;
  } catch {
    return null;
  }
}

// ── Main init — call once after the user authenticates ────────────────────────

export async function initNotifications(userId: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || _initialized) return;
  _initialized = true;

  try {
    const OneSignal = await getOneSignal();
    if (!OneSignal) return;

    // 1. Initialize the SDK with the OneSignal App ID
    OneSignal.initialize(ONESIGNAL_APP_ID);

    // 2. Request permission to send push notifications
    //    true = if previously denied, opens device Settings
    await OneSignal.Notifications.requestPermission(true);

    // 3. Identify the user — this is the key step that links the device to the
    //    Supabase user so we can target them from the dashboard / Edge Functions
    OneSignal.login(userId);

    // 4. Handle notification taps → navigate to the right screen
    OneSignal.Notifications.addEventListener('click', (event) => {
      const data = event.notification.additionalData as Record<string, string> | null;
      const type = data?.type;
      if (type) handleNotificationTap(type);
    });

  } catch (err) {
    console.error('[notifications] Init error:', err);
  }
}

// ── Navigate to the right screen based on notification type ───────────────────

function handleNotificationTap(type: string) {
  const routes: Record<string, string> = {
    daily_quote: '/app/content',
    phase_check: '/app',
    new_habits: '/app',
    weigh_reminder: '/app/tracker',
    survey_followup: '/app',
  };
  const route = routes[type] ?? '/app';
  window.location.hash = '#' + route;
}

// ── Toggle opt-in / opt-out ────────────────────────────────────────────────────

export async function setNotificationsEnabled(userId: string, enabled: boolean): Promise<void> {
  const OneSignal = await getOneSignal();
  if (OneSignal) {
    try {
      if (enabled) {
        OneSignal.User.pushSubscription.optIn();
      } else {
        OneSignal.User.pushSubscription.optOut();
      }
    } catch { /* SDK not ready yet — profile flag is the source of truth */ }
  }

  await supabase
    .from('profiles')
    .update({ notifications_enabled: enabled })
    .eq('id', userId);
}

// ── Check current OS permission state ─────────────────────────────────────────

export async function getPermissionState(): Promise<'granted' | 'denied' | 'prompt' | 'unavailable'> {
  if (!Capacitor.isNativePlatform()) return 'unavailable';
  try {
    const OneSignal = await getOneSignal();
    if (!OneSignal) return 'unavailable';
    const granted = await OneSignal.Notifications.getPermissionAsync();
    return granted ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}
