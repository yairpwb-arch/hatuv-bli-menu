import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Camera, Plus, Trash2, ImageIcon, ZoomIn } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Photo {
  id: string;
  photo_url: string;
  photo_type: 'before' | 'after' | 'progress';
  taken_at: string;
  notes: string | null;
}

interface PhotoGalleryProps {
  userId: string;
  isAdmin?: boolean;
}

export function PhotoGallery({ userId, isAdmin = false }: PhotoGalleryProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [photoType, setPhotoType] = useState<'before' | 'after' | 'progress'>('progress');
  const [photoDate, setPhotoDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [photoNotes, setPhotoNotes] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPhotos = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('transformation_photos')
      .select('*')
      .eq('user_id', userId)
      .order('taken_at', { ascending: true });

    if (!error && data) {
      setPhotos(data as Photo[]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchPhotos();
  }, [userId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('profile_photos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('profile_photos')
        .getPublicUrl(fileName);

      const { error: dbError } = await supabase
        .from('transformation_photos')
        .insert({
          user_id: userId,
          photo_url: publicUrl,
          photo_type: photoType,
          taken_at: photoDate,
          notes: photoNotes || null,
        });

      if (dbError) throw dbError;

      toast.success('התמונה הועלתה בהצלחה');
      setIsUploadOpen(false);
      setPhotoNotes('');
      fetchPhotos();
    } catch (error) {
      console.error('Error uploading photo:', error);
      toast.error('שגיאה בהעלאת התמונה');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (photo: Photo) => {
    if (!confirm('למחוק את התמונה?')) return;

    try {
      const { error } = await supabase
        .from('transformation_photos')
        .delete()
        .eq('id', photo.id);

      if (error) throw error;

      toast.success('התמונה נמחקה');
      setSelectedPhoto(null);
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
                <div 
                  className={cn(
                    "aspect-[3/4] rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden",
                    beforePhotos.length > 0 ? "border-transparent" : "border-muted-foreground/20"
                  )}
                >
                  {beforePhotos.length > 0 ? (
                    <div 
                      className="relative w-full h-full cursor-pointer group"
                      onClick={() => setSelectedPhoto(beforePhotos[0])}
                    >
                      <img 
                        src={beforePhotos[0].photo_url} 
                        alt="Before" 
                        className="w-full h-full object-cover rounded-xl"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                        <ZoomIn className="h-6 w-6 text-white" />
                      </div>
                      <span className="absolute bottom-2 right-2 bg-background/80 px-2 py-1 rounded text-xs font-medium">לפני</span>
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <ImageIcon className="h-8 w-8 mx-auto mb-1 opacity-40" />
                      <span className="text-xs">לפני</span>
                    </div>
                  )}
                </div>
                <div 
                  className={cn(
                    "aspect-[3/4] rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden",
                    afterPhotos.length > 0 ? "border-transparent" : "border-muted-foreground/20"
                  )}
                >
                  {afterPhotos.length > 0 ? (
                    <div 
                      className="relative w-full h-full cursor-pointer group"
                      onClick={() => setSelectedPhoto(afterPhotos[afterPhotos.length - 1])}
                    >
                      <img 
                        src={afterPhotos[afterPhotos.length - 1].photo_url} 
                        alt="After" 
                        className="w-full h-full object-cover rounded-xl"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                        <ZoomIn className="h-6 w-6 text-white" />
                      </div>
                      <span className="absolute bottom-2 right-2 bg-background/80 px-2 py-1 rounded text-xs font-medium">אחרי</span>
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <ImageIcon className="h-8 w-8 mx-auto mb-1 opacity-40" />
                      <span className="text-xs">אחרי</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* All Photos Grid */}
          {photos.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">כל התמונות ({photos.length})</h4>
              <div className="grid grid-cols-4 gap-2">
                {photos.map((photo) => (
                  <div 
                    key={photo.id} 
                    className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group"
                    onClick={() => setSelectedPhoto(photo)}
                  >
                    <img 
                      src={photo.photo_url} 
                      alt={getTypeLabel(photo.photo_type)}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <ZoomIn className="h-5 w-5 text-white" />
                    </div>
                  </div>
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

      {/* Upload Dialog */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>הוספת תמונה</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>סוג תמונה</Label>
              <Select value={photoType} onValueChange={(v) => setPhotoType(v as typeof photoType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="before">לפני</SelectItem>
                  <SelectItem value="progress">התקדמות</SelectItem>
                  <SelectItem value="after">אחרי</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>תאריך צילום</Label>
              <Input
                type="date"
                value={photoDate}
                onChange={(e) => setPhotoDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>הערות (אופציונלי)</Label>
              <Input
                placeholder="למשל: אחרי שבוע ראשון"
                value={photoNotes}
                onChange={(e) => setPhotoNotes(e.target.value)}
              />
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUpload}
              />
              <Button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full gradient-primary"
                disabled={isUploading}
              >
                {isUploading ? 'מעלה...' : 'בחר תמונה והעלה'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Photo View Dialog */}
      <Dialog open={!!selectedPhoto} onOpenChange={() => setSelectedPhoto(null)}>
        <DialogContent className="max-w-lg p-2">
          {selectedPhoto && (
            <div className="space-y-3">
              <img 
                src={selectedPhoto.photo_url} 
                alt={getTypeLabel(selectedPhoto.photo_type)}
                className="w-full rounded-lg"
              />
              <div className="flex items-center justify-between px-2">
                <div>
                  <span className="text-sm font-medium">{getTypeLabel(selectedPhoto.photo_type)}</span>
                  <span className="text-sm text-muted-foreground mr-2">
                    {format(new Date(selectedPhoto.taken_at), 'dd/MM/yyyy', { locale: he })}
                  </span>
                  {selectedPhoto.notes && (
                    <p className="text-sm text-muted-foreground">{selectedPhoto.notes}</p>
                  )}
                </div>
                {!isAdmin && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-destructive"
                    onClick={() => handleDelete(selectedPhoto)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
