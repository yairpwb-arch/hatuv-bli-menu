import { useState, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Camera, User, Calendar, Award, Pencil, ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Capacitor } from '@capacitor/core';

interface ProfileHeaderProps {
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
  startDate: string | null;
  currentDay: number;
  currentStreak: number;
  onAvatarUpdate: (url: string) => void;
  onEdit?: () => void;
}

export function ProfileHeader({
  userId,
  fullName,
  avatarUrl,
  startDate,
  currentDay,
  currentStreak,
  onAvatarUpdate,
  onEdit,
}: ProfileHeaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isNative = Capacitor.isNativePlatform();

  const currentWeek = Math.ceil(currentDay / 7);
  const phase = currentWeek <= 3 ? 'התחלה' : currentWeek <= 15 ? 'בנייה' : 'חיזוק';

  // Upload a base64 string (from native camera) to Supabase storage
  const uploadBase64 = async (base64: string, fmt: string) => {
    setIsUploading(true);
    try {
      const byteChars = atob(base64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
      const blob = new Blob([bytes], { type: `image/${fmt}` });

      const fileName = `${userId}/avatar.${fmt}`;
      const { error: uploadError } = await supabase.storage
        .from('profile_photos')
        .upload(fileName, blob, { upsert: true, contentType: `image/${fmt}` });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('profile_photos')
        .getPublicUrl(fileName);

      const urlWithCacheBuster = `${publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: urlWithCacheBuster })
        .eq('id', userId);
      if (updateError) throw updateError;

      onAvatarUpdate(urlWithCacheBuster);
      toast.success('תמונת הפרופיל עודכנה');
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error('שגיאה בהעלאת התמונה');
    } finally {
      setIsUploading(false);
    }
  };

  // Upload a File object (from web file input) to Supabase storage
  const uploadFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('נא לבחור קובץ תמונה'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('גודל הקובץ חייב להיות עד 5MB'); return; }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop() ?? 'jpg';
      const fileName = `${userId}/avatar.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('profile_photos')
        .upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('profile_photos')
        .getPublicUrl(fileName);

      const urlWithCacheBuster = `${publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: urlWithCacheBuster })
        .eq('id', userId);
      if (updateError) throw updateError;

      onAvatarUpdate(urlWithCacheBuster);
      toast.success('תמונת הפרופיל עודכנה');
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error('שגיאה בהעלאת התמונה');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAvatarClick = () => {
    if (isNative) {
      setShowSourcePicker(true);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleNativeSource = async (source: 'CAMERA' | 'PHOTOS') => {
    setShowSourcePicker(false);
    try {
      const { Camera, CameraSource, CameraResultType } = await import('@capacitor/camera');

      // Request both camera and photos permissions upfront
      await Camera.requestPermissions({ permissions: ['camera', 'photos'] });

      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: source === 'CAMERA' ? CameraSource.Camera : CameraSource.Photos,
      });

      if (image.base64String) {
        await uploadBase64(image.base64String, image.format ?? 'jpeg');
      }
    } catch (err: any) {
      // User cancelled — not an error worth showing
      if (err?.message?.includes('cancelled') || err?.message?.includes('cancel')) return;
      console.error('Camera error:', err);
      toast.error('שגיאה בפתיחת המצלמה');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file);
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  return (
    <>
      <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-2xl p-6 animate-fade-in">
        {/* Edit button — top left corner (RTL = visual top-right of card) */}
        {onEdit && (
          <Button
            size="icon"
            variant="ghost"
            onClick={onEdit}
            className="absolute top-3 left-3 h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-primary/10"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}

        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="relative">
            <Avatar className="h-24 w-24 border-4 border-background shadow-lg">
              <AvatarImage src={avatarUrl || undefined} alt={fullName || 'Profile'} />
              <AvatarFallback className="bg-primary/20 text-primary text-2xl">
                {fullName?.charAt(0) || <User className="h-10 w-10" />}
              </AvatarFallback>
            </Avatar>
            <Button
              size="icon"
              variant="secondary"
              className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full shadow-md"
              onClick={handleAvatarClick}
              disabled={isUploading}
            >
              <Camera className="h-4 w-4" />
            </Button>
            {/* Web fallback */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Info */}
          <div className="flex-1 space-y-2">
            <h2 className="text-2xl font-bold text-foreground">{fullName || 'משתמש'}</h2>

            <div className="flex flex-wrap gap-2">
              {startDate && (
                <Badge variant="secondary" className="gap-1">
                  <Calendar className="h-3 w-3" />
                  חבר מ-{format(new Date(startDate), 'MM/yyyy', { locale: he })}
                </Badge>
              )}
              <Badge variant="outline" className="gap-1 border-primary/50 text-primary">
                <Award className="h-3 w-3" />
                שלב: {phase}
              </Badge>
            </div>

            {currentStreak > 0 && (
              <p className="text-sm text-muted-foreground">
                🔥 רצף של {currentStreak} ימים
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Action sheet — source picker (native only) */}
      {showSourcePicker && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/50"
          onClick={() => setShowSourcePicker(false)}
        >
          <div
            className="w-full bg-background rounded-t-2xl p-4 pb-8 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-sm font-semibold text-foreground mb-4">
              העלאת תמונת פרופיל
            </p>
            <Button
              className="w-full gap-2"
              variant="outline"
              onClick={() => handleNativeSource('CAMERA')}
            >
              <Camera className="h-4 w-4" />
              צלם תמונה
            </Button>
            <Button
              className="w-full gap-2"
              variant="outline"
              onClick={() => handleNativeSource('PHOTOS')}
            >
              <ImageIcon className="h-4 w-4" />
              בחר מהגלריה
            </Button>
            <Button
              className="w-full"
              variant="ghost"
              onClick={() => setShowSourcePicker(false)}
            >
              ביטול
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
