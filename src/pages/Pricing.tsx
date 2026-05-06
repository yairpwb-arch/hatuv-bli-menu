import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useRevenueCat, PlanId } from '@/hooks/useRevenueCat';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Star, Zap, Check, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';
import { z } from 'zod';

// ── Validation ────────────────────────────────────────────────────────────────

const registrationSchema = z.object({
  fullName: z.string().min(2, 'שם מלא חייב להכיל לפחות 2 תווים'),
  email: z.string().email('כתובת אימייל לא תקינה'),
  password: z.string().min(7, 'הסיסמה חייבת להכיל לפחות 7 תווים'),
});

// ── Plan metadata ─────────────────────────────────────────────────────────────

const PLANS: Record<PlanId, {
  name: string;
  fallbackPrice: string;
  badge?: string;
  features: string[];
}> = {
  full: {
    name: 'ליווי מלא',
    fallbackPrice: '490 ₪ / חודש',
    badge: 'הפופולרי ביותר',
    features: [
      'ליווי אישי מלא',
      'מעקב יומי',
      'אימוני כושר מותאמים',
      'תמיכה 24/7',
    ],
  },
  digital: {
    name: 'דיגיטלי',
    fallbackPrice: '390 ₪ / חודש',
    features: [
      'גישה לכל המערכת',
      'שאלון שבועי',
      'מעקב תזונה ופעילות',
      'תמיכה ממוקדת',
    ],
  },
};

interface RegistrationForm {
  fullName: string;
  email: string;
  password: string;
}

// ── Step 1 — Plan selection ───────────────────────────────────────────────────

function StepPlanSelection({
  products,
  onSelect,
}: {
  products: ReturnType<typeof useRevenueCat>['products'];
  onSelect: (plan: PlanId) => void;
}) {
  return (
    <div className="w-full max-w-sm space-y-6 animate-slide-up" dir="rtl">
      {/* Hero header */}
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <img
            src="/logo.jpg"
            alt="חטוב בלי תפריט"
            className="w-20 h-20 rounded-full object-cover shadow-glow"
          />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">חטוב בלי תפריט</h1>
          <p className="text-muted-foreground mt-1">בחר את המסלול שלך</p>
        </div>
      </div>

      {/* Plan cards */}
      <div className="flex flex-col gap-4">
        {/* Plan A — Full */}
        <div className="relative">
          {PLANS.full.badge && (
            <div className="absolute -top-3 right-4 z-10">
              <Badge className="gradient-primary text-primary-foreground shadow-glow px-3 py-1 text-xs font-bold">
                <Star className="h-3 w-3 ml-1" />
                {PLANS.full.badge}
              </Badge>
            </div>
          )}
          <Card className="glass-card border-2 border-primary/50 cursor-pointer hover:border-primary transition-colors pt-2">
            <CardHeader className="pb-2 pt-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">{PLANS.full.name}</CardTitle>
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <p className="text-2xl font-bold text-gradient mt-1">
                {products.full?.priceString ?? PLANS.full.fallbackPrice}
              </p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 mb-4">
                {PLANS.full.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary flex-shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="w-full h-12 gradient-primary shadow-glow text-base font-bold"
                onClick={() => onSelect('full')}
              >
                הצטרף למסלול המלא
                <ArrowLeft className="h-5 w-5 mr-2" />
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Plan B — Digital */}
        <Card
          className="glass-card border-2 border-border/50 cursor-pointer hover:border-primary/50 transition-colors"
          style={{ animationDelay: '0.1s' }}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl">{PLANS.digital.name}</CardTitle>
              <Zap className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">
              {products.digital?.priceString ?? PLANS.digital.fallbackPrice}
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 mb-4">
              {PLANS.digital.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Check className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              className="w-full h-12 text-base font-bold"
              onClick={() => onSelect('digital')}
            >
              הצטרף למסלול הדיגיטלי
              <ArrowLeft className="h-5 w-5 mr-2" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Login link */}
      <p className="text-center text-sm text-muted-foreground">
        כבר יש לך חשבון?{' '}
        <a
          href="/auth"
          className="text-primary font-bold underline underline-offset-2 hover:opacity-80 transition-opacity"
        >
          התחבר כאן
        </a>
      </p>
    </div>
  );
}

// ── Step 2 — Registration form ────────────────────────────────────────────────

