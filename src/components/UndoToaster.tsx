import { Toaster } from 'sonner';

/**
 * The app's toast host: bottom-centre, just above the tab bar, in the app's
 * own colours. The action ("ביטול") is a text link in the brand colour.
 */
export function UndoToaster() {
  const bottom = 'calc(3.5rem + 1px + var(--app-safe-bottom) + 8px)';
  return (
    <Toaster
      position="bottom-center"
      dir="rtl"
      offset={{ bottom }}
      mobileOffset={{ bottom, left: 16, right: 16 }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-full items-center gap-3 rounded-inner border border-border bg-card-inner px-4 py-3 text-body text-foreground shadow-lg',
          title: 'flex-1 font-semibold',
          description: 'text-label text-muted-foreground',
          actionButton: 'min-h-[44px] shrink-0 px-2 text-body font-bold text-primary-soft',
        },
      }}
    />
  );
}
