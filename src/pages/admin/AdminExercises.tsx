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
import { Plus, Pencil, Trash2, Play, Dumbbell, Search, X } from 'lucide-react';
import { BunnyLoop } from '@/components/content/BunnyPlayer';
import { EXERCISE_COLLECTION, exerciseTitle, listBunnyVideos } from '@/lib/bunny';

interface Exercise {
  id: string;
  name: string;
  description: string | null;
  muscle_groups: string[] | null;
  equipment: string | null;
  /** Its video in the Bunny collection "Exercise" (the only media used). */
  video_id: string | null;
  difficulty: string | null;
  created_at: string;
}

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: 'מתחילים',
  intermediate: 'בינוני',
  advanced: 'מתקדמים',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: 'bg-success/20 text-green-400 border-green-500/30',
  intermediate: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  advanced: 'bg-red-500/20 text-destructive border-destructive/30',
};

const emptyForm = {
  name: '',
  description: '',
  muscle_groups: '',
  equipment: '',
  difficulty: '' as string,
  video_id: '' as string,
};

export default function AdminExercises() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [preview, setPreview] = useState<Exercise | null>(null);
  const [search, setSearch] = useState('');
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

  // The Bunny collection "Exercise": the videos to pick from.
  const { data: videos = [] } = useQuery({
    queryKey: ['bunny-exercise-videos'],
    queryFn: () => listBunnyVideos(EXERCISE_COLLECTION),
    staleTime: 5 * 60_000,
  });
  const titleOf = (guid: string | null) => {
    const v = guid ? videos.find((x) => x.guid === guid) : null;
    return v ? exerciseTitle(v.title) : null;
  };

  // Search by name, muscle or equipment (every word has to match somewhere); A→Z by name.
  const shown = (() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hay = (e: Exercise) => [e.name, e.equipment ?? '', ...(e.muscle_groups ?? [])].join(' ').toLowerCase();
    return exercises
      .filter((e) => words.every((w) => hay(e).includes(w)))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  })();

  const openAdd = () => {
    setEditingExercise(null);
    setForm(emptyForm);
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
      video_id: ex.video_id || '',
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'שגיאה', description: 'שם התרגיל חובה', variant: 'destructive' });
      return;
    }

    setIsUploading(true);

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      muscle_groups: form.muscle_groups
        ? form.muscle_groups.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      equipment: form.equipment.trim() || null,
      difficulty: form.difficulty || null,
      video_id: form.video_id || null,
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

  /** True when it was deleted. Asks first; one that's in a trainee's plan or history stays. */
  const handleDelete = async (id: string): Promise<boolean> => {
    const ex = exercises.find((e) => e.id === id);
    if (!confirm(`למחוק את "${ex?.name ?? 'התרגיל'}"? אי אפשר לבטל.`)) return false;
    setDeletingId(id);
    const { error } = await (supabase as any)
      .from('exercises')
      .delete()
      .eq('id', id);
    setDeletingId(null);
    if (error) {
      const inUse = error.code === '23503';
      toast({
        title: inUse ? 'אי אפשר למחוק' : 'שגיאה',
        description: inUse ? 'התרגיל נמצא בתוכנית או בהיסטוריה של מתאמן. אפשר להחליף אותו שם ואז למחוק.' : error.message,
        variant: 'destructive',
      });
      return false;
    }
    toast({ title: 'הצלחה', description: 'התרגיל נמחק' });
    queryClient.invalidateQueries({ queryKey: ['admin-exercises'] });
    return true;
  };


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

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש תרגיל: שם, שריר או ציוד"
          className="pr-9 pl-9"
          aria-label="חיפוש תרגיל"
        />
        {search && (
          <button type="button" onClick={() => setSearch('')} aria-label="ניקוי החיפוש" className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {search && <p className="-mt-3 text-sm text-muted-foreground">{shown.length ? `נמצאו ${shown.length} תרגילים` : 'לא נמצא תרגיל כזה'}</p>}

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
          {shown.map((ex) => (
            <div
              key={ex.id}
              role="button"
              tabIndex={0}
              onClick={() => setPreview(ex)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setPreview(ex)}
              className="bg-card border border-border rounded-xl overflow-hidden flex flex-col hover:shadow-md transition-shadow cursor-pointer"
            >
              {/* Media */}
              <div className="relative bg-muted h-44 flex items-center justify-center overflow-hidden">
                {ex.video_id ? (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Play className="h-10 w-10" />
                    <span className="text-xs">לחיצה לצפייה בסרטון</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Dumbbell className="h-12 w-12 opacity-20" />
                    <span className="text-xs">אין סרטון</span>
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
              <div className="flex border-t border-border" onClick={(e) => e.stopPropagation()}>
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

            {/* The video: from the Bunny collection "Exercise" */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">סרטון (מ-Bunny, אוסף Exercise)</label>
              <Select
                value={form.video_id || 'none'}
                onValueChange={(v) => {
                  const id = v === 'none' ? '' : v;
                  // The video's name is the exercise's exact name.
                  setForm({ ...form, video_id: id, name: id ? titleOf(id) ?? form.name : form.name });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="בחר סרטון" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="none">בלי סרטון</SelectItem>
                  {videos.map((v) => (
                    <SelectItem key={v.guid} value={v.guid}>
                      {exerciseTitle(v.title)}{v.ready ? '' : ' (בעיבוד)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.video_id && <BunnyLoop videoId={form.video_id} className="mx-auto max-w-[10rem]" />}
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

      {/* A card's video */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview?.video_id ? (
            <BunnyLoop videoId={preview.video_id} title={preview.name} controls />
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">אין סרטון לתרגיל הזה</p>
          )}
          {preview?.description && <p className="text-sm text-muted-foreground">{preview.description}</p>}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="outline" className="gap-1.5" onClick={() => { const ex = preview!; setPreview(null); openEdit(ex); }}>
              <Pencil className="h-4 w-4" />
              עריכה
            </Button>
            <Button
              variant="outline"
              className="gap-1.5 text-destructive hover:text-destructive"
              disabled={!!preview && deletingId === preview.id}
              onClick={async () => { if (preview && (await handleDelete(preview.id))) setPreview(null); }}
            >
              <Trash2 className="h-4 w-4" />
              מחיקה
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
