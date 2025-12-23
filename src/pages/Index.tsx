import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Dumbbell, ArrowLeft, Sparkles, Target, Apple } from 'lucide-react';

export default function Index() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="animate-slide-up">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl gradient-primary mb-6 shadow-glow">
            <Dumbbell className="h-10 w-10 text-primary-foreground" />
          </div>
          
          <h1 className="text-4xl font-bold text-foreground mb-3">
            הטוב בלי תפריט
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-sm">
            התוכנית שתשנה את חייך ב-168 ימים
          </p>
        </div>

        {/* Features */}
        <div className="grid gap-4 w-full max-w-sm mb-8 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          {[
            { icon: Target, text: 'הרגלים יומיים מותאמים אישית' },
            { icon: Apple, text: 'מעקב תזונה ללא ספירת קלוריות' },
            { icon: Sparkles, text: 'ניתוח AI חכם לארוחות' },
          ].map((feature, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-4 rounded-xl glass-card"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <feature.icon className="h-5 w-5 text-primary" />
              </div>
              <span className="font-medium">{feature.text}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="w-full max-w-sm space-y-3 animate-slide-up" style={{ animationDelay: '0.3s' }}>
          <Button
            size="lg"
            className="w-full h-14 text-lg gradient-primary shadow-glow"
            onClick={() => navigate('/auth')}
          >
            התחל את המסע
            <ArrowLeft className="h-5 w-5 mr-2" />
          </Button>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-6 text-center text-sm text-muted-foreground">
        © 2024 הטוב בלי תפריט
      </footer>
    </div>
  );
}
