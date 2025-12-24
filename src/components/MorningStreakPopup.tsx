import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Flame } from 'lucide-react';

interface MorningStreakPopupProps {
  streak: number;
  isLoading: boolean;
}

const STREAK_POPUP_KEY = 'lastStreakPopupDate';

export function MorningStreakPopup({ streak, isLoading }: MorningStreakPopupProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    const today = new Date().toISOString().split('T')[0];
    const lastPopupDate = localStorage.getItem(STREAK_POPUP_KEY);
    const hour = new Date().getHours();

    // Show popup only in the morning (before noon) and if not shown today
    if (hour < 12 && lastPopupDate !== today && streak > 0) {
      setOpen(true);
      localStorage.setItem(STREAK_POPUP_KEY, today);
    }
  }, [isLoading, streak]);

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent dir="rtl" className="sm:max-w-md text-center">
        <DialogHeader className="space-y-4">
          <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-warning to-destructive flex items-center justify-center animate-pulse">
            <Flame className="h-10 w-10 text-white" />
          </div>
          <DialogTitle className="text-2xl">בוקר טוב! ☀️</DialogTitle>
          <DialogDescription className="text-lg">
            אתה ב-<span className="font-bold text-warning text-xl">{streak}</span> ימים של רצף התמדה.
            <br />
            <span className="text-foreground font-medium">אל תשבור אותו היום!</span>
          </DialogDescription>
        </DialogHeader>
        <Button onClick={handleClose} className="w-full mt-4">
          בוא נתחיל! 💪
        </Button>
      </DialogContent>
    </Dialog>
  );
}