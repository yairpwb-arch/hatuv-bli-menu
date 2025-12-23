import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Sparkles, Plus, Apple, Clock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

interface NutritionEntry {
  id: string;
  meal_description: string;
  ai_feedback: string | null;
  recorded_at: string;
}

export default function AppNutrition() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<NutritionEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mealInput, setMealInput] = useState('');

  useEffect(() => {
    const fetchEntries = async () => {
      if (!user) return;
      setIsLoading(true);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('nutrition_log')
        .select('*')
        .eq('user_id', user.id)
        .gte('recorded_at', today.toISOString())
        .order('recorded_at', { ascending: false });

      if (error) {
        console.error('Error fetching nutrition entries:', error);
      } else {
        setEntries(data || []);
      }
      setIsLoading(false);
    };

    fetchEntries();
  }, [user]);

  const addMealWithAI = async () => {
    if (!user || !mealInput.trim()) return;

    setIsAnalyzing(true);

    try {
      // Call AI for analysis
      const response = await supabase.functions.invoke('analyze-meal', {
        body: { meal: mealInput },
      });

      const aiFeedback = response.data?.feedback || null;

      // Save to database
      const { data, error } = await supabase
        .from('nutrition_log')
        .insert({
          user_id: user.id,
          meal_description: mealInput,
          ai_feedback: aiFeedback,
        })
        .select()
        .single();

      if (error) throw error;

      setEntries((prev) => [data, ...prev]);
      setMealInput('');
      
      toast({
        title: 'נשמר!',
        description: 'הארוחה נוספה ביומן',
      });
    } catch (error) {
      console.error('Error adding meal:', error);
      toast({
        title: 'שגיאה',
        description: 'לא ניתן להוסיף את הארוחה',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const addMealManual = async () => {
    if (!user || !mealInput.trim()) return;

    try {
      const { data, error } = await supabase
        .from('nutrition_log')
        .insert({
          user_id: user.id,
          meal_description: mealInput,
        })
        .select()
        .single();

      if (error) throw error;

      setEntries((prev) => [data, ...prev]);
      setMealInput('');
      
      toast({
        title: 'נשמר!',
        description: 'הארוחה נוספה ביומן',
      });
    } catch (error) {
      console.error('Error adding meal:', error);
      toast({
        title: 'שגיאה',
        description: 'לא ניתן להוסיף את הארוחה',
        variant: 'destructive',
      });
    }
  };

  const formatTime = (dateString: string) => {
    return format(new Date(dateString), 'HH:mm', { locale: he });
  };

  return (
    <div className="min-h-screen pb-20 pt-4 px-4 space-y-4">
      <div className="animate-slide-up">
        <h2 className="text-2xl font-bold text-foreground">יומן תזונה</h2>
        <p className="text-muted-foreground">תעד את הארוחות שלך (ללא ספירת קלוריות!)</p>
      </div>

      {/* Input Card */}
      <Card className="glass-card animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <CardContent className="pt-4 space-y-4">
          <Textarea
            placeholder="ספר לי מה אכלת... (למשל: חביתה עם סלט וטחינה)"
            value={mealInput}
            onChange={(e) => setMealInput(e.target.value)}
            className="min-h-24 resize-none"
          />
          
          <div className="flex gap-2">
            <Button
              onClick={addMealWithAI}
              disabled={!mealInput.trim() || isAnalyzing}
              className="flex-1 gradient-primary"
            >
              {isAnalyzing ? (
                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 ml-2" />
              )}
              ניתוח AI
            </Button>
            <Button
              onClick={addMealManual}
              disabled={!mealInput.trim() || isAnalyzing}
              variant="outline"
            >
              <Plus className="h-4 w-4 ml-2" />
              הוסף
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Today's Entries */}
      <div className="animate-slide-up" style={{ animationDelay: '0.2s' }}>
        <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
          <Apple className="h-5 w-5 text-primary" />
          הארוחות של היום
        </h3>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="py-8 text-center">
              <Apple className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">עדיין לא הוספת ארוחות היום</p>
              <p className="text-sm text-muted-foreground">התחל לתעד את מה שאתה אוכל</p>
            </CardContent>
          </Card>
        ) : (
          <ScrollArea className="h-[calc(100vh-420px)]">
            <div className="space-y-3 pb-4">
              {entries.map((entry, index) => (
                <Card
                  key={entry.id}
                  className="glass-card animate-fade-in"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Apple className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-medium">{entry.meal_description}</p>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTime(entry.recorded_at)}
                          </span>
                        </div>
                        {entry.ai_feedback && (
                          <div className="mt-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                            <div className="flex items-start gap-2">
                              <Sparkles className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                              <p className="text-sm text-foreground/80">{entry.ai_feedback}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
