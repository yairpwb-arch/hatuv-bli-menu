import { useState } from 'react';
import { format } from 'date-fns';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { BottomSheet, SheetActions } from '@/components/ds';
import { UNDO_DAYS } from '@/lib/activityMarks';
import { minutesLabel } from '@/lib/hebrewTime';
import { cn } from '@/lib/utils';
import { WEEKDAY_SHORT } from './WeekCards';

export interface DoneDetails {
  kind: 'walk' | 'workout';
  /** yyyy-MM-dd of the day it counts for. */
  day: string;
  /** When it was ticked / saved. */
  markedAt?: string | null;
  durationMin?: number | null;
  distanceKm?: number | null;
  steps?: number | null;
  /** Sets logged in the workout; > 0 means undoing deletes them. */
  sets?: number;
  difficulty?: string | null;
  manual?: boolean;
  canUndo: boolean;
}

/** Tapping a "done" pill: what was logged, and a way to take it back. */
export function DoneSheet({
  details, onClose, onUndo,
}: {
  details: DoneDetails | null;
  onClose: () => void;
  onUndo: () => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const d = details;
  const date = d ? new Date(`${d.day}T12:00:00`) : null;
  const title = d && date ? `${d.kind === 'walk' ? 'הליכה' : 'אימון'} · יום ${WEEKDAY_SHORT[date.getDay()]} ${format(date, 'd/M')}` : '';

  const rows: [string, string][] = [];
  if (d?.markedAt) rows.push(['שעת הסימון', format(new Date(d.markedAt), 'HH:mm, d/M')]);
  if (d?.durationMin) rows.push(['משך', minutesLabel(Math.round(d.durationMin))]);
  if (d?.distanceKm) rows.push(['מרחק', `${d.distanceKm.toFixed(1)} ק"מ`]);
  if (d?.steps) rows.push(['צעדים', d.steps.toLocaleString('he-IL')]);
  if (d?.sets) rows.push(['סטים', String(d.sets)]);
  if (d?.difficulty) rows.push(['איך היה', d.difficulty === 'easy' ? 'קל' : d.difficulty === 'hard' ? 'קשה' : 'בינוני']);
  if (d?.manual) rows.push(['סומן', 'ידנית']);

  const undo = async () => {
    setBusy(true);
    await onUndo();
    setBusy(false);
    setConfirm(false);
  };

  return (
    <>
      <BottomSheet open={!!d && !confirm} onOpenChange={(o) => !o && onClose()} title={title}>
        {rows.length > 0 && (
          <dl className="mb-5 divide-y divide-border rounded-inner bg-card-inner">
            {rows.map(([k, v]) => (
              <div key={k} className="flex min-h-[44px] items-center justify-between px-4">
                <dt className="text-body text-muted-foreground">{k}</dt>
                <dd className="text-body font-semibold tabular-nums" dir="auto">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {!d?.canUndo && (
          <p className="mb-4 text-label text-muted-foreground">אפשר לבטל סימון עד {UNDO_DAYS} ימים אחורה</p>
        )}
        <SheetActions>
          <Button onClick={onClose}>סגור</Button>
          {d?.canUndo ? (
            <Button variant="outline" disabled={busy} onClick={() => (d.sets ? setConfirm(true) : undo())}>
              בטל סימון
            </Button>
          ) : (
            <span />
          )}
        </SheetActions>
      </BottomSheet>

      {/* A workout with logged sets: those sets go too, so ask first */}
      <AlertDialog open={confirm} onOpenChange={(o) => !o && setConfirm(false)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>לבטל את הסימון?</AlertDialogTitle>
            <AlertDialogDescription>הסטים שתיעדת באימון הזה יימחקו מההיסטוריה. לבטל?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>השאר</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: 'destructive' }))}
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                undo();
              }}
            >
              בטל סימון
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
