import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

function getPlatform(): 'ios' | 'android' {
  return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
}

function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jerusalem';
  } catch {
    return 'Asia/Jerusalem';
  }
}

// Navigate to the right screen based on notification type
function handleNotificationTap(type: string) {
  const routes: Record<string, string> = {
    daily_quote: '/app/content',
    phase_check: '/app',
    new_habits: '/app',
    weigh_reminder: '/app/tracker',
    survey_followup: '/app',
  };
  window.location.hash = '#' + (routes[type] ?? '/app');
}

// Saves the raw FCM / APNs token directly to notification_settings.
// MassAI approach: store the raw platform token — no OneSignal Player ID lookup.
async function saveTokenToDatabase(
  token: string,
  platform: 'ios' | 'android',
  userId: string,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('notification_settings' as any)
      .upsert(
        {
          user_id: userId,
          player_id: token,
          device_platform: platform,
          timezone: getUserTimezone(),
          notifications_enabled: true,
        },
        { onConflict: 'user_id' },
      );

    if (error) {
      console.error('[NotificationSetup] DB error saving token:', error.message);
      return false;
    }

    console.log('[NotificationSetup] Token saved to DB');
    return true;
  } catch (e) {
    console.error('[NotificationSetup] Exception saving token:', e);
    return false;
  }
}

