import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import {
  ArrowDown, ArrowUp, BookOpen, CalendarCheck, Camera, ChevronLeft, Dumbbell, Droplets, Flame, Footprints,
  Images, Loader2, Lock, TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useStreak } from '@/hooks/useStreak';
import { useHabits } from '@/hooks/useHabits';
import { useAvatarUpload } from '@/hooks/useAvatarUpload';
import { BottomSheet, Card, Pill, PrimaryButton, SectionHeader, StatTile } from '@/components/ds';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { PhotoGallery } from '@/components/profile/PhotoGallery';
import { DETAIL_FIELDS, DetailEditSheet, type DetailField } from '@/components/profile/DetailEditSheet';
import { PhotoSourceButtons } from '@/components/profile/PhotoSource';
import { MeasurementsCard } from '@/components/profile/MeasurementsCard';
import type { LucideIcon } from 'lucide-react';
import { initials } from '@/lib/initials';
import { opensIn } from '@/lib/hebrewDays';
import { useStepGoal } from '@/hooks/useStepGoal';
import { formatKg, formatNumber } from '@/components/progress/format';
import { cn } from '@/lib/utils';

interface ProfileRow {
  full_name: string | null;
  avatar_url: string | null;
  created_at: string | null;
  initial_weight: number | null;
  target_weight: number | null;
  height: number | null;
  gender: string | null;
  age?: number | null;
  birthdate: string | null;
}

type EditableField = DetailField;

const GENDER_LABELS: Record<string, string> = { male: 'זכר', female: 'נקבה', other: 'אחר' };

