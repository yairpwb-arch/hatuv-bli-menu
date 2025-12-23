import { Home, BookOpen, CalendarCheck, TrendingUp } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/app', icon: Home, label: 'בית' },
  { to: '/app/tracker', icon: CalendarCheck, label: 'מעקב' },
  { to: '/app/content', icon: BookOpen, label: 'תכנים' },
  { to: '/app/progress', icon: TrendingUp, label: 'התקדמות' },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-lg">
      <div className="flex items-center justify-around h-16 max-w-md mx-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/app'}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center w-full h-full transition-all duration-200',
                'hover:bg-secondary/50 active:scale-95',
                isActive 
                  ? 'text-primary' 
                  : 'text-muted-foreground'
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon 
                  className={cn(
                    'h-6 w-6 transition-transform duration-200',
                    isActive && 'scale-110'
                  )} 
                />
                <span className={cn(
                  'text-xs mt-1 font-medium',
                  isActive && 'font-semibold'
                )}>
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
