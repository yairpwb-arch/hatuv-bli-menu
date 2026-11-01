import { useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/**
 * Profile photo: native camera/gallery picker on the phone, file input on the
 * web. Uploads to profile_photos/<user>/avatar.<ext> and saves the URL on the
 * profile (cache-busted so the new picture shows right away).
 */
export function useAvatarUpload(userId: string | undefined, onUpdated: (url: string) => void) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPickingSource, setIsPickingSource] = useState(false);

  const upload = async (body: Blob | File, ext: string) => {
    if (!userId) return;
    setIsUploading(true);
    try {
      const path = `${userId}/avatar.${ext}`;
      const { error } = await supabase.storage
        .from('profile_photos')
        .upload(path, body, { upsert: true, contentType: body.type || `image/${ext}` });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('profile_photos').getPublicUrl(path);
      const url = `${publicUrl}?t=${Date.now()}`;
      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId);
      if (updateError) throw updateError;
      onUpdated(url);
      toast.success('תמונת הפרופיל עודכנה');
    } catch (err) {
      console.error('Error uploading avatar:', err);
      toast.error('שגיאה בהעלאת התמונה');
    } finally {
      setIsUploading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return void toast.error('נא לבחור קובץ תמונה');
    if (file.size > 5 * 1024 * 1024) return void toast.error('גודל הקובץ חייב להיות עד 5MB');
    upload(file, file.name.split('.').pop() || 'jpg');
  };

  const pickNative = async (source: 'CAMERA' | 'PHOTOS') => {
    setIsPickingSource(false);
    try {
      const { Camera, CameraSource, CameraResultType } = await import('@capacitor/camera');
      await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: source === 'CAMERA' ? CameraSource.Camera : CameraSource.Photos,
      });
      if (!image.base64String) return;
      const fmt = image.format ?? 'jpeg';
      const bytes = Uint8Array.from(atob(image.base64String), (c) => c.charCodeAt(0));
      await upload(new Blob([bytes], { type: `image/${fmt}` }), fmt);
    } catch (err) {
      // Cancelling the picker throws too — only report real failures.
      if (!String(err).toLowerCase().includes('cancel')) console.error('[avatar] picker failed', err);
    }
  };

  /** Opens the native source sheet on the phone, the file picker on the web. */
  const start = () => (Capacitor.isNativePlatform() ? setIsPickingSource(true) : fileInputRef.current?.click());

  return { fileInputRef, onFileChange, start, isUploading, isPickingSource, setIsPickingSource, pickNative };
}
