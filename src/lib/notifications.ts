/**
 * Push notifications via @capacitor/push-notifications.
 *
 * HOW IT WORKS (same pattern as MASSAI project):
 *  1. PushNotifications.requestPermissions() shows the OS permission prompt
 *  2. PushNotifications.register() triggers the OS to issue a raw APNs / FCM token
 *  3. The 'registration' event delivers the token → saved to profiles.push_token + device_platform
 *  4. Supabase Edge Function (push-notification) reads that token and calls
 *     OneSignal REST API with include_ios_tokens / include_android_reg_ids
 */

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';

let _initialized = false;
let _cachedToken: string | null = null;

function getPlatform(): 'ios' | 'android' {
  return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
}

async function saveTokenToProfile(token: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from('profiles')
    .update({ push_token: token, device_platform: getPlatform() } as any)
    .eq('id', user.id);
}

// ── Main init — call once after the user authenticates ────────────────────────

export async function initNotifications(userId: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || _initialized) return;
  _initialized = true;

  try {
    // Create Android notification channel
    if (Capacitor.getPlatform() === 'android') {
      try {
        await PushNotifications.createChannel({
          id: 'general',
          name: 'כללי',
          description: 'התראות כלליות מהאפליקציה',
          importance: 4,
          vibration: true,
          sound: 'default',
        });
      } catch { /* channel may already exist */ }
    }

    // Token received from OS → save to DB
    await PushNotifications.addListener('registration', async ({ value }) => {
      if (!value) return;
      console.log('[notifications] Push token received');
      _cachedToken = value;
      await saveTokenToProfile(value);
    });

    // Log registration errors
    await PushNotifications.addListener('registrationError', (err) => {
      console.error('[notifications] Registration error:', err);
    });

    // Handle notification taps → navigate to correct screen
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification.data as Record<string, string> | null;
      const type = data?.type;
      if (type) handleNotificationTap(type);
    });

    // Check permission and register
    const { receive } = await PushNotifications.checkPermissions();

    if (receive === 'granted') {
      await PushNotifications.register();
    } else if (receive === 'prompt' || receive === 'prompt-with-rationale') {
      const result = await PushNotifications.requestPermissions();
      if (result.receive === 'granted') {
        await PushNotifications.register();
        await supabase
          .from('profiles')
          .update({ notifications_enabled: true })
          .eq('id', userId);
      }
    }
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
  await supabase
    .from('profiles')
    .update({ notifications_enabled: enabled })
    .eq('id', userId);

  // If enabling, try to register for a token if we don't have one yet
  if (enabled && Capacitor.isNativePlatform() && !_cachedToken) {
    try {
      const { receive } = await PushNotifications.checkPermissions();
      if (receive === 'granted') {
        await PushNotifications.register();
      }
    } catch { /* ignore */ }
  }
}

// ── Check current OS permission state ─────────────────────────────────────────

export async function getPermissionState(): Promise<'granted' | 'denied' | 'prompt' | 'unavailable'> {
  if (!Capacitor.isNativePlatform()) return 'unavailable';
  try {
    const { receive } = await PushNotifications.checkPermissions();
    if (receive === 'granted') return 'granted';
    if (receive === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unavailable';
  }
}
