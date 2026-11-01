import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { ArrowRight, Check, Lock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { BottomSheet, EmptyState } from '@/components/ds';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { applySequentialGate } from '@/lib/contentGate';
import { ContentItem, kindOf } from '@/lib/contentModel';
import { GUIDE_CATEGORIES, GuideCategory, bareTitle, guideCategory, guideIcon } from '@/lib/guideTopics';
import { selectionHaptic } from '@/lib/native';
import { cn } from '@/lib/utils';
import { inDays } from '@/lib/hebrewDays';
import { guideBody } from '@/lib/guideBlocks';

type Guide = ContentItem & { category?: string | null };

/** "נפתח בעוד 9 ימים" — or after the current stage when the day already came. */
const opensOn = (g: Guide) =>
  g.daysUntilUnlock > 0 ? `נפתח ${inDays(g.daysUntilUnlock)}` : 'נפתח אחרי השלב הנוכחי';

/** A guide that hasn't opened keeps its name to itself. */
const LOCKED_TITLE = 'מדריך נעול';

const countLabel = (n: number) => (n === 1 ? 'מדריך אחד זמין' : `${n} מדריכים זמינים`);

/** The guides library: a full screen of big cards, filtered by topic. */
export default function AppGuides() {
  const navigate = useNavigate();
  const { user, currentDay } = useAuth();
  const [guides, setGuides] = useState<Guide[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [topic, setTopic] = useState<GuideCategory | 'all'>('all');
  const [details, setDetails] = useState<Guide | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setIsLoading(true);
      const [contentRes, progressRes] = await Promise.all([
        supabase.from('program_content').select('*').filter('archived_at', 'is', null).order('sort_order', { ascending: true }),
        supabase.from('content_progress').select('content_id').eq('user_id', user.id),
      ]);
      const done = new Set(progressRes.data?.map((p) => p.content_id) ?? []);
      // The gate runs over the whole path (a guide opens with its week), then guides are picked.
      const all = applySequentialGate(
        (contentRes.data ?? []).map((item) => ({
          ...item,
          dateUnlocked: currentDay >= item.unlock_day,
          isCompleted: done.has(item.id),
          daysUntilUnlock: Math.max(0, item.unlock_day - currentDay),
        })),
      ) as Guide[];
      setGuides(all.filter((g) => kindOf(g) === 'guide'));
      setIsLoading(false);
    })();
  }, [user, currentDay]);

  // New (open, not read yet) → read → locked by opening day.
  const sorted = useMemo(() => {
    const rank = (g: Guide) => (!g.isUnlocked ? 2 : g.isCompleted ? 1 : 0);
    return guides
      .filter((g) => topic === 'all' || guideCategory(g) === topic)
      .sort((a, b) => rank(a) - rank(b) || a.unlock_day - b.unlock_day);
  }, [guides, topic]);
  const available = guides.filter((g) => g.isUnlocked).length;

  const markRead = async (g: Guide) => {
    if (!user || g.isCompleted) return;
    const { error } = await supabase.from('content_progress').insert({ user_id: user.id, content_id: g.id });
    if (error && !error.message.includes('duplicate')) return;
    setGuides((prev) => prev.map((x) => (x.id === g.id ? { ...x, isCompleted: true } : x)));
  };

  const open = (g: Guide) => {
    if (!g.isUnlocked) return;
    selectionHaptic();
    if (guideBody(g.body)) return navigate(`/app/guides/${g.id}`); // an in-app guide
    const url = g.resource_link || g.video_url;
    if (url) window.open(url, Capacitor.isNativePlatform() ? '_system' : '_blank');
    else setDetails(g);
    markRead(g);
  };

  return (
    <div className="min-h-screen px-4 pb-24 pt-2" dir="rtl">
      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label="חזרה"
        className="-mr-2 inline-flex h-11 w-11 items-center justify-center text-foreground"
      >
        <ArrowRight className="h-6 w-6" strokeWidth={2} />
      </button>
      <h1 className="text-screen-title">ספריית מדריכים</h1>
      <p className="text-body text-muted-foreground">{isLoading ? ' ' : countLabel(available)}</p>

      <div role="radiogroup" aria-label="נושא" className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {GUIDE_CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={topic === c.value}
            onClick={() => setTopic(c.value)}
            className={cn(
              'relative h-9 shrink-0 rounded-pill px-4 text-label font-semibold transition-colors after:absolute after:inset-x-0 after:-inset-y-1 after:content-[""]',
              topic === c.value ? 'bg-primary text-primary-foreground' : 'bg-card-inner text-muted-foreground',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="mt-4 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="aspect-[1/1.1] rounded-[20px]" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={Lock} title="אין מדריכים בנושא הזה" description="אפשר לבחור נושא אחר" />
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
          {sorted.map((g) => {
            const Icon = guideIcon(g);
            const locked = !g.isUnlocked;
            const isNew = !locked && !g.isCompleted;
            return (
              <li key={g.id}>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => open(g)}
                  aria-label={locked ? `${LOCKED_TITLE}, ${opensOn(g)}` : `${bareTitle(g.title)}${g.isCompleted ? ', נקרא' : ', חדש'}`}
                  className={cn(
                    'relative flex aspect-[1/1.1] w-full flex-col items-start rounded-[20px] border border-[#26262D] bg-[#17171C] p-4 text-right',
                    locked && 'opacity-50',
                  )}
                >
                  {isNew && (
                    <span className="absolute left-3 top-3 rounded-pill bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">חדש</span>
                  )}
                  {g.isCompleted && (
                    <span className="absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-success/15" aria-hidden>
                      <Check className="h-3.5 w-3.5 text-success" strokeWidth={3} />
                    </span>
                  )}
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#22160C] text-primary">
                    {locked ? <Lock className="h-8 w-8 text-muted-foreground" strokeWidth={2} /> : <Icon className="h-10 w-10" strokeWidth={1.75} />}
                  </span>
                  <span className="mt-auto line-clamp-2 text-[16px] font-bold leading-snug text-foreground">{locked ? LOCKED_TITLE : bareTitle(g.title)}</span>
                  <span className="mt-1 text-label text-muted-foreground">
                    {locked ? opensOn(g) : g.duration_minutes ? `${g.duration_minutes} דק' קריאה` : 'מדריך'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* A guide without a link: its text in a sheet */}
      <BottomSheet open={!!details} onOpenChange={(o) => !o && setDetails(null)} title={details ? bareTitle(details.title) : ''}>
        <p className="whitespace-pre-line pb-4 text-body text-muted-foreground">{details?.description || 'התוכן יעלה בקרוב'}</p>
      </BottomSheet>
    </div>
  );
}
