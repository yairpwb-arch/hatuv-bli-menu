import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, format } from 'date-fns';
import { Apple, Check, ChevronLeft, Dumbbell, Footprints, Moon, Plus, CalendarDays, Lock, Sun, Utensils, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { eatStyle } from '@/lib/eventStyle';
import { Card } from '@/components/ds';
import { Skeleton } from '@/components/ui/skeleton';
import { EventEditor } from '@/components/calendar/EventEditor';
import { CalEvent, EventType, eventDay, useCalendar } from '@/hooks/useCalendar';
import { successHaptic } from '@/lib/native';
import { showUndo } from '@/lib/undoToast';

const DONE_MESSAGE: Partial<Record<EventType, string>> = {
  walk: 'ההליכה סומנה כבוצעה',
  workout: 'האימון סומן כבוצע',
};
import { cn } from '@/lib/utils';

const ICONS: Record<EventType, LucideIcon> = {
  walk: Footprints,
  workout: Dumbbell,
  meal: Apple,
  sleep: Moon,
  wake: Sun,
  eat_start: Utensils,
  eat_stop: UtensilsCrossed,
  other: CalendarDays,
};

const MAX_ITEMS = 4;

/** "What's on today": the next few events, with a done button on past ones. */
export function TodayAgenda({ userId, onChanged }: { userId: string; onChanged?: () => void }) {
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const cal = useCalendar(userId, today, addDays(today, 1));
  const [isAdding, setIsAdding] = useState(false);
  // Items ticked in this visit stay visible (with a check) instead of vanishing.
  const [justDone, setJustDone] = useState<Set<string>>(new Set());

  const todayKey = format(today, 'yyyy-MM-dd');
  const now = Date.now();
  // Today's open items, then tomorrow's, so the card never goes empty late
  // in the evening.
  // From the sleep hours: today's wake-up (until it passes) and tonight's bedtime — never tomorrow's.
  const keepSleep = (e: CalEvent) =>
    eventDay(e) === todayKey && (e.type === 'sleep' || e.start.getTime() > now);
  // Timed habits (eating window, meals): today's, until their time passes.
  const keepHabit = (e: CalEvent) => eventDay(e) === todayKey && e.start.getTime() > now;
  const items = cal.events
    .filter((e) => e.source !== 'sleep' || keepSleep(e))
    .filter((e) => e.source !== 'habit' || keepHabit(e))
    .filter((e) => format(e.start, 'yyyy-MM-dd') !== todayKey || !e.done || justDone.has(e.key))
    .slice(0, MAX_ITEMS);

  // Workouts/walks can be ticked any time today; other events once their time has come.
  const isPast = (e: CalEvent) =>
    eventDay(e) === todayKey && (!e.hasTime || e.source === 'workout' || e.source === 'walk' || e.start.getTime() <= now);

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/app/calendar')}
          className="flex min-h-[44px] items-center gap-1 text-card-title"
        >
          מה יש היום
          <ChevronLeft className="h-5 w-5 text-muted-foreground" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          aria-label="הוספת אירוע"
          className="inline-flex h-11 w-11 items-center justify-center rounded-pill bg-card-inner text-foreground"
        >
          <Plus className="h-5 w-5" strokeWidth={2} />
        </button>
      </div>

      {cal.isLoading ? (
        <Skeleton className="h-32 rounded-inner" />
      ) : items.length === 0 ? (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="w-full rounded-inner bg-card-inner px-4 py-5 text-center text-label text-muted-foreground"
        >
          אין כלום ביומן להיום. אפשר להוסיף הליכה, ארוחה או שעת שינה
        </button>
      ) : (
        <ul className="space-y-2">
          {items.map((e) => {
            // Meals from the meal layout get a plate icon, smaller for a small meal.
            const Icon = e.source === 'habit' && e.type === 'meal' ? Utensils : ICONS[e.type];
            const habit = e.source === 'habit';
            const tomorrow = eventDay(e) !== todayKey;
            return (
              <li key={e.key} className={cn('flex min-h-[52px] items-center gap-3', eatStyle(e) && cn('-mx-2 rounded-inner px-2', eatStyle(e)!.card))}>
                <span className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-pill',
                  e.done ? 'bg-success/10 text-success' : eatStyle(e) ? eatStyle(e)!.tint : habit ? 'bg-card-inner text-muted-foreground' : 'bg-card-inner text-primary',
                )}>
                  <Icon className={e.size === 'small' ? 'h-3.5 w-3.5' : 'h-5 w-5'} strokeWidth={2} />
                  {e.type === 'eat_stop' && <Lock className="-mr-1 h-3 w-3" strokeWidth={2.5} aria-hidden />}
                </span>
                <div
                  className="min-w-0 flex-1"
                  onClick={habit && e.explanation ? () => toast(e.title, { description: e.explanation ?? undefined }) : undefined}
                >
                  <p className={cn('truncate text-body font-semibold', e.done && 'text-muted-foreground')}>{e.title}</p>
                  <p className={cn('text-label tabular-nums', eatStyle(e)?.tint ?? 'text-muted-foreground')}>
                    {tomorrow ? 'מחר' : ''}{tomorrow && e.hasTime ? ' · ' : ''}
                    {e.hasTime ? format(e.start, 'HH:mm') : tomorrow ? '' : 'במהלך היום'}
                    {e.optional ? ' · לא חובה' : ''}
                  </p>
                </div>
                {e.done ? (
                  // Done: a plain status, not something to press.
                  <span className="inline-flex shrink-0 items-center gap-1 text-label font-semibold text-success">
                    <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                    בוצע
                  </span>
                ) : isPast(e) && !e.readOnly ? (
                  <button
                    type="button"
                    onClick={async () => {
                      if (await cal.markDone(e)) {
                        successHaptic();
                        setJustDone((s) => new Set(s).add(e.key));
                        onChanged?.();
                        showUndo(DONE_MESSAGE[e.type] ?? 'סומן כבוצע', async () => {
                          if (await cal.unmarkDone(e)) {
                            onChanged?.();
                            setJustDone((s) => {
                              const next = new Set(s);
                              next.delete(e.key);
                              return next;
                            });
                          }
                        });
                      }
                    }}
                    className="h-11 shrink-0 rounded-button border border-primary px-3 text-label font-semibold text-primary-soft transition-colors active:bg-primary-tint"
                  >
                    סמן בוצע
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <EventEditor
        open={isAdding}
        onOpenChange={setIsAdding}
        defaultDate={today}
        actions={cal}
      />
    </Card>
  );
}
