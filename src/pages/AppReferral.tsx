import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { CheckCircle2, ChevronRight, Copy, Gift, MessageCircle, Users } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Card, EmptyState, Pill, PrimaryButton, SecondaryButton, SectionHeader } from '@/components/ds';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppLinks } from '@/hooks/useAppLinks';
import { toast } from '@/hooks/use-toast';
import { openExternal } from '@/lib/systemSettings';
import { successHaptic } from '@/lib/native';

interface Referral {
  id: string;
  friend_name: string;
  status: 'pending' | 'contacted' | 'converted';
  created_at: string;
}

const STATUS: Record<Referral['status'], { label: string; tone: 'neutral' | 'brand' | 'success' }> = {
  pending: { label: 'נשלח', tone: 'neutral' },
  contacted: { label: 'בשיחה', tone: 'brand' },
  converted: { label: 'הצטרף', tone: 'success' },
};

const STEPS = ['שולחים לחבר', 'אנחנו מדברים איתו', 'הוא מצטרף ואתם מקבלים את המתנה'];

/** Israeli phone: mobile 05X-XXXXXXX or landline 0X-XXXXXXX, with or without +972. */
function normalizeIsraeliPhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-()]/g, '').replace(/^\+?972/, '0');
  if (/^05\d{8}$/.test(digits)) return digits;
  if (/^0[2-489]\d{7}$/.test(digits)) return digits;
  if (/^07\d{8}$/.test(digits)) return digits;
  return null;
}

