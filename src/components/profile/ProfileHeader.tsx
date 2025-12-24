import { useState, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Camera, User, Calendar, Award } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

interface ProfileHeaderProps {
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
  startDate: string | null;
  currentDay: number;
  currentStreak: number;
  onAvatarUpdate: (url: string) => void;
}

export function ProfileHeader({
  userId,
  fullName,
  avatarUrl,
  startDate,
  currentDay,
  currentStreak,
  onAvatarUpdate,
}: ProfileHeaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentWeek = Math.ceil(currentDay / 7);
  const phase = currentWeek <= 3 ? 'התחלה' : currentWeek <= 15 ? 'בנייה' : 'חיזוק';

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('נא לבחור קובץ תמונה');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('גודל הקובץ חייב להיות עד 5MB');
      return;
    }

    setIsUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}/avatar.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('profile_photos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('profile_photos')
        .getPublicUrl(fileName);

      // Add cache buster
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

  return (
    <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-2xl p-6 animate-fade-in">
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
  );
}
