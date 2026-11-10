import { useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera, Images } from 'lucide-react';
import { tapHaptic } from '@/lib/native';

export type PhotoSourceKind = 'CAMERA' | 'PHOTOS';

/**
 * A photo from the camera or the gallery, as a File (null if cancelled).
 * On the phone it's the native picker; on the web, a file input.
 */
export async function pickNativePhoto(source: PhotoSourceKind): Promise<File | null> {
  try {
    const { Camera: Cam, CameraSource, CameraResultType } = await import('@capacitor/camera');
    await Cam.requestPermissions({ permissions: [source === 'CAMERA' ? 'camera' : 'photos'] });
    const image = await Cam.getPhoto({
      quality: 85,
      allowEditing: false,
      correctOrientation: true,
      resultType: CameraResultType.Uri,
      source: source === 'CAMERA' ? CameraSource.Camera : CameraSource.Photos,
    });
    if (!image.webPath) return null;
    const blob = await fetch(image.webPath).then((r) => r.blob());
    const fmt = image.format || 'jpeg';
    return new File([blob], `photo.${fmt === 'jpeg' ? 'jpg' : fmt}`, { type: blob.type || `image/${fmt}` });
  } catch (err) {
    // Cancelling the picker throws too — only report real failures.
    if (!String(err).toLowerCase().includes('cancel')) console.error('[photo] picker failed', err);
    return null;
  }
}

/** Two big buttons: take a photo now, or pick one from the gallery. */
export function PhotoSourceButtons({ onPick }: { onPick: (file: File) => void }) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const native = Capacitor.isNativePlatform();

  const choose = async (source: PhotoSourceKind) => {
    tapHaptic();
    if (!native) return (source === 'CAMERA' ? cameraInput : galleryInput).current?.click();
    const file = await pickNativePhoto(source);
    if (file) onPick(file);
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
