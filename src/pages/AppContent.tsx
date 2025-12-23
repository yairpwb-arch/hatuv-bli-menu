import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Lock, Play, Check, Star, FileText, BookOpen } from 'lucide-react';
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

interface GroupedContent {
  [part: number]: {
    [weekRange: string]: ContentItem[];
  };
}

export default function AppContent() {
  const { currentDay, user } = useAuth();
  const [content, setContent] = useState<GroupedContent>({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);

  useEffect(() => {
    const fetchContent = async () => {
      if (!user) return;
      setIsLoading(true);

      // Fetch all content
      const { data: contentData, error: contentError } = await supabase
        .from('program_content')
        .select('*')
        .order('sort_order', { ascending: true });

      if (contentError) {
        console.error('Error fetching content:', contentError);
        setIsLoading(false);
        return;
      }

      // Fetch user's completed content
      const { data: progressData } = await supabase
        .from('content_progress')
        .select('content_id')
        .eq('user_id', user.id);

      const completedIds = new Set(progressData?.map((p) => p.content_id) || []);

      // Process and group content
      const processedContent = (contentData || []).map((item) => ({
        ...item,
        isUnlocked: currentDay >= item.unlock_day,
        isCompleted: completedIds.has(item.id),
        daysUntilUnlock: Math.max(0, item.unlock_day - currentDay),
      }));

      // Group by part and week_range
      const grouped: GroupedContent = {};
      processedContent.forEach((item) => {
        if (!grouped[item.part_number]) {
          grouped[item.part_number] = {};
        }
        if (!grouped[item.part_number][item.week_range]) {
          grouped[item.part_number][item.week_range] = [];
        }
        grouped[item.part_number][item.week_range].push(item);
      });

      setContent(grouped);
      setIsLoading(false);
    };

    fetchContent();
  }, [user, currentDay]);

  const markAsComplete = async (contentId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('content_progress')
      .insert({ user_id: user.id, content_id: contentId });

    if (error && !error.message.includes('duplicate')) {
      toast({
        title: 'שגיאה',
        description: 'לא ניתן לסמן כהושלם',
        variant: 'destructive',
      });
      return;
    }

    // Update local state
    setContent((prev) => {
      const newContent = { ...prev };
      Object.keys(newContent).forEach((part) => {
        Object.keys(newContent[Number(part)]).forEach((week) => {
          newContent[Number(part)][week] = newContent[Number(part)][week].map((item) =>
            item.id === contentId ? { ...item, isCompleted: true } : item
          );
        });
      });
      return newContent;
    });

    if (selectedContent) {
      setSelectedContent({ ...selectedContent, isCompleted: true });
    }

    toast({
      title: 'מעולה!',
      description: 'התוכן סומן כהושלם',
    });
  };

  const partNames: Record<number, string> = {
    1: 'חלק ראשון - יסודות',
    2: 'חלק שני - העמקה',
    3: 'חלק שלישי - אינטגרציה',
  };

  if (isLoading) {
    return (
      <div className="min-h-screen pb-20 pt-4 px-4 space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 pt-4 px-4 space-y-6">
      <div className="animate-slide-up">
        <h2 className="text-2xl font-bold text-foreground">ספריית התכנים</h2>
        <p className="text-muted-foreground">כל התכנים והמשאבים במקום אחד</p>
      </div>

      <ScrollArea className="h-[calc(100vh-180px)]">
        <div className="space-y-6 pb-4">
          {Object.entries(content).map(([part, weeks], partIndex) => (
            <div
              key={part}
              className="animate-slide-up"
              style={{ animationDelay: `${partIndex * 0.1}s` }}
            >
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-bold">{partNames[Number(part)]}</h3>
              </div>

              <div className="space-y-3">
                {Object.entries(weeks as Record<string, ContentItem[]>).map(([weekRange, items]) => (
                  <div key={weekRange} className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground pr-2">
                      {weekRange}
                    </p>
                    
                    {items.map((item: ContentItem) => (
                      <Card
                        key={item.id}
                        className={cn(
                          'transition-all duration-300 cursor-pointer',
                          item.isUnlocked
                            ? 'glass-card hover:shadow-lg hover:border-primary/30'
                            : 'bg-muted/50 border-muted'
                        )}
                        onClick={() => item.isUnlocked && setSelectedContent(item)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            {/* Status Icon */}
                            <div
                              className={cn(
                                'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                                item.isCompleted
                                  ? 'bg-success/20 text-success'
                                  : item.isUnlocked
                                  ? 'gradient-primary text-primary-foreground'
                                  : 'bg-muted text-muted-foreground'
                              )}
                            >
                              {item.isCompleted ? (
                                <Check className="h-5 w-5" />
                              ) : item.isUnlocked ? (
                                <Play className="h-5 w-5" />
                              ) : (
                                <Lock className="h-5 w-5" />
                              )}
                            </div>

                            {/* Content Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4
                                  className={cn(
                                    'font-medium truncate',
                                    !item.isUnlocked && 'text-muted-foreground'
                                  )}
                                >
                                  {item.title}
                                </h4>
                                {item.is_bonus && (
                                  <Badge variant="secondary" className="flex-shrink-0">
                                    <Star className="h-3 w-3 ml-1" />
                                    בונוס
                                  </Badge>
                                )}
                              </div>
                              <p
                                className={cn(
                                  'text-sm truncate',
                                  item.isUnlocked
                                    ? 'text-muted-foreground'
                                    : 'text-muted-foreground/50'
                                )}
                              >
                                {item.isUnlocked
                                  ? item.description || 'לחץ לצפייה'
                                  : `נפתח בעוד ${item.daysUntilUnlock} ימים`}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Content Detail Dialog */}
      <Dialog open={!!selectedContent} onOpenChange={() => setSelectedContent(null)}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedContent && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selectedContent.title}
                  {selectedContent.is_bonus && (
                    <Badge variant="secondary">
                      <Star className="h-3 w-3 ml-1" />
                      בונוס
                    </Badge>
                  )}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 pt-4">
                {/* Video Placeholder */}
                <div className="aspect-video bg-muted rounded-xl flex items-center justify-center">
                  {selectedContent.video_url ? (
                    <div className="text-center">
                      <Play className="h-12 w-12 text-primary mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">לחץ להפעלת הסרטון</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">תוכן טקסטואלי</p>
                    </div>
                  )}
                </div>

                {/* Description */}
                <div>
                  <h4 className="font-medium mb-2">תיאור</h4>
                  <p className="text-muted-foreground">
                    {selectedContent.description || 'אין תיאור זמין'}
                  </p>
                </div>

                {/* Resources */}
                {selectedContent.resource_link && (
                  <div>
                    <h4 className="font-medium mb-2">קבצים להורדה</h4>
                    <Button variant="outline" className="w-full" asChild>
                      <a href={selectedContent.resource_link} target="_blank" rel="noopener noreferrer">
                        <FileText className="h-4 w-4 ml-2" />
                        הורד מדריך PDF
                      </a>
                    </Button>
                  </div>
                )}

                {/* Mark Complete Button */}
                <Button
                  onClick={() => markAsComplete(selectedContent.id)}
                  disabled={selectedContent.isCompleted}
                  className="w-full"
                  variant={selectedContent.isCompleted ? 'secondary' : 'default'}
                >
                  {selectedContent.isCompleted ? (
                    <>
                      <Check className="h-4 w-4 ml-2" />
                      הושלם
                    </>
                  ) : (
                    'סמן כהושלם'
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
