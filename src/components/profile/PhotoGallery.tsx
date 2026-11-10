import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Camera, Plus, ImageIcon, ZoomIn } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { removeBodyPhoto, withSignedUrls } from '@/lib/bodyPhotos';
import { AddPhotoSheet } from './AddPhotoSheet';
import { PhotoViewer } from './PhotoViewer';
import { PHOTOS_CHANGED } from './MeasurementsCard';

interface Photo {
  id: string;
  photo_url: string;
  /** The value in the table (photo_url holds the viewable link). */
  stored_url?: string;
  photo_type: 'before' | 'after' | 'progress';
  taken_at: string;
  notes: string | null;
  /** 'onboarding': taken in the opening questionnaire (body_photos), shown as "לפני". */
  source?: 'gallery' | 'onboarding';
}

const ANGLE_LABEL: Record<string, string> = { front: 'מקדימה', side: 'מהצד', back: 'מאחור' };

interface PhotoGalleryProps {
  userId: string;
  isAdmin?: boolean;
}

export function PhotoGallery({ userId, isAdmin = false }: PhotoGalleryProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  /** Index (in photos) of the photo open in the viewer. */
  const [viewing, setViewing] = useState<number | null>(null);

  const fetchPhotos = async () => {
    const [gallery, opening] = await Promise.all([
      supabase
        .from('transformation_photos')
        .select('*')
        .eq('user_id', userId)
        .order('taken_at', { ascending: true }),
      // The photos from the opening questionnaire (front / side / back).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('body_photos')
        .select('id, angle, storage_path, taken_at')
        .eq('user_id', userId),
    ]);

    const rows: Photo[] = [
      ...((opening.data ?? []) as { id: string; angle: string; storage_path: string; taken_at: string }[]).map((b) => ({
        id: `body:${b.id}`,
        photo_url: `storage://body-photos/${b.storage_path}`,
        photo_type: 'before' as const,
        taken_at: b.taken_at,
        notes: `שאלון הפתיחה · ${ANGLE_LABEL[b.angle] ?? b.angle}`,
        source: 'onboarding' as const,
      })),
      ...((gallery.data ?? []) as Photo[]).map((p) => ({ ...p, source: 'gallery' as const })),
    ];
    // Oldest first; on the same day the opening photos come first.
    rows.sort((a, b) => a.taken_at.localeCompare(b.taken_at) || (a.source === 'onboarding' ? -1 : 0) - (b.source === 'onboarding' ? -1 : 0));

    if (!gallery.error || !opening.error) {
      // Private body photos are shown through short-lived signed links.
      setPhotos(await withSignedUrls(rows));
    }
    setIsLoading(false);
  };

  // Refetches after adding / deleting keep the gallery on screen (no skeleton).
  useEffect(() => {
    setIsLoading(true);
    fetchPhotos();
  }, [userId]);

  // A photo added from the reminder: show it.
  useEffect(() => {
    const onChange = () => void fetchPhotos();
    window.addEventListener(PHOTOS_CHANGED, onChange);
    return () => window.removeEventListener(PHOTOS_CHANGED, onChange);
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Asked for in the viewer first ("למחוק את התמונה?").
  const handleDelete = async (photo: { id: string; photo_url: string }) => {
    const row = photos.find((p) => p.id === photo.id);
    const stored = row?.stored_url ?? photo.photo_url;
    try {
      const { error } = row?.source === 'onboarding'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? await (supabase as any).from('body_photos').delete().eq('id', photo.id.slice('body:'.length))
        : await supabase.from('transformation_photos').delete().eq('id', photo.id);

      if (error) throw error;
      await removeBodyPhoto(stored);

      toast.success('התמונה נמחקה');
      setViewing(null);
      fetchPhotos();
    } catch (error) {
      console.error('Error deleting photo:', error);
      toast.error('שגיאה במחיקת התמונה');
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'before': return 'לפני';
      case 'after': return 'אחרי';
      case 'progress': return 'התקדמות';
      default: return type;
    }
  };

  const beforePhotos = photos.filter(p => p.photo_type === 'before');
  const afterPhotos = photos.filter(p => p.photo_type === 'after');

  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="aspect-square rounded-lg" />
            <Skeleton className="aspect-square rounded-lg" />
            <Skeleton className="aspect-square rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="glass-card animate-fade-in">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Camera className="h-5 w-5 text-primary" />
              גלריית התקדמות
            </CardTitle>
            {!isAdmin && (
              <Button size="sm" onClick={() => setIsUploadOpen(true)} className="gap-1">
                <Plus className="h-4 w-4" />
                הוסף
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Before & After Comparison */}
          {(beforePhotos.length > 0 || afterPhotos.length > 0) && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">לפני ואחרי</h4>
              <div className="grid grid-cols-2 gap-3">
                {([
                  [beforePhotos[0], 'לפני', 'Before'],
                  [afterPhotos[afterPhotos.length - 1], 'אחרי', 'After'],
                ] as const).map(([p, label, alt]) => (
                  <div
                    key={label}
                    className={cn(
                      "aspect-[3/4] rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden",
                      p ? "border-transparent" : "border-muted-foreground/20"
                    )}
                  >
                    {p ? (
                      <button
                        type="button"
                        className="relative w-full h-full cursor-pointer group"
                        onClick={() => setViewing(photos.indexOf(p))}
                      >
                        <img src={p.photo_url} alt={alt} className="w-full h-full object-cover rounded-xl" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                          <ZoomIn className="h-6 w-6 text-white" />
                        </div>
                        <span className="absolute bottom-2 right-2 bg-background/80 px-2 py-1 rounded text-xs font-medium">{label}</span>
                      </button>
                    ) : (
                      <div className="text-center text-muted-foreground">
                        <ImageIcon className="h-8 w-8 mx-auto mb-1 opacity-40" />
                        <span className="text-xs">{label}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Photos Grid */}
          {photos.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">כל התמונות ({photos.length})</h4>
              <div className="grid grid-cols-4 gap-2">
                {photos.map((photo, n) => (
                  <button
                    type="button"
                    key={photo.id}
                    className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group"
                    onClick={() => setViewing(n)}
                  >
                    <img
                      src={photo.photo_url}
                      alt={getTypeLabel(photo.photo_type)}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <ZoomIn className="h-5 w-5 text-white" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Camera className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>עדיין אין תמונות</p>
              {!isAdmin && (
                <p className="text-sm">הוסף תמונות כדי לעקוב אחרי ההתקדמות שלך</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {!isAdmin && (
        <AddPhotoSheet
          open={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          userId={userId}
          defaultType={beforePhotos.length ? 'progress' : 'before'}
          onSaved={fetchPhotos}
        />
      )}

      <PhotoViewer
        photos={photos}
        index={viewing}
        onIndex={setViewing}
        onClose={() => setViewing(null)}
        onDelete={handleDelete}
        canDelete={!isAdmin}
      />
    </>
  );
}
