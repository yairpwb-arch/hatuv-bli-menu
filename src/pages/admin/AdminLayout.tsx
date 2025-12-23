import { useEffect } from 'react';
import { useNavigate, Outlet, NavLink, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { Users, BookOpen, Quote, ArrowRight, LayoutDashboard, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const adminNavItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'סקירה', end: true },
  { to: '/admin/users', icon: Users, label: 'משתמשים' },
  { to: '/admin/content', icon: BookOpen, label: 'תכנים' },
  { to: '/admin/quotes', icon: Quote, label: 'ציטוטים' },
];

export default function AdminLayout() {
  const { isAdmin, isLoading, user, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }

    if (!isAdmin) {
      navigate('/app', { replace: true });
    }
  }, [isAdmin, isLoading, user, navigate]);

  const handleLogout = async () => {
    try {
      await signOut();
      toast({ title: 'להתראות!', description: 'התנתקת בהצלחה' });
      navigate('/auth', { replace: true });
    } catch (error) {
      console.error('Logout error:', error);
      toast({ title: 'שגיאה', description: 'לא ניתן להתנתק', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/app')}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowRight className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-bold text-primary">לוח ניהול</h1>
          </div>
          
          {/* Logout Button in Header */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4 ml-2" />
            התנתקות
          </Button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-card border-b border-border px-4 overflow-x-auto">
        <div className="flex gap-1">
          {adminNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="p-4">
        <Outlet />
      </main>
    </div>
  );
}
