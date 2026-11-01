import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Crosshair, MapPin, Pause, Play, Share2, Square, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { BottomSheet, PrimaryButton, SheetActions } from '@/components/ds';
import { WalkMap } from '@/components/walk/WalkMap';
import { useAuth } from '@/hooks/useAuth';
import { useActivities } from '@/hooks/useActivities';
import { supabase } from '@/integrations/supabase/client';
import { INTENSITY } from '@/lib/activityKinds';
import { selectionHaptic, successHaptic, tapHaptic } from '@/lib/native';
import { cn } from '@/lib/utils';
import { keepAwake, openLocationSettings, stepBaseline, stepsSince, watchLocation, type GpsError } from '@/lib/walkNative';
import { renderShareImage, shareImage } from '@/lib/walkShare';
import {
  AUTO_PAUSE_MS, MAX_ACCURACY_M, Split, TrackPoint, accept, boundsOf, clockLabel, encodePath, estimateCalories, haversine, paceLabel, smoothed,
} from '@/lib/walkTrack';

type Phase = 'intro' | 'ready' | 'countdown' | 'active' | 'summary';
const INTRO_KEY = 'walkLocationIntroSeen';
const AUTO_PAUSE_KEY = 'walkAutoPause';
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* nothing to keep */
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** A GPS walk: start any time, live map and numbers, splits, summary, share. */
export default function AppWalk() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const acts = useActivities(user?.id);
  const [phase, setPhase] = useState<Phase>(read(INTRO_KEY) ? 'ready' : 'intro');
  const [gpsError, setGpsError] = useState<GpsError | null>(null);
  const [fix, setFix] = useState<TrackPoint | null>(null);
  const [count, setCount] = useState(3);
  const [autoPauseOn, setAutoPauseOn] = useState(read(AUTO_PAUSE_KEY) !== 'off');
  const [follow, setFollow] = useState(true);

  // ── The walk ──
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [distance, setDistance] = useState(0);
  const [paused, setPaused] = useState<false | 'manual' | 'auto'>(false);
  const [movingMs, setMovingMs] = useState(0);
  const [steps, setSteps] = useState(0);
  const [splits, setSplits] = useState<Split[]>([]);
  const [confirmEnd, setConfirmEnd] = useState(false);
  // "מחיקת ההליכה" asks once more before throwing the walk away.
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [intensity, setIntensity] = useState<'easy' | 'medium' | 'hard' | null>(null);
  const [hideEnds, setHideEnds] = useState(true);
  const [saving, setSaving] = useState(false);

  const startedAt = useRef(0);
  const baseline = useRef<number | null>(null);
  const lastTick = useRef(0);
  const lastMoveAt = useRef(0);
  const splitStartMs = useRef(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const ptsRef = useRef<TrackPoint[]>([]);
  const distRef = useRef(0);
  const movingRef = useRef(0);

  // ── Location: on from "ready" until the summary ──
  useEffect(() => {
    if (phase === 'intro' || phase === 'summary') return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    watchLocation(onFix, (e) => setGpsError(e)).then((s) => {
      if (cancelled) s();
      else stop = s;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase === 'intro' || phase === 'summary']);

  const onFix = useCallback((p: TrackPoint) => {
    setGpsError(null);
    setFix(p);
    if (phaseRef.current !== 'active') return;
    const kept = ptsRef.current;
    if (!accept(kept[kept.length - 1], p)) return;
    // Auto-resume once moving again.
    if (pausedRef.current === 'auto' && kept.length && haversine(kept[kept.length - 1], p) > 8) setPaused(false);
    if (pausedRef.current) return;
    const before = kept.length ? smoothed(kept) : null;
    const next = [...kept, p];
    const after = smoothed(next);
    const step = before ? haversine(before, after) : 0;
    if (step > 1) lastMoveAt.current = Date.now();
    ptsRef.current = next;
    setPoints(next);
    const prevKm = Math.floor(distRef.current / 1000);
    distRef.current += step;
    setDistance(distRef.current);
    // A full km: buzz + "ק"מ 2 · 11:42 דק'".
    const km = Math.floor(distRef.current / 1000);
    if (km > prevKm) {
      const sec = Math.round((movingRef.current - splitStartMs.current) / 1000);
      splitStartMs.current = movingRef.current;
      setSplits((s) => [...s, { km, sec }]);
      successHaptic();
      toast(`ק"מ ${km} · ${paceLabel(sec)} דק'`);
    }
  }, []);

  // ── Clock, auto-pause, steps ──
  useEffect(() => {
    if (phase !== 'active') return;
    keepAwake(true);
    lastTick.current = Date.now();
    lastMoveAt.current = Date.now();
    const t = window.setInterval(() => {
      const now = Date.now();
      if (!pausedRef.current) {
        movingRef.current += now - lastTick.current;
        setMovingMs(movingRef.current);
        if (autoPauseOn && now - lastMoveAt.current > AUTO_PAUSE_MS && ptsRef.current.length > 1) {
          setPaused('auto');
          toast('השהיה אוטומטית — לא זזת 30 שניות');
        }
      }
      lastTick.current = now;
    }, 1000);
    const s = window.setInterval(async () => setSteps(await stepsSince(startedAt.current, baseline.current)), 10_000);
    return () => {
      window.clearInterval(t);
      window.clearInterval(s);
      keepAwake(false);
    };
  }, [phase, autoPauseOn]);

  // ── Countdown 3-2-1 ──
  const begin = async () => {
    baseline.current = await stepBaseline();
    setCount(3);
    setPhase('countdown');
    tapHaptic();
  };
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count === 0) {
      startedAt.current = Date.now();
      setPhase('active');
      successHaptic();
      return;
    }
    const t = window.setTimeout(() => {
      setCount((c) => c - 1);
      tapHaptic();
    }, 1000);
    return () => window.clearTimeout(t);
  }, [phase, count]);

  // ── Numbers ──
  const movingSec = movingMs / 1000;
  const avgPace = distance > 30 ? movingSec / (distance / 1000) : null;
  const currentPace = useMemo(() => {
    // Moving average over the last 30 seconds of fixes.
    const recent = points.filter((p) => p.t >= Date.now() - 30_000);
    if (recent.length < 2) return null;
    let d = 0;
    for (let i = 1; i < recent.length; i++) d += haversine(recent[i - 1], recent[i]);
    const sec = (recent[recent.length - 1].t - recent[0].t) / 1000;
    return d > 10 ? sec / (d / 1000) : null;
  }, [points]);
  const calories = estimateCalories(profile?.current_weight ?? null, movingSec);
  const quality = !fix ? 'searching' : fix.accuracy <= MAX_ACCURACY_M ? 'good' : 'weak';

  // ── Finish ──
  const finish = async () => {
    setConfirmEnd(false);
    setSteps(await stepsSince(startedAt.current, baseline.current));
    setPhase('summary');
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const id = await acts.save({
      kind: 'walk',
      custom_name: null,
      started_at: new Date(startedAt.current).toISOString(),
      duration_min: Math.max(1, Math.round(movingSec / 60)),
      distance_m: Math.round(distance),
      intensity,
      note: null,
      source: 'gps',
      replaces: null,
      steps: steps || null,
      calories,
      avg_pace_sec_km: avgPace ? Math.round(avgPace) : null,
    });
    if (id && points.length > 1) {
      // The route: the trainee's own (owner-only table — admins see only the summary).
      await db.from('activity_tracks').insert({
        activity_id: id,
        user_id: user.id,
        path: encodePath(points),
        splits,
        bounds: boundsOf(points),
      });
    }
    setSaving(false);
    if (!id) return toast.error('לא נשמר, נסו שוב');
    successHaptic();
    toast('ההליכה נשמרה');
    navigate('/app/workouts', { replace: true });
  };

  const share = async () => {
    const url = await renderShareImage(
      points,
      [
        { label: 'ק"מ', value: (distance / 1000).toFixed(2) },
        { label: 'זמן', value: clockLabel(movingSec) },
        { label: 'קצב', value: paceLabel(avgPace) },
      ],
      hideEnds,
    );
    try {
      await shareImage(url);
    } catch {
      /* cancelled */
    }
  };

  const fastest = splits.length ? splits.reduce((a, b) => (b.sec < a.sec ? b : a)) : null;
  // Under a minute since the start (pauses included): not saved. Moving time
  // alone was too strict: standing still with auto-pause kept it near zero.
  const tooShort = phase !== 'summary' && Date.now() - startedAt.current < 60_000;
  const discard = () => {
    if (!confirmDiscard) return setConfirmDiscard(true);
    navigate(-1);
  };

  // ── Screens ──
  if (phase === 'intro') {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-[#0E0E11] px-6 text-center" dir="rtl">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-tint text-primary">
          <MapPin className="h-10 w-10" strokeWidth={1.75} />
        </span>
        <h1 className="text-screen-title">הליכה עם מפה</h1>
        <p className="max-w-xs text-body text-muted-foreground">כדי למדוד מרחק ומסלול, גם כשהמסך נעול. המיקום נשמר רק אצלך.</p>
        <PrimaryButton
          className="w-full max-w-xs"
          onClick={() => {
            write(INTRO_KEY, '1');
            setPhase('ready');
          }}
        >
          המשך
        </PrimaryButton>
        <button type="button" onClick={() => navigate(-1)} className="min-h-[44px] text-label font-semibold text-muted-foreground">
          לא עכשיו
        </button>
      </div>
    );
  }

  if (phase === 'summary') {
    return (
      <div className="min-h-[100dvh] bg-[#0E0E11] pb-[calc(3.5rem+var(--app-safe-bottom)+24px)]" dir="rtl">
        <div className="h-72 w-full">
          <WalkMap route={points} summary className="h-full w-full" />
        </div>
        <div className="space-y-card-gap px-4 pt-4">
          <h1 className="text-screen-title">כל הכבוד!</h1>
          <p className="-mt-2 text-label text-muted-foreground">{format(new Date(startedAt.current), 'd/M · HH:mm')}</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['זמן', clockLabel(movingSec)],
              ['ק"מ', (distance / 1000).toFixed(2)],
              ['קצב ממוצע', paceLabel(avgPace)],
              ['צעדים', steps ? steps.toLocaleString('he-IL') : '—'],
              ['קלוריות', `~${calories}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-inner bg-card-inner px-2 py-3 text-center">
                <p className="text-card-title tabular-nums" dir="ltr">{value}</p>
                <p className="text-label text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          {splits.length > 0 && (
            <div className="rounded-inner bg-card-inner">
              {splits.map((s) => (
                <div key={s.km} className={cn('flex min-h-[44px] items-center justify-between px-4', s === fastest && 'text-primary')}>
                  <span className="text-body">ק"מ {s.km}{s === fastest ? ' · הכי מהיר' : ''}</span>
                  <span className="text-body font-semibold tabular-nums" dir="ltr">{paceLabel(s.sec)}</span>
                </div>
              ))}
            </div>
          )}

          <fieldset className="space-y-2">
            <legend className="text-label font-semibold">איך היה?</legend>
            <div className="grid grid-cols-3 gap-2">
              {INTENSITY.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setIntensity(intensity === o.value ? null : o.value)}
                  className={cn(
                    'min-h-[44px] rounded-pill border text-label font-semibold',
                    intensity === o.value ? 'border-primary bg-primary-tint text-primary-soft' : 'border-border text-muted-foreground',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="flex min-h-[48px] items-center justify-between gap-3 rounded-inner bg-card-inner px-4">
            <span className="text-body">להסתיר בשיתוף את 200 המטר הראשונים והאחרונים</span>
            <Switch checked={hideEnds} onCheckedChange={setHideEnds} />
          </label>

          <SheetActions>
            <Button disabled={saving} onClick={save}>{saving ? 'שומר...' : 'שמור'}</Button>
            <Button variant="outline" onClick={share}>
              <Share2 className="h-4 w-4" strokeWidth={2} />
              שתף
            </Button>
          </SheetActions>
          <button type="button" onClick={discard} className="min-h-[44px] w-full text-label font-semibold text-destructive">
            {confirmDiscard ? 'בטוח? ההליכה תימחק ולא תישמר' : 'מחיקת ההליכה'}
          </button>
        </div>
      </div>
    );
  }

  const stat = (label: string, value: string, big?: boolean) => (
    <div className={cn('rounded-inner bg-card-inner px-3 py-3 text-center', big && 'col-span-2')}>
      <p className={cn('tabular-nums', big ? 'text-[56px] font-bold leading-none' : 'text-card-title')} dir="ltr">{value}</p>
      <p className="mt-1 text-label text-muted-foreground">{label}</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-[#0E0E11] safe-top" dir="rtl">
      {/* Map: top half */}
      <div className="relative h-1/2 w-full">
        <WalkMap
          route={points}
          current={fix}
          heading={fix?.heading ?? null}
          follow={follow}
          onUserPan={() => setFollow(false)}
          className="h-full w-full"
        />
        {phase !== 'active' && (
          <button type="button" onClick={() => navigate(-1)} aria-label="סגירה" className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#0E0E11]/80">
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        )}
        {!follow && (
          <button
            type="button"
            onClick={() => setFollow(true)}
            className="absolute bottom-3 left-3 inline-flex h-11 items-center gap-1.5 rounded-pill bg-[#0E0E11]/90 px-4 text-label font-semibold"
          >
            <Crosshair className="h-4 w-4" strokeWidth={2} />
            מרכז
          </button>
        )}
      </div>

      {/* Numbers + controls: bottom half */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6 pt-4">
        {phase === 'ready' && (
          <>
            {gpsError === 'denied' ? (
              <div className="space-y-3 rounded-inner bg-card-inner p-4 text-center">
                <p className="text-body">אין הרשאה למיקום. אפשר לאשר בהגדרות הטלפון.</p>
                <Button variant="outline" onClick={() => openLocationSettings()}>להגדרות</Button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 text-label font-semibold" role="status">
                <span className={cn('h-2.5 w-2.5 rounded-full', quality === 'good' ? 'bg-success' : quality === 'weak' ? 'bg-primary' : 'bg-muted-foreground animate-pulse')} />
                {quality === 'good' ? 'GPS טוב' : quality === 'weak' ? 'GPS חלש' : 'מחפש GPS...'}
              </div>
            )}
            <label className="flex min-h-[48px] items-center justify-between rounded-inner bg-card-inner px-4">
              <span className="text-body">השהיה אוטומטית כשעוצרים</span>
              <Switch
                checked={autoPauseOn}
                onCheckedChange={(v) => {
                  setAutoPauseOn(v);
                  write(AUTO_PAUSE_KEY, v ? 'on' : 'off');
                }}
              />
            </label>
            <button
              type="button"
              disabled={quality !== 'good'}
              onClick={begin}
              className="mx-auto mt-2 flex h-28 w-28 items-center justify-center rounded-full bg-primary text-[22px] font-bold text-primary-foreground disabled:opacity-40"
            >
              התחל
            </button>
            {quality !== 'good' && (
              <button type="button" onClick={begin} className="min-h-[44px] text-label font-semibold text-muted-foreground">
                התחל בכל זאת
              </button>
            )}
          </>
        )}

        {phase === 'countdown' && (
          <div className="flex flex-1 items-center justify-center">
            <span key={count} className="text-[120px] font-bold leading-none text-primary motion-safe:animate-scale-in">{count || ''}</span>
          </div>
        )}

        {phase === 'active' && (
          <>
            {paused === 'auto' && <p className="text-center text-label font-semibold text-primary-soft">השהיה אוטומטית — ממשיכים כשתזוזו</p>}
            <div className="grid grid-cols-2 gap-2">
              {stat('זמן', clockLabel(movingSec), true)}
              {stat('ק"מ', (distance / 1000).toFixed(2))}
              {stat('קצב נוכחי', paceLabel(currentPace))}
              {stat('קצב ממוצע', paceLabel(avgPace))}
              {stat('צעדים', steps ? steps.toLocaleString('he-IL') : '—')}
              {stat('קלוריות', `~${calories}`)}
            </div>
            {paused ? (
              <SheetActions>
                <Button
                  onClick={() => {
                    selectionHaptic();
                    lastMoveAt.current = Date.now();
                    setPaused(false);
                  }}
                >
                  <Play className="h-4 w-4" strokeWidth={2} />
                  המשך
                </Button>
                <Button variant="outline" onClick={() => setConfirmEnd(true)}>
                  <Square className="h-4 w-4" strokeWidth={2} />
                  סיום
                </Button>
              </SheetActions>
            ) : (
              <PrimaryButton
                onClick={() => {
                  selectionHaptic();
                  setPaused('manual');
                }}
              >
                <Pause className="h-5 w-5" strokeWidth={2} />
                השהה
              </PrimaryButton>
            )}
          </>
        )}
      </div>

      <BottomSheet
        open={confirmEnd}
        onOpenChange={(o) => {
          setConfirmEnd(o);
          if (!o) setConfirmDiscard(false);
        }}
        title={tooShort ? 'ההליכה קצרה מדי, לא תישמר' : 'לסיים את ההליכה?'}
      >
        <SheetActions>
          <Button onClick={() => setConfirmEnd(false)}>המשך</Button>
          <Button variant="outline" onClick={() => (tooShort ? navigate(-1) : finish())}>
            {tooShort ? 'צא בלי לשמור' : 'סיים ושמור'}
          </Button>
        </SheetActions>
        {!tooShort && (
          <button type="button" onClick={discard} className="mt-3 min-h-[44px] w-full text-label font-semibold text-destructive">
            {confirmDiscard ? 'בטוח? ההליכה תימחק ולא תישמר' : 'מחיקת ההליכה'}
          </button>
        )}
      </BottomSheet>
    </div>
  );
}
