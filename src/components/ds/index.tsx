/**
 * Design-system building blocks. Screens compose these instead of styling
 * raw divs, so colour, radius, spacing and type all come from the tokens in
 * index.css / tailwind.config.ts.
 */
import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Drawer as DrawerPrimitive } from 'vaul';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/* ── Card ─────────────────────────────────────────────────────────────────── */

interface CardProps extends React.HTMLAttributes<HTMLElement> {
  /** Inner cards sit inside a card: lighter surface, smaller radius. */
  inner?: boolean;
  as?: 'section' | 'div' | 'article';
}

export function Card({ inner = false, as: Tag = 'section', className, ...props }: CardProps) {
  return (
    <Tag
      className={cn(
        inner
          ? 'rounded-inner bg-card-inner p-4'
          : 'rounded-card border border-border bg-card p-card text-card-foreground',
        className,
      )}
      {...props}
    />
  );
}

/* ── Buttons ──────────────────────────────────────────────────────────────── */

type DsButtonProps = Omit<ButtonProps, 'variant'> & { icon?: LucideIcon };

/** Solid brand button — one per screen region, for the main action. */
export const PrimaryButton = React.forwardRef<HTMLButtonElement, DsButtonProps>(
  ({ icon: Icon, className, children, size = 'lg', ...props }, ref) => (
    <Button ref={ref} size={size} className={cn('w-full text-base font-bold', className)} {...props}>
      {Icon && <Icon strokeWidth={2} aria-hidden />}
      {children}
    </Button>
  ),
);
PrimaryButton.displayName = 'PrimaryButton';

/** Quiet button on the inner-card surface, for secondary actions. */
export const SecondaryButton = React.forwardRef<HTMLButtonElement, DsButtonProps>(
  ({ icon: Icon, className, children, ...props }, ref) => (
    <Button ref={ref} variant="secondary" className={className} {...props}>
      {Icon && <Icon strokeWidth={2} aria-hidden />}
      {children}
    </Button>
  ),
);
SecondaryButton.displayName = 'SecondaryButton';

/* ── Pill ─────────────────────────────────────────────────────────────────── */

type PillTone = 'neutral' | 'brand' | 'success';

const PILL_TONES: Record<PillTone, string> = {
  neutral: 'bg-card-inner text-muted-foreground',
  brand: 'bg-primary-tint text-primary-soft',
  success: 'bg-success/10 text-success',
};

interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
  icon?: LucideIcon;
}

export function Pill({ tone = 'neutral', icon: Icon, className, children, ...props }: PillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-3 py-1.5 text-label font-semibold',
        PILL_TONES[tone],
        className,
      )}
      {...props}
    >
      {Icon && <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />}
      {children}
    </span>
  );
}

/* ── StatTile ─────────────────────────────────────────────────────────────── */

interface StatTileProps {
  value: React.ReactNode;
  label: string;
  /** Small line under the label, e.g. "החודש". */
  caption?: string;
  icon?: LucideIcon;
  className?: string;
}

export function StatTile({ value, label, caption, icon: Icon, className }: StatTileProps) {
  return (
    <Card as="div" className={cn('flex flex-col items-center gap-1 px-3 py-4 text-center', className)}>
      {Icon && <Icon className="h-5 w-5 text-primary" strokeWidth={2} aria-hidden />}
      <p className="text-stat tabular-nums" dir="ltr">{value}</p>
      <p className="text-label font-semibold text-foreground">{label}</p>
      {caption && <p className="text-label text-muted-foreground">{caption}</p>}
    </Card>
  );
}

/* ── SectionHeader ────────────────────────────────────────────────────────── */

interface SectionHeaderProps {
  title: string;
  icon?: LucideIcon;
  /** Optional link-style action on the far side, e.g. "כל התמונות". */
  action?: { label: string; onClick: () => void; icon?: LucideIcon };
  className?: string;
}

export function SectionHeader({ title, icon: Icon, action, className }: SectionHeaderProps) {
  const ActionIcon = action?.icon;
  return (
    <div className={cn('flex items-center justify-between gap-2', className)}>
      <h3 className="flex items-center gap-2 text-card-title">
        {Icon && <Icon className="h-5 w-5 text-primary" strokeWidth={2} aria-hidden />}
        {title}
      </h3>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex min-h-[44px] items-center gap-1.5 text-label font-semibold text-primary-soft"
        >
          {ActionIcon && <ActionIcon className="h-4 w-4" strokeWidth={2} aria-hidden />}
          {action.label}
        </button>
      )}
    </div>
  );
}

/* ── EmptyState ───────────────────────────────────────────────────────────── */

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-2 py-6 text-center', className)}>
      <Icon className="h-8 w-8 text-muted-foreground" strokeWidth={2} aria-hidden />
      <p className="text-body font-bold">{title}</p>
      {description && <p className="text-label text-muted-foreground">{description}</p>}
      {action && (
        <PrimaryButton className="mt-2" onClick={action.onClick}>
          {action.label}
        </PrimaryButton>
      )}
    </div>
  );
}

/* ── BottomSheet ──────────────────────────────────────────────────────────── */

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Opens from the bottom over a dimmed backdrop: 24px top corners, a drag
 * handle, and padding for the safe area. Actions go in the children, two
 * side by side (see SheetActions).
 */
export function BottomSheet({ open, onOpenChange, title, description, children }: BottomSheetProps) {
  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/60" />
        <DrawerPrimitive.Content
          dir="rtl"
          className="fixed inset-x-0 bottom-0 z-[80] flex flex-col rounded-t-[24px] border-t border-border bg-card px-5 pt-3 outline-none"
          // Never taller than the screen below the status bar; the content scrolls inside.
          style={{ paddingBottom: 'calc(1.25rem + var(--app-safe-bottom))', maxHeight: 'calc(100dvh - var(--app-safe-top) - 24px)' }}
        >
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-pill bg-border" aria-hidden />
          <DrawerPrimitive.Title className="text-card-title">{title}</DrawerPrimitive.Title>
          {description && (
            <DrawerPrimitive.Description className="mt-1 text-body text-muted-foreground">{description}</DrawerPrimitive.Description>
          )}
          <div className="-mx-5 mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">{children}</div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}

/** Two equal buttons in a row, 52px tall, 12px apart. */
export function SheetActions({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 [&>button]:h-[52px]">{children}</div>;
}
