import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { 
  Lock, Play, Check, Star, FileText, BookOpen, 
  ChevronDown, ChevronUp, ExternalLink, ClipboardList, BookText
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  isUnlocked: boolean;
  isCompleted: boolean;
  daysUntilUnlock: number;
}

type TabType = 'all' | 'videos' | 'guides';

const PART_NAMES: Record<number, { title: string; subtitle: string }> = {
  1: { title: 'חלק 1', subtitle: 'בניית היסודות' },
  2: { title: 'חלק 2', subtitle: 'אדפטציה ושדרוג תזונתי' },
  3: { title: 'חלק 3', subtitle: 'הטמעה ושיפור ביצועים' },
};

export default function AppContent() {
  const { currentDay, user } = useAuth();
  const [allContent, setAllContent] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [expandedParts, setExpandedParts] = useState<Set<number>>(new Set([1, 2, 3]));
  const [weeklySurveyLink, setWeeklySurveyLink] = useState('');
  const [snacksBookLink, setSnacksBookLink] = useState('');

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

      const processedContent = (contentResult.data || []).map((item) => ({
        ...item,
        isUnlocked: currentDay >= item.unlock_day,
        isCompleted: completedIds.has(item.id),
        daysUntilUnlock: Math.max(0, item.unlock_day - currentDay),
      }));

      setAllContent(processedContent);

      // Parse settings
      if (settingsResult.data) {
        settingsResult.data.forEach((s: { key: string; value: string | null }) => {
          if (s.key === 'weekly_survey_link') setWeeklySurveyLink(s.value || '');
          if (s.key === 'snacks_book_link') setSnacksBookLink(s.value || '');
        });
      }

      setIsLoading(false);
    };

    fetchContent();
  }, [user, currentDay]);

  // Filter content by type
  const filteredContent = allContent.filter((item) => {
    if (activeTab === 'videos') return item.video_url;
    if (activeTab === 'guides') return !item.video_url;
    return true;
  });

  // Calculate progress
  const totalContent = allContent.length;
  const completedContent = allContent.filter((item) => item.isCompleted).length;
  const progressPercentage = totalContent > 0 ? Math.round((completedContent / totalContent) * 100) : 0;

  // Group content by part and week
  const groupedContent = filteredContent.reduce((acc, item) => {
    if (!acc[item.part_number]) {
      acc[item.part_number] = {};
    }
    if (!acc[item.part_number][item.week_range]) {
      acc[item.part_number][item.week_range] = [];
    }
    acc[item.part_number][item.week_range].push(item);
    return acc;
  }, {} as Record<number, Record<string, ContentItem[]>>);

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
        prev.map((item) => (item.id === contentId ? { ...item, isCompleted: false } : item))
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
        prev.map((item) => (item.id === contentId ? { ...item, isCompleted: true } : item))
      );
      toast({ title: 'מעולה!', description: 'התוכן סומן כהושלם' });
    }

    if (selectedContent?.id === contentId) {
      setSelectedContent((prev) => prev ? { ...prev, isCompleted: !isCurrentlyCompleted } : null);
    }
  };

  const togglePart = (part: number) => {
    setExpandedParts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(part)) {
        newSet.delete(part);
      } else {
        newSet.add(part);
      }
      return newSet;
    });
  };

  const handleWeeklySurveyClick = () => {
    if (weeklySurveyLink) {
      window.open(weeklySurveyLink, '_blank');
    } else {
      toast({
        title: 'שאלון מעקב שבועי',
        description: 'הקישור לשאלון לא הוגדר עדיין',
      });
    }
  };

  const handleSnacksBookClick = () => {
    if (snacksBookLink) {
      window.open(snacksBookLink, '_blank');
    } else {
      toast({
        title: 'ספר נשנושים',
        description: 'הקישור לספר לא הוגדר עדיין',
      });
    }
  };

  const TabButton = ({ value, label }: { value: TabType; label: string }) => (
    <button
      onClick={() => setActiveTab(value)}
      className={cn(
        'px-4 py-2 rounded-full text-sm font-medium transition-all duration-200',
        activeTab === value
          ? 'gradient-primary text-primary-foreground shadow-glow'
          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
      )}
    >
      {label}
    </button>
  );

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
    <div className="min-h-screen pb-32 pt-4 px-4 space-y-5">
      {/* Header */}
      <div className="animate-fade-in">
        <h2 className="text-2xl font-bold text-foreground">חטוב בלי תפריט</h2>
        <p className="text-muted-foreground text-sm">מפת הדרכים שלך להצלחה</p>
      </div>

      {/* Progress Bar */}
      <div className="glass-card p-4 animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">ההתקדמות שלך</span>
          <span className="text-sm font-bold text-primary">{progressPercentage}%</span>
        </div>
        <Progress value={progressPercentage} className="h-2" />
        <p className="text-xs text-muted-foreground mt-2">
          {completedContent} מתוך {totalContent} תכנים הושלמו
        </p>
      </div>

      {/* Quick Action Buttons */}
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
      </div>

      {/* Tabs */}
      <div className="flex gap-2 animate-fade-in" style={{ animationDelay: '0.15s' }}>
        <TabButton value="all" label="הכל" />
        <TabButton value="videos" label="סרטונים" />
        <TabButton value="guides" label="מדריכים" />
      </div>

      {/* Content Roadmap */}
      <div className="space-y-4">
        {[1, 2, 3].map((partNumber, partIndex) => {
          const partContent = groupedContent[partNumber];
          if (!partContent) return null;

          const isExpanded = expandedParts.has(partNumber);
          const partInfo = PART_NAMES[partNumber];

          return (
            <div
              key={partNumber}
              className="animate-fade-in"
              style={{ animationDelay: `${0.2 + partIndex * 0.1}s` }}
            >
              {/* Part Header */}
              <button
                onClick={() => togglePart(partNumber)}
                className="w-full glass-card p-4 flex items-center justify-between hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                    <BookOpen className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div className="text-right">
                    <h3 className="font-bold text-foreground">{partInfo.title}</h3>
                    <p className="text-sm text-muted-foreground">{partInfo.subtitle}</p>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </button>

              {/* Part Content */}
              {isExpanded && (
                <div className="mt-3 space-y-4 pr-2 border-r-2 border-primary/20 mr-5">
                  {Object.entries(partContent).map(([weekRange, items]) => (
                    <div key={weekRange} className="space-y-2">
                      {/* Week Label */}
                      <div className="flex items-center gap-2 pr-4">
                        <div className="w-3 h-3 rounded-full bg-primary/30 -mr-[7px]" />
                        <span className="text-sm font-medium text-muted-foreground">
                          {weekRange}
                        </span>
                      </div>

                      {/* Content Cards */}
                      <div className="space-y-2 pr-4">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className={cn(
                              'glass-card p-3 flex items-center gap-3 transition-all duration-200',
                              item.isUnlocked
                                ? 'cursor-pointer hover:border-primary/40 hover:shadow-md'
                                : 'opacity-60',
                              item.isCompleted && 'bg-success/5 border-success/20'
                            )}
                            onClick={() => item.isUnlocked && setSelectedContent(item)}
                          >
                            {/* Completion Toggle */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (item.isUnlocked) {
                                  toggleCompletion(item.id, item.isCompleted);
                                }
                              }}
                              disabled={!item.isUnlocked}
                              className={cn(
                                'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all',
                                item.isCompleted
                                  ? 'bg-success border-success text-success-foreground'
                                  : item.isUnlocked
                                  ? 'border-border hover:border-primary bg-background'
                                  : 'border-muted bg-muted'
                              )}
                            >
                              {item.isCompleted ? (
                                <Check className="h-4 w-4" />
                              ) : !item.isUnlocked ? (
                                <Lock className="h-3 w-3 text-muted-foreground" />
                              ) : null}
                            </button>

                            {/* Type Icon */}
                            <div
                              className={cn(
                                'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                                item.video_url
                                  ? 'bg-primary/10 text-primary'
                                  : 'bg-accent/10 text-accent'
                              )}
                            >
                              {item.video_url ? (
                                <Play className="h-4 w-4" />
                              ) : (
                                <FileText className="h-4 w-4" />
                              )}
                            </div>

                            {/* Content Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4
                                  className={cn(
                                    'font-medium text-sm truncate',
                                    item.isCompleted && 'text-muted-foreground line-through'
                                  )}
                                >
                                  {item.title}
                                </h4>
                                {item.is_bonus && (
                                  <Badge
                                    variant="outline"
                                    className="flex-shrink-0 bg-warning/10 text-warning border-warning/30 text-xs"
                                  >
                                    <Star className="h-3 w-3 ml-1" />
                                    בונוס
                                  </Badge>
                                )}
                              </div>
                              {!item.isUnlocked && (
                                <p className="text-xs text-muted-foreground">
                                  נפתח בעוד {item.daysUntilUnlock} ימים
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {Object.keys(groupedContent).length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>אין תכנים להצגה בקטגוריה זו</p>
        </div>
      )}

      {/* Sticky Weekly Survey Button */}
      <div className="fixed bottom-20 left-4 right-4 z-40">
        <Button
          className="w-full gradient-primary shadow-glow text-primary-foreground font-medium"
          size="lg"
          onClick={handleWeeklySurveyClick}
        >
          <ClipboardList className="h-5 w-5 ml-2" />
          שאלון מעקב שבועי
        </Button>
      </div>

      {/* Content Detail Dialog */}
      <Dialog open={!!selectedContent} onOpenChange={() => setSelectedContent(null)}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedContent && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-right">
                  {selectedContent.title}
                  {selectedContent.is_bonus && (
                    <Badge
                      variant="outline"
                      className="bg-warning/10 text-warning border-warning/30"
                    >
                      <Star className="h-3 w-3 ml-1" />
                      בונוס
                    </Badge>
                  )}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 pt-4">
                {/* Video Player or Placeholder */}
                {selectedContent.video_url ? (
                  <div className="aspect-video bg-muted rounded-xl overflow-hidden">
                    {selectedContent.video_url.includes('youtube') ||
                    selectedContent.video_url.includes('youtu.be') ? (
                      <iframe
                        src={selectedContent.video_url
                          .replace('watch?v=', 'embed/')
                          .replace('youtu.be/', 'youtube.com/embed/')}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : selectedContent.video_url.includes('vimeo') ? (
                      <iframe
                        src={selectedContent.video_url.replace(
                          'vimeo.com/',
                          'player.vimeo.com/video/'
                        )}
                        className="w-full h-full"
                        allow="autoplay; fullscreen; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <video src={selectedContent.video_url} controls className="w-full h-full" />
                    )}
                  </div>
                ) : (
                  <div className="aspect-video bg-accent/10 rounded-xl flex items-center justify-center">
                    <FileText className="h-16 w-16 text-accent/50" />
                  </div>
                )}

                {/* Description */}
                {selectedContent.description && (
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {selectedContent.description}
                  </p>
                )}

                {/* Resource Link */}
                {selectedContent.resource_link && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => window.open(selectedContent.resource_link!, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 ml-2" />
                    פתח מדריך / קובץ
                  </Button>
                )}

                {/* Completion Toggle */}
                <Button
                  className={cn(
                    'w-full',
                    selectedContent.isCompleted
                      ? 'bg-success hover:bg-success/90'
                      : 'gradient-primary'
                  )}
                  onClick={() => toggleCompletion(selectedContent.id, selectedContent.isCompleted)}
                >
                  {selectedContent.isCompleted ? (
                    <>
                      <Check className="h-4 w-4 ml-2" />
                      סומן כהושלם - לחץ לביטול
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 ml-2" />
                      סמן כהושלם
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
