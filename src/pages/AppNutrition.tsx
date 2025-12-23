import { useEffect, useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Sparkles, Camera, Clock, Loader2, UtensilsCrossed, X, Image as ImageIcon } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

interface NutritionEntry {
  id: string;
  meal_description: string;
  ai_feedback: string | null;
  recorded_at: string;
  image_url: string | null;
}

// Component to handle signed URLs for meal images
function MealImage({ imagePath }: { imagePath: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSignedUrl = async () => {
      try {
        const { data, error } = await supabase.storage
          .from('meal_photos')
          .createSignedUrl(imagePath, 3600); // 1 hour expiry

        if (error) throw error;
        setSignedUrl(data.signedUrl);
      } catch (error) {
        console.error('Error getting signed URL:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSignedUrl();
  }, [imagePath]);

  if (isLoading) {
    return <Skeleton className="aspect-video w-full" />;
  }

  if (!signedUrl) {
    return null;
  }

  return (
    <div className="aspect-video w-full bg-muted">
      <img
        src={signedUrl}
        alt="Meal"
        className="w-full h-full object-cover"
      />
    </div>
  );
}

export default function AppNutrition() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<NutritionEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [mealInput, setMealInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!selectedImage || !user) return null;

    setIsUploading(true);
    try {
      const fileExt = selectedImage.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('meal_photos')
        .upload(fileName, selectedImage);

      if (uploadError) throw uploadError;

      // Return the file path - we'll create signed URLs when displaying
      return fileName;
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: 'שגיאה בהעלאת התמונה',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsUploading(false);
    }
  };


  const addMealWithAI = async () => {
    if (!user || (!mealInput.trim() && !selectedImage)) return;

    setIsAnalyzing(true);

    try {
      // Upload image first if exists
      const imageUrl = await uploadImage();

      // Call AI for analysis
      const response = await supabase.functions.invoke('analyze-meal', {
        body: { meal: mealInput || 'ארוחה מצולמת' },
      });

      const aiFeedback = response.data?.feedback || null;

      // Save to database
      const { data, error } = await supabase
        .from('nutrition_log')
        .insert({
          user_id: user.id,
          meal_description: mealInput || 'ארוחה מצולמת',
          ai_feedback: aiFeedback,
          image_url: imageUrl,
        })
        .select()
        .single();

      if (error) throw error;

      setEntries((prev) => [data, ...prev]);
      setMealInput('');
      clearImage();
      
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

  const formatTime = (dateString: string) => {
    return format(new Date(dateString), 'HH:mm', { locale: he });
  };

  const getMealTypeIcon = (time: string) => {
    const hour = new Date(time).getHours();
    if (hour < 11) return 'ארוחת בוקר';
    if (hour < 15) return 'ארוחת צהריים';
    if (hour < 18) return 'חטיף';
    return 'ארוחת ערב';
  };

  const isSubmitDisabled = (!mealInput.trim() && !selectedImage) || isAnalyzing || isUploading;

  return (
    <div className="min-h-screen pb-24 pt-6 px-4 space-y-6 bg-background">
      {/* Header */}
      <div className="animate-slide-up">
        <h2 className="text-2xl font-bold text-foreground">יומן תזונה</h2>
        <p className="text-muted-foreground text-sm">תעד את הארוחות שלך בקלות</p>
      </div>

      {/* New Meal Input Card */}
      <Card className="card-elevated p-6 animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <div className="space-y-4">
          {/* Image Preview */}
          {imagePreview && (
            <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-muted">
              <img 
                src={imagePreview} 
                alt="Preview" 
                className="w-full h-full object-cover"
              />
              <button
                onClick={clearImage}
                className="absolute top-2 left-2 p-1.5 rounded-full bg-foreground/70 text-background hover:bg-foreground/90 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Dual Input Options */}
          <div className="flex gap-3">
            {/* Camera Button */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isAnalyzing || isUploading}
              className="flex-shrink-0 w-20 h-20 rounded-2xl bg-primary/10 border-2 border-dashed border-primary/30 flex flex-col items-center justify-center gap-1 hover:bg-primary/15 hover:border-primary/50 transition-all disabled:opacity-50"
            >
              {selectedImage ? (
                <ImageIcon className="h-6 w-6 text-primary" />
              ) : (
                <Camera className="h-6 w-6 text-primary" />
              )}
              <span className="text-xs font-medium text-primary">צלם</span>
            </button>

            {/* Text Input */}
            <div className="flex-1">
              <Textarea
                placeholder="ספר לי מה אכלת..."
                value={mealInput}
                onChange={(e) => setMealInput(e.target.value)}
                className="min-h-20 resize-none rounded-xl border-border/50 bg-muted/30 focus:bg-background transition-colors"
              />
            </div>
          </div>

          {/* Submit Button */}
          <Button
            onClick={addMealWithAI}
            disabled={isSubmitDisabled}
            className="w-full h-12 rounded-xl gradient-primary text-base font-semibold shadow-glow hover:shadow-lg transition-all"
          >
            {isAnalyzing || isUploading ? (
              <>
                <Loader2 className="h-5 w-5 ml-2 animate-spin" />
                {isUploading ? 'מעלה תמונה...' : 'מנתח...'}
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5 ml-2" />
                נתח את הארוחה
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Daily Feed */}
      <div className="animate-slide-up" style={{ animationDelay: '0.2s' }}>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-foreground">
          <UtensilsCrossed className="h-5 w-5 text-primary" />
          הארוחות של היום
        </h3>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full rounded-2xl" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <Card className="card-elevated p-8">
            <div className="text-center space-y-3">
              {/* Empty plate illustration */}
              <div className="w-24 h-24 mx-auto rounded-full bg-muted flex items-center justify-center">
                <UtensilsCrossed className="h-10 w-10 text-muted-foreground/50" />
              </div>
              <div>
                <p className="text-lg font-medium text-muted-foreground">הצלחת ריקה עדיין...</p>
                <p className="text-sm text-muted-foreground/70">צלם או תאר את הארוחה הראשונה שלך</p>
              </div>
            </div>
          </Card>
        ) : (
          <ScrollArea className="h-[calc(100vh-480px)]">
            <div className="space-y-4 pb-4">
              {entries.map((entry, index) => (
                <Card
                  key={entry.id}
                  className="card-elevated overflow-hidden animate-fade-in"
                  style={{ animationDelay: `${index * 0.08}s` }}
                >
                  {/* Meal Image */}
                  {entry.image_url && (
                    <MealImage imagePath={entry.image_url} />
                  )}
                  
                  <CardContent className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">{formatTime(entry.recorded_at)}</span>
                        <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded-full">
                          {getMealTypeIcon(entry.recorded_at)}
                        </span>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-foreground font-medium">{entry.meal_description}</p>

                    {/* AI Feedback Bubble */}
                    {entry.ai_feedback && (
                      <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
                        <div className="flex items-start gap-2">
                          <div className="p-1 rounded-full bg-primary/20">
                            <Sparkles className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <p className="text-sm text-foreground/80 leading-relaxed">{entry.ai_feedback}</p>
                        </div>
                      </div>
                    )}
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