export default function AppReferral() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const links = useAppLinks();
  const [referrals, setReferrals] = useState<Referral[] | null>(null);
  const [form, setForm] = useState({ friendName: '', friendPhone: '', notes: '' });
  const [friendKnows, setFriendKnows] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedName, setSubmittedName] = useState<string | null>(null);

  const reward = links?.referral_reward || 'מתנה';
  const code = profile?.referral_code || null;
  const base = links?.public_site_url?.replace(/\/+$/, '');
  const personalLink = base && code ? `${base}/join?ref=${code}` : null;

  const loadReferrals = useCallback(async () => {
    if (!profile?.id) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('referrals')
      .select('id, friend_name, status, created_at')
      .eq('referrer_id', profile.id)
      .order('created_at', { ascending: false });
    setReferrals((data as Referral[]) ?? []);
  }, [profile?.id]);

  useEffect(() => {
    loadReferrals();
  }, [loadReferrals]);

  const shareText = [
    'היי! אני בתהליך "חטוב בלי תפריט" וזה ממש עובד לי.',
    personalLink ? `שווה לך להציץ: ${personalLink}` : code ? `אם תרצה לשמוע פרטים, תגיד להם שהגעת דרכי (קוד ${code})` : '',
  ].filter(Boolean).join('\n');

  const shareWhatsApp = () => openExternal(`https://wa.me/?text=${encodeURIComponent(shareText)}`);

  const copyLink = async () => {
    const text = personalLink ?? shareText;
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: personalLink ? 'הלינק הועתק' : 'ההודעה הועתקה' });
    } catch {
      toast({ title: 'לא הצלחנו להעתיק', variant: 'destructive' });
    }
  };

  const phone = normalizeIsraeliPhone(form.friendPhone);
  const canSubmit = form.friendName.trim().length >= 2 && !!phone && friendKnows && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit || !profile?.id) return;
    setIsSubmitting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('referrals').insert({
      referrer_id: profile.id,
      friend_name: form.friendName.trim(),
      friend_phone: phone,
      notes: form.notes.trim() || null,
      friend_knows: true,
      source: 'form',
    });
    setIsSubmitting(false);
    if (error) {
      console.error('Referral insert error:', error);
      toast({ title: 'שגיאה בשליחה', description: 'נסו שוב', variant: 'destructive' });
      return;
    }
    successHaptic();
    setSubmittedName(form.friendName.trim().split(/\s+/)[0]);
    setForm({ friendName: '', friendPhone: '', notes: '' });
    setFriendKnows(false);
    setPhoneTouched(false);
    loadReferrals();
  };

  const joined = (referrals ?? []).filter((r) => r.status === 'converted').length;

  return (
    <div className="min-h-screen space-y-card-gap px-4 pb-24 pt-4">
      <header className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="חזרה"
          className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-pill text-muted-foreground"
        >
          <ChevronRight className="h-6 w-6" strokeWidth={2} />
        </button>
        <h1 className="text-screen-title">חבר מביא חבר</h1>
      </header>

      {/* Reward */}
      <Card className="space-y-2 border-primary/40 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-pill bg-primary-tint">
          <Gift className="h-7 w-7 text-primary" strokeWidth={2} />
        </span>
        <p className="text-stat text-primary-soft">{reward}</p>
        <p className="text-card-title">על כל חבר שמצטרף</p>
        <p className="text-body text-muted-foreground">מכירים מישהו שמחפש שינוי בלי דיאטה? שלחו לו, ואנחנו נמשיך מכאן.</p>
      </Card>

      {/* How it works */}
      <Card className="space-y-3">
        <SectionHeader title="איך זה עובד" />
        <ol className="grid grid-cols-3 gap-2">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-col items-center gap-2 text-center">
              <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-primary text-body font-bold text-primary-foreground">{i + 1}</span>
              <span className="text-label leading-snug text-muted-foreground">{s}</span>
            </li>
          ))}
        </ol>
      </Card>

      {/* Share */}
      <div className="space-y-2">
        <PrimaryButton icon={MessageCircle} onClick={shareWhatsApp}>שלח לחבר בוואטסאפ</PrimaryButton>
        <SecondaryButton icon={Copy} className="w-full" onClick={copyLink}>
          {personalLink ? 'העתק לינק' : 'העתק הודעה'}
        </SecondaryButton>
        {code && <p className="text-center text-label text-muted-foreground">הקוד האישי שלך: <span className="font-bold tabular-nums text-foreground" dir="ltr">{code}</span></p>}
      </div>

      {/* Leave the friend's details */}
      {submittedName ? (
        <Card className="space-y-3 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-success" strokeWidth={2} />
          <p className="text-card-title">קיבלנו! נחזור ל{submittedName} בקרוב</p>
          <SecondaryButton className="w-full" onClick={() => setSubmittedName(null)}>להפנות חבר נוסף</SecondaryButton>
        </Card>
      ) : (
        <Card className="space-y-4">
          <SectionHeader title="או השאירו לנו את הפרטים של החבר" />
          <div className="space-y-1.5">
            <Label htmlFor="ref-name">שם החבר</Label>
            <Input id="ref-name" value={form.friendName} onChange={(e) => setForm({ ...form, friendName: e.target.value })} className="h-12" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ref-phone">טלפון</Label>
            <Input
              id="ref-phone"
              type="tel"
              inputMode="tel"
              dir="ltr"
              placeholder="050-1234567"
              value={form.friendPhone}
              onChange={(e) => setForm({ ...form, friendPhone: e.target.value })}
              onBlur={() => setPhoneTouched(true)}
              aria-invalid={phoneTouched && !phone}
              className="h-12 text-right"
            />
            {phoneTouched && form.friendPhone && !phone && (
              <p className="text-label text-destructive">מספר טלפון ישראלי, למשל 050-1234567</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ref-notes">הערות (לא חובה)</Label>
            <Textarea id="ref-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
            <Checkbox checked={friendKnows} onCheckedChange={(v) => setFriendKnows(v === true)} className="h-5 w-5" />
            <span className="text-body">החבר יודע שתיצרו איתו קשר</span>
          </label>
          <PrimaryButton onClick={handleSubmit} disabled={!canSubmit}>{isSubmitting ? 'שולח...' : 'שליחה'}</PrimaryButton>
        </Card>
      )}

      {/* My referrals */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-card-title">ההפניות שלי</h3>
          {joined > 0 && <Pill tone="success" icon={Gift}>{joined === 1 ? 'מתנה אחת נצברה' : `${joined} מתנות נצברו`}</Pill>}
        </div>
        {referrals === null ? (
          <div className="space-y-2">
            <Skeleton className="h-14 rounded-inner" />
            <Skeleton className="h-14 rounded-inner" />
          </div>
        ) : referrals.length === 0 ? (
          <EmptyState icon={Users} title="עוד אין הפניות" description="החבר הראשון שתשלחו יופיע כאן, עם הסטטוס שלו" />
        ) : (
          <ul className="space-y-2">
            {referrals.map((r) => (
              <li key={r.id} className="flex min-h-[56px] items-center gap-3 rounded-inner bg-card-inner px-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-semibold">{r.friend_name}</p>
                  <p className="text-label text-muted-foreground">{format(new Date(r.created_at), 'd/M/yy')}</p>
                </div>
                <Pill tone={STATUS[r.status]?.tone ?? 'neutral'}>{STATUS[r.status]?.label ?? r.status}</Pill>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
