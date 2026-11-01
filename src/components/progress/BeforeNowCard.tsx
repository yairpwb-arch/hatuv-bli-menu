import { useRef, useState } from 'react';
import { Camera, Images, Loader2 } from 'lucide-react';
import { Card } from '@/components/ds';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { successHaptic } from '@/lib/native';
import { formatKg, parseDay } from './format';
import { uploadBodyPhoto } from '@/lib/bodyPhotos';

export interface ProgressPhoto {
  id: string;
  photo_url: string;
  photo_type: 'before' | 'after' | 'progress';
  taken_at: string;
}

interface BeforeNowCardProps {
  userId: string;
  currentDay: number;
  /** Sorted oldest → newest. */
  photos: ProgressPhoto[];
  weightAt: (day: string) => number | null;
  onUploaded: () => void;
  onOpenAll: () => void;
}

export function BeforeNowCard({ userId, currentDay, photos, weightAt, onUploaded, onOpenAll }: BeforeNowCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const before = photos.find((p) => p.photo_type === 'before') ?? photos[0] ?? null;
  const latest = [...photos].reverse().find((p) => p.id !== before?.id) ?? null;
  const takenToday = latest?.taken_at.slice(0, 10) === format(new Date(), 'yyyy-MM-dd');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('נא לבחור קובץ תמונה');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('גודל הקובץ חייב להיות עד 10MB');
      return;
    }

    setIsUploading(true);
    try {
      // Body photos go to the private bucket, never a public one.
      const stored = await uploadBodyPhoto(userId, file);
      const { error: dbError } = await supabase.from('transformation_photos').insert({
        user_id: userId,
        photo_url: stored,
        photo_type: before ? 'progress' : 'before',
        taken_at: format(new Date(), 'yyyy-MM-dd'),
      });
      if (dbError) throw dbError;
      successHaptic();
      toast.success('התמונה נשמרה');
      onUploaded();
    } catch (error) {
      console.error('Error uploading photo:', error);
      toast.error('שגיאה בהעלאת התמונה');
    } finally {
      setIsUploading(false);
    }
  };

  const captureTile = (label: string) => (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      disabled={isUploading}
      className="aspect-[3/4] w-full rounded-2xl border border-dashed flex flex-col items-center justify-center gap-2 px-3 text-center transition-colors hover:bg-primary/5 disabled:opacity-60"
      style={{ borderColor: 'hsl(var(--primary) / 0.5)' }}
    >
      {isUploading ? (
        <Loader2 className="h-7 w-7 text-primary animate-spin" />
      ) : (
        <Camera className="h-7 w-7 text-primary" strokeWidth={2} />
      )}
      <span className="font-bold text-sm">{label}</span>
      <span className="text-xs text-muted-foreground">אותה תאורה, אותה זווית</span>
    </button>
  );

  const photoTile = (photo: ProgressPhoto, caption: string) => {
    const weight = weightAt(photo.taken_at);
    return (
      <figure className="space-y-1.5">
        <img src={photo.photo_url} alt={caption} className="aspect-[3/4] w-full rounded-2xl object-cover" />
        <figcaption className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{caption}</span>
          {' · '}
          {format(parseDay(photo.taken_at), 'd/M/yy')}
          {weight != null && ` · ${formatKg(weight)} ק"ג`}
        </figcaption>
      </figure>
    );
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold">לפני ועכשיו</h3>
        {photos.length > 0 && (
          <button
            type="button"
            onClick={onOpenAll}
            className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary"
          >
            <Images className="h-4 w-4" strokeWidth={2} />
            כל התמונות
          </button>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />

      {before ? (
        <div className="grid grid-cols-2 gap-3 items-start">
          {photoTile(before, 'התחלה')}
          {latest && takenToday ? photoTile(latest, 'היום') : (
            <div className="space-y-2">
              {captureTile(`צלמו את יום ${currentDay}`)}
              {latest && (
                <p className="text-xs text-muted-foreground text-center">
                  תמונה אחרונה: {format(parseDay(latest.taken_at), 'd/M/yy')}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            עוד אין תמונת התחלה. תמונה אחת היום תראה לכם בעוד חודש כמה השתניתם.
          </p>
          <div className="w-1/2">{captureTile('צלמו תמונת התחלה')}</div>
        </div>
      )}
    </Card>
  );
}
