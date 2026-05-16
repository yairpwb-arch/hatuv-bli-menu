import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Trash2, Settings, Mail, AlertTriangle } from 'lucide-react';

export default function AccountDeletion() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background px-4 pt-4 pb-20" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6 max-w-2xl mx-auto">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full w-9 h-9 shrink-0"
          onClick={() => navigate(-1)}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">מחיקת חשבון ונתונים</h1>
          <p className="text-xs text-muted-foreground">הסבר על כל אפשרויות המחיקה</p>
        </div>
      </div>

      <div className="space-y-4 max-w-2xl mx-auto">

        {/* Option 1 — Pricing screen */}
        <div className="card-elevated rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Trash2 className="h-4 w-4 text-primary" />
            </div>
            <h2 className="font-semibold text-base">מחיקה מהירה — ללא מנוי פעיל</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed pr-12">
            עבור לדף התשלום, גלול למטה ולחץ על כפתור <strong className="text-foreground">מחק את החשבון שלי</strong>.
            הפעולה תמחק את החשבון ואת כל הנתונים לאלתר.
          </p>
        </div>

        {/* Option 2 — Settings */}
        <div className="card-elevated rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Settings className="h-4 w-4 text-primary" />
            </div>
            <h2 className="font-semibold text-base">מחיקה דרך ההגדרות</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed pr-12">
            כנס ל<strong className="text-foreground">הגדרות</strong> בתחתית האפליקציה, גלול לסוף הדף ולחץ על
            {' '}<strong className="text-foreground">מחיקת חשבון</strong>. תתבקש לאשר את הפעולה בחלון קופץ.
          </p>
        </div>

        {/* Option 3 — Email */}
        <div className="card-elevated rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Mail className="h-4 w-4 text-primary" />
            </div>
            <h2 className="font-semibold text-base">מחיקה בפנייה לתמיכה</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed pr-12">
            שלח אימייל ל-{' '}
            <button
              type="button"
              className="text-primary underline underline-offset-2"
              onClick={() => window.open('mailto:yairpwb@gmail.com?subject=בקשת מחיקת חשבון', '_blank')}
            >
              yairpwb@gmail.com
            </button>
            {' '}עם הכותרת <strong className="text-foreground">"בקשת מחיקת חשבון"</strong> וציין את מספר הטלפון
            או האימייל שבו נרשמת.
          </p>
        </div>

        {/* Important notice */}
        <div className="rounded-2xl border border-warning/40 bg-warning/5 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
            <h3 className="font-semibold text-sm">חשוב לדעת</h3>
          </div>
          <ul className="text-sm text-muted-foreground leading-relaxed space-y-2 pr-6">
            <li>
              מחיקת החשבון גורמת ל<strong className="text-foreground">מחיקה מוחלטת ובלתי הפיכה</strong> של
              כל המידע האישי וההיסטוריה שלך בתוכנית.
            </li>
            <li>
              <strong className="text-foreground">מחיקת החשבון אינה מבטלת אוטומטית חיובים פעילים</strong> מ-App Store
              או Google Play. לביטול המנוי יש לעשות זאת בנפרד דרך הגדרות המכשיר.
            </li>
          </ul>
        </div>

        {/* Cancel subscription links */}
        <div className="card-elevated rounded-2xl p-4 space-y-3">
          <h3 className="font-semibold text-sm">ביטול מנוי בחנות האפליקציות</h3>
          <button
            type="button"
            className="w-full text-right text-sm text-primary underline underline-offset-2"
            onClick={() => window.open('https://support.apple.com/en-us/118428', '_blank')}
          >
            ביטול מנוי ב-App Store (iOS)
          </button>
          <button
            type="button"
            className="w-full text-right text-sm text-primary underline underline-offset-2"
            onClick={() => window.open('https://support.google.com/googleplay/answer/7018481', '_blank')}
          >
            ביטול מנוי ב-Google Play (Android)
          </button>
        </div>

      </div>
    </div>
  );
}
