import { useNavigate } from 'react-router-dom';
import { MessageCircle, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

const WHATSAPP_URL = 'https://wa.me/message/IZV5KBE6SSC7B';

function openWhatsApp() {
  if (Capacitor.isNativePlatform()) {
    // '_system' tells Capacitor to hand the URL to the OS — opens WhatsApp directly
    window.open(WHATSAPP_URL, '_system');
  } else {
    window.open(WHATSAPP_URL, '_blank', 'noopener,noreferrer');
  }
}

export default function JoinProgram() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-5" dir="rtl">
      <div className="w-full max-w-md animate-fade-in flex flex-col items-center gap-8">

        {/* ─── Logo + Brand ─── */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl scale-125" />
            <img
              src="/logo.jpg"
              alt="חטוב בלי תפריט"
              className="relative w-28 h-28 rounded-full object-cover shadow-glow ring-4 ring-primary/30"
            />
          </div>
          <h1 className="text-3xl font-bold text-foreground">חטוב בלי תפריט</h1>
          <p className="text-muted-foreground text-sm">התוכנית המוכחת לגוף חזק ובריא</p>
        </div>

        {/* ─── Main Card ─── */}
        <div className="w-full rounded-2xl border border-primary/20 bg-card/80 backdrop-blur-sm p-6 shadow-lg space-y-5">

          {/* Headline */}
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 text-primary mb-1">
              <Sparkles className="h-5 w-5" />
              <span className="text-sm font-semibold uppercase tracking-wider">הצטרפות לתוכנית</span>
              <Sparkles className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-bold text-foreground leading-snug">
              רוצה להצטרף?
            </h2>
            <p className="text-muted-foreground text-sm">
              לחץ על הכפתור למטה ונדבר על הפרטים
            </p>
          </div>

          {/* Feature bullets */}
          <ul className="space-y-2.5 text-sm text-foreground/80">
            {[
              'תוכנית אימונים אישית ומעקב צעדים',
              'ליווי צמוד ומעקב שבועי',
              'יצירת הרגלים בריאים בצורה הדרגתית',
              'גוף חטוב שנשאר לתמיד',
            ].map(item => (
              <li key={item} className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          {/* WhatsApp CTA */}
          <button
            type="button"
            onClick={openWhatsApp}
            className="flex items-center justify-center gap-3 w-full rounded-xl bg-[#25D366] hover:bg-[#1fb855] active:scale-95 transition-all text-white font-bold py-4 text-base shadow-md shadow-[#25D366]/30"
          >
            <MessageCircle className="h-5 w-5" />
            שמיעת פרטים על התוכנית
          </button>
        </div>

        {/* ─── Back to login ─── */}
        <button
          type="button"
          onClick={() => navigate('/auth')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowRight className="h-4 w-4" />
          חזרה להתחברות
        </button>

      </div>
    </div>
  );
}
