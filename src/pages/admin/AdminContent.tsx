import { useEffect, useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, Star, Loader2, Upload, Link, CheckCircle2 } from 'lucide-react';

interface Content {
  id: string;
  part_number: number;
  week_range: string;
  unlock_day: number;
  title: string;
  description: string | null;
  video_url: string | null;
  resource_link: string | null;
  is_bonus: boolean;
  sort_order: number;
}

const emptyContent: Omit<Content, 'id'> = {
  part_number: 1,
  week_range: '',
  unlock_day: 1,
  title: '',
  description: '',
  video_url: '',
  resource_link: '',
  is_bonus: false,
  sort_order: 0,
};

export default function AdminContent() {
  const [content, setContent] = useState<Content[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContent, setEditingContent] = useState<Content | null>(null);
  const [formData, setFormData] = useState<Omit<Content, 'id'>>(emptyContent);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [videoInputMode, setVideoInputMode] = useState<'upload' | 'url'>('url');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadComplete, setUploadComplete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchContent();
  }, []);

  const fetchContent = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('program_content')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching content:', error);
      toast({ title: 'שגיאה', description: 'לא ניתן לטעון תכנים', variant: 'destructive' });
    } else {
      setContent(data || []);
    }
    setIsLoading(false);
  };

  const openAddDialog = () => {
    setEditingContent(null);
    setFormData({ ...emptyContent, sort_order: content.length + 1 });
    setVideoInputMode('url');
    setUploadProgress(0);
    setUploadComplete(false);
    setIsDialogOpen(true);
  };

  const openEditDialog = (item: Content) => {
    setEditingContent(item);
    setFormData({
      part_number: item.part_number,
      week_range: item.week_range,
      unlock_day: item.unlock_day,
      title: item.title,
      description: item.description || '',
      video_url: item.video_url || '',
      resource_link: item.resource_link || '',
      is_bonus: item.is_bonus,
      sort_order: item.sort_order,
    });
    setVideoInputMode(item.video_url?.includes('supabase') ? 'upload' : 'url');
    setUploadProgress(0);
    setUploadComplete(item.video_url?.includes('supabase') || false);
    setIsDialogOpen(true);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('video/')) {
      toast({ title: 'שגיאה', description: 'אנא בחר קובץ וידאו', variant: 'destructive' });
      return;
    }

    // Allow up to 500MB
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({ title: 'שגיאה', description: 'הקובץ גדול מדי (מקסימום 500MB)', variant: 'destructive' });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadComplete(false);

    const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = `videos/${fileName}`;

    // Simulate progress for better UX (actual upload progress tracking)
    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return prev;
        }
        return prev + Math.random() * 15;
      });
    }, 500);

    try {
      const { error: uploadError } = await supabase.storage
        .from('videos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      clearInterval(progressInterval);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        toast({ title: 'שגיאה', description: 'לא ניתן להעלות את הקובץ', variant: 'destructive' });
        setUploadProgress(0);
        setIsUploading(false);
        return;
      }

      setUploadProgress(100);

      const { data: { publicUrl } } = supabase.storage
        .from('videos')
        .getPublicUrl(filePath);

      setFormData({ ...formData, video_url: publicUrl });
      setUploadComplete(true);
      toast({ title: 'הצלחה', description: 'הסרטון הועלה בהצלחה' });
    } catch (error) {
      clearInterval(progressInterval);
      console.error('Upload error:', error);
      toast({ title: 'שגיאה', description: 'לא ניתן להעלות את הקובץ', variant: 'destructive' });
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.title || !formData.week_range) {
      toast({ title: 'שגיאה', description: 'אנא מלא את כל השדות הנדרשים', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);

    if (editingContent) {
      const { error } = await supabase
        .from('program_content')
        .update(formData)
        .eq('id', editingContent.id);

      if (error) {
        toast({ title: 'שגיאה', description: 'לא ניתן לעדכן את התוכן', variant: 'destructive' });
      } else {
        toast({ title: 'הצלחה', description: 'התוכן עודכן בהצלחה' });
        setIsDialogOpen(false);
        fetchContent();
      }
    } else {
      const { error } = await supabase.from('program_content').insert(formData);

      if (error) {
        toast({ title: 'שגיאה', description: 'לא ניתן להוסיף את התוכן', variant: 'destructive' });
      } else {
        toast({ title: 'הצלחה', description: 'התוכן נוסף בהצלחה' });
        setIsDialogOpen(false);
        fetchContent();
      }
    }

    setIsSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק תוכן זה?')) return;

    const { error } = await supabase.from('program_content').delete().eq('id', id);

    if (error) {
      toast({ title: 'שגיאה', description: 'לא ניתן למחוק את התוכן', variant: 'destructive' });
    } else {
      toast({ title: 'הצלחה', description: 'התוכן נמחק בהצלחה' });
      fetchContent();
    }
  };

  const partNames: Record<number, string> = {
    1: 'חלק 1',
    2: 'חלק 2',
    3: 'חלק 3',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">ניהול תכנים</h2>
          <p className="text-muted-foreground">הוסף ועדכן את תכני התוכנית</p>
        </div>

        <Button onClick={openAddDialog} className="gradient-primary">
          <Plus className="h-4 w-4 ml-2" />
          הוסף תוכן
        </Button>
      </div>

      <Card className="card-elevated">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right w-16">סדר</TableHead>
                  <TableHead className="text-right">חלק</TableHead>
                  <TableHead className="text-right">שבוע</TableHead>
                  <TableHead className="text-right">כותרת</TableHead>
                  <TableHead className="text-right">יום פתיחה</TableHead>
                  <TableHead className="text-right">סוג</TableHead>
                  <TableHead className="text-right">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {content.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.sort_order}</TableCell>
                    <TableCell>{partNames[item.part_number]}</TableCell>
                    <TableCell>{item.week_range}</TableCell>
                    <TableCell className="font-medium">{item.title}</TableCell>
                    <TableCell>{item.unlock_day}</TableCell>
                    <TableCell>
                      {item.is_bonus ? (
                        <Badge variant="secondary">
                          <Star className="h-3 w-3 ml-1" />
                          בונוס
                        </Badge>
                      ) : (
                        <Badge>רגיל</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(item)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent dir="rtl" className="w-[95vw] max-w-lg max-h-[85vh] overflow-y-auto p-5 sm:p-6">
          <DialogHeader className="pb-2">
            <DialogTitle>{editingContent ? 'עריכת תוכן' : 'הוספת תוכן חדש'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Part & Week Selection */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">חלק</Label>
                <Select
                  value={String(formData.part_number)}
                  onValueChange={(v) => setFormData({ ...formData, part_number: Number(v), week_range: '' })}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">חלק 1 - בניית היסודות</SelectItem>
                    <SelectItem value="2">חלק 2 - אדפטציה ושדרוג</SelectItem>
                    <SelectItem value="3">חלק 3 - הטמעה ושיפור</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">שבוע/תקופה</Label>
                <Select
                  value={formData.week_range}
                  onValueChange={(v) => setFormData({ ...formData, week_range: v })}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="בחר תקופה" />
                  </SelectTrigger>
                  <SelectContent>
                    {formData.part_number === 1 && (
                      <>
                        <SelectItem value="מבוא">מבוא</SelectItem>
                        <SelectItem value="שבוע 1">שבוע 1</SelectItem>
                        <SelectItem value="שבוע 2">שבוע 2</SelectItem>
                        <SelectItem value="שבוע 3">שבוע 3</SelectItem>
                        <SelectItem value="שבועות 4-5">שבועות 4-5</SelectItem>
                      </>
                    )}
                    {formData.part_number === 2 && (
                      <>
                        <SelectItem value="מבוא">מבוא</SelectItem>
                        <SelectItem value="שבועות 6-7">שבועות 6-7</SelectItem>
                        <SelectItem value="שבועות 8-10">שבועות 8-10</SelectItem>
                        <SelectItem value="שבועות 11-15">שבועות 11-15</SelectItem>
                      </>
                    )}
                    {formData.part_number === 3 && (
                      <>
                        <SelectItem value="שבועות 16-18">שבועות 16-18</SelectItem>
                        <SelectItem value="שבועות 19-24">שבועות 19-24</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">כותרת</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="כותרת התוכן"
                className="h-10"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">תיאור</Label>
              <Textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="תיאור קצר של התוכן"
                rows={2}
              />
            </div>

            {/* Unlock Day & Sort Order - Side by Side */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">יום פתיחה</Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.unlock_day}
                  onChange={(e) => setFormData({ ...formData, unlock_day: Number(e.target.value) })}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">סדר תצוגה</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: Number(e.target.value) })}
                  className="h-10"
                />
              </div>
            </div>

            {/* Video Input Section */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">סרטון</Label>
              <Tabs value={videoInputMode} onValueChange={(v) => setVideoInputMode(v as 'upload' | 'url')} dir="rtl">
                <TabsList className="grid w-full grid-cols-2 h-10">
                  <TabsTrigger value="url" className="flex items-center gap-2 text-sm">
                    <Link className="h-4 w-4" />
                    קישור חיצוני
                  </TabsTrigger>
                  <TabsTrigger value="upload" className="flex items-center gap-2 text-sm">
                    <Upload className="h-4 w-4" />
                    העלאה
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="url" className="mt-2 space-y-1">
                  <Input
                    value={formData.video_url || ''}
                    onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                    placeholder="https://youtube.com/watch?v=..."
                    dir="ltr"
                    className="text-left h-10"
                  />
                  <p className="text-xs text-muted-foreground">תומך ב-YouTube, Vimeo וקישורים ישירים</p>
                </TabsContent>
                <TabsContent value="upload" className="mt-2 space-y-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="video/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  
                  {/* Upload Button */}
                  {!isUploading && !uploadComplete && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-16 border-dashed border-2"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <Upload className="h-5 w-5 text-muted-foreground" />
                        <span className="text-sm">בחר קובץ וידאו (עד 500MB)</span>
                      </div>
                    </Button>
                  )}
                  
                  {/* Progress Bar */}
                  {isUploading && (
                    <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">מעלה סרטון...</span>
                        <span className="font-medium">{Math.round(uploadProgress)}%</span>
                      </div>
                      <Progress value={uploadProgress} className="h-2" />
                    </div>
                  )}
                  
                  {/* Success State - More Compact */}
                  {uploadComplete && !isUploading && (
                    <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/20 rounded-lg">
                      <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-success">הועלה בהצלחה</p>
                        <Input
                          value={formData.video_url || ''}
                          readOnly
                          dir="ltr"
                          className="text-left h-8 text-xs mt-1 bg-background"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setUploadComplete(false);
                          setFormData({ ...formData, video_url: '' });
                        }}
                      >
                        החלף
                      </Button>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>

            {/* Resource Link */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">קישור למשאב (PDF)</Label>
              <Input
                value={formData.resource_link || ''}
                onChange={(e) => setFormData({ ...formData, resource_link: e.target.value })}
                placeholder="https://..."
                dir="ltr"
                className="text-left h-10"
              />
            </div>

            {/* Bonus Checkbox */}
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <input
                type="checkbox"
                id="isBonus"
                checked={formData.is_bonus}
                onChange={(e) => setFormData({ ...formData, is_bonus: e.target.checked })}
                className="h-5 w-5 rounded"
              />
              <Label htmlFor="isBonus" className="text-sm font-medium cursor-pointer">
                תוכן בונוס
                <span className="text-xs text-muted-foreground block">יוצג עם תגית בונוס מיוחדת</span>
              </Label>
            </div>

            {/* Submit Button */}
            <Button onClick={handleSubmit} className="w-full gradient-primary h-11 mt-2" disabled={isSubmitting || isUploading}>
              {isSubmitting && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              {editingContent ? 'שמור שינויים' : 'הוסף תוכן'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
