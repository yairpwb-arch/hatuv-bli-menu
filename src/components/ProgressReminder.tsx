import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Camera, ChevronLeft, Ruler, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { BottomSheet, SecondaryButton } from '@/components/ds';
import { AddPhotoSheet } from '@/components/profile/AddPhotoSheet';
import { MEASUREMENTS_CHANGED, MeasurementsSheet, PHOTOS_CHANGED } from '@/components/profile/MeasurementsCard';
import { useMeasurements } from '@/hooks/useMeasurements';

// body_measurements / body_photos aren't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Back in the app after this long counts as "coming into the app" again. */
const AWAY_MS = 30 * 60_000;
/** Screens where a pop-up would get in the way. */
const QUIET = ['/app/walk'];

type Missing = { measurements: boolean; photos: boolean };

async function whatsMissing(userId: string): Promise<Missing> {
  const count = (table: string) =>
    db.from(table).select('id', { count: 'exact', head: true }).eq('user_id', userId).then((r: { count: number | null }) => r.count ?? 0);
  const [m, p, b] = await Promise.all([count('body_measurements'), count('transformation_photos'), count('body_photos')]);
  return { measurements: m === 0, photos: p + b === 0 };
}

/**
 * Every time the trainee comes into the app (a launch, or back after half an
 * hour away) without measurements or progress photos — e.g. they skipped them
 * in the opening questionnaire — a sheet asks for them, with a shortcut to each.
 */
export function ProgressReminder() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const measurements = useMeasurements(user?.id);
  const [missing, setMissing] = useState<Missing>({ measurements: false, photos: false });
  const [sheet, setSheet] = useState<null | 'ask' | 'measurements' | 'photos'>(null);
  const awaySince = useRef<number | null>(null);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const check = useCallback(
    async (show: boolean) => {
      if (!user) return;
      const m = await whatsMissing(user.id);
      setMissing(m);
      if (show && (m.measurements || m.photos) && !QUIET.some((p) => pathRef.current.startsWith(p))) setSheet('ask');
      if (!m.measurements && !m.photos) setSheet((s) => (s === 'ask' ? null : s));
    },
    [user],
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

  /** After adding one: ask for the other if it's still missing. */
  const afterAdding = async () => {
    if (!user) return;
    const m = await whatsMissing(user.id);
    setMissing(m);
    setSheet(m.measurements || m.photos ? 'ask' : null);
  };

  if (!user) return null;

  const rows = [
    missing.measurements && {
      key: 'measurements' as const,
      icon: Ruler,
      title: 'מדידת היקפים',
      text: 'יד, חזה, מותניים ובטן · 2 דקות עם סרט מדידה',
    },
    missing.photos && {
      key: 'photos' as const,
      icon: Camera,
      title: 'תמונות התקדמות',
      text: 'חזית, צד וגב · רק את/ה והמאמנים רואים אותן',
    },
  ].filter(Boolean) as { key: 'measurements' | 'photos'; icon: typeof Ruler; title: string; text: string }[];

  return (
    <>
      <BottomSheet
        open={sheet === 'ask'}
        onOpenChange={(o) => !o && setSheet(null)}
        title={rows.length > 1 ? 'עוד שני דברים קטנים' : 'עוד דבר קטן'}
        icon={Sparkles}
        description="ככה נראה את השינוי שלך גם בשבועות שהמשקל לא זז."
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

      <MeasurementsSheet
        open={sheet === 'measurements'}
        onClose={() => void afterAdding()}
        initial={{}}
        onSave={async (v) => {
          const ok = await measurements.save(v);
          if (ok) window.dispatchEvent(new Event(MEASUREMENTS_CHANGED));
          return ok;
        }}
      />
      <AddPhotoSheet
        open={sheet === 'photos'}
        onClose={() => void afterAdding()}
        userId={user.id}
        defaultType="before"
        onSaved={() => window.dispatchEvent(new Event(PHOTOS_CHANGED))}
      />
    </>
  );
}
