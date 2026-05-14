import { Home, BookOpen, Dumbbell, TrendingUp } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/app', icon: Home, label: 'בית' },
  { to: '/app/workouts', icon: Dumbbell, label: 'אימונים' },
  { to: '/app/content', icon: BookOpen, label: 'תכנים' },
  { to: '/app/progress', icon: TrendingUp, label: 'התקדמות' },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass-surface border-t border-border/40">
      <div className="flex items-center justify-around h-16 max-w-2xl mx-auto px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/app'}
            className={({ isActive }) =>
              cn(
                'relative flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all duration-200 rounded-xl mx-0.5',
                'active:scale-90',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Active pill indicator */}
                {isActive && (
                  <span className="absolute top-2 w-6 h-0.5 rounded-full bg-primary shadow-glow" />
                )}

                {/* Icon with glow when active */}
                <item.icon
                  className={cn(
                    'h-5 w-5 transition-all duration-200',
                    isActive && 'drop-shadow-[0_0_6px_hsl(var(--primary)/0.7)]'
                  )}
                />

                <span className={cn(
                  'text-[10px] font-medium tracking-wide',
                  isActive && 'font-semibold'
                )}>
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
      {/* Spacer for iOS home indicator */}
      <div className="safe-bottom-spacer" />
    </nav>
  );
}
