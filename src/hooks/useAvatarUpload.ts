import { useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/** A profile photo needs no more than this (the longest side, in pixels). */
const AVATAR_PX = 1024;

/**
 * Any photo (a full-size iPhone shot too) as a JPEG of at most 1024px:
 * small to upload, and never too big. The original if it can't be read.
 */
async function shrink(file: File): Promise<{ body: Blob; ext: string }> {
  const fallback = { body: file as Blob, ext: (file.name.split('.').pop() || 'jpg').toLowerCase() };
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    }).finally(() => setTimeout(() => URL.revokeObjectURL(url), 0));
    const scale = Math.min(1, AVATAR_PX / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob ? { body: blob, ext: 'jpg' } : fallback;
  } catch (err) {
    console.warn('[avatar] could not shrink, uploading the original', err);
    return fallback;
  }
}

/**
 * Profile photo: the camera / gallery sheet on the phone (PhotoSourceButtons),
 * file input on the web. Uploads to profile_photos/<user>/avatar.<ext> and
 * saves the URL on the profile (cache-busted so the new picture shows right away).
 */
export function useAvatarUpload(userId: string | undefined, onUpdated: (url: string) => void) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPickingSource, setIsPickingSource] = useState(false);

  const upload = async (file: File) => {
    if (!userId) return;
    if (file.type && !file.type.startsWith('image/')) return void toast.error('נא לבחור קובץ תמונה');
    setIsUploading(true);
    try {
      const { body, ext } = await shrink(file);
      if (body.size > 10 * 1024 * 1024) throw new Error('too big');
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
      toast.error('שגיאה בהעלאת התמונה, נסו שוב');
    } finally {
      setIsUploading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void upload(file);
  };

  /** Opens the camera / gallery sheet on the phone, the file picker on the web. */
  const start = () => {
    if (isUploading) return;
    if (Capacitor.isNativePlatform()) setIsPickingSource(true);
    else fileInputRef.current?.click();
  };

  /** A photo already picked (the sheet's camera / gallery buttons). */
  const uploadFile = (file: File) => {
    setIsPickingSource(false);
    void upload(file);
  };

  return { fileInputRef, onFileChange, start, isUploading, isPickingSource, setIsPickingSource, uploadFile };
}