function ageOf(p: ProfileRow): number | null {
  if (p.age) return p.age;
  if (!p.birthdate) return null;
  const b = new Date(p.birthdate);
  const now = new Date();
  return now.getFullYear() - b.getFullYear() - (now < new Date(now.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
}

function DetailRow({ icon: Icon, label, value, onEdit }: { icon: LucideIcon; label: string; value: string; onEdit: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex min-h-[52px] w-full items-center gap-3 px-1 text-right"
    >
      <Icon className="h-5 w-5 shrink-0 text-primary" strokeWidth={2} aria-hidden />
      <span className="flex-1 text-body text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 text-body font-semibold">
        {value}
        <ChevronLeft className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
      </span>
    </button>
  );
}

export default function AppProfile() {
  const { user, currentDay, contentDay, currentWeek, planDays, refreshProfile } = useAuth();
  const { goal: stepGoal } = useStepGoal();
  const navigate = useNavigate();
  const { currentStreak, perfectDaysThisMonth } = useStreak(user?.id, currentWeek);
  const today = format(new Date(), 'yyyy-MM-dd');
  const { habits } = useHabits(user?.id, currentDay, today, planDays);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [latestWeight, setLatestWeight] = useState<number | null>(null);
  const [lessons, setLessons] = useState({ done: 0, total: 0 });
  const [part, setPart] = useState<number | null>(null);
  const [nextUnlock, setNextUnlock] = useState<{ title: string; days: number } | null>(null);
  const [plan, setPlan] = useState({ workoutDays: 0, walkDays: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<EditableField | null>(null);
  const [draft, setDraft] = useState('');

  const avatar = useAvatarUpload(user?.id, (url) => {
    setProfile((p) => (p ? { ...p, avatar_url: url } : p));
    refreshProfile();
  });

  const load = useCallback(async () => {
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const [profileRes, weightRes, contentRes, progressRes, workoutRes, walkRes] = await Promise.all([
      db.from('profiles').select('*').eq('id', user.id).single(),
      supabase
        .from('weight_log')
        .select('weight')
        .eq('user_id', user.id)
        .order('recorded_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('program_content').select('id, title, unlock_day, part_number').filter('archived_at', 'is', null).order('unlock_day', { ascending: true }),
      supabase.from('content_progress').select('content_id').eq('user_id', user.id),
      db.from('workout_day_schedule').select('weekday').eq('user_id', user.id),
      db.from('user_walking_schedule').select('day_of_week').eq('user_id', user.id).eq('is_active', true).not('day_of_week', 'is', null),
    ]);

    if (profileRes.data) setProfile(profileRes.data);
    setLatestWeight(weightRes.data?.weight ?? null);

    const content = (contentRes.data || []) as { id: string; title: string; unlock_day: number; part_number: number }[];
    const ids = new Set(content.map((c) => c.id));
    setLessons({
      done: new Set((progressRes.data || []).map((p) => p.content_id).filter((id) => ids.has(id))).size,
      total: content.length,
    });
    const unlocked = content.filter((c) => c.unlock_day <= contentDay);
    // Parts 1–3 are the journey; 5 is the separate habits-basics track.
    const parts = unlocked.map((c) => c.part_number).filter((n) => Number.isFinite(n) && n < 5);
    setPart(parts.length ? Math.max(...parts) : null);
    const next = content.find((c) => c.unlock_day > contentDay);
    setNextUnlock(next ? { title: next.title, days: next.unlock_day - contentDay } : null);

    setPlan({ workoutDays: (workoutRes.data || []).length, walkDays: (walkRes.data || []).length });
    setIsLoading(false);
  }, [user, contentDay]);

  useEffect(() => {
    load();
  }, [load]);

  const water = useMemo(
    () => habits.find((h) => h.icon === 'droplets' || h.name.includes('מים'))?.name ?? null,
    [habits],
  );

  const totalWeeks = Math.ceil(planDays / 7);
  const progress = Math.min(currentDay / planDays, 1);
  const memberSince = profile?.created_at ? format(new Date(profile.created_at), 'LLLL yyyy', { locale: he }) : null;
  const start = profile?.initial_weight ?? null;
  const change = latestWeight != null && start != null ? +(latestWeight - start).toFixed(1) : null;

  const openEdit = (field: EditableField) => {
    if (!profile) return;
    const current =
      field === 'age' ? ageOf(profile) : field === 'gender' ? profile.gender : profile[field];
    setDraft(current != null ? String(current) : '');
    setEditing(field);
  };

  const saveEdit = async (field: EditableField, text: string) => {
    if (!user) return false;
    const value = field === 'gender' ? text || null : text ? Number(text) : null;
    if (field !== 'gender' && value != null && Number.isNaN(value)) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('profiles').update({ [field]: value }).eq('id', user.id);
    if (error) {
      toast.error('לא הצלחנו לשמור');
      return false;
    }
    setProfile((p) => (p ? { ...p, [field]: value } : p));
    toast.success('נשמר');
    return true;
  };

  if (isLoading || !profile) {
    return (
      <div className="min-h-screen space-y-card-gap px-4 pb-24 pt-4">
        <Skeleton className="h-44 rounded-card" />
        <Skeleton className="h-36 rounded-card" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-28 rounded-card" />
          <Skeleton className="h-28 rounded-card" />
          <Skeleton className="h-28 rounded-card" />
        </div>
        <Skeleton className="h-56 rounded-card" />
      </div>
    );
  }

  const age = ageOf(profile);

  return (
    <div className="min-h-screen space-y-card-gap px-4 pb-24 pt-4">
      {/* Who I am */}
      <Card className="flex flex-col items-center gap-3 text-center">
        <div className="relative">
          {/* The whole picture opens the camera / gallery, not only the small button. */}
          <button type="button" onClick={avatar.start} aria-label="הוספת תמונת פרופיל" className="block rounded-full transition-transform active:scale-[0.97]">
            <Avatar className="h-[88px] w-[88px]">
              {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt="" className="object-cover" />}
              <AvatarFallback className="bg-primary-tint text-stat text-primary-soft">{initials(profile.full_name)}</AvatarFallback>
            </Avatar>
          </button>
          <button
            type="button"
            onClick={avatar.start}
            disabled={avatar.isUploading}
            aria-label="החלפת תמונה"
            className="absolute -bottom-1 -left-1 inline-flex h-11 w-11 items-center justify-center rounded-pill border-4 border-card bg-primary text-primary-foreground"
          >
            {avatar.isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" strokeWidth={2} />}
          </button>
          <input ref={avatar.fileInputRef} type="file" accept="image/*" className="hidden" onChange={avatar.onFileChange} />
        </div>
        <div>
          <h2 className="text-screen-title">{profile.full_name || 'הפרופיל שלי'}</h2>
          {memberSince && <p className="text-label text-muted-foreground">חבר מ-{memberSince}</p>}
        </div>
        <Pill tone="brand">שלב {currentWeek}</Pill>
      </Card>

      {/* My journey */}
      <Card className="space-y-3">
        <SectionHeader title="המסע שלי" />
        <p className="text-body font-semibold">
          {part ? `חלק ${part} · ` : ''}שבוע {Math.min(currentWeek, totalWeeks)} מתוך {totalWeeks}
        </p>
        <div className="h-2.5 overflow-hidden rounded-pill bg-card-inner" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-pill bg-primary" style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="text-label text-muted-foreground">יום {currentDay} מתוך {planDays}</p>
        {latestWeight != null && (
          <div className="flex items-center justify-between rounded-inner bg-card-inner px-3 py-3">
            <span className="text-body">משקל אחרון <span className="font-bold tabular-nums">{formatKg(latestWeight)} ק"ג</span></span>
            {change != null && (
              <span className={cn('inline-flex items-center gap-1 text-label font-semibold', change < 0 ? 'text-success' : 'text-muted-foreground')}>
                {change < 0 ? <ArrowDown className="h-4 w-4" strokeWidth={2} /> : change > 0 ? <ArrowUp className="h-4 w-4" strokeWidth={2} /> : null}
                {change === 0 ? 'ללא שינוי' : `${formatKg(Math.abs(change))} ק"ג מההתחלה`}
              </span>
            )}
          </div>
        )}
        {nextUnlock && (
          <div className="flex items-center gap-3 rounded-inner bg-card-inner px-3 py-3">
            <Lock className="h-4 w-4 shrink-0 text-primary-soft" strokeWidth={2} />
            <p className="min-w-0 flex-1 truncate text-body">{nextUnlock.title}</p>
            <span className="shrink-0 text-label font-semibold text-primary-soft">{opensIn(nextUnlock.days)}</span>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <StatTile icon={Flame} value={formatNumber(currentStreak)} label="רצף נוכחי" caption="ימים" />
        <StatTile icon={CalendarCheck} value={formatNumber(perfectDaysThisMonth)} label="ימים מושלמים" caption="החודש" />
        <StatTile icon={BookOpen} value={`${lessons.done}/${lessons.total}`} label="שיעורים" caption="הושלמו" />
      </div>

      {/* My details */}
      <Card className="space-y-1">
        <SectionHeader title="הפרטים שלי" />
        <div className="divide-y divide-border">
          <DetailRow icon={DETAIL_FIELDS.height.icon} label="גובה" value={profile.height ? `${profile.height} ס"מ` : 'להוספה'} onEdit={() => openEdit('height')} />
          <DetailRow icon={DETAIL_FIELDS.target_weight.icon} label="משקל יעד" value={profile.target_weight ? `${formatKg(profile.target_weight)} ק"ג` : 'להוספה'} onEdit={() => openEdit('target_weight')} />
          <DetailRow icon={DETAIL_FIELDS.gender.icon} label="מין" value={profile.gender ? GENDER_LABELS[profile.gender] ?? profile.gender : 'להוספה'} onEdit={() => openEdit('gender')} />
          <DetailRow icon={DETAIL_FIELDS.age.icon} label="גיל" value={age ? String(age) : 'להוספה'} onEdit={() => openEdit('age')} />
        </div>
      </Card>

      {/* My plan */}
      <Card className="space-y-1">
        <SectionHeader title="התוכנית שלי" action={{ label: 'עריכה', onClick: () => navigate('/app/workouts') }} />
        <div className="divide-y divide-border">
          {[
            { icon: Dumbbell, label: 'ימי אימון', value: plan.workoutDays ? `${plan.workoutDays} בשבוע` : 'עוד לא נקבעו' },
            { icon: Footprints, label: 'ימי הליכה', value: plan.walkDays ? `${plan.walkDays} בשבוע` : 'עוד לא נקבעו' },
            { icon: TrendingUp, label: 'יעד צעדים', value: formatNumber(stepGoal) },
            { icon: Droplets, label: 'יעד מים', value: water ?? 'לפי השלב הבא' },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex min-h-[52px] items-center gap-3 px-1">
              <Icon className="h-5 w-5 text-primary" strokeWidth={2} />
              <span className="flex-1 text-body text-muted-foreground">{label}</span>
              <span className="text-body font-semibold">{value}</span>
            </div>
          ))}
        </div>
      </Card>

      {user && <MeasurementsCard userId={user.id} />}

      <PrimaryButton icon={TrendingUp} onClick={() => navigate('/app/progress')}>לדף ההתקדמות</PrimaryButton>

      {/* Photos — the progress screen's "all photos" link lands here */}
      {user && (
        <div id="photos" className="space-y-2">
          <div className="flex items-center gap-2 px-1 text-card-title">
            <Images className="h-5 w-5 text-primary" strokeWidth={2} />
            התמונות שלי
          </div>
          <PhotoGallery userId={user.id} />
        </div>
      )}

      {/* Native photo source sheet */}
      <BottomSheet open={avatar.isPickingSource} onOpenChange={avatar.setIsPickingSource} title="תמונת פרופיל" icon={Camera}>
        <PhotoSourceButtons onPick={avatar.uploadFile} />
      </BottomSheet>

      {/* Edit one detail */}
      <DetailEditSheet field={editing} initial={draft} onClose={() => setEditing(null)} onSave={saveEdit} />
    </div>
  );
}
