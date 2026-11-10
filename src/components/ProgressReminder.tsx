import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import { Camera, ChevronLeft, Ruler, Scale, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { BottomSheet, PrimaryButton, SecondaryButton } from '@/components/ds';
import { NumberField } from '@/components/onboarding/inputs';
import { AddPhotoSheet } from '@/components/profile/AddPhotoSheet';
import { MEASUREMENTS_CHANGED, MeasurementsSheet, PHOTOS_CHANGED } from '@/components/profile/MeasurementsCard';
import { isMeasureDue, useMeasurements } from '@/hooks/useMeasurements';
import { successHaptic } from '@/lib/native';

// body_measurements / body_photos aren't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Back in the app after this long counts as "coming into the app" again. */
const AWAY_MS = 30 * 60_000;
/** Screens where a pop-up would get in the way. */
const QUIET = ['/app/walk'];
/** The weekly weigh-in is on Friday; from this hour without one, it's asked for. */
const WEIGH_IN_HOUR = 14;

type Missing = { weight: boolean; measurements: 'none' | 'stale' | null; photos: boolean };
type Row = 'weight' | 'measurements' | 'photos';

/** The latest Friday whose 14:00 has passed (yyyy-MM-dd): the weigh-in that should be in by now. */
function weighInDay(now = new Date()): string {
  const d = new Date(now);
  const back = (d.getDay() - 5 + 7) % 7; // days since Friday
  d.setDate(d.getDate() - back);
  d.setHours(WEIGH_IN_HOUR, 0, 0, 0);
  if (d > now) d.setDate(d.getDate() - 7);
  return format(d, 'yyyy-MM-dd');
}

async function whatsMissing(userId: string, startDate: string | null | undefined): Promise<Missing & { lastWeight: number | null }> {
  const count = (table: string) =>
    db.from(table).select('id', { count: 'exact', head: true }).eq('user_id', userId).then((r: { count: number | null }) => r.count ?? 0);
  const friday = weighInDay();
  const [lastM, p, b, weighed, lastW] = await Promise.all([
    db.from('body_measurements').select('measured_at').eq('user_id', userId).order('measured_at', { ascending: false }).limit(1).maybeSingle(),
    count('transformation_photos'),
    count('body_photos'),
    db.from('weight_log').select('id').eq('user_id', userId).gte('recorded_at', friday).limit(1),
    db.from('weight_log').select('weight').eq('user_id', userId).order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const measuredAt = (lastM.data as { measured_at: string } | null)?.measured_at ?? null;
  // Before the program starts there's no weekly weigh-in yet.
  const started = !startDate || startDate <= friday;
  return {
    weight: started && ((weighed.data as unknown[] | null) ?? []).length === 0,
    measurements: !measuredAt ? 'none' : isMeasureDue(measuredAt) ? 'stale' : null,
    photos: p + b === 0,
    lastWeight: (lastW.data as { weight: number } | null)?.weight ?? null,
  };
}

/**
 * Every time the trainee comes into the app (a launch, or back after half an
 * hour away), a sheet asks for what's due, with a shortcut to each:
 *   - the weekly weigh-in, once Friday 14:00 has passed without one;
 *   - measurements, if there are none or the last ones are two months old;
 *   - progress photos, if there are none (e.g. skipped in the questionnaire).
 */
export function ProgressReminder() {
  const { user, profile } = useAuth();
  const startDate = (profile as { start_date?: string | null } | null)?.start_date;
  const { pathname } = useLocation();
  const measurements = useMeasurements(user?.id);
  const [missing, setMissing] = useState<Missing>({ weight: false, measurements: null, photos: false });
  const [lastWeight, setLastWeight] = useState<number | null>(null);
  const [sheet, setSheet] = useState<null | 'ask' | Row>(null);
  const awaySince = useRef<number | null>(null);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const check = useCallback(
    async (show: boolean) => {
      if (!user) return;
      const m = await whatsMissing(user.id, startDate);
      setMissing(m);
      setLastWeight(m.lastWeight);
      const any = m.weight || !!m.measurements || m.photos;
      if (show && any && !QUIET.some((p) => pathRef.current.startsWith(p))) setSheet('ask');
      if (!any) setSheet((s) => (s === 'ask' ? null : s));
    },
    [user, startDate],
  );

  // A launch: after the first screen has settled.
  useEffect(() => {
    const t = window.setTimeout(() => void check(true), 1500);
    return () => window.clearTimeout(t);
  }, [check]);

  // Back in the foreground after a while.
  useEffect(() => {
    let handle: { remove: () => void } | undefined;
    let gone = false;
    import('@capacitor/app')
      .then(({ App }) =>
        App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) {
            awaySince.current = Date.now();
            return;
          }
          if (awaySince.current && Date.now() - awaySince.current >= AWAY_MS) void check(true);
          awaySince.current = null;
        }),
      )
      .then((h) => {
        if (gone) void h.remove();
        else handle = h;
      })
      .catch(() => undefined);
    return () => {
      gone = true;
      handle?.remove();
    };
  }, [check]);

  /** After one is done (or closed): back to the list if anything else is still due. */
  const afterOne = async () => {
    if (!user) return;
    const m = await whatsMissing(user.id, startDate);
    setMissing(m);
    setLastWeight(m.lastWeight);
    setSheet(m.weight || m.measurements || m.photos ? 'ask' : null);
  };

  if (!user) return null;

  const rows = [
    missing.weight && {
      key: 'weight' as const,
      icon: Scale,
      title: 'שקילה שבועית',
      text: 'יום שישי עבר ועוד לא נשקלת השבוע',
    },
    missing.measurements && {
      key: 'measurements' as const,
      icon: Ruler,
      title: missing.measurements === 'stale' ? 'עדכון היקפים' : 'מדידת היקפים',
      text: missing.measurements === 'stale' ? 'עברו חודשיים מהמדידה האחרונה' : 'יד, חזה, מותניים ובטן · 2 דקות עם סרט מדידה',
    },
    missing.photos && {
      key: 'photos' as const,
      icon: Camera,
      title: 'תמונות התקדמות',
      text: 'חזית, צד וגב · רק את/ה והמאמנים רואים אותן',
    },
  ].filter(Boolean) as { key: Row; icon: typeof Ruler; title: string; text: string }[];

  return (
    <>
      <BottomSheet
        open={sheet === 'ask'}
        onOpenChange={(o) => !o && setSheet(null)}
        title={rows.length > 1 ? 'כמה דברים קטנים לעדכן' : rows[0]?.key === 'weight' ? 'זמן להישקל' : 'עוד דבר קטן'}
        icon={Sparkles}
        description="ככה רואים את השינוי שלך, ונדע לכוון אותך נכון."
      >
        <div className="space-y-3 pb-1">
          {rows.map(({ key, icon: Icon, title, text }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSheet(key)}
              className="flex min-h-[72px] w-full items-center gap-3 rounded-card border border-border bg-card-inner p-3 text-right transition-transform active:scale-[0.98]"
            >
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-pill bg-primary text-primary-foreground">
                <Icon className="h-6 w-6" strokeWidth={2} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body font-bold">{title}</span>
                <span className="block text-label text-muted-foreground">{text}</span>
              </span>
              <ChevronLeft className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden />
            </button>
          ))}
          <SecondaryButton className="w-full" onClick={() => setSheet(null)}>אחר כך</SecondaryButton>
        </div>
      </BottomSheet>

      <WeightSheet
        open={sheet === 'weight'}
        userId={user.id}
        start={lastWeight}
        onClose={() => void afterOne()}
      />
      <MeasurementsSheet
        open={sheet === 'measurements'}
        onClose={() => void afterOne()}
        initial={{}}
        onSave={async (v) => {
          const ok = await measurements.save(v);
          if (ok) window.dispatchEvent(new Event(MEASUREMENTS_CHANGED));
          return ok;
        }}
      />
      <AddPhotoSheet
        open={sheet === 'photos'}
        onClose={() => void afterOne()}
        userId={user.id}
        defaultType="before"
        onSaved={() => window.dispatchEvent(new Event(PHOTOS_CHANGED))}
      />
    </>
  );
}

