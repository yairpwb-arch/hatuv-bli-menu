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

// ── Saves the push token to notification_settings via upsert (never fails silently) ──
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

    // Mirror to profiles so useAuth can still read the flag
    await supabase
      .from('profiles')
      .update({ notifications_enabled: true, push_token: token, device_platform: platform } as any)
      .eq('id', userId);

    console.log('[NotificationSetup] Token saved to notification_settings');

    // Register with OneSignal to get a Player ID — replaces the raw FCM/APNs token in the DB
    // so all sends use include_player_ids (more reliable than raw tokens).
    try {
      const { error: regError } = await supabase.functions.invoke('push-notification', {
        body: { type: 'register_device' },
      });
      if (regError) {
        console.warn('[NotificationSetup] OneSignal registration failed:', regError.message);
      } else {
        console.log('[NotificationSetup] OneSignal Player ID registered');
      }
    } catch (e) {
      console.warn('[NotificationSetup] OneSignal registration exception:', e);
    }

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

      // Token received from OS → cache + auto-save if notifications already enabled
      registrationHandle = await PushNotifications.addListener('registration', async ({ value }) => {
        if (!value) return;
        console.log('[NotificationSetup] Push token received');
        pushTokenRef.current = value;

        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) {
            // Check notification_settings (source of truth)
            const { data: existing } = await supabase
              .from('notification_settings' as any)
              .select('notifications_enabled')
              .eq('user_id', user.id)
              .maybeSingle();

            if ((existing as any)?.notifications_enabled) {
              // Token refreshed by OS — update it
              await saveTokenToDatabase(value, getPlatform(), user.id);
            }
          }
        } catch (e) {
          console.warn('[NotificationSetup] Auto-save token failed:', e);
        }
      });

      // Log registration errors to DB for debugging (e.g. wrong APNs env, missing entitlement)
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

  // ─── Get device token — waits up to 15s for OS to issue token ─────────────

  const getDeviceToken = useCallback((): Promise<string | null> => {
    if (pushTokenRef.current) {
      console.log('[NotificationSetup] Using cached push token');
      return Promise.resolve(pushTokenRef.current);
    }

    return new Promise(async (resolve) => {
      let registrationHandle: any;

      const timer = setTimeout(() => {
        console.warn('[NotificationSetup] Token timeout after 15s');
        registrationHandle?.remove();
        resolve(null);
      }, 15_000);

      try {
        registrationHandle = await PushNotifications.addListener('registration', ({ value }) => {
          clearTimeout(timer);
          registrationHandle?.remove();
          if (value) pushTokenRef.current = value;
          resolve(value || null);
        });
        await PushNotifications.register();
      } catch (e) {
        clearTimeout(timer);
        registrationHandle?.remove();
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
        const canRequest = await canRequestPermission();
        if (!canRequest) {
          console.warn('[NotificationSetup] Permission denied — cannot request');
          setIsLoading(false);
          return false;
        }
        granted = await requestPermission();
        if (!granted) {
          setIsLoading(false);
          return false;
        }
      }

      const token = await getDeviceToken();
      if (!token) {
        console.error('[NotificationSetup] No push token received');
        setIsLoading(false);
        return false;
      }

      const saved = await saveTokenToDatabase(token, getPlatform(), userId);
      setIsLoading(false);

      if (!saved) return false;

      console.log('[NotificationSetup] ===== SETUP COMPLETE =====');
      return true;
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
      await supabase
        .from('notification_settings' as any)
        .upsert(
          { user_id: userId, notifications_enabled: false },
          { onConflict: 'user_id' },
        );
      // Mirror to profiles
      await supabase
        .from('profiles')
        .update({ notifications_enabled: false } as any)
        .eq('id', userId);

      setIsLoading(false);
      return true;
    } catch (e) {
      console.error('[NotificationSetup] Disable error:', e);
      setIsLoading(false);
      return false;
    }
  }, []);

  return {
    enableNotifications,
    disableNotifications,
    getPermissionStatus,
    canRequestPermission,
    permissionStatus,
    isLoading,
  };
}
