import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('כתובת אימייל לא תקינה'),
  password: z.string().min(6, 'הסיסמה חייבת להכיל לפחות 6 תווים'),
});

export default function Auth() {
  const [isLoading, setIsLoading] = useState(false);
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const { signIn, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Show loading state while auth is initializing
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = loginSchema.safeParse(loginData);
    if (!result.success) {
      toast({
        title: 'שגיאה',
        description: result.error.errors[0].message,
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await signIn(loginData.email.trim(), loginData.password);

      if (error) {
        toast({
          title: 'שגיאה בהתחברות',
          description: error.message === 'Invalid login credentials'
            ? 'אימייל או סיסמה שגויים'
            : error.message,
          variant: 'destructive',
        });
        return;
      }

      toast({ title: 'ברוך הבא!', description: 'התחברת בהצלחה' });
      navigate('/app');
    } catch (err) {
      toast({
        title: 'שגיאה בהתחברות',
        description: 'אירעה שגיאה, נסה שוב',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <img
              src="/logo.jpg"
              alt="חטוב בלי תפריט"
              className="w-20 h-20 rounded-full object-cover shadow-glow"
            />
          </div>
          <h1 className="text-3xl font-bold text-foreground">חטוב בלי תפריט</h1>
          <p className="text-muted-foreground mt-2">התוכנית שלך לחיים בריאים</p>
        </div>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle>ברוך שובך!</CardTitle>
            <CardDescription>התחבר כדי להמשיך במסע שלך</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">אימייל</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="your@email.com"
                  value={loginData.email}
                  onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                  dir="ltr"
                  className="text-left"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">סיסמה</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  value={loginData.password}
                  onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                  dir="ltr"
                  className="text-left"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
                התחבר
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-4">
          אין לך עדיין מנוי?{' '}
          <button
            type="button"
            onClick={() => navigate('/join')}
            className="text-primary font-bold underline underline-offset-2 hover:opacity-80 transition-opacity"
          >
            לחץ כאן להצטרפות לתוכנית
          </button>
        </p>
      </div>
    </div>
  );
}