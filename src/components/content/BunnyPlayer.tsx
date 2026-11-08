import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { savePosition, savedPosition, signedPlayerUrl } from '@/lib/bunny';

/**
 * A Bunny Stream video in a 16:9 box (the player's own button goes full
 * screen). Starts where the trainee stopped last time, keeps saving the
 * position, and reports the end (onEnded) so the item can be marked watched.
 * Talks to the player through its Player.js messages (postMessage).
 */
export function BunnyEmbed({ videoId, userId, title, autoplay = true, onEnded, className }: {
  videoId: string;
  userId: string;
  title?: string;
  autoplay?: boolean;
  onEnded?: () => void;
  className?: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const ended = useRef(false);
  const lastSaved = useRef(0);
  // The latest callback, so a new function each render doesn't re-wire the listener.
  const endedCb = useRef(onEnded);
  endedCb.current = onEnded;

  useEffect(() => {
    let cancelled = false;
    ended.current = false;
    setSrc(null);
    setError(false);
    (async () => {
      const link = await signedPlayerUrl(videoId);
      if (cancelled) return;
      if (!link) return setError(true);
      const from = savedPosition(userId, videoId);
      const sep = link.url.includes('?') ? '&' : '?';
      // Resume a few seconds back, so the trainee catches the thread again.
      setSrc(`${link.url}${sep}autoplay=${autoplay}&preload=true&responsive=true${from > 5 ? `&t=${Math.max(0, from - 3)}` : ''}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [videoId, userId, autoplay]);

  useEffect(() => {
    const send = (method: string, value?: string) =>
      frame.current?.contentWindow?.postMessage(
        JSON.stringify({ context: 'player.js', version: '0.0.11', method, value, listener: value }),
        '*',
      );
    const finish = () => {
      if (ended.current) return;
      ended.current = true;
      savePosition(userId, videoId, 0); // watched: next time from the start
      endedCb.current?.();
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      let msg: { context?: string; event?: string; value?: { seconds?: number; duration?: number } };
      try {
        msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (msg?.context !== 'player.js') return;
      if (msg.event === 'ready') {
        send('addEventListener', 'timeupdate');
        send('addEventListener', 'ended');
      } else if (msg.event === 'timeupdate' && msg.value?.seconds != null) {
        const { seconds, duration } = msg.value;
        if (Math.abs(seconds - lastSaved.current) >= 5) {
          lastSaved.current = seconds;
          savePosition(userId, videoId, seconds);
        }
        // Some players skip "ended" when closed on the last frame.
        if (duration && seconds / duration >= 0.97) finish();
      } else if (msg.event === 'ended') {
        finish();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [userId, videoId]);

  return (
    <div className={`relative w-full overflow-hidden bg-black ${className ?? ''}`} style={{ paddingTop: '56.25%' }}>
      {error ? (
        <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-body text-white/80">
          לא הצלחנו לטעון את הסרטון. בדקו חיבור ונסו שוב.
        </p>
      ) : src ? (
        <iframe
          ref={frame}
          src={src}
          title={title ?? 'סרטון'}
          className="absolute inset-0 h-full w-full border-0"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          // Android's WebView sends "https://localhost" as the referrer, which Bunny's
          // allowed-domains check turns away (the player loads, the video never does).
          // iOS sends none; this makes Android the same.
          referrerPolicy="no-referrer"
        />
      ) : (
        <Loader2 className="absolute inset-0 m-auto h-8 w-8 animate-spin text-white/70" aria-label="טוען" />
      )}
    </div>
  );
}

/** The same video on a full black screen, with a close button. */
export function BunnyPlayer({ videoId, userId, title, onClose, onEnded }: {
  videoId: string;
  userId: string;
  title?: string;
  onClose: () => void;
  onEnded?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black safe-top" dir="rtl" role="dialog" aria-label={title ?? 'סרטון'}>
      <div className="flex h-14 items-center gap-2 px-2">
        <button type="button" onClick={onClose} aria-label="סגירה" className="flex h-11 w-11 items-center justify-center text-white">
          <X className="h-6 w-6" strokeWidth={2} />
        </button>
        {title && <p className="min-w-0 flex-1 truncate text-body font-semibold text-white">{title}</p>}
      </div>
      <div className="flex flex-1 items-center justify-center">
        <BunnyEmbed videoId={videoId} userId={userId} title={title} onEnded={onEnded} />
      </div>
    </div>
  );
}
