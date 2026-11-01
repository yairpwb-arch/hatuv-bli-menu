import { Moon } from 'lucide-react';

/**
 * Night mode: opening the app between bedtime and wake-up shows this quiet,
 * dark screen instead of home. No accent colours, no numbers to chase.
 */
export function NightScreen({
  wake, onEnter, onOpenSummary,
}: {
  wake: string;
  onEnter: () => void;
  /** Shown while tonight's summary is still open and unanswered. */
  onOpenSummary?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] !mt-0 flex flex-col items-center justify-center gap-6 bg-[#08080A] px-8 text-center" dir="rtl" role="dialog" aria-label="זמן לישון">
      <Moon className="h-12 w-12 text-[#8E8C93]" strokeWidth={1.5} aria-hidden />
      <div className="space-y-2">
        <h1 className="text-screen-title text-[#D9D7D2]">זמן לישון.</h1>
        <p className="text-body text-[#8E8C93]">נתראה מחר בבוקר.</p>
        <p className="text-label text-[#8E8C93]">
          קמים ב-<span className="tabular-nums" dir="ltr">{wake}</span>
        </p>
      </div>
      <div className="flex flex-col items-center gap-1">
        {onOpenSummary && (
          <button type="button" onClick={onOpenSummary} className="min-h-[44px] px-4 text-label font-semibold text-[#B5B3B9] underline underline-offset-4">
            סיכום היום עוד פתוח
          </button>
        )}
        <button type="button" onClick={onEnter} className="min-h-[44px] px-4 text-label text-[#8E8C93]">
          בכל זאת להיכנס
        </button>
      </div>
    </div>
  );
}
