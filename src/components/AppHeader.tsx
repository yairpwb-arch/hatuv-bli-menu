import { Settings, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';

export function AppHeader() {
  const { profile, signOut, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-sm border-b border-border">
      <div className="flex items-center justify-between px-4 h-14">
        <h1 className="text-lg font-bold text-primary">חטוב בלי תפריט</h1>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <User className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{profile?.full_name || 'משתמש'}</p>
              <p className="text-xs text-muted-foreground">{profile?.email}</p>
            </div>
            <DropdownMenuSeparator />
            {/* Only show admin link for yairpwb@gmail.com */}
            {isAdmin && (
              <DropdownMenuItem onClick={() => navigate('/admin')}>
                <Settings className="ml-2 h-4 w-4" />
                ניהול מערכת
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => navigate('/app/profile')}>
              <User className="ml-2 h-4 w-4" />
              הפרופיל שלי
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
              התנתק
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}