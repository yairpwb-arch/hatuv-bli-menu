import { useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import WeeklySurveyModal from '@/components/WeeklySurveyModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Check, Star, ExternalLink, ClipboardList, BookText, FileText, Lock, Map } from 'lucide-react';
import { cn } from '@/lib/utils';
import ContentPath from '@/components/content/ContentPath';
import StageUnlockSplash from '@/components/content/StageUnlockSplash';
import { useContentCelebration } from '@/hooks/useContentCelebration';
import {
  MILESTONE_ID,
  MILESTONE_DAY,
  getNodeVisual,
  getMilestoneVisual,
  type ContentKind,
} from '@/lib/contentPathStyle';

interface ContentItem {
  id: string;
  part_number: number;
  week_range: string;
  unlock_day: number;
  title: string;
  description: string | null;
  video_url: string | null;
  resource_link: string | null;
  is_bonus: boolean;
  content_type?: ContentKind | null;
  /** date gate only — currentDay has reached unlock_day */
  dateUnlocked: boolean;
  /** final gate: dateUnlocked AND the previous stage in the path was completed */
  isUnlocked: boolean;
  isCompleted: boolean;
  daysUntilUnlock: number;
}

const PART_NAMES: Record<number, string> = {
  1: 'חלק 1',
  2: 'חלק 2',
  3: 'חלק 3',
  5: 'הבסיס לשינוי הרגלים',
};

// Stages unlock a WEEK at a time, not one-by-one: everything sharing the same
// week_range opens together once its date has come, as long as the previous
// week's stages are all completed — items within the same week never gate
// each other (no waiting for a sibling video to be marked watched before the
// next one in that same week opens). Re-run this any time completion state
// changes, not just once at fetch time — otherwise finishing a week never
// actually reveals the next one until the page is reloaded.
function applySequentialGate<T extends { week_range: string; dateUnlocked: boolean; isCompleted: boolean }>(
  items: T[]
): (T & { isUnlocked: boolean })[] {
  const result: (T & { isUnlocked: boolean })[] = [];
  let previousWeekCompleted = true;
  let i = 0;
  while (i < items.length) {
    let j = i;
    while (j < items.length && items[j].week_range === items[i].week_range) j++;
    const weekItems = items.slice(i, j);
    for (const item of weekItems) {
      result.push({ ...item, isUnlocked: item.dateUnlocked && previousWeekCompleted });
    }
    previousWeekCompleted = weekItems.every((it) => it.isCompleted);
    i = j;
  }
  return result;
}

export default function AppContent() {
  const { currentDay, currentWeek, user } = useAuth();
  const [allContent, setAllContent] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [snacksBookLink, setSnacksBookLink] = useState('');
  const [surveyOpen, setSurveyOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'path' | 'guides'>('path');

  // Switching views lands on a page that's much shorter than the river path
  // (which can be scrolled far down, e.g. after the boat auto-scrolls to the
  // current stage) — without resetting scroll, the guides grid opens already
  // scrolled near its own bottom instead of starting at its top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [viewMode]);

  useEffect(() => {
    const fetchContent = async () => {
      if (!user) return;
      setIsLoading(true);

      const [contentResult, progressResult, settingsResult] = await Promise.all([
        supabase
          .from('program_content')
          .select('*')
          .order('sort_order', { ascending: true }),
        supabase
          .from('content_progress')
          .select('content_id')
          .eq('user_id', user.id),
        supabase
          .from('app_settings')
          .select('key, value'),
      ]);

      if (contentResult.error) {
        console.error('Error fetching content:', contentResult.error);
        setIsLoading(false);
        return;
      }

      const completedIds = new Set(progressResult.data?.map((p) => p.content_id) || []);

      // Pass 1: date-based gate + completion, in fetched (sort_order) order.
      const withDateGate = (contentResult.data || []).map((item) => ({
        ...item,
        dateUnlocked: currentDay >= item.unlock_day,
        isCompleted: completedIds.has(item.id),
        daysUntilUnlock: Math.max(0, item.unlock_day - currentDay),
      }));

      setAllContent(applySequentialGate(withDateGate) as ContentItem[]);

      // Parse settings
      if (settingsResult.data) {
        settingsResult.data.forEach((s: { key: string; value: string | null }) => {
          if (s.key === 'snacks_book_link') setSnacksBookLink(s.value || '');
        });
      }

      setIsLoading(false);
    };

    fetchContent();
  }, [user, currentDay]);

  // Calculate progress
  const totalContent = allContent.length;
  const completedContent = allContent.filter((item) => item.isCompleted).length;
  const progressPercentage = totalContent > 0 ? Math.round((completedContent / totalContent) * 100) : 0;

  const lastContentCompleted = allContent.length === 0 || allContent[allContent.length - 1].isCompleted;
  const milestoneUnlocked = currentDay >= MILESTONE_DAY && lastContentCompleted;

  // The boat's destination: the next stage that isn't completed yet — even if
  // it's still locked (so the boat waits at the next upcoming stage instead of
  // skipping straight to the final milestone just because nothing is currently
  // unlocked-and-incomplete). Only the milestone once every real stage is done.
  const currentFrontierId = useMemo(() => {
    const next = allContent.find((i) => !i.isCompleted);
    return next ? next.id : MILESTONE_ID;
  }, [allContent]);

  const celebrationItems = useMemo(
    () => [...allContent.map((i) => ({ id: i.id })), { id: MILESTONE_ID }],
    [allContent]
  );
  const celebration = useContentCelebration(celebrationItems, user?.id, allContent.length > 0 ? currentFrontierId : null);

  // What the full-screen splash should show for the celebrated id.
  const splashInfo = useMemo(() => {
    if (!celebration.cardTargetId) return null;
    if (celebration.cardTargetId === MILESTONE_ID) {
      const { Icon, fillClass } = getMilestoneVisual();
      return { title: 'כל הכבוד על סיום התוכנית!', stageLabel: 'סיכום', Icon, fillClass };
    }
    const index = allContent.findIndex((i) => i.id === celebration.cardTargetId);
    if (index === -1) return null;
    const item = allContent[index];
    const { Icon, fillClass } = getNodeVisual(item.content_type ?? (item.video_url ? 'video' : 'content'), item.part_number);
    return { title: item.title, stageLabel: String(index + 1), Icon, fillClass };
  }, [celebration.cardTargetId, allContent]);

  const toggleCompletion = async (contentId: string, isCurrentlyCompleted: boolean) => {
    if (!user) return;

    if (isCurrentlyCompleted) {
      // Remove completion
      const { error } = await supabase
        .from('content_progress')
        .delete()
        .eq('user_id', user.id)
        .eq('content_id', contentId);

      if (error) {
        toast({ title: 'שגיאה', description: 'לא ניתן לבטל סימון', variant: 'destructive' });
        return;
      }

      setAllContent((prev) =>
        applySequentialGate(prev.map((item) => (item.id === contentId ? { ...item, isCompleted: false } : item)))
      );
      toast({ title: 'בוטל', description: 'הסימון בוטל' });
    } else {
      // Add completion
      const { error } = await supabase
        .from('content_progress')
        .insert({ user_id: user.id, content_id: contentId });

      if (error && !error.message.includes('duplicate')) {
        toast({ title: 'שגיאה', description: 'לא ניתן לסמן כהושלם', variant: 'destructive' });
        return;
      }

      setAllContent((prev) =>
        applySequentialGate(prev.map((item) => (item.id === contentId ? { ...item, isCompleted: true } : item)))
      );
      toast({ title: 'מעולה!', description: 'התוכן סומן כהושלם' });
    }

    // Close the detail dialog on any toggle (mark done or undo) so the boat's
    // sail to its new destination is visible instead of hidden behind it.
    if (selectedContent?.id === contentId) {
      setSelectedContent(null);
    }
  };

  const handleWeeklySurveyClick = () => {
    setSurveyOpen(true);
  };

  const handleSnacksBookClick = () => {
    if (snacksBookLink) {
      const trimmed = snacksBookLink.trim();
      // Already has a scheme (https:, mailto:, tel:...) — use as-is. A bare
      // email address becomes mailto: instead of being treated as a domain
      // (e.g. "someone@gmail.com" naively prefixed with "https://" resolves
      // to just gmail.com, landing the trainee on a Gmail login page instead
      // of wherever the admin actually meant to send them).
      const url = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
        ? trimmed
        : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
        ? `mailto:${trimmed}`
        : `https://${trimmed}`;
      if (Capacitor.isNativePlatform()) {
        window.open(url, '_system');
      } else {
        window.open(url, '_blank');
      }
    } else {
      toast({
        title: 'ספר נשנושים',
        description: 'הקישור לספר לא הוגדר עדיין',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen pb-24 pt-4 px-4 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-20 rounded-full" />
          <Skeleton className="h-10 w-24 rounded-full" />
          <Skeleton className="h-10 w-24 rounded-full" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32">
      {/* Sticky header block — header, progress bar, snacks button stay put;
          only the river path underneath actually scrolls. */}
      {/* top offset matches the global AppHeader's real height (56px + its own
          safe-area inset) exactly, so this doesn't slide up underneath it —
          env() keeps it correct on every phone, notched or not. */}
      <div
        className="sticky z-30 bg-background pt-4 px-4 pb-3 space-y-3 border-b border-border/50"
        style={{ top: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }}
      >
        <div className="glass-card p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">ההתקדמות שלך</span>
            <span className="text-sm font-bold text-primary">{progressPercentage}%</span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
          <p className="text-xs text-muted-foreground mt-2">
            {completedContent} מתוך {totalContent} תכנים הושלמו
          </p>
        </div>

        <div className="flex gap-2 animate-fade-in" style={{ animationDelay: '0.12s' }}>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSnacksBookClick}
            className="flex-1 border-accent/30 text-accent hover:bg-accent/10"
          >
            <BookText className="h-4 w-4 ml-2" />
            ספר נשנושים
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode((m) => (m === 'path' ? 'guides' : 'path'))}
            className="flex-1 border-white/30 text-white hover:bg-white/10"
          >
            {viewMode === 'path' ? (
              <>
                <FileText className="h-4 w-4 ml-2" />
                מדריכים
              </>
            ) : (
              <>
                <Map className="h-4 w-4 ml-2" />
                מפת דרכים
              </>
            )}
          </Button>
        </div>
      </div>

      {viewMode === 'path' ? (
        /* Content Path — bleeds to the screen edges, scrolls underneath the sticky header above */
        allContent.length > 0 &&
        celebration.boatStationId && (
          <ContentPath
            allContent={allContent}
            currentDay={currentDay}
            milestoneUnlocked={milestoneUnlocked}
            partNames={PART_NAMES}
            boatStationId={celebration.boatStationId}
            onSelect={setSelectedContent}
          />
        )
      ) : (
        /* Guides grid */
        <div className="px-4 pt-4 grid grid-cols-2 gap-3 animate-fade-in">
          {allContent.filter((item) => item.content_type === 'guide').length === 0 ? (
            <p className="col-span-2 text-center text-muted-foreground py-8">אין מדריכים עדיין</p>
          ) : (
            allContent
              .filter((item) => item.content_type === 'guide')
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={!item.isUnlocked}
                  onClick={() => item.isUnlocked && setSelectedContent(item)}
                  className={cn(
                    'glass-card aspect-square p-3 flex flex-col items-center justify-center gap-2 text-center transition-all',
                    item.isUnlocked ? 'hover:border-primary/40 hover:shadow-md' : 'opacity-70 cursor-not-allowed',
                    item.isUnlocked && item.isCompleted && 'bg-success/5 border-success/20'
                  )}
                >
                  <div
                    className={cn(
                      'w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0',
                      item.isUnlocked ? 'gradient-primary' : 'bg-muted'
                    )}
                  >
                    {item.isUnlocked ? (
                      <FileText className="h-7 w-7 text-primary-foreground" />
                    ) : (
                      <Lock className="h-7 w-7 text-muted-foreground" />
                    )}
                  </div>
                  <p
                    className={cn(
                      'text-sm font-semibold leading-snug line-clamp-2',
                      !item.isUnlocked && 'text-muted-foreground'
                    )}
                  >
                    {item.isUnlocked ? item.title : 'תוכן נעול'}
                  </p>
                  {item.isUnlocked && item.isCompleted && <Check className="h-4 w-4 text-success" />}
                  {!item.isUnlocked && (
                    <p className="text-xs text-muted-foreground">
                      {item.daysUntilUnlock > 0 ? `נפתח בעוד ${item.daysUntilUnlock} ימים` : 'נפתח בקרוב'}
                    </p>
                  )}
                </button>
              ))
          )}
        </div>
      )}

      {/* Full-screen "stage unlocked" splash */}
      {splashInfo && celebration.cardPhase !== 'idle' && (
        <StageUnlockSplash
          title={splashInfo.title}
          stageLabel={splashInfo.stageLabel}
          Icon={splashInfo.Icon}
          fillClass={splashInfo.fillClass}
          phase={celebration.cardPhase}
          onSkip={celebration.skip}
        />
      )}

      {/* Sticky Weekly Survey Button */}
      <div className="fixed left-4 right-4 z-40" style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))' }}>
        <Button
          className="w-full gradient-primary shadow-glow text-primary-foreground font-bold ring-2 ring-primary/40 animate-pulse-glow"
          size="lg"
          onClick={handleWeeklySurveyClick}
        >
          <ClipboardList className="h-5 w-5 ml-2" />
          שאלון מעקב שבועי
        </Button>
      </div>

      {/* Weekly Survey Modal */}
      <WeeklySurveyModal
        open={surveyOpen}
        onClose={() => setSurveyOpen(false)}
        currentWeek={currentWeek}
      />

      {/* Content Detail Dialog */}
      <Dialog open={!!selectedContent} onOpenChange={() => setSelectedContent(null)}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[92vh] overflow-y-auto p-0">
          {selectedContent && (
            <div className="p-6 pt-10 space-y-4">
              {/* Title row */}
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-foreground leading-snug">
                    {selectedContent.title}
                  </h2>
                  {selectedContent.is_bonus && (
                    <Badge variant="outline" className="mt-1 bg-warning/10 text-warning border-warning/30">
                      <Star className="h-3 w-3 ml-1" />
                      בונוס
                    </Badge>
                  )}
                </div>
              </div>

              {/* Direct link button — video or guide */}
              {(selectedContent.video_url || selectedContent.resource_link) && (
                <Button
                  className="w-full gradient-primary text-primary-foreground shadow-glow"
                  size="lg"
                  onClick={() => window.open((selectedContent.video_url || selectedContent.resource_link)!, '_blank')}
                >
                  <ExternalLink className="h-5 w-5 ml-2" />
                  {selectedContent.video_url ? 'פתח סרטון' : 'פתח מדריך'}
                </Button>
              )}

              {selectedContent.description && (
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {selectedContent.description}
                </p>
              )}

              {/* Completion Toggle */}
              <Button
                className={cn('w-full', selectedContent.isCompleted ? 'bg-success hover:bg-success/90' : 'gradient-primary')}
                onClick={() => toggleCompletion(selectedContent.id, selectedContent.isCompleted)}
              >
                <Check className="h-4 w-4 ml-2" />
                {selectedContent.isCompleted ? 'סומן כהושלם - לחץ לביטול' : 'סמן כהושלם'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
