import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import { z } from 'zod';

const TERMS_URL = 'https://docs.google.com/document/d/1PquUiaPZ6_v2TYH-qOlAbxGqwjpf8E0-hqzYtmomebs/edit?usp=sharing';

const registrationSchema = z.object({
  fullName: z.string().min(2, 'שם מלא חייב להכיל לפחות 2 תווים'),
  email: z.string().email('כתובת אימייל לא תקינה'),
  password: z.string().min(6, 'הסיסמה חייבת להכיל לפחות 6 תווים'),
});

export default function Pricing() {
  const navigate = useNavigate();
  const { signUp, signIn, user, signOut } = useAuth();

  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [errors, setErrors] = useState<Partial<typeof form>>({});
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // If already logged in → go to app
  useEffect(() => {
    if (user) navigate('/app', { replace: true });
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = registrationSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Partial<typeof form> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof typeof form;
        if (!fieldErrors[field]) fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setServerError(null);
    setIsRegistering(true);

    try {
      const { error: signUpError } = await signUp(form.email, form.password, form.fullName);

      if (signUpError) {
        if (signUpError.message === 'User already registered') {
          const { error: signInError } = await signIn(form.email, form.password);
          if (signInError) {
            setServerError('האימייל כבר רשום — בדוק שהסיסמה נכונה או התחבר דרך מסך ההתחברות');
            return;
          }
        } else {
          setServerError(signUpError.message);
          return;
        }
      }

      // Set profile active + start_date
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (uid) {
        const today = new Date().toISOString().split('T')[0];
        await supabase.from('profiles').update({
          is_active: true,
          start_date: today,
        }).eq('id', uid).is('start_date', null);

        // If no existing start_date was null, at least ensure is_active
        await supabase.from('profiles').update({ is_active: true }).eq('id', uid);
      }

      toast({ title: 'ברוך הבא!', description: 'נרשמת בהצלחה' });
      navigate('/app');
    } catch {
      setServerError('אירעה שגיאה בלתי צפויה. נסה שוב.');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      await supabase.functions.invoke('delete-account', {});
      await signOut();
      navigate('/auth');
    } catch {
      toast({ title: 'שגיאה', description: 'לא ניתן למחוק את החשבון כרגע', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-sm space-y-6 animate-slide-up">

        {/* Hero */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <img src="/logo.jpg" alt="חטוב בלי תפריט" className="w-20 h-20 rounded-full object-cover shadow-glow" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">חטוב בלי תפריט</h1>
            <p className="text-muted-foreground mt-1">יצירת חשבון</p>
          </div>
        </div>

        {/* Form */}
        <Card className="glass-card">
          <CardContent className="pt-6">
            {serverError && (
              <div className="mb-4 rounded-md bg-destructive/15 border border-destructive/40 px-4 py-3 text-sm text-destructive font-medium text-right">
                {serverError}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="fullName">שם מלא</Label>
                <Input
                  id="fullName"
                  placeholder="ישראל ישראלי"
                  value={form.fullName}
                  onChange={e => { setForm(p => ({ ...p, fullName: e.target.value })); setErrors(p => ({ ...p, fullName: undefined })); }}
                  className={errors.fullName ? 'border-destructive' : ''}
                  disabled={isRegistering}
                />
                {errors.fullName && <p className="text-xs text-destructive">{errors.fullName}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">אימייל</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={form.email}
                  onChange={e => { setForm(p => ({ ...p, email: e.target.value })); setErrors(p => ({ ...p, email: undefined })); }}
                  dir="ltr"
                  className={`text-left${errors.email ? ' border-destructive' : ''}`}
                  disabled={isRegistering}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">סיסמה (לפחות 6 תווים)</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => { setForm(p => ({ ...p, password: e.target.value })); setErrors(p => ({ ...p, password: undefined })); }}
                  dir="ltr"
                  className={`text-left${errors.password ? ' border-destructive' : ''}`}
                  disabled={isRegistering}
                />
                {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
              </div>

              {/* Terms */}
              <div className="flex items-start gap-3 rounded-xl border p-3">
                <Checkbox
                  id="terms"
                  checked={termsAccepted}
                  onCheckedChange={v => setTermsAccepted(!!v)}
                  disabled={isRegistering}
                  className="mt-0.5"
                />
                <label htmlFor="terms" className="text-sm leading-relaxed cursor-pointer select-none">
                  קראתי ואני מסכים/ה{' '}
                  <button type="button" className="text-primary underline underline-offset-2 font-medium" onClick={() => window.open(TERMS_URL, '_blank')}>
                    לתנאי השימוש
                  </button>{' '}
                  של האפליקציה
                </label>
              </div>

              <Button
                type="submit"
                className="w-full h-12 gradient-primary shadow-glow text-base font-bold mt-2"
                disabled={isRegistering || !termsAccepted}
              >
                {isRegistering ? (
                  <><Loader2 className="h-4 w-4 animate-spin ml-2" />מבצע רישום...</>
                ) : (
                  <>כניסה לאפליקציה<ArrowLeft className="h-5 w-5 mr-2" /></>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Login link */}
        <p className="text-center text-sm text-muted-foreground">
          כבר יש לך חשבון?{' '}
          <a href="/auth" className="text-primary font-bold underline underline-offset-2 hover:opacity-80 transition-opacity">
            התחבר כאן
          </a>
        </p>

        {/* Delete account */}
        <div className="flex flex-col items-center gap-2 pt-2">
          <Button
            variant="ghost"
            className="w-full h-11 text-destructive hover:text-destructive hover:bg-destructive/10 gap-2 border border-destructive/30"
            disabled={isDeleting}
            onClick={handleDeleteAccount}
          >
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            מחק את החשבון שלי
          </Button>
          <p className="text-xs text-muted-foreground text-center">מחיקה מלאה ובלתי הפיכה של כל נתוני החשבון</p>
          <button
            type="button"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-primary transition-colors"
            onClick={() => navigate('/account-deletion')}
          >
            מדיניות מחיקת חשבון ונתונים
          </button>
        </div>

      </div>
    </div>
  );
}
