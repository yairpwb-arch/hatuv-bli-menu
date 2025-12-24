import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Scale, Clock, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, differenceInDays, nextFriday } from 'date-fns';
import { he } from 'date-fns/locale';

interface WeighInCardProps {
  userId: string;
  currentWeight: number | null;
  onWeightAdded: () => void;
}

export function WeighInCard({ userId, currentWeight, onWeightAdded }: WeighInCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newWeight, setNewWeight] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const today = new Date();
  const todayDayOfWeek = today.getDay();
  const isFriday = todayDayOfWeek === 5;
  
  // Calculate days until next Friday
  const next = nextFriday(today);
  const daysUntilFriday = isFriday ? 0 : differenceInDays(next, today);

  const handleAddWeight = async () => {
    if (!newWeight) return;
    
    const weightValue = parseFloat(newWeight);
    if (isNaN(weightValue) || weightValue <= 0) {
      toast.error('נא להזין משקל תקין');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const dateString = format(today, 'yyyy-MM-dd');
      
      const { error: logError } = await supabase
        .from('weight_log')
        .insert({
          user_id: userId,
          weight: weightValue,
          recorded_at: dateString,
        });

      if (logError) throw logError;

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ current_weight: weightValue })
        .eq('id', userId);

      if (profileError) throw profileError;

      toast.success('השקילה נוספה בהצלחה');
      setNewWeight('');
      setIsModalOpen(false);
      onWeightAdded();
    } catch (error) {
      console.error('Error adding weight:', error);
      toast.error('שגיאה בהוספת השקילה');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Card className={`glass-card animate-fade-in ${isFriday ? 'border-2 border-primary/50 bg-primary/5' : ''}`}>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isFriday ? 'gradient-primary' : 'bg-muted'}`}>
                <Scale className={`h-6 w-6 ${isFriday ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <h3 className="font-bold">שקילה שבועית</h3>
                {isFriday ? (
                  <p className="text-sm text-primary font-medium">היום יום שקילה! 🎯</p>
                ) : (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    השקילה הבאה בעוד {daysUntilFriday} ימים
                  </p>
                )}
                {currentWeight && (
                  <p className="text-xs text-muted-foreground">
                    משקל אחרון: {currentWeight} ק"ג
                  </p>
                )}
              </div>
            </div>
            
            <Button 
              onClick={() => setIsModalOpen(true)}
              disabled={!isFriday}
              className={isFriday ? 'gradient-primary shadow-glow' : ''}
              variant={isFriday ? 'default' : 'outline'}
            >
              {isFriday ? (
                'הוסף שקילה'
              ) : (
                <>
                  <Lock className="h-4 w-4 ml-1" />
                  נעול
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>שקילה שבועית - יום שישי</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>משקל (ק"ג)</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="לדוגמה: 75.5"
                value={newWeight}
                onChange={(e) => setNewWeight(e.target.value)}
                className="text-lg h-12"
                autoFocus
              />
            </div>
            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
              <p>💡 טיפים לשקילה נכונה:</p>
              <ul className="list-disc list-inside mt-1 space-y-1 text-xs">
                <li>שקלו בבוקר לפני אכילה</li>
                <li>באותו הביגוד</li>
                <li>על אותו משטח</li>
              </ul>
            </div>
            <Button 
              onClick={handleAddWeight} 
              className="w-full gradient-primary"
              disabled={isSubmitting || !newWeight}
            >
              {isSubmitting ? 'שומר...' : 'שמור שקילה'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
