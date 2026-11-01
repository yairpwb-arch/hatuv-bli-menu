import { Capacitor } from '@capacitor/core';

/** Opens this app's page in the phone's settings (to turn notifications back on, etc.). */
export async function openAppSystemSettings(): Promise<void> {
  const platform = Capacitor.getPlatform();
  if (platform === 'android') {
    const { StepCounter } = await import('@/plugins/StepCounterPlugin');
    await StepCounter.openAppSettings();
  } else if (platform === 'ios') {
    // Opens UIApplication.openSettingsURLString — the app's own settings page.
    const { Health } = await import('capacitor-health');
    await Health.openAppleHealthSettings();
  }
}

/** Opens an external link in the system browser / app. */
export function openExternal(url: string) {
  window.open(url, Capacitor.isNativePlatform() ? '_system' : '_blank');
}