function StepRegistrationForm({
  selectedPlan,
  isRegistering,
  onBack,
  onSubmit,
}: {
  selectedPlan: PlanId;
  isRegistering: boolean;
  onBack: () => void;
  onSubmit: (form: RegistrationForm) => void;
}) {
  const [form, setForm] = useState<RegistrationForm>({
    fullName: '',
    email: '',
    password: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      registrationSchema.parse(form);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast({
          title: 'שגיאה',
          description: err.errors[0].message,
          variant: 'destructive',
        });
        return;
      }
    }
    onSubmit(form);
  };

  const planMeta = PLANS[selectedPlan];

  return (
    <div className="w-full max-w-sm animate-slide-up" dir="rtl">
      {/* Header row */}
      <div className="flex items-center gap-2 mb-6">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full w-9 h-9"
          onClick={onBack}
          disabled={isRegistering}
        >
          <ArrowRight className="h-5 w-5" />
        </Button>
        <h2 className="text-xl font-bold flex-1">יצירת חשבון</h2>
        <Badge
          className={
            selectedPlan === 'full'
              ? 'gradient-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground'
          }
        >
          {planMeta.name}
        </Badge>
      </div>

      <Card className="glass-card">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reg-fullName">שם מלא</Label>
              <Input
                id="reg-fullName"
                type="text"
                placeholder="ישראל ישראלי"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
                disabled={isRegistering}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reg-email">אימייל</Label>
              <Input
                id="reg-email"
                type="email"
                placeholder="your@email.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                dir="ltr"
                className="text-left"
                disabled={isRegistering}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reg-password">סיסמה (לפחות 7 תווים)</Label>
              <Input
                id="reg-password"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                dir="ltr"
                className="text-left"
                disabled={isRegistering}
              />
            </div>

            <Button
              type="submit"
              className="w-full h-12 gradient-primary shadow-glow text-base font-bold mt-2"
              disabled={isRegistering}
            >
              {isRegistering ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  מבצע רישום...
                </>
              ) : (
                <>
                  הצטרף וסיים תשלום
                  <ArrowLeft className="h-5 w-5 mr-2" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Step 3 — Processing ───────────────────────────────────────────────────────

function StepProcessing({ statusText }: { statusText: string }) {
  return (
    <div
      className="w-full max-w-sm flex flex-col items-center justify-center gap-6 animate-fade-in"
      dir="rtl"
    >
      <div className="w-20 h-20 rounded-full gradient-primary flex items-center justify-center shadow-glow">
        <Loader2 className="h-10 w-10 text-primary-foreground animate-spin" />
      </div>
      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground">{statusText}</h2>
        <p className="text-muted-foreground mt-2 text-sm">נא לא לסגור את האפליקציה</p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Pricing() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const { isNative, products, purchasePlan, initialize } = useRevenueCat();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [processingText, setProcessingText] = useState('מבצע רישום...');

  const handlePlanSelect = (plan: PlanId) => {
    setSelectedPlan(plan);
    setStep(2);
  };

  const handleRegistrationSubmit = async (form: RegistrationForm) => {
    if (!selectedPlan) return;

    setIsRegistering(true);
    setProcessingText('מבצע רישום...');
    setStep(3);

    // 1. Create Supabase account
    const { error: signUpError } = await signUp(form.email, form.password, form.fullName);

    if (signUpError) {
      setIsRegistering(false);
      setStep(2);
      toast({
        title: 'שגיאה ברישום',
        description:
          signUpError.message === 'User already registered'
            ? 'כתובת האימייל כבר רשומה במערכת'
            : signUpError.message,
        variant: 'destructive',
      });
      return;
    }

    // 2. Get the new user's session
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    // 3. On web — no IAP available, enter app directly
    if (!isNative) {
      setIsRegistering(false);
      toast({ title: 'ברוך הבא!', description: 'נרשמת בהצלחה' });
      navigate('/app');
      return;
    }

    // 4. Native — link RevenueCat to Supabase user and open IAP sheet
    setProcessingText('מעבד תשלום...');

    if (userId) {
      await initialize(userId);
    }

    const result = await purchasePlan(selectedPlan);
    setIsRegistering(false);

    if (result.success) {
      toast({ title: 'ברוך הבא!', description: 'נרשמת בהצלחה והתשלום בוצע' });
      navigate('/app');
    } else if (result.error === 'user_cancelled') {
      toast({
        title: 'ביטלת את התשלום',
        description: 'החשבון נוצר — תוכל להשלים את התשלום מאוחר יותר',
      });
      navigate('/app');
    } else {
      toast({
        title: 'שגיאה בתשלום',
        description: 'החשבון נוצר אך התשלום נכשל. ניתן לנסות שוב מהגדרות',
        variant: 'destructive',
      });
      navigate('/app');
    }
  };

  return (
    <div
      className="min-h-screen bg-background flex flex-col items-center justify-center p-4"
      dir="rtl"
    >
      {step === 1 && (
        <StepPlanSelection products={products} onSelect={handlePlanSelect} />
      )}
      {step === 2 && selectedPlan && (
        <StepRegistrationForm
          selectedPlan={selectedPlan}
          isRegistering={isRegistering}
          onBack={() => setStep(1)}
          onSubmit={handleRegistrationSubmit}
        />
      )}
      {step === 3 && <StepProcessing statusText={processingText} />}
    </div>
  );
}
