import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Gift, Send, Phone, User, MessageSquare, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export default function AppReferral() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [form, setForm] = useState({ friendName: '', friendPhone: '', notes: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!form.friendName.trim() || !form.friendPhone.trim()) {
      toast({ title: 'שגיאה', description: 'יש למלא שם ומספר טלפון של החבר', variant: 'destructive' });
      return;
    }
    if (!profile?.id) return;

    setIsSubmitting(true);
    const { error } = await (supabase as any).from('referrals').insert({
      referrer_id: profile.id,
      friend_name: form.friendName.trim(),
      friend_phone: form.friendPhone.trim(),
      notes: form.notes.trim() || null,
    });

    if (error) {
      console.error('Referral insert error:', error);
      toast({ title: 'שגיאה בשליחה', description: error.message || 'לא ניתן לשלוח, נסה שוב', variant: 'destructive' });
    } else {
      setSubmitted(true);
    }
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-40 glass-surface border-b border-border/40 safe-top">
        <div className="flex items-center px-4 h-14 max-w-2xl mx-auto gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <h1 className="font-bold text-base">חבר מביא חבר</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {submitted ? (
          /* Success state */
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-green-500/15 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
            </div>
            <h2 className="text-xl font-bold">תודה רבה!</h2>
            <p className="text-muted-foreground text-sm max-w-xs">
              קיבלנו את הפרטים. נצור קשר עם החבר שלך בהקדם.
              <br />
              <span className="text-primary font-medium">תזכור — 500 ₪ + חודש מתנה מחכים לך! 🎁</span>
            </p>
            <Button onClick={() => { setSubmitted(false); setForm({ friendName: '', friendPhone: '', notes: '' }); }} variant="outline" className="mt-2">
              הפנה חבר נוסף
            </Button>
          </div>
        ) : (
          <>
            {/* Benefit banner */}
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                    <Gift className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">תביא חבר — תרוויח!</p>
                    <p className="text-muted-foreground text-xs mt-1 leading-relaxed">
                      על כל חבר שמצטרף לתהליך דרכך, תקבל{' '}
                      <span className="text-foreground font-medium">500 ₪</span> ועוד{' '}
                      <span className="text-foreground font-medium">חודש ליווי מתנה</span> 🎉
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Form */}
            <Card className="card-elevated">
              <CardContent className="pt-6 space-y-5">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    שם החבר / החברה *
                  </Label>
                  <Input
                    placeholder="ישראל ישראלי"
                    value={form.friendName}
                    onChange={e => setForm(p => ({ ...p, friendName: e.target.value }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    מספר טלפון *
                  </Label>
                  <Input
                    placeholder="050-0000000"
                    type="tel"
                    dir="ltr"
                    className="text-right"
                    value={form.friendPhone}
                    onChange={e => setForm(p => ({ ...p, friendPhone: e.target.value }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    הערות (אופציונלי)
                  </Label>
                  <Textarea
                    placeholder="למשל: החבר שלי רוצה לרדת 10 קג, דיברנו עליו..."
                    rows={3}
                    value={form.notes}
                    onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  />
                </div>

                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full gradient-primary"
                >
                  <Send className="h-4 w-4 ml-2" />
                  {isSubmitting ? 'שולח...' : 'שלח הפנייה'}
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
