import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { BookText, Check, FileText, Lock, Play, ShoppingCart, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, PrimaryButton } from '@/components/ds';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { successHaptic, selectionHaptic } from '@/lib/native';
import { applySequentialGate } from '@/lib/contentGate';
import { inDays, opensIn } from '@/lib/hebrewDays';
import { milestoneDay } from '@/lib/contentPathStyle';
import { ContentItem, PartMeta, buildParts, metaLine } from '@/lib/contentModel';
import { cn } from '@/lib/utils';
import ContentMap, { ContentMapHandle } from '@/components/content/ContentMap';
import ContentCards, { CardsFilter } from '@/components/content/ContentCards';
import { VideoLauncher } from '@/components/content/VideoLauncher';
import { BunnyEmbed } from '@/components/content/BunnyPlayer';
import { bunnyId } from '@/lib/bunny';
import { guideBody, shoppingList } from '@/lib/guideBlocks';
import { openExternalLink } from '@/lib/externalLink';
import { useContentView, ContentView } from '@/hooks/useContentView';
import { useUnlockReveal } from '@/hooks/useUnlockReveal';

/** The global AppHeader's height; the collapsed bar sits right under it. */
const HEADER_TOP = 'calc(3.5rem + var(--app-safe-top))';
const BAR_H = 56;

/** Where "the current point" should land: about the top third, below the bars. */
function anchorY() {
  const header = document.querySelector('header.app-bar')?.getBoundingClientRect().bottom ?? 56;
  return Math.max(window.innerHeight / 3, header + BAR_H + 72);
}

/** Video or guide link → the system app; nothing to open → the details dialog. */
function openLink(item: ContentItem): boolean {
  if (bunnyId(item.video_url)) return false; // played in the app
  const url = item.video_url || item.resource_link;
  if (!url) return false;
  window.open(url, Capacitor.isNativePlatform() ? '_system' : '_blank');
  return true;
}

