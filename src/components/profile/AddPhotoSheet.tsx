import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { CalendarDays, Camera, Lightbulb, Lock, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { BottomSheet, ChoiceChips, PrimaryButton } from '@/components/ds';
import { uploadBodyPhoto } from '@/lib/bodyPhotos';
import { successHaptic } from '@/lib/native';
import { PhotoSourceButtons } from './PhotoSource';

export type PhotoType = 'before' | 'progress' | 'after';

export const PHOTO_TYPES: { value: PhotoType; label: string }[] = [
  { value: 'before', label: 'לפני' },
  { value: 'progress', label: 'התקדמות' },
  { value: 'after', label: 'אחרי' },
];

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Adding a body photo: camera or gallery first, then a preview with the type
 * (chips), the date and an optional note, and a progress bar while it uploads.
 */
export function AddPhotoSheet({
  open, onClose, userId, defaultType, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  defaultType: PhotoType;
  onSaved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [type, setType] = useState<PhotoType>(defaultType);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const today = format(new Date(), 'yyyy-MM-dd');

  // A fresh start every time it opens.
  useEffect(() => {
    if (!open) return;
    setFile(null);
    setType(defaultType);
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setNotes('');
    setProgress(null);
  }, [open, defaultType]);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (f: File) => {
    if (!f.type.startsWith('image/')) return void toast.error('נא לבחור קובץ תמונה');
    if (f.size > MAX_BYTES) return void toast.error('גודל הקובץ חייב להיות עד 10MB');
    setFile(f);
  };

  const upload = async () => {
    if (!file || progress != null) return;
    // Storage doesn't report upload progress, so the bar moves by stages:
    // it eases towards 85% while uploading, then fills when the row is saved.
    setProgress(8);
    const tick = window.setInterval(() => setProgress((p) => (p == null ? p : p + (85 - p) * 0.08)), 120);
    try {
      const stored = await uploadBodyPhoto(userId, file);
      window.clearInterval(tick);
      setProgress(92);
      const { error } = await supabase.from('transformation_photos').insert({
        user_id: userId,
        photo_url: stored,
        photo_type: type,
        taken_at: date,
        notes: notes.trim() || null,
      });
      if (error) throw error;
      setProgress(100);
      successHaptic();
      await new Promise((r) => setTimeout(r, 350));
      toast.success('התמונה נשמרה');
      onSaved();
      onClose();
    } catch (err) {
      window.clearInterval(tick);
      console.error('Error uploading photo:', err);
      toast.error('לא הצלחנו להעלות את התמונה, נסה שוב');
      setProgress(null);
    }
  };

  const busy = progress != null;

  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => !o && !busy && onClose()}
      title="הוספת תמונה"
      icon={Camera}
    >
      {!file ? (
        <div className="space-y-4 pb-1">
          <PhotoSourceButtons onPick={pick} />
          <div className="flex gap-3 rounded-inner bg-primary-tint px-4 py-3">
            <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-primary-soft" strokeWidth={2} aria-hidden />
            <p className="text-body text-foreground">
              <span className="font-semibold">טיפ קטן: </span>
              לצלם באותו מקום, באותה תאורה, חזית / צד / גב, כדי שההשוואה תהיה אמיתית.
            </p>
          </div>
          <PrivacyLine />
        </div>
      ) : (
        <div className="space-y-5 pb-1">
          <div className="relative overflow-hidden rounded-card bg-black">
            {preview && <img src={preview} alt="התמונה שנבחרה" className="mx-auto max-h-[38dvh] w-full object-contain" />}
            {!busy && (
              <button
                type="button"
                onClick={() => setFile(null)}
                className="absolute left-3 top-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-pill bg-black/55 px-3 text-label font-semibold text-white backdrop-blur"
              >
                <RefreshCw className="h-4 w-4" strokeWidth={2} aria-hidden />
                החלפה
              </button>
            )}
          </div>

          <fieldset className="space-y-2" disabled={busy}>
            <legend className="mb-2 text-label font-semibold text-muted-foreground">סוג תמונה</legend>
            <ChoiceChips<PhotoType> value={type} onChange={setType} options={PHOTO_TYPES} />
          </fieldset>

          <div className="space-y-2">
            <p className="text-label font-semibold text-muted-foreground">תאריך צילום</p>
            {/* The native date picker, under a row in the app's style. */}
            <div className="relative">
              <div className="flex min-h-[52px] items-center gap-3 rounded-inner border border-border bg-card-inner px-4">
                <CalendarDays className="h-5 w-5 text-primary" strokeWidth={2} aria-hidden />
                <span className="flex-1 text-body font-semibold">
                  {date === today ? 'היום, ' : ''}
                  {format(new Date(`${date}T12:00:00`), 'd בMMMM yyyy', { locale: he })}
                </span>
                <span className="text-label font-semibold text-primary-soft">שינוי</span>
              </div>
              <input
                ref={dateInput}
                type="date"
                aria-label="תאריך צילום"
                value={date}
                max={today}
                disabled={busy}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                onClick={() => {
                  try { dateInput.current?.showPicker?.(); } catch { /* not supported: the tap opens it */ }
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="photo-notes" className="text-label font-semibold text-muted-foreground">הערות (אופציונלי)</label>
            <input
              id="photo-notes"
              value={notes}
              disabled={busy}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="למשל: אחרי שבוע ראשון"
              enterKeyHint="done"
              className="min-h-[52px] w-full rounded-inner border border-border bg-card-inner px-4 text-body outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </div>

          {busy ? (
            <div className="space-y-2 py-1" aria-live="polite">
              <div className="flex items-center justify-between text-label font-semibold">
                <span>{progress! >= 100 ? 'נשמר!' : 'מעלה את התמונה…'}</span>
                <span className="tabular-nums text-muted-foreground" dir="ltr">{Math.round(progress!)}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-pill bg-card-inner" role="progressbar" aria-valuenow={Math.round(progress!)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-pill bg-primary transition-[width] duration-200 ease-out" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : (
            <PrimaryButton onClick={upload}>שמירת התמונה</PrimaryButton>
          )}
          <PrivacyLine />
        </div>
      )}
    </BottomSheet>
  );
}

function PrivacyLine() {
  return (
    <p className="flex items-center justify-center gap-1.5 text-label text-muted-foreground">
      <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      התמונות פרטיות, רק אתה והמאמנים רואים אותן
    </p>
  );
}
