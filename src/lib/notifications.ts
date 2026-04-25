/**
 * Push notifications via @capacitor/push-notifications + OneSignal REST API.
 *
 * HOW IT WORKS:
 *  1. Capacitor registers the device with APNs (iOS) or FCM (Android) → device token
 *  2. We send that raw token to OneSignal REST API to get a "player ID"
 *  3. We store the player ID in the user's profile row in Supabase
 *  4. The server-side Edge Function uses these player IDs to send notifications
 */

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';

// ── Replace with your OneSignal App ID from onesignal.com ────────────────────
export const ONESIGNAL_APP_ID = '80006c7a-5f60-4057-b42d-0f561a008014';

// ── Device type constants for OneSignal REST API ─────────────────────────────
const ONESIGNAL_DEVICE_TYPES: Record<string, number> = {
  ios: 0,
  android: 1,
  web: 5,
};

let _initialized = false;

// ── Register a device token with OneSignal and return the player ID ───────────

async function registerWithOneSignal(deviceToken: string): Promise<string | null> {
  const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
  const deviceType = ONESIGNAL_DEVICE_TYPES[platform] ?? 1;

  try {
    const res = await fetch('https://onesignal.com/api/v1/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        device_type: deviceType,
        identifier: deviceToken,
      }),
    });

    if (!res.ok) {
      console.error('[notifications] OneSignal registration failed:', await res.text());
      return null;
    }

    const data = await res.json();
    return data.id as string | null; // OneSignal player ID
  } catch (err) {
    console.error('[notifications] OneSignal registration error:', err);
    return null;
  }
}

// ── Save player ID to the user's profile ─────────────────────────────────────

async function savePlayerIdToProfile(userId: string, playerId: string) {
  await supabase
    .from('profiles')
    .update({ push_token: playerId })
    .eq('id', userId);
}

// ── Main init function — call once when user is authenticated ─────────────────

export async function initNotifications(userId: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || _initialized) return;
  _initialized = true;

  try {
    // 1. Check / request permission
    let permResult = await PushNotifications.checkPermissions();

    if (permResult.receive === 'prompt') {
      permResult = await PushNotifications.requestPermissions();
    }

    if (permResult.receive !== 'granted') {
      console.log('[notifications] Permission not granted');
      return;
    }

    // 2. Register with APNs / FCM
    await PushNotifications.register();

    // 3. On successful registration, send token to OneSignal
    PushNotifications.addListener('registration', async (token) => {
      const playerId = await registerWithOneSignal(token.value);
      if (playerId) {
        await savePlayerIdToProfile(userId, playerId);
      }
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('[notifications] Registration error:', err);
    });

    // 4. Handle foreground notifications (show via toast or in-app UI)
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[notifications] Received:', notification.title, notification.body);
    });

    // 5. Handle notification tap → navigate
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const type = action.notification.data?.type;
      if (type) {
        handleNotificationTap(type);
      }
    });
  } catch (err) {
    console.error('[notifications] Init error:', err);
  }
}

// ── Navigate to the right screen based on notification type ──────────────────

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

// ── Toggle opt-in / opt-out via Supabase profile flag ────────────────────────

export async function setNotificationsEnabled(userId: string, enabled: boolean): Promise<void> {
  await supabase
    .from('profiles')
    .update({ notifications_enabled: enabled })
    .eq('id', userId);
}

// ── Check current permission state ───────────────────────────────────────────

export async function getPermissionState(): Promise<'granted' | 'denied' | 'prompt' | 'unavailable'> {
  if (!Capacitor.isNativePlatform()) return 'unavailable';
  try {
    const { receive } = await PushNotifications.checkPermissions();
    return receive as 'granted' | 'denied' | 'prompt';
  } catch {
    return 'unavailable';
  }
}
