import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowRight, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ds';
import { GuideStory } from '@/components/guides/GuideStory';
import { useTodayPlan } from '@/components/settings/MealTimesGroup';
import { useAuth } from '@/hooks/useAuth';
import { useSleepSchedule } from '@/hooks/useSleepSchedule';
import { supabase } from '@/integrations/supabase/client';
import { applySequentialGate } from '@/lib/contentGate';
import type { ContentItem } from '@/lib/contentModel';
import { openExternalLink } from '@/lib/externalLink';
import { blocksForGender, guideBody, shoppingList } from '@/lib/guideBlocks';
import { guidePages } from '@/lib/guidePages';
import { successHaptic } from '@/lib/native';

type Guide = ContentItem & { body?: unknown };

/** Our shared photo for the guide pages; the app logo until it's uploaded (app_settings.guide_avatar_url). */
const DEFAULT_AVATAR = '/logo.png';

/** /app/guides/meals?meal=<name>: the guide holding the meal pages, opened on that meal (from the calendar). */
const MEALS_GUIDE = 'meals';

/* Where the trainee stopped in each guide (on this device). */
const pageKey = (userId: string, guideId: string) => `guidePage:${userId}:${guideId}`;
function savedPage(userId: string, guideId: string): number {
  try {
    return Number(localStorage.getItem(pageKey(userId, guideId))) || 0;
  } catch {
    return 0;
  }
}
function savePage(userId: string, guideId: string, page: number) {
  try {
    localStorage.setItem(pageKey(userId, guideId), String(page));
  } catch {
    /* storage unavailable: the guide opens from the start next time */
  }
}

/**
 * An in-app guide as a full-screen story. Leaving in the middle and coming back
 * resumes on the same page; reaching the last page marks it read.
 */
export default function AppGuide() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, contentDay: currentDay, profile } = useAuth();
  const [guide, setGuide] = useState<Guide | null>(null);
  const [avatar, setAvatar] = useState(DEFAULT_AVATAR);
  const [snacksBook, setSnacksBook] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const marked = useRef(false);

  // The times the trainee's calendar shows for today's meals, by meal name.
  const { schedule: hours } = useSleepSchedule(user?.id);
  const { plan } = useTodayPlan(user?.id, hours);
  const mealTimes = useMemo(
    () => Object.fromEntries((plan?.moments ?? []).filter((m) => m.kind === 'meal').map((m) => [m.label, format(m.at, 'HH:mm')])),
    [plan],
  );

  const fromCalendar = id === MEALS_GUIDE;
  const mealName = params.get('meal');

  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      setIsLoading(true);
      const [contentRes, progressRes, settingsRes] = await Promise.all([
        supabase.from('program_content').select('*').filter('archived_at', 'is', null).order('sort_order', { ascending: true }),
        supabase.from('content_progress').select('content_id').eq('user_id', user.id),
        supabase.from('app_settings').select('key, value').in('key', ['guide_avatar_url', 'snacks_book_link']),
      ]);
      const done = new Set(progressRes.data?.map((p) => p.content_id) ?? []);
      // The same gate as the content page: a guide opens with its stage.
      const all = applySequentialGate(
        (contentRes.data ?? []).map((item) => ({
          ...item,
          dateUnlocked: currentDay >= item.unlock_day,
          isCompleted: done.has(item.id),
          daysUntilUnlock: Math.max(0, item.unlock_day - currentDay),
        })),
      ) as Guide[];
      const g = fromCalendar
        ? all.find((x) => guideBody(x.body)?.some((b) => b.type === 'meal')) ?? null
        : all.find((x) => x.id === id) ?? null;
      setGuide(g);
      const setting = (key: string) => settingsRes.data?.find((s) => s.key === key)?.value?.trim() || '';
      setAvatar(setting('guide_avatar_url') || DEFAULT_AVATAR);
      setSnacksBook(setting('snacks_book_link'));
      marked.current = !!g?.isCompleted;
      setIsLoading(false);
    })();
  }, [user, id, currentDay, fromCalendar]);

  const gender = (profile as { gender?: string | null } | null)?.gender;
  const pages = useMemo(() => {
    const body = guideBody(guide?.body);
    return body ? guidePages(blocksForGender(body, gender)) : [];
  }, [guide, gender]);

  // A meal tapped in the calendar opens on its own page (the cover if there's none, e.g. "ארוחה קטנה").
  const mealPage = mealName ? Math.max(0, pages.findIndex((p) => p.kind === 'meal' && p.name === mealName)) : null;

  const onPage = useCallback((page: number) => {
    // A look at one meal doesn't move the place the trainee is reading from.
    if (user && guide && !fromCalendar) savePage(user.id, guide.id, page);
  }, [user, guide, fromCalendar]);

  const onLastPage = useCallback(async () => {
    if (!user || !guide || marked.current) return;
    marked.current = true;
    const { error } = await supabase.from('content_progress').insert({ user_id: user.id, content_id: guide.id });
    if (error && !error.message.includes('duplicate')) {
      marked.current = false;
      return;
    }
    successHaptic();
  }, [user, guide]);

  const close = useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/app/content', { replace: true });
  }, [navigate]);

  const backToContent = useCallback(() => {
    // Read to the end: next time it opens from the cover.
    if (user && guide) savePage(user.id, guide.id, 0);
    navigate('/app/content', { replace: true });
  }, [navigate, user, guide]);

  const onLink = useCallback((target: string) => {
    if (target !== 'snacks_book') return;
    if (snacksBook) openExternalLink(snacksBook);
    else toast('הקישור לספר הנשנושים לא הוגדר עדיין');
  }, [snacksBook]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[90] space-y-4 bg-black px-6 pt-16" dir="rtl">
        <Skeleton className="h-[72px] w-[72px] rounded-full" />
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-12 w-1/2" />
      </div>
    );
  }

  if (shoppingList(guide?.body)) return <Navigate to="/app/shopping-list" replace />;

  // From the calendar the meals guide opens by its date alone: whoever has meals there
  // is past its day, even if an earlier stage isn't marked done yet.
  const open = fromCalendar ? guide?.dateUnlocked : guide?.isUnlocked;
  if (!guide || pages.length === 0 || !open) {
    return (
      <div className="px-4 pb-24 pt-4" dir="rtl">
        <button type="button" onClick={close} aria-label="חזרה" className="-mr-2 inline-flex h-11 w-11 items-center justify-center text-foreground">
          <ArrowRight className="h-6 w-6" strokeWidth={2} />
        </button>
        <EmptyState
          icon={Lock}
          title={!guide || pages.length === 0 ? 'המדריך לא נמצא' : 'המדריך עוד נעול'}
          description={!guide || pages.length === 0 ? 'אולי הוא הוסר או עוד לא עלה' : 'הוא ייפתח עם השלב שלו בתוכנית'}
        />
      </div>
    );
  }

  return (
    <GuideStory
      title={guide.title}
      pages={pages}
      avatar={avatar}
      mealTimes={mealTimes}
      startPage={mealPage ?? (user ? savedPage(user.id, guide.id) : 0)}
      onPage={onPage}
      onLastPage={onLastPage}
      onClose={close}
      onBack={backToContent}
      onCta={(to) => navigate(to)}
      onLink={onLink}
    />
  );
}
