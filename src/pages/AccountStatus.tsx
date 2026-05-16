import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ChevronLeft, CalendarDays, Trophy, Clock, Zap, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { format, addDays, endOfMonth } from 'date-fns';
import { he } from 'date-fns/locale';

export default function AccountStatus() {
  const navigate = useNavigate();
  const { profile, currentDay, currentWeek, planDays } = useAuth();
  const PROGRAM_DAYS = planDays;

  const isProgram = profile?.subscription_type === 'program';

  const daysRemaining = Math.max(0, PROGRAM_DAYS - currentDay);
  const weeksRemaining = Math.ceil(daysRemaining / 7);
  const progressPct = Math.min(100, Math.round((currentDay / PROGRAM_DAYS) * 100));
  const isProgramDone = currentDay >= PROGRAM_DAYS;

  const startDate = profile?.start_date ? new Date(profile.start_date) : null;
  const endDate = isProgram && startDate ? addDays(startDate, PROGRAM_DAYS - 1) : null;

  // For subscription users — show end of current calendar month
  const subscriptionEndDate = !isProgram ? endOfMonth(new Date()) : null;

  const fmt = (d: Date) => format(d, 'd בMMMM yyyy', { locale: he });

  return (
    <div className="min-h-screen bg-background px-4 pt-4 pb-20" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full w-9 h-9 shrink-0"
          onClick={() => navigate(-1)}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">סטטוס חשבון</h1>
          <p className="text-xs text-muted-foreground">פרטי התוכנית שלך</p>
        </div>
      </div>

      <div className="space-y-4">

        {/* User info */}
        <div className="card-elevated rounded-2xl p-4 space-y-1">
          <p className="text-base font-bold">{profile?.full_name || '—'}</p>
          <p className="text-sm text-muted-foreground">{profile?.email || '—'}</p>
          <span className={`inline-block mt-2 text-xs font-semibold px-2.5 py-0.5 rounded-full ${
            profile?.is_active
              ? 'bg-success/15 text-success'
              : 'bg-destructive/15 text-destructive'
          }`}>
            {profile?.is_active ? 'מנוי פעיל' : 'מנוי לא פעיל'}
          </span>
        </div>

        {/* Program progress — only for program users */}
        {isProgram && (
          <div className="card-elevated rounded-2xl p-4 space-y-4">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">התקדמות בתוכנית</h2>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-bold text-foreground">יום {currentDay} מתוך {PROGRAM_DAYS}</span>
                <span className="text-muted-foreground">{progressPct}%</span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full gradient-primary rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-muted/40 rounded-xl p-3 text-center">
                <CalendarDays className="h-4 w-4 text-primary mx-auto mb-1" />
                <p className="text-lg font-bold">{currentDay}</p>
                <p className="text-xs text-muted-foreground">ימים עברו</p>
              </div>
              <div className="bg-muted/40 rounded-xl p-3 text-center">
                <Zap className="h-4 w-4 text-primary mx-auto mb-1" />
                <p className="text-lg font-bold">{currentWeek}</p>
                <p className="text-xs text-muted-foreground">שבוע נוכחי</p>
              </div>
              <div className={`rounded-xl p-3 text-center ${isProgramDone ? 'bg-success/10' : 'bg-muted/40'}`}>
                {isProgramDone
                  ? <Trophy className="h-4 w-4 text-success mx-auto mb-1" />
                  : <Clock className="h-4 w-4 text-primary mx-auto mb-1" />}
                <p className={`text-lg font-bold ${isProgramDone ? 'text-success' : ''}`}>
                  {isProgramDone ? '✓' : daysRemaining}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isProgramDone ? 'הושלם!' : 'ימים נשארו'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Subscription status — for subscription users */}
        {!isProgram && (
          <div className="card-elevated rounded-2xl p-4 space-y-4">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">סטטוס מנוי</h2>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <RefreshCw className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">מנוי חודשי</p>
                <p className="text-sm text-muted-foreground">מתחדש אוטומטית</p>
              </div>
            </div>
            {subscriptionEndDate && (
              <div className="flex justify-between items-center pt-1 border-t border-border/50">
                <span className="text-sm text-muted-foreground">פעיל עד</span>
                <span className="text-sm font-semibold text-primary">{fmt(subscriptionEndDate)}</span>
              </div>
            )}
          </div>
        )}

        {/* Dates — for program users */}
        {isProgram && startDate && (
          <div className="card-elevated rounded-2xl p-4 space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">תאריכים</h2>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">תחילת תוכנית</span>
              <span className="text-sm font-semibold">{fmt(startDate)}</span>
            </div>
            {endDate && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">סיום תוכנית</span>
                <span className="text-sm font-semibold">{fmt(endDate)}</span>
              </div>
            )}
            {!isProgramDone && endDate && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">נשארו</span>
                <span className="text-sm font-semibold text-primary">
                  {weeksRemaining} שבועות ({daysRemaining} ימים)
                </span>
              </div>
            )}
          </div>
        )}

        {isProgram && isProgramDone && (
          <div className="rounded-2xl border border-success/30 bg-success/5 p-4 text-center space-y-1">
            <Trophy className="h-8 w-8 text-success mx-auto" />
            <p className="font-bold text-success">סיימת את התוכנית!</p>
            <p className="text-sm text-muted-foreground">כל {PROGRAM_DAYS} ימים הושלמו בהצלחה</p>
          </div>
        )}

      </div>
    </div>
  );
}
