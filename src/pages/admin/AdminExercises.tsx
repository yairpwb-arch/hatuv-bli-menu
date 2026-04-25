import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Pencil, Trash2, Upload, Video, Image, Dumbbell } from 'lucide-react';

interface Exercise {
  id: string;
  name: string;
  description: string | null;
  muscle_groups: string[] | null;
  equipment: string | null;
  media_url: string | null;
  difficulty: string | null;
  created_at: string;
}

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: 'מתחילים',
  intermediate: 'בינוני',
  advanced: 'מתקדמים',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: 'bg-green-500/20 text-green-400 border-green-500/30',
  intermediate: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  advanced: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const emptyForm = {
  name: '',
  description: '',
  muscle_groups: '',
  equipment: '',
  difficulty: '' as string,
};

export default function AdminExercises() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: exercises = [], isLoading } = useQuery({
    queryKey: ['admin-exercises'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('exercises')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Exercise[];
    },
  });

  const openAdd = () => {
    setEditingExercise(null);
    setForm(emptyForm);
    setMediaFile(null);
    setIsDialogOpen(true);
  };

  const openEdit = (ex: Exercise) => {
    setEditingExercise(ex);
    setForm({
      name: ex.name,
      description: ex.description || '',
      muscle_groups: (ex.muscle_groups || []).join(', '),
      equipment: ex.equipment || '',
      difficulty: ex.difficulty || '',
    });
    setMediaFile(null);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'שגיאה', description: 'שם התרגיל חובה', variant: 'destructive' });
      return;
    }

    setIsUploading(true);

    let mediaUrl = editingExercise?.media_url || null;

    // Upload media if provided
    if (mediaFile) {
      const ext = mediaFile.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('exercise_media')
        .upload(fileName, mediaFile, { upsert: true });

      if (uploadError) {
        toast({ title: 'שגיאת העלאה', description: uploadError.message, variant: 'destructive' });
        setIsUploading(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from('exercise_media')
        .getPublicUrl(uploadData.path);
      mediaUrl = urlData.publicUrl;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      muscle_groups: form.muscle_groups
        ? form.muscle_groups.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      equipment: form.equipment.trim() || null,
      difficulty: form.difficulty || null,
      media_url: mediaUrl,
    };

    if (editingExercise) {
      const { error } = await (supabase as any)
        .from('exercises')
        .update(payload)
        .eq('id', editingExercise.id);
      if (error) {
        toast({ title: 'שגיאה', description: error.message, variant: 'destructive' });
        setIsUploading(false);
        return;
      }
      toast({ title: 'הצלחה', description: 'התרגיל עודכן' });
    } else {
      const { error } = await (supabase as any)
        .from('exercises')
        .insert(payload);
      if (error) {
        toast({ title: 'שגיאה', description: error.message, variant: 'destructive' });
        setIsUploading(false);
        return;
      }
      toast({ title: 'הצלחה', description: 'התרגיל נוסף' });
    }

    queryClient.invalidateQueries({ queryKey: ['admin-exercises'] });
    setIsDialogOpen(false);
    setIsUploading(false);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const { error } = await (supabase as any)
      .from('exercises')
      .delete()
      .eq('id', id);
    if (error) {
      toast({ title: 'שגיאה', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'הצלחה', description: 'התרגיל נמחק' });
      queryClient.invalidateQueries({ queryKey: ['admin-exercises'] });
    }
    setDeletingId(null);
  };

  const isVideo = (url: string) => /\.(mp4|webm|mov|avi)$/i.test(url);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">ספריית תרגילים</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {exercises.length} תרגילים בספרייה
          </p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          הוסף תרגיל
        </Button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-64 rounded-xl bg-card animate-pulse" />
          ))}
        </div>
      ) : exercises.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <Dumbbell className="h-16 w-16 text-muted-foreground/30" />
          <p className="text-muted-foreground">עדיין אין תרגילים בספרייה</p>
          <Button onClick={openAdd} variant="outline">הוסף את הראשון</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {exercises.map((ex) => (
            <div
              key={ex.id}
              className="bg-card border border-border rounded-xl overflow-hidden flex flex-col hover:shadow-md transition-shadow"
            >
              {/* Media */}
              <div className="relative bg-muted h-44 flex items-center justify-center overflow-hidden">
                {ex.media_url ? (
                  isVideo(ex.media_url) ? (
                    <video
                      src={ex.media_url}
                      className="w-full h-full object-cover"
                      muted
                      loop
                      onMouseOver={(e) => (e.currentTarget as HTMLVideoElement).play()}
                      onMouseOut={(e) => { (e.currentTarget as HTMLVideoElement).pause(); (e.currentTarget as HTMLVideoElement).currentTime = 0; }}
                    />
                  ) : (
                    <img
                      src={ex.media_url}
                      alt={ex.name}
                      className="w-full h-full object-cover"
                    />
                  )
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Dumbbell className="h-12 w-12 opacity-20" />
                    <span className="text-xs">אין מדיה</span>
                  </div>
                )}
                {ex.difficulty && (
                  <span
                    className={`absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full border font-medium ${DIFFICULTY_COLORS[ex.difficulty] || ''}`}
                  >
                    {DIFFICULTY_LABELS[ex.difficulty] || ex.difficulty}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="p-4 flex-1 flex flex-col gap-2">
                <h3 className="font-semibold text-base leading-tight">{ex.name}</h3>
                {ex.description && (
                  <p className="text-muted-foreground text-xs line-clamp-2">{ex.description}</p>
                )}
                <div className="flex flex-wrap gap-1 mt-auto pt-2">
                  {(ex.muscle_groups || []).map((g) => (
                    <Badge key={g} variant="secondary" className="text-xs">
                      {g}
                    </Badge>
                  ))}
                  {ex.equipment && (
                    <Badge variant="outline" className="text-xs">{ex.equipment}</Badge>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex border-t border-border">
                <button
                  onClick={() => openEdit(ex)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  עריכה
                </button>
                <div className="w-px bg-border" />
                <button
                  onClick={() => handleDelete(ex.id)}
                  disabled={deletingId === ex.id}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  מחיקה
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingExercise ? 'עריכת תרגיל' : 'הוסף תרגיל חדש'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">שם התרגיל *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="לחיצת חזה"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">תיאור / הנחיות</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="הסבר על ביצוע התרגיל..."
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">שרירים (מופרדים בפסיקים)</label>
              <Input
                value={form.muscle_groups}
                onChange={(e) => setForm({ ...form, muscle_groups: e.target.value })}
                placeholder="חזה, כתפיים, טריצפס"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">ציוד</label>
                <Input
                  value={form.equipment}
                  onChange={(e) => setForm({ ...form, equipment: e.target.value })}
                  placeholder="מוט, דמבל..."
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">רמת קושי</label>
                <Select
                  value={form.difficulty}
                  onValueChange={(v) => setForm({ ...form, difficulty: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="בחר" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">מתחילים</SelectItem>
                    <SelectItem value="intermediate">בינוני</SelectItem>
                    <SelectItem value="advanced">מתקדמים</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Media upload */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">תמונה / וידאו</label>
              {editingExercise?.media_url && !mediaFile && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  {isVideo(editingExercise.media_url) ? (
                    <Video className="h-3.5 w-3.5" />
                  ) : (
                    <Image className="h-3.5 w-3.5" />
                  )}
                  <span className="truncate max-w-[200px]">{editingExercise.media_url.split('/').pop()}</span>
                </div>
              )}
              <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors text-sm text-muted-foreground">
                <Upload className="h-4 w-4" />
                {mediaFile ? mediaFile.name : 'בחר קובץ (תמונה / וידאו)'}
                <input
                  type="file"
                  accept="image/*,video/*"
                  className="sr-only"
                  onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleSave}
                disabled={isUploading}
                className="flex-1"
              >
                {isUploading ? 'שומר...' : editingExercise ? 'שמור שינויים' : 'הוסף תרגיל'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                className="flex-1"
              >
                ביטול
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