/** Window event: a weight was saved outside the screens that show it. */
export const WEIGHT_CHANGED = 'weight-changed';

/** Today's weight, straight from the reminder (one weigh-in per day). */
function WeightSheet({ open, userId, start, onClose }: { open: boolean; userId: string; start: number | null; onClose: () => void }) {
  const [value, setValue] = useState<number | undefined>(start ?? undefined);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setValue(start ?? undefined);
  }, [open, start]);

  const save = async () => {
    if (value == null || value < 30 || value > 300) return;
    setSaving(true);
    const today = format(new Date(), 'yyyy-MM-dd');
    const { data: todays } = await db.from('weight_log').select('id').eq('user_id', userId).eq('recorded_at', today).limit(1);
    const { error } = todays?.[0]
      ? await db.from('weight_log').update({ weight: value }).eq('id', todays[0].id)
      : await db.from('weight_log').insert({ user_id: userId, weight: value, recorded_at: today });
    setSaving(false);
    if (error) return void toast.error('לא נשמר, נסו שוב');
    successHaptic();
    toast.success('המשקל נשמר');
    window.dispatchEvent(new Event(WEIGHT_CHANGED));
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => !o && !saving && onClose()}
      title="שקילה שבועית"
      icon={Scale}
      description="הכי טוב בבוקר, אחרי שירותים ולפני אוכל ושתייה."
    >
      <NumberField value={value} onChange={setValue} unit='ק"ג' min={30} max={300} step={0.1} decimals start={start ?? 75} />
      <PrimaryButton className="mt-5" disabled={saving || value == null || value < 30 || value > 300} onClick={save}>
        {saving ? 'שומר…' : 'שמירה'}
      </PrimaryButton>
    </BottomSheet>
  );
}
