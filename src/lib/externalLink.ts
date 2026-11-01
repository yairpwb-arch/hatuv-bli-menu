import { Capacitor } from '@capacitor/core';

/** Opens a link typed in the admin settings: outside the app, and fixes a missing scheme. */
export function openExternalLink(raw: string) {
  const trimmed = raw.trim();
  // Already has a scheme → as-is; a bare email → mailto: (not a domain).
  const url = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
    ? `mailto:${trimmed}`
    : `https://${trimmed}`;
  window.open(url, Capacitor.isNativePlatform() ? '_system' : '_blank');
}
