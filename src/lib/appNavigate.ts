/**
 * Navigation requests from outside the router (notification taps). The app
 * uses BrowserRouter, so setting location.hash doesn't navigate; instead a
 * listener inside the router picks these up. A tap that arrives before the
 * listener is mounted (cold start) is kept and delivered on mount.
 */
const EVENT = 'app:navigate';
let pending: string | null = null;

export function requestNavigate(path: string) {
  pending = path;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: path }));
}

export function listenForNavigate(go: (path: string) => void): () => void {
  if (pending) {
    go(pending);
    pending = null;
  }
  const handler = (e: Event) => {
    pending = null;
    go((e as CustomEvent<string>).detail);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
