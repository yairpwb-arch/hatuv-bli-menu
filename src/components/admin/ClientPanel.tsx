/**
 * The admin's client panel: a wide drawer from the side with a header that
 * always shows where the client stands (stage, weight, last weigh-in, the
 * group, workouts this week, the bot), and the "פרטים" / "בוט" tabs.
 */
import * as React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { differenceInCalendarDays, format, formatDistanceToNowStrict, startOfWeek } from 'date-fns';
import { he } from 'date-fns/locale';
import {
  AlertTriangle, ArrowDown, ArrowUp, Bot, Loader2, MessageCircle, RefreshCw, RotateCcw, X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Card, Pill, PrimaryButton, SectionHeader } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { TRACKS, programEnd, trackLabel } from '@/lib/programTracks';
import { cn } from '@/lib/utils';

// Bot tables and a few profile columns aren't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface PanelUser {
  id: string;
  email: string;
  full_name: string | null;
  start_date: string | null;
  current_weight: number | null;
  initial_weight: number | null;
  height: number | null;
  birthdate: string | null;
  age?: number | null;
  gender: string | null;
  phone_number: string | null;
  is_active: boolean;
  plan_duration_days: number | null;
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
const asDate = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00`);
const dmy = (s: string) => format(asDate(s), 'd.M.yyyy');
const ago = (iso: string) => {
  const days = differenceInCalendarDays(new Date(), new Date(iso));
  if (days === 0) return 'היום';
  if (days === 1) return 'אתמול';
  if (days < 0) return format(new Date(iso), 'd.M');
  return `לפני ${formatDistanceToNowStrict(new Date(iso), { locale: he, unit: days < 1 ? 'hour' : 'day' })}`;
};
const ageOf = (u: Pick<PanelUser, 'age' | 'birthdate'>) => {
  if (u.age) return u.age;
  if (!u.birthdate) return null;
  const a = Math.floor((Date.now() - new Date(u.birthdate).getTime()) / (365.25 * 864e5));
  return a > 0 ? a : null;
};
/** Day of the program (1 = the start date); ≤ 0 before it. */
const dayOf = (start: string | null) => (start ? differenceInCalendarDays(new Date(), asDate(start)) + 1 : null);

export type BotState = 'none' | 'off' | 'draft' | 'live';
const BOT_LABEL: Record<BotState, string> = { none: 'אין קבוצה מקושרת', off: 'בוט כבוי', draft: 'מצב טיוטה', live: 'בוט פעיל' };

interface GroupRow {
  chat_id: string;
  name: string | null;
  user_id: string | null;
  bot_enabled: boolean;
  draft_mode: boolean;
}
const botState = (g: GroupRow | null): BotState => (!g ? 'none' : !g.bot_enabled ? 'off' : g.draft_mode ? 'draft' : 'live');

/* ── The drawer ──────────────────────────────────────────────────────────── */

/** A wide panel from the side (the left, in RTL), full height. */
export function ClientDrawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          dir="rtl"
          aria-describedby={undefined}
          // No focus ring on the close button just for opening.
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed inset-y-0 left-0 z-50 flex w-full max-w-[720px] flex-col bg-background shadow-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left data-[state=open]:duration-300 data-[state=closed]:duration-200"
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ── The header ──────────────────────────────────────────────────────────── */

interface HeaderData {
  firstWeight: number | null;
  lastWeight: number | null;
  lastWeighIn: string | null;
  lastMessage: { at: string; sender: string } | null;
  workoutsThisWeek: number;
  walksThisWeek: number;
  part: number | null;
  group: GroupRow | null;
}

/** Everything the header shows, loaded for one client. */
export function useClientHeader(user: PanelUser | null, refreshKey: number) {
  const [data, setData] = useState<HeaderData | null>(null);
  useEffect(() => {
    if (!user) return;
    let gone = false;
    (async () => {
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
      const day = dayOf(user.start_date) ?? 0;
      const [weights, group, sessions, acts, content, walkActs, walkTicks] = await Promise.all([
        db.from('weight_log').select('weight, recorded_at').eq('user_id', user.id).order('recorded_at', { ascending: true }),
        db.from('whatsapp_groups').select('chat_id, name, user_id, bot_enabled, draft_mode').eq('user_id', user.id).maybeSingle(),
        db.from('workout_session_logs').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('completed_at', weekStart.toISOString()),
        db.from('activities').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'done').is('session_id', null)
          .not('kind', 'in', '(walk,hike)').gte('started_at', weekStart.toISOString()),
        db.from('program_content').select('unlock_day, part_number').is('archived_at', null).lte('unlock_day', Math.max(day, 0)),
        // Walks: logged as activities (GPS / by hand), or ticked as the plan's walk.
        db.from('activities').select('day').eq('user_id', user.id).eq('status', 'done').in('kind', ['walk', 'hike']).gte('started_at', weekStart.toISOString()),
        db.from('activity_log').select('completed_at').eq('user_id', user.id).eq('activity_type', 'walk').gte('completed_at', ymd(weekStart)),
      ]);
      const w = (weights.data ?? []) as { weight: number; recorded_at: string }[];
      const g = (group.data ?? null) as GroupRow | null;
      let lastMessage: HeaderData['lastMessage'] = null;
      if (g) {
        const { data: m } = await db.from('whatsapp_messages').select('created_at, sender').eq('chat_id', g.chat_id).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (m) lastMessage = { at: m.created_at, sender: m.sender };
      }
      const parts = ((content.data ?? []) as { part_number: number }[]).map((c) => c.part_number).filter((n) => n < 5);
      if (gone) return;
      setData({
        firstWeight: user.initial_weight ?? w[0]?.weight ?? null,
        lastWeight: w[w.length - 1]?.weight ?? user.current_weight ?? null,
        lastWeighIn: w[w.length - 1]?.recorded_at ?? null,
        lastMessage,
        workoutsThisWeek: (sessions.count ?? 0) + (acts.count ?? 0),
        // A walk both logged and ticked counts once (per day).
        walksThisWeek: (() => {
          const logged = ((walkActs.data ?? []) as { day: string }[]).map((a) => a.day);
          const ticked = ((walkTicks.data ?? []) as { completed_at: string }[]).map((t) => t.completed_at.slice(0, 10)).filter((d) => !logged.includes(d));
          return logged.length + new Set(ticked).size;
        })(),
        part: parts.length ? Math.max(...parts) : null,
        group: g,
      });
    })();
    return () => {
      gone = true;
    };
  }, [user, refreshKey]);
  return data;
}

function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'good' | 'muted' }) {
  return (
    <div className="min-w-0 rounded-inner bg-card-inner px-3 py-2.5">
      <p className="truncate text-label text-muted-foreground">{label}</p>
      <p className="truncate text-body font-bold">{value}</p>
      {sub && <p className={cn('truncate text-label', tone === 'good' ? 'text-success' : 'text-muted-foreground')}>{sub}</p>}
    </div>
  );
}

/** Stays at the top while the tabs scroll: who, where they are, and how they're doing. */
export function ClientHeader({ user, data, onClose }: { user: PanelUser; data: HeaderData | null; onClose: () => void }) {
  const day = dayOf(user.start_date);
  const planDays = user.plan_duration_days ?? 280;
  const notStarted = day != null && day < 1;
  const finished = day != null && day > planDays;
  const status = !user.is_active
    ? { label: 'לא פעיל', tone: 'danger' as const }
    : !user.start_date
    ? { label: 'בלי תאריך התחלה', tone: 'neutral' as const }
    : notStarted
    ? { label: 'עוד לא התחיל', tone: 'brand' as const }
    : finished
    ? { label: 'סיים את התוכנית', tone: 'neutral' as const }
    : { label: 'פעיל', tone: 'success' as const };
  const end = user.start_date ? dmy(programEnd(user.start_date, planDays)) : null;
  const line = !user.start_date
    ? `מסלול ${trackLabel(planDays)}`
    : notStarted
    ? `מתחיל ב-${dmy(user.start_date)} (בעוד ${1 - day!} ימים) · מסלול ${trackLabel(planDays)}, מסתיים ב-${end}`
    : `יום ${day} · שבוע ${Math.ceil(day! / 7)}${data?.part ? ` · חלק ${data.part}` : ''} · מסלול ${trackLabel(planDays)}, מסתיים ב-${end}`;
  const bot = botState(data?.group ?? null);
  const change = data?.firstWeight != null && data.lastWeight != null ? +(data.lastWeight - data.firstWeight).toFixed(1) : null;
  const senderLabel: Record<string, string> = { client: 'מהלקוח', coach: 'מאיתנו', bot: 'מהבוט' };

  return (
    <div className="space-y-3 px-6 pb-3 pt-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-[1.5rem] font-extrabold leading-tight">{user.full_name || user.email}</h2>
            <Pill tone={status.tone}>{status.label}</Pill>
            <Pill tone={bot === 'live' ? 'success' : bot === 'draft' ? 'brand' : 'neutral'} icon={Bot}>{BOT_LABEL[bot]}</Pill>
          </div>
          <p className="text-body text-muted-foreground">{line}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="סגירה"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-pill text-muted-foreground hover:bg-card-inner"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="משקל"
          value={
            data?.lastWeight != null ? (
              <span dir="ltr">{data.firstWeight != null && data.firstWeight !== data.lastWeight ? `${data.firstWeight} → ` : ''}{data.lastWeight} ק"ג</span>
            ) : '—'
          }
          sub={
            change != null && change !== 0 ? (
              <span className="inline-flex items-center gap-0.5">
                {change < 0 ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
                {Math.abs(change)} ק"ג מההתחלה
              </span>
            ) : change === 0 ? 'ללא שינוי' : undefined
          }
          tone={change != null && change < 0 ? 'good' : 'muted'}
        />
        <Stat label="שקילה אחרונה" value={data?.lastWeighIn ? ago(data.lastWeighIn) : 'עוד לא נשקל'} sub={data?.lastWeighIn ? dmy(data.lastWeighIn) : undefined} />
        <Stat
          label="הודעה אחרונה בקבוצה"
          value={!data?.group ? 'אין קבוצה' : data.lastMessage ? ago(data.lastMessage.at) : 'אין הודעות'}
          sub={data?.lastMessage ? senderLabel[data.lastMessage.sender] ?? '' : undefined}
        />
        <Stat
          label="השבוע (מיום ראשון)"
          value={
            data ? (
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-primary-soft">{data.workoutsThisWeek === 1 ? 'אימון אחד' : `${data.workoutsThisWeek} אימונים`}</span>
                <span className="text-success">{data.walksThisWeek === 1 ? 'הליכה אחת' : `${data.walksThisWeek} הליכות`}</span>
              </span>
            ) : '—'
          }
          sub={
            data ? (
              <span className="inline-flex items-center gap-2">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-pill bg-primary" />אימון</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-pill bg-success" />הליכה</span>
              </span>
            ) : undefined
          }
        />
      </div>
    </div>
  );
}

/* ── Tab: details ────────────────────────────────────────────────────────── */

interface Form {
  full_name: string;
  phone_number: string;
  age: string;
  gender: string;
  height: string;
  start_date: string;
  plan_duration_days: string;
  is_active: boolean;
}
const formOf = (u: PanelUser): Form => ({
  full_name: u.full_name ?? '',
  phone_number: u.phone_number ?? '',
  age: ageOf(u) != null ? String(ageOf(u)) : '',
  gender: u.gender ?? '',
  height: u.height != null ? String(u.height) : '',
  start_date: u.start_date ?? '',
  plan_duration_days: u.plan_duration_days ? String(u.plan_duration_days) : '',
  is_active: u.is_active,
});

function Field({ label, hint, children, className }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-label font-semibold">{label}</Label>
      {children}
      {hint && <p className="text-label text-muted-foreground">{hint}</p>}
    </div>
  );
}

const nextSaturday = () => {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  return ymd(d);
};

/** Personal details and the process, one save button (sticky, active only when something changed), and the danger zone. */
export function DetailsTab({ user, onSaved }: { user: PanelUser; onSaved: (patch: Partial<PanelUser>) => void }) {
  const [base, setBase] = useState<Form>(() => formOf(user));
  const [form, setForm] = useState<Form>(base);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    const f = formOf(user);
    setBase(f);
    setForm(f);
  }, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(base), [form, base]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    const age = form.age ? Number(form.age) : null;
    const patch: Partial<PanelUser> = {
      full_name: form.full_name.trim() || null,
      phone_number: form.phone_number.trim() || null,
      age,
      // Kept for the screens that still read the birth year.
      birthdate: age ? `${new Date().getFullYear() - age}-01-01` : null,
      gender: form.gender || null,
      height: form.height ? Number(form.height) : null,
      start_date: form.start_date || null,
      ...(form.plan_duration_days ? { plan_duration_days: Number(form.plan_duration_days) } : {}),
      is_active: form.is_active,
    };
    const { error } = await db.from('profiles').update(patch).eq('id', user.id);
    setSaving(false);
    if (error) return toast({ title: 'לא נשמר', description: error.message, variant: 'destructive' });
    setBase(form);
    onSaved(patch);
    toast({ title: 'נשמר' });
  };

  const resetStart = async () => {
    const sat = nextSaturday();
    const { error } = await db.from('profiles').update({ start_date: sat }).eq('id', user.id);
    setConfirmReset(false);
    if (error) return toast({ title: 'לא אופס', description: error.message, variant: 'destructive' });
    setForm((f) => ({ ...f, start_date: sat }));
    setBase((b) => ({ ...b, start_date: sat }));
    onSaved({ start_date: sat });
    toast({ title: 'יום ההתחלה אופס', description: `מתחיל מחדש בשבת ${dmy(sat)}` });
  };

  const day = dayOf(form.start_date || null);
  const isSaturday = form.start_date ? asDate(form.start_date).getDay() === 6 : true;
  const end = form.start_date && form.plan_duration_days ? programEnd(form.start_date, Number(form.plan_duration_days)) : null;
  const sat = nextSaturday();

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 space-y-card-gap px-6 py-5">
        <Card className="space-y-4">
          <SectionHeader title="פרטים אישיים" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="שם מלא" className="sm:col-span-2">
              <Input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
            </Field>
            <Field label="אימייל" hint="שם המשתמש להתחברות. לא משתנה מכאן">
              <Input value={user.email} readOnly dir="ltr" className="cursor-default bg-card-inner text-left" />
            </Field>
            <Field
              label="טלפון"
              hint={
                form.phone_number.trim() ? 'המספר שממנו הלקוח כותב בוואטסאפ' : (
                  <span className="inline-flex items-center gap-1.5 text-primary-soft">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    בלי טלפון הבוט לא יכול לזהות את הלקוח
                  </span>
                )
              }
            >
              <Input dir="ltr" className="text-left" value={form.phone_number} onChange={(e) => set('phone_number', e.target.value)} placeholder="050-000-0000" />
            </Field>
            <Field label="גיל">
              <Input type="number" min={10} max={120} dir="ltr" className="text-left" value={form.age} onChange={(e) => set('age', e.target.value)} placeholder="30" />
            </Field>
            <Field label="מגדר">
              <Select value={form.gender} onValueChange={(v) => set('gender', v)}>
                <SelectTrigger><SelectValue placeholder="בחר" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">זכר</SelectItem>
                  <SelectItem value="female">נקבה</SelectItem>
                  <SelectItem value="other">אחר</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label='גובה (ס"מ)'>
              <Input type="number" dir="ltr" className="text-left" value={form.height} onChange={(e) => set('height', e.target.value)} placeholder="170" />
            </Field>
          </div>
        </Card>

        <Card className="space-y-4">
          <SectionHeader title="תהליך" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="תאריך התחלה"
              hint={!isSaturday ? <span className="text-primary-soft">זה לא יום שבת. השבועות בתוכנית מתחילים בשבת</span> : 'יום 1 של התוכנית. תמיד שבת'}
            >
              <Input type="date" dir="ltr" className="text-left" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
              {day != null && (
                <div>
                  {day > 0 ? (
                    <Pill tone="success">יום {day} בתוכנית</Pill>
                  ) : (
                    <Pill tone="brand">מתחיל בעוד {1 - day} ימים · התוכן נעול עד אז</Pill>
                  )}
                </div>
              )}
            </Field>
            <Field label="מסלול" hint={end ? `מסתיים ביום ו׳ ${dmy(end)} (סוף שבוע ${Math.round(Number(form.plan_duration_days) / 7)})` : 'אורך התוכנית'}>
              <Select value={form.plan_duration_days} onValueChange={(v) => set('plan_duration_days', v)}>
                <SelectTrigger><SelectValue placeholder="בחר מסלול" /></SelectTrigger>
                <SelectContent>
                  {TRACKS.map((t) => <SelectItem key={t.days} value={String(t.days)}>{t.label} ({t.days / 7} שבועות)</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-start justify-between gap-4 rounded-inner bg-card-inner px-4 py-3 sm:col-span-2">
              <div>
                <p className="text-body font-semibold">מתאמן פעיל</p>
                <p className="text-label text-muted-foreground">כבוי = אין גישה לאפליקציה</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => set('is_active', v)} />
            </div>
          </div>
        </Card>

        <section className="space-y-3 rounded-card border-2 border-destructive/30 p-card">
          <h3 className="flex items-center gap-2 text-card-title text-destructive">
            <AlertTriangle className="h-5 w-5" />
            פעולות מסוכנות
          </h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-body font-semibold">איפוס יום ההתחלה</p>
              <p className="text-label text-muted-foreground">הלקוח מתחיל מחדש מיום 1, מהשבת הקרובה ({dmy(sat)})</p>
            </div>
            <Button variant="outline" className="shrink-0 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirmReset(true)}>
              <RotateCcw className="h-4 w-4" />
              איפוס יום התחלה
            </Button>
          </div>
        </section>
      </div>

      {/* One save button, always in reach */}
      <div className="sticky bottom-0 z-10 flex items-center gap-3 border-t border-border bg-card/95 px-6 py-3 backdrop-blur">
        <p className={cn('flex-1 text-label', dirty ? 'font-semibold text-primary-soft' : 'text-muted-foreground')}>
          {dirty ? 'יש שינויים שלא נשמרו' : 'אין שינויים'}
        </p>
        {dirty && (
          <Button variant="ghost" onClick={() => setForm(base)} disabled={saving}>ביטול</Button>
        )}
        <PrimaryButton className="w-auto px-10" disabled={!dirty || saving} onClick={save}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}שמירה
        </PrimaryButton>
      </div>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent dir="rtl" className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>לאפס את יום ההתחלה?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-right">
              <span className="block">
                תאריך ההתחלה יעבור לשבת הקרובה, <b>{dmy(sat)}</b>, והלקוח יחזור ליום 1.
              </span>
              <span className="block">
                עד אז כל התוכן נעול. מאותה שבת הסרטונים וההרגלים ייפתחו מחדש לפי הימים, והבוט לא ישלח לו הודעות יזומות עד ההתחלה.
              </span>
              <span className="block">שקילות, אימונים וצפיות שכבר נרשמו לא נמחקים.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(e) => { e.preventDefault(); void resetStart(); }}>
              כן, לאפס
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── Tab: bot ────────────────────────────────────────────────────────────── */

const NONE = '__none__';

/** The client's WhatsApp group, what the bot does there, and what it knows about them. */
export function BotTab({ userId, onChanged }: { userId: string; onChanged: () => void }) {
  const [groups, setGroups] = useState<{ chat_id: string; name: string }[]>([]);
  const [taken, setTaken] = useState<Map<string, string | null>>(new Map());
  const [mine, setMine] = useState<GroupRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setListError(null);
    const [rows, list] = await Promise.all([
      db.from('whatsapp_groups').select('chat_id, name, user_id, bot_enabled, draft_mode'),
      supabase.functions.invoke('whatsapp-admin', { body: { action: 'list_groups' } }).catch(() => ({ data: null, error: true })),
    ]);
    const all = (rows.data ?? []) as GroupRow[];
    setMine(all.find((g) => g.user_id === userId) ?? null);
    setTaken(new Map(all.map((g) => [g.chat_id, g.user_id])));
    if (list.error || !list.data?.groups) setListError('לא הצלחנו לקבל את רשימת הקבוצות מוואטסאפ. אפשר לנסות "רענון"');
    setGroups((list.data?.groups ?? []) as { chat_id: string; name: string }[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Links the client to a group (or unlinks): the bot starts off, in draft mode. */
  const choose = async (chatId: string) => {
    setSaving(true);
    let error: { message: string } | null = null;
    if (mine) ({ error } = await db.from('whatsapp_groups').update({ user_id: null, bot_enabled: false }).eq('chat_id', mine.chat_id));
    if (!error && chatId !== NONE) {
      const name = groups.find((g) => g.chat_id === chatId)?.name ?? null;
      ({ error } = await db
        .from('whatsapp_groups')
        .upsert({ chat_id: chatId, name, user_id: userId, bot_enabled: false, draft_mode: true }, { onConflict: 'chat_id' }));
    }
    setSaving(false);
    if (error) toast({ title: 'שגיאה', description: error.message, variant: 'destructive' });
    else toast({ title: chatId === NONE ? 'הקבוצה נותקה' : 'הקבוצה קושרה', description: chatId === NONE ? undefined : 'הבוט מתחיל כבוי ובמצב טיוטה' });
    await load();
    onChanged();
  };

  const setFlag = async (key: 'bot_enabled' | 'draft_mode', value: boolean) => {
    if (!mine) return;
    setMine({ ...mine, [key]: value });
    const { error } = await db.from('whatsapp_groups').update({ [key]: value }).eq('chat_id', mine.chat_id);
    if (error) {
      toast({ title: 'שגיאה', description: error.message, variant: 'destructive' });
      await load();
    }
    onChanged();
  };

  const state = botState(mine);
  const explain: Record<BotState, { title: string; text: string; tone: string }> = {
    none: { title: 'אין קבוצה מקושרת', text: 'הבוט לא מחובר ללקוח הזה. קודם מקשרים קבוצה למעלה.', tone: 'bg-card-inner' },
    off: { title: 'כבוי', text: 'הבוט לא עושה כלום בקבוצה הזו.', tone: 'bg-card-inner' },
    draft: { title: 'פעיל + טיוטה', text: 'הבוט מנסח תשובות, אבל הן מגיעות אלינו לאישור לפני שהן נשלחות לקבוצה.', tone: 'bg-primary-tint' },
    live: { title: 'פעיל בלי טיוטה', text: 'הבוט עונה ישר בקבוצה, בלי אישור שלנו.', tone: 'bg-success/10' },
  };

  return (
    <div className="space-y-card-gap px-6 py-5">
      <Card className="space-y-4">
        <SectionHeader
          title="קבוצת וואטסאפ"
          icon={MessageCircle}
          action={{ label: 'רענון', icon: RefreshCw, onClick: () => void load() }}
        />
        {loading ? (
          <div className="flex justify-center py-3"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : (
          <>
            <Select value={mine?.chat_id ?? NONE} onValueChange={(v) => void choose(v)} disabled={saving}>
              <SelectTrigger><SelectValue placeholder="בחירת קבוצה" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>ללא קבוצה</SelectItem>
                {/* Its saved group, even if WhatsApp didn't list it this time */}
                {mine && !groups.some((g) => g.chat_id === mine.chat_id) && (
                  <SelectItem value={mine.chat_id}>{mine.name ?? mine.chat_id}</SelectItem>
                )}
                {groups.map((g) => {
                  const owner = taken.get(g.chat_id);
                  const other = !!owner && owner !== userId;
                  return (
                    <SelectItem key={g.chat_id} value={g.chat_id} disabled={other}>
                      {g.name}{other ? ' (משויכת למתאמן אחר)' : ''}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {listError && <p className="text-label text-destructive">{listError}</p>}
            {!mine && (
              <p className="rounded-inner bg-card-inner px-4 py-3 text-body text-muted-foreground">
                אין קבוצה? פותחים קבוצת וואטסאפ עם הלקוח, מוסיפים אליה את המספר של הבוט, לוחצים "רענון" ובוחרים אותה כאן.
              </p>
            )}
          </>
        )}
      </Card>

      <Card className="space-y-4">
        <SectionHeader title="מה הבוט עושה" icon={Bot} />
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between gap-4 pb-3">
            <div>
              <p className="text-body font-semibold">בוט פעיל</p>
              <p className="text-label text-muted-foreground">הבוט קורא את הקבוצה ומנסח תשובות</p>
            </div>
            <Switch checked={!!mine?.bot_enabled} disabled={!mine} onCheckedChange={(v) => void setFlag('bot_enabled', v)} />
          </div>
          <div className="flex items-center justify-between gap-4 pt-3">
            <div>
              <p className="text-body font-semibold">מצב טיוטה</p>
              <p className="text-label text-muted-foreground">כל תשובה מגיעה אלינו לאישור לפני הקבוצה</p>
            </div>
            <Switch checked={mine?.draft_mode ?? true} disabled={!mine || !mine.bot_enabled} onCheckedChange={(v) => void setFlag('draft_mode', v)} />
          </div>
        </div>
        <div className={cn('rounded-inner px-4 py-3', explain[state].tone)}>
          <p className="text-body font-bold">עכשיו: {explain[state].title}</p>
          <p className="text-body">{explain[state].text}</p>
        </div>
        {!mine && (
          <p className="flex items-center gap-1.5 text-label text-primary-soft">
            <AlertTriangle className="h-4 w-4" />
            אי אפשר להפעיל בוט בלי קבוצה מקושרת
          </p>
        )}
      </Card>

      <ClientProfile userId={userId} />
    </div>
  );
}

/** What the bot knows about the client: written weekly by the bot, editable here. */
function ClientProfile({ userId }: { userId: string }) {
  const [text, setText] = useState('');
  const [saved, setSaved] = useState('');
  const [meta, setMeta] = useState<{ updated_at?: string; edited_at?: string | null; edited_by?: string | null } | null>(null);
  const [editor, setEditor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    db.from('client_profiles').select('profile, updated_at, edited_at, edited_by').eq('user_id', userId).maybeSingle()
      .then(async ({ data }: { data: { profile: string; updated_at: string; edited_at: string | null; edited_by: string | null } | null }) => {
        setText(data?.profile ?? '');
        setSaved(data?.profile ?? '');
        setMeta(data);
        if (data?.edited_by) {
          const { data: p } = await db.from('profiles').select('full_name').eq('id', data.edited_by).maybeSingle();
          setEditor(p?.full_name ?? null);
        }
      });
  }, [userId]);

  const save = async () => {
    setSaving(true);
    const { data: who } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const { error } = await db.from('client_profiles').upsert(
      { user_id: userId, profile: text, edited_by: who.user?.id ?? null, edited_at: now },
      { onConflict: 'user_id' },
    );
    setSaving(false);
    if (error) return toast({ title: 'שגיאה', description: error.message, variant: 'destructive' });
    setSaved(text);
    setMeta((m) => ({ ...m, edited_at: now, edited_by: who.user?.id ?? null }));
    toast({ title: 'נשמר', description: 'העדכון השבועי הבא של הבוט יתחיל מהגרסה שלך' });
  };

  // The latest of the two: the weekly automatic one, or a hand edit.
  const manual = !!meta?.edited_at && (!meta.updated_at || meta.edited_at >= meta.updated_at);
  const last = manual ? meta?.edited_at : meta?.updated_at;
  const when = (d: string) => format(new Date(d), 'd.M.yyyy HH:mm');

  return (
    <Card className="space-y-3">
      <SectionHeader title="מה שאנחנו יודעים על הלקוח" />
      <p className="text-label text-muted-foreground">
        {last
          ? <>עדכון אחרון {when(last)} · {manual ? <>ידני{editor ? ` (${editor})` : ''}</> : 'אוטומטי (העדכון השבועי של הבוט)'}</>
          : 'עוד אין תיק. הבוט כותב אותו במוצאי שבת, אחרי שבוע של שיחות בקבוצה'}
      </p>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={14}
        placeholder="עוד אין תיק. אפשר לכתוב כאן מה שחשוב לבוט לדעת על הלקוח."
        className="text-body leading-relaxed"
      />
      <div className="flex justify-end">
        <PrimaryButton className="w-auto px-8" size="default" onClick={save} disabled={saving || text === saved}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}שמירה
        </PrimaryButton>
      </div>
    </Card>
  );
}
