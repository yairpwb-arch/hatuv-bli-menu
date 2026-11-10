import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { format } from 'date-fns';
import { Columns2, SplitSquareHorizontal, Trash2, X } from 'lucide-react';
import { BottomSheet, SheetActions } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ViewerPhoto {
  id: string;
  photo_url: string;
  photo_type: 'before' | 'after' | 'progress';
  taken_at: string;
  notes: string | null;
}

const TYPE_LABEL: Record<ViewerPhoto['photo_type'], string> = { before: 'לפני', progress: 'התקדמות', after: 'אחרי' };
const GAP = 16;
const MAX_SCALE = 4;
const dateOf = (p: ViewerPhoto) => format(new Date(`${p.taken_at.slice(0, 10)}T12:00:00`), 'dd/MM/yyyy');

type Mode = null | 'swipe' | 'dismiss' | 'pan' | 'pinch' | 'idle';

/**
 * Full-screen photo viewer on black: the photo at its full shape, swipe
 * between photos (RTL: the next one comes from the left), pinch or double-tap
 * to zoom, drag down to close. "השוואה" puts it next to the "before" photo.
 */
export function PhotoViewer({
  photos, index, onIndex, onClose, onDelete, canDelete,
}: {
  photos: ViewerPhoto[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
  onDelete: (p: ViewerPhoto) => Promise<void>;
  canDelete: boolean;
}) {
  const open = index != null && !!photos[index];
  const i = open ? index! : 0;
  const photo = photos[i];

  const stage = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(390);
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [animate, setAnimate] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [compare, setCompare] = useState<null | 'slider' | 'side'>(null);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef({ mode: 'idle' as Mode, sx: 0, sy: 0, t: 0, dist: 1, scale: 1, pan: { x: 0, y: 0 }, lastTap: 0, tapTimer: 0 });

  // Reset when it opens or the photo changes from outside.
  useEffect(() => {
    if (!open) {
      setCompare(null);
      setConfirm(false);
      setChrome(true);
    }
    setScale(1);
    setPan({ x: 0, y: 0 });
    setDy(0);
  }, [open, i]);

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => stage.current && setWidth(stage.current.clientWidth);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, compare]);

  // Keys on a computer: arrows move (RTL), Escape is handled by the dialog.
  useEffect(() => {
    if (!open || compare) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && i < photos.length - 1) onIndex(i + 1);
      if (e.key === 'ArrowRight' && i > 0) onIndex(i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, compare, i, photos.length, onIndex]);

  const settle = (fn: () => void) => {
    setAnimate(true);
    fn();
    window.setTimeout(() => setAnimate(false), 260);
  };

  /** Moves to another photo, carrying on from where the finger left it. */
  const go = (to: number) => {
    const dir = to > i ? 1 : -1;
    setAnimate(false);
    // The next photo sits one width to the left (RTL), so it starts where it was.
    setDx((d) => d - dir * (width + GAP));
    onIndex(to);
    requestAnimationFrame(() => requestAnimationFrame(() => settle(() => setDx(0))));
  };

  const clampPan = (p: { x: number; y: number }, s: number) => {
    const el = stage.current;
    if (!el) return p;
    const mx = ((s - 1) * el.clientWidth) / 2;
    const my = ((s - 1) * el.clientHeight) / 2;
    return { x: Math.max(-mx, Math.min(mx, p.x)), y: Math.max(-my, Math.min(my, p.y)) };
  };

  const twoFinger = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setAnimate(false);
    if (pointers.current.size === 2) {
      g.current.mode = 'pinch';
      g.current.dist = twoFinger();
      g.current.scale = scale;
      g.current.pan = pan;
      setDx(0);
      setDy(0);
    } else if (pointers.current.size === 1) {
      Object.assign(g.current, { mode: 'idle', sx: e.clientX, sy: e.clientY, t: Date.now(), pan });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const s = g.current;
    if (s.mode === 'pinch' && pointers.current.size === 2) {
      const next = Math.max(1, Math.min(MAX_SCALE, (s.scale * twoFinger()) / s.dist));
      setScale(next);
      setPan(clampPan(s.pan, next));
      return;
    }
    const ddx = e.clientX - s.sx;
    const ddy = e.clientY - s.sy;
    if (s.mode === 'idle' && Math.hypot(ddx, ddy) > 8) {
      if (scale > 1.01) s.mode = 'pan';
      else if (Math.abs(ddx) > Math.abs(ddy)) s.mode = 'swipe';
      else if (ddy > 0) s.mode = 'dismiss';
    }
    if (s.mode === 'pan') setPan(clampPan({ x: s.pan.x + ddx, y: s.pan.y + ddy }, scale));
    if (s.mode === 'swipe') {
      // Resist at the ends (RTL: dragging right brings the next photo).
      const atEnd = (ddx > 0 && i >= photos.length - 1) || (ddx < 0 && i <= 0);
      setDx(atEnd ? ddx / 3 : ddx);
    }
    if (s.mode === 'dismiss') setDy(Math.max(0, ddy));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const s = g.current;
    if (s.mode === 'pinch') {
      if (pointers.current.size === 0) {
        if (scale < 1.05) settle(() => { setScale(1); setPan({ x: 0, y: 0 }); });
        s.mode = 'idle';
      } else {
        // One finger still down: it carries on panning from here.
        const [p] = [...pointers.current.values()];
        Object.assign(s, { mode: 'pan', sx: p.x, sy: p.y, pan });
      }
      return;
    }
    const ddx = e.clientX - s.sx;
    const ddy = e.clientY - s.sy;
    const fast = Date.now() - s.t < 250;
    if (s.mode === 'swipe') {
      const far = Math.abs(ddx) > width * 0.2 || (fast && Math.abs(ddx) > 40);
      if (far && ddx > 0 && i < photos.length - 1) go(i + 1);
      else if (far && ddx < 0 && i > 0) go(i - 1);
      else settle(() => setDx(0));
    } else if (s.mode === 'dismiss') {
      if (ddy > 110 || (fast && ddy > 50)) onClose();
      else settle(() => setDy(0));
    } else if (s.mode === 'idle' && Math.hypot(ddx, ddy) < 8) {
      // A tap: double tap zooms, a single one hides / shows the bars.
      const now = Date.now();
      window.clearTimeout(s.tapTimer);
      if (now - s.lastTap < 280) {
        s.lastTap = 0;
        const rect = stage.current!.getBoundingClientRect();
        if (scale > 1.01) settle(() => { setScale(1); setPan({ x: 0, y: 0 }); });
        else {
          const z = 2.5;
          const cx = e.clientX - rect.left - rect.width / 2;
          const cy = e.clientY - rect.top - rect.height / 2;
          settle(() => { setScale(z); setPan(clampPan({ x: -cx * (z - 1), y: -cy * (z - 1) }, z)); });
        }
      } else {
        s.lastTap = now;
        s.tapTimer = window.setTimeout(() => setChrome((c) => !c), 280);
      }
    }
    s.mode = 'idle';
  };

  // What "השוואה" compares with: the first "before" photo, or — on that photo — the latest other one.
  const firstBefore = photos.find((p) => p.photo_type === 'before') ?? null;
  const other = photo && firstBefore && photo.id !== firstBefore.id
    ? firstBefore
    : [...photos].reverse().find((p) => p.id !== photo?.id && p.id !== firstBefore?.id) ?? null;
  const pair = photo && other ? (other === firstBefore ? [firstBefore, photo] : [photo, other]) : null;

  const fade = Math.max(0.25, 1 - dy / 400);

  return (
    <>
      <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Content
            dir="rtl"
            aria-describedby={undefined}
            onOpenAutoFocus={(e) => e.preventDefault()}
            className="fixed inset-0 z-[90] flex flex-col bg-black text-white outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
            style={{ backgroundColor: `rgba(0,0,0,${fade})` }}
          >
            <DialogPrimitive.Title className="sr-only">תמונת התקדמות</DialogPrimitive.Title>

            {/* Top: close, type + date, position */}
            <div
              className={cn('relative z-10 flex items-center justify-between px-3 pb-2 transition-opacity duration-200', (!chrome || dy > 0) && 'pointer-events-none opacity-0')}
              style={{ paddingTop: 'calc(var(--app-safe-top) + 8px)' }}
            >
              <span className="w-11 text-center text-label tabular-nums text-white/70" dir="ltr">
                {!compare && photos.length > 1 ? `${i + 1}/${photos.length}` : ''}
              </span>
              {photo && !compare && (
                <div className="flex items-center gap-2">
                  <span className="rounded-pill bg-white/15 px-3 py-1 text-label font-semibold">{TYPE_LABEL[photo.photo_type]}</span>
                  <span className="text-label tabular-nums text-white/80">{dateOf(photo)}</span>
                </div>
              )}
              {compare && <span className="text-body font-bold">השוואה</span>}
              <button
                type="button"
                aria-label={compare ? 'חזרה לתמונה' : 'סגירה'}
                onClick={() => (compare ? setCompare(null) : onClose())}
                className="inline-flex h-11 w-11 items-center justify-center rounded-pill bg-white/10 backdrop-blur active:bg-white/20"
              >
                <X className="h-5 w-5" strokeWidth={2.25} />
              </button>
            </div>

            {/* The photos */}
            {!compare ? (
              <div
                ref={stage}
                className="relative min-h-0 flex-1 touch-none select-none overflow-hidden"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                {[i - 1, i, i + 1].map((j) => {
                  const p = photos[j];
                  if (!p) return null;
                  const k = j - i;
                  const current = k === 0;
                  return (
                    <div
                      key={p.id}
                      className={cn('absolute inset-0 flex items-center justify-center', animate && 'transition-transform duration-[250ms] ease-out')}
                      style={{
                        transform: `translate3d(${-k * (width + GAP) + dx}px, ${current ? dy : 0}px, 0) scale(${current ? 1 - dy / 1500 : 1})`,
                      }}
                    >
                      <img
                        src={p.photo_url}
                        alt={`${TYPE_LABEL[p.photo_type]} ${dateOf(p)}`}
                        draggable={false}
                        className={cn('max-h-full max-w-full object-contain', animate && 'transition-transform duration-[250ms] ease-out')}
                        style={current ? { transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})` } : undefined}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              pair && <Compare before={pair[0]} after={pair[1]} mode={compare} />
            )}

            {/* Bottom: note, compare, delete */}
            <div
              className={cn('relative z-10 space-y-3 px-4 pt-3 transition-opacity duration-200', (!chrome || dy > 0) && 'pointer-events-none opacity-0')}
              style={{ paddingBottom: 'calc(var(--app-safe-bottom) + 12px)' }}
            >
              {photo?.notes && !compare && <p className="text-center text-body text-white/85">{photo.notes}</p>}
              <div className="flex items-center gap-3">
                {compare ? (
                  <div className="grid flex-1 grid-cols-2 gap-1 rounded-pill bg-white/10 p-1">
                    {([['slider', 'גרירה', SplitSquareHorizontal], ['side', 'זו לצד זו', Columns2]] as const).map(([m, label, Icon]) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setCompare(m)}
                        className={cn('inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-pill text-label font-semibold', compare === m ? 'bg-white text-black' : 'text-white/80')}
                      >
                        <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                        {label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <>
                    {pair ? (
                      <button
                        type="button"
                        onClick={() => setCompare('slider')}
                        className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-button text-body font-bold backdrop-blur active:bg-white/20"
                        style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
                      >
                        <SplitSquareHorizontal className="h-5 w-5" strokeWidth={2} aria-hidden />
                        השוואה ל{other === firstBefore ? '"לפני"' : 'תמונה האחרונה'}
                      </button>
                    ) : (
                      <span className="flex-1" />
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        aria-label="מחיקת התמונה"
                        onClick={() => setConfirm(true)}
                        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-pill text-white/70 active:bg-white/10"
                      >
                        <Trash2 className="h-5 w-5" strokeWidth={2} />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <BottomSheet
        top
        open={open && confirm}
        onOpenChange={(o) => !o && !deleting && setConfirm(false)}
        title="למחוק את התמונה?"
        icon={Trash2}
        tone="danger"
        description="אי אפשר לשחזר אותה אחרי המחיקה."
      >
        <SheetActions>
          <Button variant="secondary" onClick={() => setConfirm(false)} disabled={deleting}>ביטול</Button>
          <Button
            variant="destructive"
            disabled={deleting}
            onClick={async () => {
              if (!photo) return;
              setDeleting(true);
              await onDelete(photo);
              setDeleting(false);
              setConfirm(false);
            }}
          >
            {deleting ? 'מוחק…' : 'מחיקה'}
          </Button>
        </SheetActions>
      </BottomSheet>
    </>
  );
}

/** Two photos compared: a slider to drag across, or side by side. "Before" is on the right (RTL). */
function Compare({ before, after, mode }: { before: ViewerPhoto; after: ViewerPhoto; mode: 'slider' | 'side' }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const move = (x: number) => {
    const r = box.current?.getBoundingClientRect();
    if (r) setPos(Math.max(0, Math.min(100, ((x - r.left) / r.width) * 100)));
  };
  const tag = (p: ViewerPhoto, side: 'right' | 'left') => (
    <span className={cn('absolute top-3 rounded-pill bg-black/55 px-3 py-1 text-label font-semibold backdrop-blur', side === 'right' ? 'right-3' : 'left-3')}>
      {TYPE_LABEL[p.photo_type]} · <span className="tabular-nums">{dateOf(p)}</span>
    </span>
  );

  if (mode === 'side') {
    return (
      <div className="flex min-h-0 flex-1 items-center px-3">
        <div className="grid w-full grid-cols-2 gap-2">
          {[before, after].map((p, n) => (
            <div key={p.id} className="relative aspect-[3/4] overflow-hidden rounded-inner bg-white/5">
              <img src={p.photo_url} alt="" draggable={false} className="h-full w-full object-cover" />
              <span className="absolute inset-x-2 bottom-2 rounded-pill bg-black/55 px-2 py-1 text-center text-label font-semibold backdrop-blur">
                {n === 0 ? 'לפני' : TYPE_LABEL[p.photo_type]} · <span className="tabular-nums">{format(new Date(`${p.taken_at.slice(0, 10)}T12:00:00`), 'd/M')}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-3">
      <div
        ref={box}
        className="relative aspect-[3/4] max-h-full w-full touch-none select-none overflow-hidden rounded-inner bg-white/5"
        style={{ maxWidth: 'min(100%, calc((100dvh - 220px) * 0.75))' }}
        onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); move(e.clientX); }}
        onPointerMove={(e) => e.buttons && move(e.clientX)}
      >
        {/* "Before" underneath on the right; the newer photo over it, showing from the left up to the handle. */}
        <img src={before.photo_url} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
        <img
          src={after.photo_url}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        />
        {tag(before, 'right')}
        {tag(after, 'left')}
        <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_8px_rgba(0,0,0,0.5)]" style={{ left: `${pos}%` }}>
          <span className="absolute left-1/2 top-1/2 inline-flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-pill bg-white text-black shadow-lg">
            <SplitSquareHorizontal className="h-5 w-5" strokeWidth={2} />
          </span>
        </div>
      </div>
    </div>
  );
}