/** "מפה" / "רשימה" — a text switch next to the page title. */
function ViewToggle({ view, onChange }: { view: ContentView; onChange: (v: ContentView) => void }) {
  return (
    <div role="radiogroup" aria-label="תצוגה" className="flex rounded-pill bg-card-inner p-1">
      {([
        { v: 'map', label: 'מפה' },
        { v: 'cards', label: 'רשימה' },
      ] as const).map(({ v, label }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={view === v}
          onClick={() => onChange(v)}
          className={cn(
            'h-11 min-w-[72px] rounded-pill px-4 text-label font-bold transition-colors',
            view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function AppContent() {
  const { currentDay, user, profile } = useAuth();
  const navigate = useNavigate();
  const [allContent, setAllContent] = useState<ContentItem[]>([]);
  const [partMetas, setPartMetas] = useState<PartMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [snacksBookLink, setSnacksBookLink] = useState('');
  const { view, ready: viewReady, choose } = useContentView(user?.id);
  const [cardsFilter, setCardsFilter] = useState<CardsFilter>('all');
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fetchContent = async () => {
      if (!user) return;
      setIsLoading(true);

      const [contentResult, progressResult, settingsResult, partsResult] = await Promise.all([
        supabase.from('program_content').select('*').filter('archived_at', 'is', null).order('sort_order', { ascending: true }),
        supabase.from('content_progress').select('content_id').eq('user_id', user.id),
        supabase.from('app_settings').select('key, value'),
        // program_parts isn't in the generated types yet; missing table → default names.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('program_parts').select('part_number, name, subtitle'),
      ]);

      if (contentResult.error) {
        console.error('Error fetching content:', contentResult.error);
        setIsLoading(false);
        return;
      }

      const completedIds = new Set(progressResult.data?.map((p) => p.content_id) || []);
      const withDateGate = (contentResult.data || []).map((item) => ({
        ...item,
        dateUnlocked: currentDay >= item.unlock_day,
        isCompleted: completedIds.has(item.id),
        daysUntilUnlock: Math.max(0, item.unlock_day - currentDay),
      }));
      setAllContent(applySequentialGate(withDateGate) as ContentItem[]);
      setPartMetas(((partsResult.data ?? []) as PartMeta[]));

      settingsResult.data?.forEach((s: { key: string; value: string | null }) => {
        if (s.key === 'snacks_book_link') setSnacksBookLink(s.value || '');
      });
      setIsLoading(false);
    };
    fetchContent();
  }, [user, currentDay]);

  // ── Derived ──
  const parts = useMemo(() => buildParts(allContent, partMetas), [allContent, partMetas]);
  const totalContent = allContent.length;
  const completedContent = allContent.filter((i) => i.isCompleted).length;
  const progressPercentage = totalContent > 0 ? Math.round((completedContent / totalContent) * 100) : 0;
  const lastCompleted = allContent.length === 0 || allContent[allContent.length - 1].isCompleted;
  const MILESTONE_DAY = milestoneDay(allContent);
  const finalUnlocked = currentDay >= MILESTONE_DAY && lastCompleted;
  const nextUp = useMemo(() => allContent.find((i) => i.isUnlocked && !i.isCompleted) ?? null, [allContent]);
  const soon = useMemo(() => allContent.find((i) => !i.isUnlocked) ?? null, [allContent]);
  const currentId = nextUp?.id ?? null;
  const lockedNextLabel = !nextUp && soon ? `התוכן הבא נפתח ${soon.daysUntilUnlock > 0 ? inDays(soon.daysUntilUnlock) : 'אחרי השלב הנוכחי'}` : null;

  const unlockedIds = useMemo(() => allContent.filter((i) => i.isUnlocked).map((i) => i.id), [allContent]);
  const completedParts = useMemo(() => parts.filter((p) => p.complete).map((p) => p.number), [parts]);
  const { revealIds, trophyParts } = useUnlockReveal(user?.id, unlockedIds, completedParts, !isLoading && allContent.length > 0);

  // ── Scrolling to points on the map / cards ──
  const viewRef = useRef<ContentMapHandle>(null);
  const scrollToId = useCallback((id: string, behavior: ScrollBehavior) => {
    const y = viewRef.current?.nodeY(id);
    if (y == null) return false;
    window.scrollTo({ top: Math.max(0, y - anchorY()), behavior });
    return true;
  }, []);

  const jumpToCurrent = (behavior: ScrollBehavior = 'smooth') => {
    const id = currentId ?? soon?.id;
    if (!id) return;
    if (scrollToId(id, behavior)) viewRef.current?.spotlight(id);
  };

  // Opening the page lands on the current point (no long animation).
  const landedRef = useRef<string | null>(null);
  useEffect(() => {
    if (isLoading || !viewReady || allContent.length === 0) return;
    const key = `${view}`;
    if (landedRef.current === key) return;
    landedRef.current = key;
    const id = currentId ?? soon?.id;
    if (!id) return;
    // Two frames: the map measures its width, then lays out.
    requestAnimationFrame(() => requestAnimationFrame(() => scrollToId(id, 'auto')));
  }, [isLoading, viewReady, allContent.length, view, currentId, soon, scrollToId]);

  // ── Collapsing header: the bar shows once the full "next up" card is gone ──
  const fullCardRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const el = fullCardRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const header = document.querySelector('header.app-bar')?.getBoundingClientRect().bottom ?? 56;
    const io = new IntersectionObserver(([e]) => setCollapsed(!e.isIntersecting), { rootMargin: `-${Math.round(header)}px 0px 0px 0px` });
    io.observe(el);
    return () => io.disconnect();
  }, [isLoading, currentId, lockedNextLabel]);

  // ── Switching views: a quick fade, landing on the same part ──
  const switchView = (next: ContentView, filter: CardsFilter = 'all') => {
    selectionHaptic();
    setCardsFilter(filter);
    if (next === view) return;
    const anchor = window.scrollY + anchorY();
    const partHere = [...parts].reverse().find((p) => (viewRef.current?.partY(p.number) ?? Infinity) <= anchor)?.number;
    setFading(true);
    window.setTimeout(() => {
      landedRef.current = next; // keep the reading position instead of jumping to "current"
      choose(next);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const y = partHere != null ? viewRef.current?.partY(partHere) : null;
          if (y != null) window.scrollTo({ top: Math.max(0, y - anchorY() + 40), behavior: 'auto' });
          setFading(false);
        }),
      );
    }, 150);
  };

  // An in-app guide opens its own screen; anything else, the details window.
  const selectItem = (item: ContentItem) => {
    if (shoppingList(item.body)) navigate('/app/shopping-list');
    else if (guideBody(item.body)) navigate(`/app/guides/${item.id}`);
    else setSelectedContent(item);
  };

  const openItem = (item: ContentItem) => {
    if (shoppingList(item.body)) return navigate('/app/shopping-list');
    if (guideBody(item.body)) return navigate(`/app/guides/${item.id}`);
    if (bunnyId(item.video_url)) return setSelectedContent(item); // the video plays in the window
    if (!openLink(item)) setSelectedContent(item);
  };

  const toggleCompletion = async (contentId: string, isCurrentlyCompleted: boolean, keepOpen = false) => {
    if (!user) return;
    if (isCurrentlyCompleted) {
      const { error } = await supabase.from('content_progress').delete().eq('user_id', user.id).eq('content_id', contentId);
      if (error) {
        toast.error('לא ניתן לבטל סימון');
        return;
      }
      setAllContent((prev) => applySequentialGate(prev.map((i) => (i.id === contentId ? { ...i, isCompleted: false } : i))));
      toast('הסימון בוטל');
    } else {
      const { error } = await supabase.from('content_progress').insert({ user_id: user.id, content_id: contentId });
      if (error && !error.message.includes('duplicate')) {
        toast.error('לא ניתן לסמן כהושלם');
        return;
      }
      setAllContent((prev) => applySequentialGate(prev.map((i) => (i.id === contentId ? { ...i, isCompleted: true } : i))));
      successHaptic();
      toast('התוכן סומן כהושלם');
    }
    if (keepOpen) setSelectedContent((s) => (s?.id === contentId ? { ...s, isCompleted: !isCurrentlyCompleted } : s));
    else if (selectedContent?.id === contentId) setSelectedContent(null);
  };

  // The button above the map: the same stage, so it opens when that stage does.
  const handleShoppingListClick = () => {
    const item = allContent.find((i) => shoppingList(i.body));
    if (!item) return toast('רשימת הקניות תעלה בקרוב');
    if (!item.isUnlocked) return toast(`רשימת הקניות נפתחת ${item.daysUntilUnlock > 0 ? inDays(item.daysUntilUnlock) : 'אחרי השלב הנוכחי'}`);
    navigate('/app/shopping-list');
  };

  const handleSnacksBookClick = () => {
    if (!snacksBookLink) {
      toast('הקישור לספר הנשנושים לא הוגדר עדיין');
      return;
    }
    openExternalLink(snacksBookLink);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen space-y-card-gap px-4 pb-24 pt-4">
        <Skeleton className="h-8 w-40 rounded-inner" />
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-12 rounded-inner" />
        <Skeleton className="h-36 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    );
  }

  if (allContent.length === 0) {
    return (
      <div className="min-h-screen px-4 pb-24 pt-4">
        <h1 className="text-screen-title">תכנים</h1>
        <p className="mt-6 text-center text-body text-muted-foreground">התכנים של התוכנית יופיעו כאן</p>
      </div>
    );
  }

  const shoppingOpen = !!allContent.find((i) => shoppingList(i.body))?.isUnlocked;
  const nextTitle = nextUp?.title ?? lockedNextLabel;
  const initials = (profile?.full_name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');

  return (
    <div className="min-h-screen pb-[calc(3.5rem+var(--app-safe-bottom)+24px)]">
      {/* ── Full header (scrolls away) ── */}
      <div className="space-y-card-gap px-4 pt-4">
        <div className="flex items-center justify-between">
          <h1 className="text-screen-title">תכנים</h1>
          <ViewToggle view={view} onChange={(v) => switchView(v)} />
        </div>

        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-body font-semibold">ההתקדמות שלך</span>
            <span className="text-body font-bold tabular-nums text-primary">{progressPercentage}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-pill bg-card-inner">
            <div className="h-full rounded-pill bg-primary" style={{ width: `${progressPercentage}%` }} />
          </div>
          <p className="text-label text-muted-foreground">{completedContent} מתוך {totalContent} תכנים הושלמו</p>
        </Card>

        {/* The shopping list shows only once its stage opened; until then the guides take its place. */}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={handleSnacksBookClick}>
            <BookText strokeWidth={2} />
            ספר נשנושים
          </Button>
          {shoppingOpen && (
            <Button variant="outline" onClick={handleShoppingListClick}>
              <ShoppingCart strokeWidth={2} />
              רשימת קניות
            </Button>
          )}
          <Button variant="outline" className={shoppingOpen ? 'col-span-2' : undefined} onClick={() => navigate('/app/guides')}>
            <FileText strokeWidth={2} />
            ספריית מדריכים
          </Button>
        </div>

        {/* Next up — when it scrolls away, the compact bar takes over */}
        <div ref={fullCardRef}>
          {nextUp ? (
            <Card className="space-y-3 border-primary/40">
              <div>
                <p className="text-label font-semibold text-primary-soft">הבא בתור · {metaLine(nextUp)}</p>
                <p className="text-card-title">{nextUp.title}</p>
              </div>
              {nextUp.video_url || nextUp.resource_link ? (
                <VideoLauncher
                  url={(nextUp.video_url || nextUp.resource_link)!}
                  isVideo={!!nextUp.video_url}
                  onPlay={bunnyId(nextUp.video_url) ? () => setSelectedContent(nextUp) : undefined}
                />
              ) : (
                <PrimaryButton onClick={() => selectItem(nextUp)}>{guideBody(nextUp.body) ? 'לקריאה' : 'לפרטים'}</PrimaryButton>
              )}
            </Card>
          ) : lockedNextLabel ? (
            <Card className="flex items-center gap-3">
              <Lock className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={2} />
              <p className="text-body text-muted-foreground">{lockedNextLabel}</p>
            </Card>
          ) : (
            <div className="h-px" />
          )}
        </div>
      </div>

      {/* ── Collapsed bar: one 56px row under the app header ── */}
      <div
        aria-hidden={!collapsed}
        className={cn(
          'fixed inset-x-0 z-30 border-b border-line bg-surface-raised/95 backdrop-blur-md will-change-transform transition-[transform,opacity] duration-200 ease-out',
          collapsed ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-3 opacity-0',
        )}
        style={{ top: HEADER_TOP }}
      >
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <button type="button" tabIndex={collapsed ? 0 : -1} onClick={() => jumpToCurrent()} className="min-w-0 flex-1 text-right" aria-label="הבא בתור: מעבר לנקודה במפה">
            {nextUp ? (
              <>
                <span className="block text-[11px] font-semibold leading-tight text-primary-soft">הבא בתור</span>
                <span className="block truncate text-body font-semibold leading-tight">{nextTitle}</span>
              </>
            ) : (
              <span className="flex items-center gap-1.5 text-label leading-tight text-muted-foreground">
                <Lock className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                <span className="line-clamp-2">{nextTitle}</span>
              </span>
            )}
          </button>
          {nextUp && (
            <button
              type="button"
              tabIndex={collapsed ? 0 : -1}
              onClick={() => openItem(nextUp)}
              aria-label={`פתיחת ${nextUp.title}`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
            >
              <Play className="h-5 w-5" strokeWidth={2} fill="currentColor" />
            </button>
          )}
        </div>
      </div>

      {/* ── Map or cards ── */}
      <div className={cn('pt-4 transition-opacity duration-150', fading ? 'opacity-0' : 'opacity-100')}>
        {view === 'map' ? (
          <ContentMap
            ref={viewRef}
            parts={parts}
            currentId={currentId}
            soonId={soon?.id ?? null}
            revealIds={revealIds}
            trophyParts={trophyParts}
            finalUnlocked={finalUnlocked}
            finalOpensLabel={currentDay < MILESTONE_DAY ? opensIn(MILESTONE_DAY - currentDay) : 'נפתח אחרי סיום התכנים'}
            initials={initials}
            onSelect={selectItem}
          />
        ) : (
          <ContentCards
            ref={viewRef}
            parts={parts}
            currentId={currentId}
            soonId={soon?.id ?? null}
            initialFilter={cardsFilter}
            currentDay={currentDay}
            onSelect={selectItem}
            onOpen={openItem}
          />
        )}
      </div>

      {/* ── Content details ── */}
      <Dialog open={!!selectedContent} onOpenChange={() => setSelectedContent(null)}>
        <DialogContent dir="rtl" className="max-h-[92vh] max-w-lg overflow-y-auto p-0">
          {selectedContent && (
            <div className="space-y-4 p-6 pt-10">
              <div>
                <p className="text-label font-semibold text-muted-foreground">{metaLine(selectedContent)}</p>
                <h2 className="text-card-title leading-snug">{selectedContent.title}</h2>
                {selectedContent.is_bonus && (
                  <Badge variant="outline" className="mt-1 border-primary/30 bg-primary-tint text-primary-soft">
                    <Star className="ml-1 h-3 w-3" />
                    בונוס
                  </Badge>
                )}
              </div>
              {bunnyId(selectedContent.video_url) && user && (
                <BunnyEmbed
                  videoId={bunnyId(selectedContent.video_url)!}
                  userId={user.id}
                  title={selectedContent.title}
                  className="rounded-lg"
                  onEnded={() => {
                    // Watched to the end: marked "נצפה" (completed) automatically, the window stays open.
                    if (!selectedContent.isCompleted) toggleCompletion(selectedContent.id, false, true);
                  }}
                />
              )}
              {selectedContent.description && (
                <p className="text-body leading-relaxed text-muted-foreground">{selectedContent.description}</p>
              )}
              {/* Two actions side by side: open it, and mark it done */}
              <div className="grid grid-cols-2 gap-3">
                {!bunnyId(selectedContent.video_url) && (selectedContent.video_url || selectedContent.resource_link) ? (
                  <VideoLauncher
                    url={(selectedContent.video_url || selectedContent.resource_link)!}
                    isVideo={!!selectedContent.video_url}
                    label={selectedContent.video_url ? 'צפייה' : 'פתיחה'}
                    className="h-12 text-[15px]"
                  />
                ) : (
                  <Button variant="outline" onClick={() => setSelectedContent(null)}>סגירה</Button>
                )}
                <Button
                  variant={selectedContent.isCompleted || (!bunnyId(selectedContent.video_url) && (selectedContent.video_url || selectedContent.resource_link)) ? 'outline' : 'default'}
                  onClick={() => toggleCompletion(selectedContent.id, selectedContent.isCompleted)}
                >
                  <Check strokeWidth={2} />
                  {selectedContent.isCompleted ? 'בטל השלמה' : 'סמן כהושלם'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
