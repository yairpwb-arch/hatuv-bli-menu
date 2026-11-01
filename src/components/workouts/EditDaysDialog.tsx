import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { WorkoutPlanDay } from '@/hooks/useWorkoutPlan';
import type { WalkEntry } from '@/hooks/useWeekPlan';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { WEEKDAY_SHORT } from './WeekCards';

function DayPicker({ label, value, onChange }: { label: string; value: number | null; onChange: (d: number | null) => void }) {
  const todayWd = new Date().getDay();
  return (
    <div className="space-y-2">
      <p className="text-body font-semibold">{label}</p>
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {WEEKDAY_SHORT.map((d, wd) => (
          <button
            key={wd}
            type="button"
            role="radio"
            aria-checked={value === wd}
            onClick={() => onChange(value === wd ? null : wd)}
            className={cn(
              'h-11 flex-1 rounded-button text-label font-semibold transition-colors',
              value === wd
                ? 'bg-primary text-primary-foreground'
                : wd === todayWd
                ? 'border border-primary/50 bg-primary-tint text-primary-soft'
                : 'bg-card-inner text-muted-foreground',
            )}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One editor for both the workout days and the walk days. */
export function EditDaysDialog({
  open, onOpenChange, planDays, schedule, walks, onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  planDays: WorkoutPlanDay[];
  schedule: { plan_day_id: string; weekday: number }[];
  walks: WalkEntry[];
  onSave: (workoutDays: Map<string, number | null>, walkDays: Map<string, number | null>) => Promise<void>;
}) {
  const [workoutDraft, setWorkoutDraft] = useState(new Map<string, number | null>());
  const [walkDraft, setWalkDraft] = useState(new Map<string, number | null>());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const byDay = new Map(schedule.map((r) => [r.plan_day_id, r.weekday]));
    setWorkoutDraft(new Map(planDays.map((d) => [d.id, byDay.get(d.id) ?? null])));
    setWalkDraft(new Map(walks.map((w) => [w.id, w.day_of_week])));
  }, [open, planDays, schedule, walks]);

  const save = async () => {
    setSaving(true);
    await onSave(workoutDraft, walkDraft);
    setSaving(false);
    onOpenChange(false);
    toast({ title: 'הימים עודכנו' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[85vh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>עריכת ימים</DialogTitle>
          <DialogDescription>באיזה יום בשבוע כל אימון וכל הליכה. לחיצה נוספת מבטלת.</DialogDescription>
        </DialogHeader>

        <section className="space-y-4">
          <h3 className="text-label font-semibold text-muted-foreground">אימונים</h3>
          {planDays.map((d) => (
            <DayPicker
              key={d.id}
              label={d.name}
              value={workoutDraft.get(d.id) ?? null}
              onChange={(v) => setWorkoutDraft((m) => new Map(m).set(d.id, v))}
            />
          ))}
        </section>

        {walks.length > 0 && (
          <section className="space-y-4 border-t border-border pt-4">
            <h3 className="text-label font-semibold text-muted-foreground">הליכות</h3>
            {walks.map((w) => (
              <DayPicker
                key={w.id}
                label={w.walk_number === 1 ? 'הליכה ראשונה' : 'הליכה שנייה'}
                value={walkDraft.get(w.id) ?? null}
                onChange={(v) => setWalkDraft((m) => new Map(m).set(w.id, v))}
              />
            ))}
          </section>
        )}

        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button onClick={save} disabled={saving}>{saving ? 'שומר...' : 'שמירה'}</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
