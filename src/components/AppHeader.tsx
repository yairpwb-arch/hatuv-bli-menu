import { useEffect, useState } from 'react';
import { ChevronLeft, Gift, LogOut, Settings, SlidersHorizontal, User, type LucideIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { initials } from '@/lib/initials';
import { cn } from '@/lib/utils';

function MenuRow({ icon: Icon, label, onSelect }: { icon: LucideIcon; label: string; onSelect: () => void }) {
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      className="flex h-12 cursor-pointer items-center gap-3 rounded-button px-3 text-body focus:bg-card focus:text-foreground"
    >
      <Icon className="h-5 w-5 text-muted-foreground" strokeWidth={2} />
      <span className="flex-1">{label}</span>
      <ChevronLeft className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
    </DropdownMenuItem>
  );
}

export function AppHeader() {
  const { profile, signOut, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  // Close the menu as soon as the page scrolls under it.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, { passive: true });
    return () => window.removeEventListener('scroll', close);
  }, [open]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const name = profile?.full_name || 'משתמש';
  const avatar = (size: 'sm' | 'md') => (
    <Avatar className={size === 'md' ? 'h-10 w-10' : 'h-8 w-8'}>
      {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="" className="object-cover" />}
      <AvatarFallback className={cn('bg-primary-tint font-bold text-primary-soft', size === 'md' ? 'text-body' : 'text-label')}>
        {initials(profile?.full_name) || <User className="h-4 w-4" strokeWidth={2} />}
      </AvatarFallback>
    </Avatar>
  );

  return (
    <header className="app-bar sticky top-0 z-40 border-b safe-top">
      <div className="flex items-center justify-between px-4 h-14 max-w-2xl mx-auto">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="חטוב בלי תפריט" className="w-8 h-8 rounded-full object-cover" />
          <h1 className="text-base font-bold text-primary-soft">חטוב בלי תפריט</h1>
        </div>

        <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="תפריט משתמש"
              className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-pill"
            >
              {avatar('sm')}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={6}
            className="w-[260px] rounded-inner border-border bg-card-inner p-2 shadow-lg data-[state=open]:animate-menu-in"
          >
            <div className="flex items-center gap-3 px-2 pb-3 pt-1">
              {avatar('md')}
              <div className="min-w-0">
                <p className="truncate text-body font-bold">{name}</p>
                <p className="truncate text-label text-muted-foreground" dir="ltr">{profile?.email}</p>
              </div>
            </div>
            {isAdmin && <MenuRow icon={Settings} label="ניהול מערכת" onSelect={() => navigate('/admin')} />}
            <MenuRow icon={User} label="הפרופיל שלי" onSelect={() => navigate('/app/profile')} />
            <MenuRow icon={SlidersHorizontal} label="הגדרות" onSelect={() => navigate('/app/settings')} />
            <MenuRow icon={Gift} label="חבר מביא חבר" onSelect={() => navigate('/app/referral')} />
            <DropdownMenuSeparator className="my-2 bg-border" />
            <DropdownMenuItem
              onSelect={() => setConfirmSignOut(true)}
              className="flex h-12 cursor-pointer items-center gap-3 rounded-button px-3 text-body text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              <LogOut className="h-5 w-5" strokeWidth={2} />
              התנתק
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={confirmSignOut} onOpenChange={setConfirmSignOut}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>להתנתק?</AlertDialogTitle>
            <AlertDialogDescription>הנתונים שלך שמורים. אפשר להתחבר שוב בכל רגע.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleSignOut} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              התנתק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
