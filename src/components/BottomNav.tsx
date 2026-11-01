import { House, BicepsFlexed, BookOpen, ChartLine, type LucideIcon } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { tapHaptic } from '@/lib/native';
import { useTabBadges, type TabKey } from '@/hooks/useTabBadges';

interface NavItem {
  key: TabKey;
  to: string;
  icon: LucideIcon;
  label: string;
  /** Read out with the label when the tab has a badge. */
  badgeLabel: string;
}

// First item renders rightmost (RTL).
const navItems: NavItem[] = [
  { key: 'home', to: '/app', icon: House, label: 'בית', badgeLabel: 'יש שאלון שבועי למילוי' },
  { key: 'workouts', to: '/app/workouts', icon: BicepsFlexed, label: 'אימונים', badgeLabel: 'יש עדכון' },
  { key: 'content', to: '/app/content', icon: BookOpen, label: 'תכנים', badgeLabel: 'יש תוכן חדש' },
  { key: 'progress', to: '/app/progress', icon: ChartLine, label: 'התקדמות', badgeLabel: 'יש עדכון' },
];

const isTabActive = (to: string, pathname: string) =>
  to === '/app' ? pathname === '/app' || pathname === '/app/' : pathname.startsWith(to);

export function BottomNav() {
  const { pathname } = useLocation();
  const badges = useTabBadges();
  const activeIndex = navItems.findIndex((item) => isTabActive(item.to, pathname));

  return (
    <nav
      className="app-bar fixed bottom-0 left-0 right-0 z-50 border-t"
      style={{ paddingBottom: 'var(--app-safe-bottom)' }}
    >
      <div role="tablist" aria-label="ניווט ראשי" className="relative flex h-14 max-w-2xl mx-auto">
        {/* One pill that slides between columns. Columns are equal width, so
            shifting by -100% of a column-wide track moves it one tab left (RTL). */}
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute top-[4.5px] right-0 flex w-1/4 justify-center',
            'transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none',
            activeIndex < 0 && 'opacity-0',
          )}
          style={{ transform: `translateX(${-Math.max(activeIndex, 0) * 100}%)` }}
        >
          <span className="h-8 w-14 rounded-full bg-primary/15" />
        </span>

        {navItems.map((item) => {
          const isActive = isTabActive(item.to, pathname);
          const hasBadge = !!badges[item.key];
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/app'}
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? 'page' : undefined}
              aria-label={hasBadge ? `${item.label}, ${item.badgeLabel}` : item.label}
              onClick={(e) => {
                if (isActive) {
                  // Re-tapping the current tab scrolls back to the top.
                  e.preventDefault();
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
                tapHaptic();
              }}
              className={cn(
                'relative z-10 flex flex-1 flex-col items-center justify-center gap-1 select-none',
                'transition-colors duration-200 ease-out',
                isActive ? 'text-primary' : 'text-[color:var(--bar-inactive)]',
              )}
            >
              <span className="relative">
                <item.icon className="h-6 w-6" strokeWidth={2} aria-hidden />
                {hasBadge && (
                  <span
                    aria-hidden
                    className="absolute -top-0.5 -left-1 h-2 w-2 rounded-full bg-primary ring-2 ring-[color:var(--bar-bg)]"
                  />
                )}
              </span>
              <span className={cn('text-[11px] leading-none', isActive ? 'font-bold' : 'font-medium')}>
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
