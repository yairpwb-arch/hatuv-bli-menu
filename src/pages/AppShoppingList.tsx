import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { ArrowRight, Check, Lock, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, EmptyState, SheetActions } from '@/components/ds';
import { Illustration } from '@/components/illustrations/Illustration';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { applySequentialGate } from '@/lib/contentGate';
import type { ContentItem } from '@/lib/contentModel';
import { openExternalLink } from '@/lib/externalLink';
import { shoppingList, type ShoppingCategory } from '@/lib/guideBlocks';
import { selectionHaptic } from '@/lib/native';
import { cn } from '@/lib/utils';

type Row = ContentItem & { body?: unknown };

const marksKey = (userId: string) => `shoppingList:${userId}`;

/** "רשימת קניות 🛒", then the marked items under their categories. */
export function shoppingMessage(categories: ShoppingCategory[], marked: Set<string>): string {
  const parts = categories
    .map((c) => ({ title: c.title, items: c.items.filter((i) => marked.has(i)) }))
    .filter((c) => c.items.length > 0)
    .map((c) => [`*${c.title}*`, ...c.items.map((i) => `- ${i}`)].join('\n'));
  return ['רשימת קניות 🛒', ...parts].join('\n\n');
}

/**
 * The shopping list: interactive, not a story. The items come from Supabase
 * (the row's body); what the trainee marked to buy stays on this device until
 * they clear it, and can be sent as a WhatsApp message.
 */
export default function AppShoppingList() {
  const navigate = useNavigate();
  const { user, currentDay } = useAuth();
  const [row, setRow] = useState<Row | null>(null);
  const [snacksBook, setSnacksBook] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setIsLoading(true);
      const [contentRes, progressRes, settingsRes, saved] = await Promise.all([
        supabase.from('program_content').select('*').filter('archived_at', 'is', null).order('sort_order', { ascending: true }),
        supabase.from('content_progress').select('content_id').eq('user_id', user.id),
        supabase.from('app_settings').select('key, value').in('key', ['snacks_book_link']),
        Preferences.get({ key: marksKey(user.id) }),
      ]);
      const done = new Set(progressRes.data?.map((p) => p.content_id) ?? []);
      const all = applySequentialGate(
        (contentRes.data ?? []).map((item) => ({
          ...item,
          dateUnlocked: currentDay >= item.unlock_day,
          isCompleted: done.has(item.id),
          daysUntilUnlock: Math.max(0, item.unlock_day - currentDay),
        })),
      ) as Row[];
      const found = all.find((x) => shoppingList(x.body)) ?? null;
      setRow(found);
      setSnacksBook(settingsRes.data?.find((s) => s.key === 'snacks_book_link')?.value?.trim() || '');
      try {
        setMarked(new Set(saved.value ? (JSON.parse(saved.value) as string[]) : []));
      } catch {
        setMarked(new Set());
      }
      setIsLoading(false);
      // Opening it is what this stage asks for: the path moves on.
      if (found?.isUnlocked && !found.isCompleted) {
        await supabase.from('content_progress').insert({ user_id: user.id, content_id: found.id });
      }
    })();
  }, [user, currentDay]);

  const list = useMemo(() => shoppingList(row?.body), [row]);

  const update = (change: (current: Set<string>) => Set<string>) =>
    setMarked((current) => {
      const next = change(current);
      if (user) void Preferences.set({ key: marksKey(user.id), value: JSON.stringify([...next]) });
      return next;
    });

  const toggle = (item: string) => {
    selectionHaptic();
    update((current) => {
      const next = new Set(current);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  };

  // Items since removed from the list don't count or get sent.
  const count = useMemo(() => (list ? list.categories.flatMap((c) => c.items).filter((i) => marked.has(i)).length : 0), [list, marked]);

  const send = () => {
    if (!list || count === 0) return;
    const url = `https://wa.me/?text=${encodeURIComponent(shoppingMessage(list.categories, marked))}`;
    window.open(url, Capacitor.isNativePlatform() ? '_system' : '_blank');
  };

  const openLink = (target: string) => {
    if (target !== 'snacks_book') return;
    if (snacksBook) openExternalLink(snacksBook);
    else toast('הקישור לספר הנשנושים לא הוגדר עדיין');
  };

  const back = (
    <button type="button" onClick={() => navigate(-1)} aria-label="חזרה" className="-mr-2 inline-flex h-11 w-11 items-center justify-center text-foreground">
      <ArrowRight className="h-6 w-6" strokeWidth={2} />
    </button>
  );

  if (isLoading) {
    return (
      <div className="space-y-4 px-4 pb-24 pt-4" dir="rtl">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    );
  }

  if (!list || !row?.isUnlocked) {
    return (
      <div className="px-4 pb-24 pt-4" dir="rtl">
        {back}
        <EmptyState
          icon={Lock}
          title={!list ? 'רשימת הקניות תעלה בקרוב' : 'רשימת הקניות עוד נעולה'}
          description={!list ? 'אפשר לחזור לכאן מאוחר יותר' : 'היא תיפתח עם השלב שלה בתוכנית'}
        />
      </div>
    );
  }

  return (
    <div className="px-4 pb-[calc(3.5rem+var(--app-safe-bottom)+96px)] pt-4" dir="rtl">
      {back}
      <h1 className="text-screen-title">{list.title}</h1>
      <p className="mt-1 text-body text-muted-foreground">{list.subtitle}</p>

      <div className="mt-5 space-y-card-gap">
        {list.categories.map((c) => (
          <Card key={c.title} className="space-y-2">
            <div className="flex items-center gap-3">
              <Illustration name={c.visual} size={56} />
              <h2 className="text-card-title">{c.title}</h2>
            </div>
            <ul>
              {c.items.map((item) => {
                const on = marked.has(item);
                return (
                  <li key={item}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(item)}
                      className="flex min-h-[48px] w-full items-center gap-3 border-t border-border py-2 text-right"
                    >
                      <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/50')}>
                        {on && <Check className="h-4 w-4" strokeWidth={3} aria-hidden />}
                      </span>
                      <span className={cn('min-w-0 text-body', on && 'font-semibold')}>{item}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {c.link && (
              <button type="button" onClick={() => openLink(c.link!.target)} className="min-h-[44px] w-full text-right text-label font-semibold text-primary-soft underline underline-offset-4">
                {c.link.label}
              </button>
            )}
          </Card>
        ))}
      </div>

      {count > 0 && (
        <button type="button" onClick={() => setConfirmClear(true)} className="mt-3 min-h-[44px] w-full text-label font-semibold text-muted-foreground">
          נקה סימונים
        </button>
      )}

      {/* Always at hand, above the tab bar */}
      <div className="fixed inset-x-0 z-30 mx-auto max-w-2xl px-4" style={{ bottom: 'calc(3.5rem + var(--app-safe-bottom) + 12px)' }}>
        <Button className="h-[52px] w-full text-[15px] font-bold shadow-lg" disabled={count === 0} onClick={send}>
          <Send strokeWidth={2} />
          שלח את הרשימה בוואטסאפ ({count === 1 ? 'פריט אחד' : `${count} פריטים`})
        </Button>
      </div>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogTitle className="text-card-title">לנקות את כל הסימונים?</DialogTitle>
          <SheetActions>
            <Button
              variant="outline"
              onClick={() => {
                update(() => new Set());
                setConfirmClear(false);
              }}
            >
              נקה
            </Button>
            <Button onClick={() => setConfirmClear(false)}>השאר</Button>
          </SheetActions>
        </DialogContent>
      </Dialog>
    </div>
  );
}
