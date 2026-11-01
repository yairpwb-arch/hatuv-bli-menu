import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

// Haptics are fire-and-forget: a missing plugin or an unsupported device must
// never break the action that triggered them.
async function haptics() {
  return (await import('@capacitor/haptics')).Haptics;
}

/** Light tap — buttons and other presses. */
export function tapHaptic() {
  if (!isNative) return;
  haptics()
    .then(async (h) => h.impact({ style: (await import('@capacitor/haptics')).ImpactStyle.Light }))
    .catch(() => undefined);
}

/** Selection tick — switching tabs or toggling a choice. */
export function selectionHaptic() {
  if (!isNative) return;
  haptics().then((h) => h.selectionChanged()).catch(() => undefined);
}

/** Success buzz — completing something worth celebrating. */
export function successHaptic() {
  if (!isNative) return;
  haptics()
    .then(async (h) => h.notification({ type: (await import('@capacitor/haptics')).NotificationType.Success }))
    .catch(() => undefined);
}

// Match the system status bar to the app header for each theme.
const STATUS_BAR = {
  dark: { background: '#121216' },
  light: { background: '#FAFBFC' },
} as const;

export async function applyStatusBarTheme(theme: 'dark' | 'light') {
  if (!isNative) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    // Style.Dark = light text (for the dark theme), Style.Light = dark text.
    await StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light });
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: STATUS_BAR[theme].background });
    }
  } catch {
    // Older Android versions can reject setBackgroundColor; the app still works.
  }
}
