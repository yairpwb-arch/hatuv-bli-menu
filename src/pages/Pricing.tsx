import { useState, useEffect } from 'react';
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
import { Star, Zap, Check, ArrowLeft, Loader2 } from 'lucide-react';
import { z } from 'zod';

// ── Validation ────────────────────────────────────────────────────────────────

const registrationSchema = z.object({
  fullName: z.string().min(2, 'שם מלא חייב להכיל לפחות 2 תווים'),
  email: z.string().email('כתובת אימייל לא תקינה'),
  password: z.string().min(6, 'הסיסמה חייבת להכיל לפחות 6 תווים'),
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

// ── Step 1 — Registration form ────────────────────────────────────────────────

function StepRegistrationForm({
  isRegistering,
  serverError,
  onSubmit,
}: {
  isRegistering: boolean;
  serverError: string | null;
  onSubmit: (form: RegistrationForm) => void;
}) {
  const [form, setForm] = useState<RegistrationForm>({
    fullName: '',
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<Partial<RegistrationForm>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[Pricing] form submitted', { email: form.email, passwordLen: form.password.length });
    const result = registrationSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Partial<RegistrationForm> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof RegistrationForm;
        if (!fieldErrors[field]) fieldErrors[field] = issue.message;
      }
      console.log('[Pricing] validation failed', fieldErrors);
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    onSubmit(form);
  };

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
          <p className="text-muted-foreground mt-1">יצירת חשבון</p>
        </div>
      </div>

      <Card className="glass-card">
        <CardContent className="pt-6">
          {serverError && (
            <div className="mb-4 rounded-md bg-destructive/15 border border-destructive/40 px-4 py-3 text-sm text-destructive font-medium text-right">
              {serverError}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reg-fullName">שם מלא</Label>
              <Input
                id="reg-fullName"
                type="text"
                placeholder="ישראל ישראלי"
                value={form.fullName}
                onChange={(e) => {
                  setForm({ ...form, fullName: e.target.value });
                  setErrors((prev) => ({ ...prev, fullName: undefined }));
                }}
                className={errors.fullName ? 'border-destructive' : ''}
                disabled={isRegistering}
              />
              {errors.fullName && (
                <p className="text-xs text-destructive">{errors.fullName}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reg-email">אימייל</Label>
              <Input
                id="reg-email"
                type="email"
                placeholder="your@email.com"
                value={form.email}
                onChange={(e) => {
                  setForm({ ...form, email: e.target.value });
                  setErrors((prev) => ({ ...prev, email: undefined }));
                }}
                dir="ltr"
                className={`text-left${errors.email ? ' border-destructive' : ''}`}
                disabled={isRegistering}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reg-password">סיסמה (לפחות 6 תווים)</Label>
              <Input
                id="reg-password"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => {
                  setForm({ ...form, password: e.target.value });
                  setErrors((prev) => ({ ...prev, password: undefined }));
                }}
                dir="ltr"
                className={`text-left${errors.password ? ' border-destructive' : ''}`}
                disabled={isRegistering}
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password}</p>
              )}
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
                  המשך לבחירת מסלול
                  <ArrowLeft className="h-5 w-5 mr-2" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

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

// ── Step 2 — Plan selection ───────────────────────────────────────────────────

function StepPlanSelection({
  products,
  isPurchasing,
  onSelect,
}: {
  products: ReturnType<typeof useRevenueCat>['products'];
  isPurchasing: boolean;
  onSelect: (plan: PlanId) => void;
}) {
  return (
    <div className="w-full max-w-sm space-y-6 animate-slide-up" dir="rtl">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-foreground">בחר את המסלול שלך</h2>
        <p className="text-muted-foreground text-sm">לאחר הבחירה יפתח חלון התשלום</p>
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
                disabled={isPurchasing}
              >
                {isPurchasing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    הצטרף למסלול המלא
                    <ArrowLeft className="h-5 w-5 mr-2" />
                  </>
                )}
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
              disabled={isPurchasing}
            >
              {isPurchasing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  הצטרף למסלול הדיגיטלי
                  <ArrowLeft className="h-5 w-5 mr-2" />
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Terms of Use — Apple guideline 3.1.2(c) */}
      <p className="text-center text-xs text-muted-foreground leading-relaxed">
        בלחיצה על &ldquo;הצטרף&rdquo; אתה מסכים{' '}
        <button
          className="text-primary underline underline-offset-2 font-medium"
          onClick={() =>
            window.open(
              'https://docs.google.com/document/d/1PquUiaPZ6_v2TYH-qOlAbxGqwjpf8E0-hqzYtmomebs/edit?usp=sharing',
              '_blank',
            )
          }
        >
          לתנאי השימוש
        </button>{' '}
        של האפליקציה
      </p>
    </div>
  );
}

// ── Step 3 — Processing ───────────────────────────────────────────────────────

function StepProcessing() {
  return (
    <div
      className="w-full max-w-sm flex flex-col items-center justify-center gap-6 animate-fade-in"
      dir="rtl"
    >
      <div className="w-20 h-20 rounded-full gradient-primary flex items-center justify-center shadow-glow">
        <Loader2 className="h-10 w-10 text-primary-foreground animate-spin" />
      </div>
      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground">מעבד תשלום...</h2>
        <p className="text-muted-foreground mt-2 text-sm">נא לא לסגור את האפליקציה</p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Pricing() {
  const navigate = useNavigate();
  const { signUp, signIn, user: existingUser } = useAuth();
  const { isNative, products, purchasePlan, initialize } = useRevenueCat();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [userId, setUserId] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Already logged-in user with no active subscription — skip registration step
  useEffect(() => {
    if (existingUser && step === 1) {
      setUserId(existingUser.id);
      if (isNative) initialize(existingUser.id);
      setStep(2);
    }
  }, [existingUser?.id]);

  // Step 1: create Supabase account → move to plan selection
  const handleRegistrationSubmit = async (form: RegistrationForm) => {
    setIsRegistering(true);
    setServerError(null);

    try {
      console.log('[Pricing] calling signUp...');
      const { error: signUpError } = await signUp(form.email, form.password, form.fullName);
      console.log('[Pricing] signUp result:', signUpError);

      if (signUpError) {
        // If email already exists, try signing in with the same credentials
        if (signUpError.message === 'User already registered') {
          const { error: signInError } = await signIn(form.email, form.password);
          if (signInError) {
            setServerError('האימייל כבר רשום — בדוק שהסיסמה נכונה או התחבר דרך מסך ההתחברות');
            return;
          }
          // Sign-in succeeded — fall through to getSession below
        } else {
          setServerError(signUpError.message);
          return;
        }
      }

      // Get new user's ID and link to RevenueCat
      const { data: { session } } = await supabase.auth.getSession();
      const newUserId = session?.user?.id ?? null;
      console.log('[Pricing] session userId:', newUserId);
      setUserId(newUserId);

      if (isNative && newUserId) {
        await initialize(newUserId);
      }

      setStep(2);
    } catch (err) {
      console.error('[Pricing] registration error:', err);
      setServerError('אירעה שגיאה בלתי צפויה. נסה שוב.');
    } finally {
      setIsRegistering(false);
    }
  };

  // Step 2: user picks a plan → open IAP (native) or go straight to app (web)
  const handlePlanSelect = async (plan: PlanId) => {
    if (!isNative) {
      toast({ title: 'ברוך הבא!', description: 'נרשמת בהצלחה' });
      navigate('/app');
      return;
    }

    setIsPurchasing(true);
    setStep(3);

    // Re-initialize if userId available (safety net)
    if (userId) {
      await initialize(userId);
    }

    const result = await purchasePlan(plan);
    setIsPurchasing(false);

    if (result.success) {
      toast({ title: 'ברוך הבא!', description: 'נרשמת בהצלחה והתשלום בוצע' });
      navigate('/app');
    } else if (result.error === 'user_cancelled') {
      setStep(2);
      toast({
        title: 'ביטלת את התשלום',
        description: 'החשבון שלך נוצר — בחר מסלול ושלם כדי להיכנס לאפליקציה',
      });
    } else {
      setStep(2);
      toast({
        title: 'שגיאה בתשלום',
        description: 'אירעה שגיאה — אנא נסה שוב',
        variant: 'destructive',
      });
    }
  };

  return (
    <div
      className="min-h-screen bg-background flex flex-col items-center justify-center p-4"
      dir="rtl"
    >
      {step === 1 && (
        <StepRegistrationForm
          isRegistering={isRegistering}
          serverError={serverError}
          onSubmit={handleRegistrationSubmit}
        />
      )}
      {step === 2 && (
        <StepPlanSelection
          products={products}
          isPurchasing={isPurchasing}
          onSelect={handlePlanSelect}
        />
      )}
      {step === 3 && <StepProcessing />}
    </div>
  );
}
