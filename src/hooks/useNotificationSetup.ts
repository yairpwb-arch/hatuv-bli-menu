import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';

function getPlatform(): 'ios' | 'android' {
  return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
}

/**
 * Saves the raw APNs (iOS) or FCM (Android) push token to the user's profile.
 * OneSignal receives these tokens via include_ios_tokens / include_android_reg_ids
 * when the Edge Function sends a notification.
 */
async function saveTokenToProfile(token: string, userId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ push_token: token, device_platform: getPlatform() } as any)
      .eq('id', userId);
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

// Navigate to the right screen based on notification type
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

      // Token received from OS → cache it and auto-save if notifications are enabled
      registrationHandle = await PushNotifications.addListener('registration', async ({ value }) => {
        if (!value) return;
        console.log('[NotificationSetup] Push token received');
        pushTokenRef.current = value;

        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('notifications_enabled')
              .eq('id', user.id)
              .maybeSingle();
            if ((profile as any)?.notifications_enabled) {
              await saveTokenToProfile(value, user.id);
            }
          }
        } catch (e) {
          console.warn('[NotificationSetup] Auto-save token failed:', e);
        }
      });

      errorHandle = await PushNotifications.addListener('registrationError', (err) => {
        console.error('[NotificationSetup] Registration error:', err);
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

  // ─── Enable notifications (called from settings toggle or trigger) ─────────

  const enableNotifications = useCallback(async (userId: string): Promise<boolean> => {
    console.log('[NotificationSetup] ===== ENABLE NOTIFICATIONS =====');
    setIsLoading(true);

    try {
      let granted = await getPermissionStatus();

      if (!granted) {
        const canRequest = await canRequestPermission();
        if (!canRequest) {
          // Permission permanently denied — user must enable in device settings
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

      const saved = await saveTokenToProfile(token, userId);
      if (!saved) {
        setIsLoading(false);
        return false;
      }

      // Mark as enabled in profile
      await supabase
        .from('profiles')
        .update({ notifications_enabled: true } as any)
        .eq('id', userId);

      setIsLoading(false);
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
      const { error } = await supabase
        .from('profiles')
        .update({ notifications_enabled: false } as any)
        .eq('id', userId);
      setIsLoading(false);
      if (error) {
        console.error('[NotificationSetup] DB error disabling:', error.message);
        return false;
      }
      return true;
    } catch (e) {
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
