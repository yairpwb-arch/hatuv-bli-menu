import { useEffect, useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { BottomSheet, PrimaryButton, SecondaryButton } from '@/components/ds';
import { successHaptic } from '@/lib/native';

// bot_workout_plans isn't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Weeks of the program when the extra workout is offered. */
const OFFER_WEEKS = [9, 10];

const OFFER = {
  male: {
    code: 'extra_pullups',
    title: 'רוצים להשתפר במתח?',
    text: 'אם אתם רוצים להשתפר במתח, אתם יכולים להוסיף עוד אימון.',
  },
  female: {
    code: 'extra_abs',
    title: 'רוצות לחזק עוד את הבטן?',
    text: 'אם אתן רוצות לחזק עוד יותר את הבטן שלכן, אתן יכולות להוסיף עוד אימון.',
  },
} as const;

const dismissKey = (userId: string, code: string) => `extra_offer_${code}_${userId}`;

/**
 * In weeks 9–10, once: an extra workout on top of the plan (men: pull-ups,
 * women: abs). "Add" asks the workout bot for it; it shows up in the plan once
 * a coach has gone over it.
 */
export function ExtraWorkoutOffer({ userId, currentWeek, gender, hasPlan }: { userId: string; currentWeek: number; gender: string | null | undefined; hasPlan: boolean }) {
  const offer = gender === 'female' ? OFFER.female : OFFER.male;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hasPlan || !OFFER_WEEKS.includes(currentWeek)) return;
    try {
      if (localStorage.getItem(dismissKey(userId, offer.code))) return;
    } catch {
      // Without storage it can still be offered.
    }
    let gone = false;
    // Already asked (in any state): not offered again.
    db.from('bot_workout_plans').select('id').eq('user_id', userId).eq('request', offer.code).limit(1)
      .then(({ data }: { data: unknown[] | null }) => {
        if (!gone && !(data ?? []).length) window.setTimeout(() => !gone && setOpen(true), 900);
      });
    return () => {
      gone = true;
    };
  }, [userId, currentWeek, hasPlan, offer.code]);

  const remember = () => {
    try {
      localStorage.setItem(dismissKey(userId, offer.code), new Date().toISOString());
    } catch {
      // Nothing to keep.
    }
  };

  const add = async () => {
    setBusy(true);
    const { error } = await db.from('bot_workout_plans').insert({ user_id: userId, kind: 'request', status: 'building', request: offer.code });
    setBusy(false);
    if (error) return void toast.error('לא הצלחנו להוסיף עכשיו, נסו שוב מאוחר יותר');
    remember();
    successHaptic();
    setOpen(false);
    toast.success('מעולה! אנחנו מכינים לך את האימון, והוא יופיע כאן בקרוב 💪');
  };

  return (
    <BottomSheet open={open} onOpenChange={(o) => !o && (remember(), setOpen(false))} title={offer.title} icon={Dumbbell} description={offer.text}>
      <div className="space-y-3 pb-1">
        <PrimaryButton onClick={add} disabled={busy}>{busy ? 'מוסיף…' : 'כן, להוסיף אימון'}</PrimaryButton>
        <SecondaryButton
          className="w-full"
          onClick={() => {
            remember();
            setOpen(false);
          }}
        >
          לא עכשיו
        </SecondaryButton>
      </div>
    </BottomSheet>
  );
}
