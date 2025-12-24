import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ProfileData {
  full_name: string | null;
  height: number | null;
  target_weight: number | null;
  birthdate: string | null;
}

interface EditProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  initialData: ProfileData;
  onUpdate: () => void;
}

export function EditProfileModal({
  open,
  onOpenChange,
  userId,
  initialData,
  onUpdate,
}: EditProfileModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    height: '',
    targetWeight: '',
    birthdate: '',
  });

  useEffect(() => {
    if (open) {
      setFormData({
        fullName: initialData.full_name || '',
        height: initialData.height?.toString() || '',
        targetWeight: initialData.target_weight?.toString() || '',
        birthdate: initialData.birthdate || '',
      });
    }
  }, [open, initialData]);

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      const updateData: Record<string, unknown> = {
        full_name: formData.fullName || null,
        height: formData.height ? parseFloat(formData.height) : null,
        target_weight: formData.targetWeight ? parseFloat(formData.targetWeight) : null,
        birthdate: formData.birthdate || null,
      };

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', userId);

      if (error) throw error;

      toast.success('הפרופיל עודכן בהצלחה');
      onUpdate();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('שגיאה בעדכון הפרופיל');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>עריכת פרופיל</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>שם מלא</Label>
            <Input
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              placeholder="ישראל ישראלי"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>גובה (ס"מ)</Label>
              <Input
                type="number"
                value={formData.height}
                onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                placeholder="170"
              />
            </div>
            <div className="space-y-2">
              <Label>משקל יעד (ק"ג)</Label>
              <Input
                type="number"
                step="0.1"
                value={formData.targetWeight}
                onChange={(e) => setFormData({ ...formData, targetWeight: e.target.value })}
                placeholder="70"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>תאריך לידה</Label>
            <Input
              type="date"
              value={formData.birthdate}
              onChange={(e) => setFormData({ ...formData, birthdate: e.target.value })}
            />
          </div>

          <Button 
            onClick={handleSubmit} 
            className="w-full gradient-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'שומר...' : 'שמור שינויים'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