export function useNotificationSetup() {
  const [isLoading, setIsLoading] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'not_determined'>('not_determined');
  const pushTokenRef = useRef<string | null>(null);

  // ─── Persistent listeners — set up once on mount ───────────────────────────
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let registrationHandle: any;
    let errorHandle: any;
    let actionHandle: any;
    let foregroundHandle: any;

    const setup = async () => {
      // Android: create notification channel before registering
      if (getPlatform() === 'android') {
        try {
          await PushNotifications.createChannel({
            id: 'general',
            name: 'כללי',
            description: 'התראות כלליות מהאפליקציה',
            importance: 4,
            visibility: 1,
            vibration: true,
            lights: true,
          });
        } catch (e) {
          console.warn('[NotificationSetup] Channel creation skipped:', e);
        }
      }

      // Auto-save token when OS refreshes it and notifications are already enabled
      registrationHandle = await PushNotifications.addListener('registration', async ({ value }) => {
        if (!value) return;
        console.log('[NotificationSetup] Push token received and cached');
        pushTokenRef.current = value;

        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) {
            const { data: existing } = await supabase
              .from('notification_settings' as any)
              .select('notifications_enabled')
              .eq('user_id', user.id)
              .maybeSingle();

            if ((existing as any)?.notifications_enabled) {
              await saveTokenToDatabase(value, getPlatform(), user.id);
              console.log('[NotificationSetup] Token auto-saved to DB');
            }
          }
        } catch (e) {
          console.warn('[NotificationSetup] Auto-save token failed:', e);
        }
      });

      // Log registration errors to DB for debugging
      errorHandle = await PushNotifications.addListener('registrationError', async (err) => {
        const errorMsg = String((err as any)?.error ?? JSON.stringify(err));
        console.error('[NotificationSetup] Registration error:', errorMsg);
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) {
            await supabase
              .from('notification_settings' as any)
              .upsert(
                { user_id: user.id, registration_error: errorMsg },
                { onConflict: 'user_id' },
              );
          }
        } catch { /* non-fatal */ }
      });

      foregroundHandle = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        const title = notification.title ?? '';
        const body = notification.body ?? '';
        const data = notification.data as Record<string, string> | null;
        const type = data?.type;
        toast(title, {
          description: body,
          duration: 5000,
          action: type ? {
            label: 'פתח',
            onClick: () => handleNotificationTap(type),
          } : undefined,
        });
      });

      actionHandle = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const data = action.notification.data as Record<string, string> | null;
        const type = data?.type;
        if (type) handleNotificationTap(type);
      });

      // Only register if already granted — NEVER auto-request permission here
      const { receive } = await PushNotifications.checkPermissions();
      if (receive === 'granted') {
        await PushNotifications.register();
      }
    };

    setup().catch(console.error);

    return () => {
      registrationHandle?.remove();
      errorHandle?.remove();
      foregroundHandle?.remove();
      actionHandle?.remove();
    };
  }, []);

  // ─── Permission helpers ────────────────────────────────────────────────────

  const getPermissionStatus = useCallback(async (): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      const { receive } = await PushNotifications.checkPermissions();
      const granted = receive === 'granted';
      setPermissionStatus(granted ? 'granted' : receive === 'denied' ? 'denied' : 'not_determined');
      return granted;
    } catch {
      return false;
    }
  }, []);

  const canRequestPermission = useCallback(async (): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      const { receive } = await PushNotifications.checkPermissions();
      return receive === 'prompt' || receive === 'prompt-with-rationale';
    } catch {
      return true;
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      const { receive } = await PushNotifications.requestPermissions();
      const granted = receive === 'granted';
      setPermissionStatus(granted ? 'granted' : 'denied');
      return granted;
    } catch {
      return false;
    }
  }, []);

  // ─── Get device token (MassAI approach — wait up to 15s) ──────────────────
  // Sets up a one-time listener and waits for the FCM / APNs token.
  // Returns null if the token doesn't arrive within 15 seconds.

  const getDeviceToken = useCallback((): Promise<string | null> => {
    if (pushTokenRef.current) {
      console.log('[NotificationSetup] Using cached push token');
      return Promise.resolve(pushTokenRef.current);
    }

    return new Promise(async (resolve) => {
      let handle: any;

      // iOS APNs registration can take up to 15s on first run
      const timer = setTimeout(() => {
        console.warn('[NotificationSetup] Token timeout after 15s');
        handle?.remove();
        resolve(null);
      }, 15_000);

      try {
        handle = await PushNotifications.addListener('registration', ({ value }) => {
          clearTimeout(timer);
          handle?.remove();
          if (value) pushTokenRef.current = value;
          resolve(value || null);
        });
        await PushNotifications.register();
      } catch (e) {
        clearTimeout(timer);
        handle?.remove();
        resolve(null);
      }
    });
  }, []);

  // ─── Enable notifications ──────────────────────────────────────────────────

  const enableNotifications = useCallback(async (userId: string): Promise<boolean> => {
    console.log('[NotificationSetup] ===== ENABLE NOTIFICATIONS =====');
    setIsLoading(true);

    try {
      let granted = await getPermissionStatus();

      if (!granted) {
        // Always attempt requestPermissions — the OS decides whether to show
        // the dialog (Android 13+) or return immediately (older Android / already denied).
        // Removing the canRequestPermission() gate avoids device quirks where
        // checkPermissions() returns an unexpected value and blocks the request.
        console.log('[NotificationSetup] Requesting permission...');
        granted = await requestPermission();
        if (!granted) {
          console.warn('[NotificationSetup] Permission not granted');
          setIsLoading(false);
          return false;
        }
      }

      const token = await getDeviceToken();
      if (!token) {
        console.error('[NotificationSetup] No push token received after 15s');
        setIsLoading(false);
        return false;
      }

      const platform = getPlatform();
      const saved = await saveTokenToDatabase(token, platform, userId);
      setIsLoading(false);

      if (saved) {
        console.log('[NotificationSetup] ===== SETUP COMPLETE =====');
      }
      return saved;
    } catch (e) {
      console.error('[NotificationSetup] Unexpected error:', e);
      setIsLoading(false);
      return false;
    }
  }, [getPermissionStatus, canRequestPermission, requestPermission, getDeviceToken]);

  // ─── Disable notifications ─────────────────────────────────────────────────

  const disableNotifications = useCallback(async (userId: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('notification_settings' as any)
        .update({ notifications_enabled: false })
        .eq('user_id', userId);
      setIsLoading(false);
      if (error) {
        console.error('[NotificationSetup] DB error disabling:', error.message);
        return false;
      }
      return true;
    } catch (e) {
      console.error('[NotificationSetup] Disable error:', e);
      setIsLoading(false);
      return false;
    }
  }, []);

  // ─── Retry registration ────────────────────────────────────────────────────
  // Triggers another FCM/APNs registration attempt and saves if token arrives.

  const retryRegistration = useCallback(async (userId: string): Promise<void> => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const { receive } = await PushNotifications.checkPermissions();
      if (receive !== 'granted') return;

      const token = await getDeviceToken();
      if (token) {
        await saveTokenToDatabase(token, getPlatform(), userId);
        console.log('[NotificationSetup] Retry: token saved');
      } else {
        console.warn('[NotificationSetup] Retry: token still not received');
      }
    } catch (e) {
      console.warn('[NotificationSetup] Retry registration failed:', e);
    }
  }, [getDeviceToken]);

  return {
    enableNotifications,
    disableNotifications,
    getPermissionStatus,
    canRequestPermission,
    retryRegistration,
    permissionStatus,
    isLoading,
  };
}
