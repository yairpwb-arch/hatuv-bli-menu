import { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import type { Habit } from '@/hooks/useHabits';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { selectionHaptic } from '@/lib/native';
import { cn } from '@/lib/utils';

/**
 * The "i" by the table's title: every habit in progress now, and a tap on one
 * opens a short explanation of it.
 */
export function HabitsInfo({ habits }: { habits: Habit[] }) {
  const [open, setOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          selectionHaptic();
          setOpen(true);
        }}
        aria-label="ההרגלים שלך עכשיו – הסבר"
        className="-m-1.5 inline-flex h-11 w-11 items-center justify-center rounded-pill text-muted-foreground transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        <Info className="h-5 w-5" strokeWidth={2} />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-card pb-[calc(1.5rem+var(--app-safe-bottom))]" dir="rtl" onOpenAutoFocus={(e) => e.preventDefault()}>
          <SheetHeader className="text-right">
            <SheetTitle>ההרגלים שלך עכשיו</SheetTitle>
            <SheetDescription>{habits.length} הרגלים בתהליך · לחיצה על הרגל מסבירה אותו</SheetDescription>
          </SheetHeader>

          <ul className="mt-4 space-y-2">
            {habits.map((h) => {
              const expanded = openId === h.id;
              return (
                <li key={h.id} className="overflow-hidden rounded-inner bg-card-inner">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => {
                      selectionHaptic();
                      setOpenId(expanded ? null : h.id);
                    }}
                    className="flex min-h-[48px] w-full items-center gap-3 px-3 py-2 text-right"
                  >
                    <span className="flex-1 text-body font-semibold">{h.name}</span>
                    <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} strokeWidth={2} />
                  </button>
                  {expanded && (
                    <p className="px-3 pb-3 text-body text-muted-foreground animate-fade-in">
                      {h.explanation || 'ההרגל הזה הוא חלק מהשלב שלך עכשיו. ההסבר המלא נמצא בסרטון של השלב.'}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
