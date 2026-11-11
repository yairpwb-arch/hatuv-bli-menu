import { useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera, Images } from 'lucide-react';
import { tapHaptic } from '@/lib/native';
import { toast } from '@/hooks/use-toast';
import { openAppSystemSettings } from '@/lib/systemSettings';

export type PhotoSourceKind = 'CAMERA' | 'PHOTOS';

/** What happened: a photo, cancelled, no permission, or the native picker failed (use the file input). */
export type PickResult = { file: File } | { cancelled: true } | { denied: true } | { failed: true };

const isCancel = (err: unknown) => /cancel/i.test(String((err as { message?: string })?.message ?? err));

async function toFile(webPath: string, format?: string): Promise<File> {
  const blob = await fetch(webPath).then((r) => r.blob());
  const fmt = (format || blob.type.split('/')[1] || 'jpeg').toLowerCase();
  return new File([blob], `photo.${fmt === 'jpeg' ? 'jpg' : fmt}`, { type: blob.type || `image/${fmt}` });
}

/**
 * A photo from the camera or the gallery (the phone's native picker).
 * Asks for permission first. The plugin's current API, then its older one;
 * if both fail, { failed } and the caller falls back to the system file picker.
 */
export async function pickNativePhoto(source: PhotoSourceKind): Promise<PickResult> {
  const { Camera: Cam, CameraSource, CameraResultType, MediaTypeSelection } = await import('@capacitor/camera');
  const kind = source === 'CAMERA' ? 'camera' : 'photos';

  // Permission: asked once by the system; after a "no", only the phone's settings can change it.
  try {
    let status = (await Cam.checkPermissions())[kind];
    if (status !== 'granted' && status !== 'limited') status = (await Cam.requestPermissions({ permissions: [kind] }))[kind];
    if (status === 'denied') return { denied: true };
  } catch (err) {
    console.warn('[photo] permission check failed', err); // the picker itself still asks
  }

  // The current API (camera plugin 8.1+).
  try {
    if (source === 'CAMERA') {
      const r = await Cam.takePhoto({ quality: 85, correctOrientation: true, saveToGallery: false, editable: 'no' });
      if (r.webPath) return { file: await toFile(r.webPath) };
    } else {
      const r = await Cam.chooseFromGallery({ mediaType: MediaTypeSelection.Photo, allowMultipleSelection: false, limit: 1, editable: 'no' } as never);
      const first = r.results?.[0];
      if (first?.webPath) return { file: await toFile(first.webPath) };
    }
    return { cancelled: true };
  } catch (err) {
    if (isCancel(err)) return { cancelled: true };
    console.error('[photo] picker failed, trying the older API', err);
  }

  // The older API.
  try {
    const image = await Cam.getPhoto({
      quality: 85,
      allowEditing: false,
      correctOrientation: true,
      resultType: CameraResultType.Uri,
      source: source === 'CAMERA' ? CameraSource.Camera : CameraSource.Photos,
    });
    if (image.webPath) return { file: await toFile(image.webPath, image.format) };
    return { cancelled: true };
  } catch (err) {
    if (isCancel(err)) return { cancelled: true };
    console.error('[photo] older picker failed too', err);
    return { failed: true };
  }
}

/** Two big buttons: take a photo now, or pick one from the gallery. */
export function PhotoSourceButtons({ onPick }: { onPick: (file: File) => void }) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const native = Capacitor.isNativePlatform();

  const choose = async (source: PhotoSourceKind) => {
    tapHaptic();
    const input = (source === 'CAMERA' ? cameraInput : galleryInput).current;
    if (!native) return input?.click();
    const r = await pickNativePhoto(source);
    if ('file' in r) return onPick(r.file);
    if ('denied' in r) {
      return toast({
        title: source === 'CAMERA' ? 'אין גישה למצלמה' : 'אין גישה לתמונות',
        description: 'אפשר לאשר בהגדרות של הטלפון: הגדרות ← חטוב בלי תפריט ← ' + (source === 'CAMERA' ? 'מצלמה' : 'תמונות'),
        action: (
          <button type="button" className="shrink-0 rounded-pill bg-primary px-3 py-1.5 text-label font-bold text-primary-foreground" onClick={() => void openAppSystemSettings()}>
            להגדרות
          </button>
        ) as never,
      });
    }
    // The native picker failed: the system's own picker (camera / library) instead.
    if ('failed' in r) input?.click();
  };

  const fromInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onPick(file);
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {([
        { source: 'CAMERA', icon: Camera, label: 'צלם עכשיו' },
        { source: 'PHOTOS', icon: Images, label: 'מהגלריה' },
      ] as const).map(({ source, icon: Icon, label }) => (
        <button
          key={source}
          type="button"
          onClick={() => choose(source)}
          className="flex min-h-[112px] flex-col items-center justify-center gap-2.5 rounded-card border border-border bg-card-inner text-body font-bold transition-transform active:scale-[0.97]"
        >
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-pill bg-primary text-primary-foreground">
            <Icon className="h-6 w-6" strokeWidth={2} aria-hidden />
          </span>
          {label}
        </button>
      ))}
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={fromInput} />
      <input ref={galleryInput} type="file" accept="image/*" className="hidden" onChange={fromInput} />
    </div>
  );
}
