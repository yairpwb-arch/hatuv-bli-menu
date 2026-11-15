import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import type { Option } from '@/lib/onboarding';
import {
  CATALOG, CUSTOM_KINDS, type CatalogItem, type CustomKind, LOCKED, LOCK_REASON, QUESTIONNAIRE_INFO,
  type QuestionnaireId, TEXTS_KEY, type TextRow, useQuestionnaireTexts,
} from '@/lib/questionnaireTexts';

// questionnaire_texts isn't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const ORDER: QuestionnaireId[] = ['onboarding', 'weekly', 'workout'];
const kindLabel = (k: CustomKind | null) => CUSTOM_KINDS.find((x) => x.value === k)?.label ?? '';
/** The opening questionnaire doesn't know the gender yet (it asks it): there it's "את/ה". */
const genderHint = (q: QuestionnaireId) =>
  q === 'onboarding' ? 'לשון זכר ונקבה: כותבים את/ה (בשאלון הזה עוד לא יודעים מה המין)' : 'לשון זכר ונקבה: {אתה|את}, וכל מתאמן רואה את שלו';

/**
 * Admin → שאלונים → שאלות: every questionnaire of the app as the trainee sees it.
 * Built-in questions: change the wording and the answer labels, or hide the ones
 * the app doesn't rely on. And questions of the coaches' own, of any kind.
 */
export function QuestionnaireEditor() {
  const [which, setWhich] = useState<QuestionnaireId>('weekly');
  const { data: rows, isLoading } = useQuestionnaireTexts();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: TEXTS_KEY });

  const mine = useMemo(() => (rows ?? []).filter((r) => r.questionnaire === which), [rows, which]);
  const edits = new Map(mine.filter((r) => !r.is_custom).map((r) => [r.key, r]));
  const custom = mine.filter((r) => r.is_custom).sort((a, b) => a.sort_order - b.sort_order);

  const saveRow = async (row: Partial<TextRow> & { key: string }) => {
    const { error } = await db.from('questionnaire_texts').upsert(
      { questionnaire: which, is_custom: false, hidden: false, required: true, sort_order: 0, ...row, updated_at: new Date().toISOString() },
      { onConflict: 'questionnaire,key' },
    );
    if (error) {
      toast({ title: 'לא נשמר', description: error.message, variant: 'destructive' });
      return false;
    }
    await refresh();
    return true;
  };
  const removeRow = async (key: string) => {
    const { error } = await db.from('questionnaire_texts').delete().eq('questionnaire', which).eq('key', key);
    if (error) return toast({ title: 'לא נמחק', description: error.message, variant: 'destructive' });
    await refresh();
  };

  return (
    <div className="space-y-4">
      {/* The three questionnaires */}
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-1">
        {ORDER.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setWhich(q)}
            className={cn('rounded-lg px-2 py-2 text-sm font-semibold transition-colors', which === q ? 'bg-card shadow-sm' : 'text-muted-foreground')}
          >
            {QUESTIONNAIRE_INFO[q].label}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{QUESTIONNAIRE_INFO[which].label}:</span> {QUESTIONNAIRE_INFO[which].when}.
        {' '}השינויים מגיעים למתאמנים מיד, בפעם הבאה שהשאלון נפתח.
      </p>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
      ) : (
        <>
          <div className="space-y-2">
            {CATALOG[which].map((item, i) => (
              <BuiltInQuestion
                key={item.key}
                n={i + 1}
                item={item}
                edit={edits.get(item.key)}
                locked={LOCKED[which].has(item.key)}
                lockReason={LOCK_REASON[which]}
                onSave={(patch) => saveRow({ key: item.key, ...patch })}
                onReset={() => removeRow(item.key)}
                hint={genderHint(which)}
              />
            ))}
          </div>

          <CustomQuestions
            which={which}
            rows={custom}
            onSave={(row) => saveRow({ ...row, is_custom: true })}
            onDelete={removeRow}
          />
        </>
      )}
    </div>
  );
}

// ── A built-in question ──────────────────────────────────────────────────────

function BuiltInQuestion({
  n, item, edit, locked, lockReason, onSave, onReset, hint,
}: {
  hint: string;
  n: number;
  item: CatalogItem;
  edit: TextRow | undefined;
  locked: boolean;
  lockReason: string;
  onSave: (patch: Partial<TextRow>) => Promise<boolean>;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const title = edit?.title?.trim() || item.title;
  const subtitle = edit && edit.subtitle != null ? edit.subtitle : item.subtitle;
  const hidden = !!edit?.hidden && !locked;
  const labelOf = (o: Option) => edit?.options?.find((e) => e.value === o.value)?.label?.trim() || o.label;

  const [draft, setDraft] = useState({ title, subtitle: subtitle ?? '', labels: {} as Record<string, string> });
  const startEdit = () => {
    setDraft({ title, subtitle: subtitle ?? '', labels: Object.fromEntries((item.options ?? []).map((o) => [o.value, labelOf(o)])) });
    setOpen(true);
  };
  const save = async () => {
    const options = item.options?.map((o) => ({ value: o.value, label: draft.labels[o.value]?.trim() || o.label })) ?? null;
    const changed = (s: string, d?: string) => (s.trim() && s.trim() !== (d ?? '') ? s.trim() : null);
    const ok = await onSave({
      title: changed(draft.title, item.title),
      // An emptied subtitle is kept as '' (= no subtitle); unchanged → null (= the code's).
      subtitle: draft.subtitle.trim() === (item.subtitle ?? '') ? null : draft.subtitle.trim(),
      options: options && options.some((o, i) => o.label !== item.options![i].label) ? options : null,
      hidden,
    });
    if (ok) {
      setOpen(false);
      toast({ title: 'נשמר' });
    }
  };

  return (
    <div className={cn('rounded-xl border border-border bg-card p-3', hidden && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-5 shrink-0 text-center text-xs text-muted-foreground tabular-nums">{n}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          {item.options && (
            <p className="mt-1 text-xs text-muted-foreground">תשובות: {item.options.map(labelOf).join(' · ')}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-[11px]">{item.type}</Badge>
            {item.note && <span className="text-[11px] text-muted-foreground">{item.note}</span>}
            {edit && (edit.title || edit.subtitle != null || edit.options) && <Badge className="text-[11px]">נערך</Badge>}
            {hidden && <Badge variant="outline" className="text-[11px]">מוסתר</Badge>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {locked ? (
            <span title={lockReason} className="p-1.5 text-muted-foreground"><Lock className="h-4 w-4" /></span>
          ) : (
            <button
              type="button"
              title={hidden ? 'להציג במתאמנים' : 'להסתיר מהמתאמנים'}
              onClick={() => onSave({ title: edit?.title ?? null, subtitle: edit?.subtitle ?? null, options: edit?.options ?? null, hidden: !hidden })}
              className="p-1.5 text-muted-foreground hover:text-foreground"
            >
              {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
          <button type="button" title="עריכה" onClick={() => (open ? setOpen(false) : startEdit())} className="p-1.5 text-muted-foreground hover:text-primary">
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <Field label="השאלה">
            <Input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
          </Field>
          <Field label="הסבר מתחת לשאלה (אפשר להשאיר ריק)">
            <Input value={draft.subtitle} onChange={(e) => setDraft((d) => ({ ...d, subtitle: e.target.value }))} />
          </Field>
          {item.options && (
            <Field label="נוסח התשובות (התשובות עצמן קבועות, כי האפליקציה נשענת עליהן)">
              <div className="space-y-1.5">
                {item.options.map((o) => (
                  <Input
                    key={o.value}
                    value={draft.labels[o.value] ?? ''}
                    placeholder={o.label}
                    onChange={(e) => setDraft((d) => ({ ...d, labels: { ...d.labels, [o.value]: e.target.value } }))}
                  />
                ))}
              </div>
            </Field>
          )}
          <p className="text-xs text-muted-foreground">{hint}{item.title.includes('{name}') ? ' · {name} = שם האימון' : ''}</p>
          {locked && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3 w-3" />{lockReason}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={save}>שמירה</Button>
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>ביטול</Button>
            {edit && (
              <Button size="sm" variant="ghost" className="gap-1" onClick={() => { onReset(); setOpen(false); }}>
                <RotateCcw className="h-3.5 w-3.5" />חזרה לנוסח המקורי
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Questions the coaches added ──────────────────────────────────────────────

const EMPTY = { title: '', subtitle: '', kind: 'scale' as CustomKind, options: '', required: true };

function CustomQuestions({
  which, rows, onSave, onDelete,
}: {
  which: QuestionnaireId;
  rows: TextRow[];
  onSave: (row: Partial<TextRow> & { key: string }) => Promise<boolean>;
  onDelete: (key: string) => void;
}) {
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState(EMPTY);
  const [deleting, setDeleting] = useState<TextRow | null>(null);
  const withOptions = draft.kind === 'single' || draft.kind === 'multi';

  const open = (r?: TextRow) => {
    setDraft(r
      ? { title: r.title ?? '', subtitle: r.subtitle ?? '', kind: r.kind ?? 'text', options: (r.options ?? []).map((o) => o.label).join('\n'), required: r.required }
      : EMPTY);
    setEditing(r ? r.key : 'new');
  };
  const save = async () => {
    if (!draft.title.trim()) return toast({ title: 'צריך לכתוב את השאלה', variant: 'destructive' });
    const labels = draft.options.split('\n').map((s) => s.trim()).filter(Boolean);
    if (withOptions && labels.length < 2) return toast({ title: 'צריך לפחות 2 תשובות, כל אחת בשורה', variant: 'destructive' });
    const old = rows.find((r) => r.key === editing);
    const key = old?.key ?? `custom_${Date.now().toString(36)}`;
    // Option values stay as they were for labels that didn't change (answers already given keep their meaning).
    const options = withOptions
      ? labels.map((label, i) => ({ value: old?.options?.find((o) => o.label === label)?.value ?? `o${Date.now().toString(36)}_${i}`, label }))
      : null;
    const ok = await onSave({
      key,
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim() || null,
      kind: draft.kind,
      options,
      required: draft.required,
      sort_order: old?.sort_order ?? (rows.length ? Math.max(...rows.map((r) => r.sort_order)) + 1 : 1),
      hidden: old?.hidden ?? false,
    });
    if (ok) {
      setEditing(null);
      toast({ title: 'נשמר' });
    }
  };
  const move = async (i: number, dir: -1 | 1) => {
    const a = rows[i];
    const b = rows[i + dir];
    if (!a || !b) return;
    await onSave({ ...a, sort_order: b.sort_order });
    await onSave({ ...b, sort_order: a.sort_order === b.sort_order ? a.sort_order + dir : a.sort_order });
  };

  return (
    <section className="space-y-2 pt-2">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold">שאלות שהוספתם</h3>
          <p className="text-xs text-muted-foreground">
            {which === 'onboarding' ? 'מופיעות לפני התמונות והמדידות בסוף השאלון' : which === 'weekly' ? 'מופיעות אחרי ההרגלים, בכל שבוע' : 'מופיעות בשאלות האימונים, לפני "דבר נוסף"'}
          </p>
        </div>
        <Button size="sm" className="gap-1" onClick={() => open()} disabled={editing === 'new'}>
          <Plus className="h-4 w-4" />הוספת שאלה
        </Button>
      </div>

      {rows.length === 0 && editing !== 'new' && <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">עוד לא הוספתם שאלות לשאלון הזה</p>}

      {rows.map((r, i) => (
        <div key={r.key} className={cn('rounded-xl border border-border bg-card p-3', r.hidden && 'opacity-60')}>
          {editing === r.key ? (
            <CustomForm draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setEditing(null)} hint={genderHint(which)} />
          ) : (
            <div className="flex items-start gap-3">
              <div className="flex shrink-0 flex-col">
                <button type="button" aria-label="למעלה" disabled={i === 0} onClick={() => move(i, -1)} className="text-muted-foreground disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" aria-label="למטה" disabled={i === rows.length - 1} onClick={() => move(i, 1)} className="text-muted-foreground disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{r.title}</p>
                {r.subtitle && <p className="text-xs text-muted-foreground">{r.subtitle}</p>}
                {r.options?.length ? <p className="mt-1 text-xs text-muted-foreground">תשובות: {r.options.map((o) => o.label).join(' · ')}</p> : null}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-[11px]">{kindLabel(r.kind)}</Badge>
                  <Badge variant="outline" className="text-[11px]">{r.required ? 'חובה' : 'לא חובה'}</Badge>
                  {r.hidden && <Badge variant="outline" className="text-[11px]">מוסתר</Badge>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" title={r.hidden ? 'להציג' : 'להסתיר'} onClick={() => onSave({ ...r, hidden: !r.hidden })} className="p-1.5 text-muted-foreground hover:text-foreground">
                  {r.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button type="button" title="עריכה" onClick={() => open(r)} className="p-1.5 text-muted-foreground hover:text-primary"><Pencil className="h-4 w-4" /></button>
                <button type="button" title="מחיקה" onClick={() => setDeleting(r)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          )}
        </div>
      ))}

      {editing === 'new' && (
        <div className="rounded-xl border border-primary/50 bg-card p-3">
          <CustomForm draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setEditing(null)} hint={genderHint(which)} />
        </div>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת שאלה</AlertDialogTitle>
            <AlertDialogDescription>
              למחוק את "{deleting?.title}"? היא לא תופיע יותר בשאלון. תשובות שכבר נשלחו נשארות שמורות.
              {' '}אם רק רוצים להפסיק לשאול אותה לזמן מה, אפשר להסתיר במקום.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleting) onDelete(deleting.key); setDeleting(null); }}
            >
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function CustomForm({
  draft, setDraft, onSave, onCancel, hint,
}: {
  hint: string;
  draft: typeof EMPTY;
  setDraft: React.Dispatch<React.SetStateAction<typeof EMPTY>>;
  onSave: () => void;
  onCancel: () => void;
}) {
  const withOptions = draft.kind === 'single' || draft.kind === 'multi';
  return (
    <div className="space-y-3">
      <Field label="השאלה">
        <Input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} autoFocus />
      </Field>
      <Field label="הסבר מתחת לשאלה (לא חובה)">
        <Input value={draft.subtitle} onChange={(e) => setDraft((d) => ({ ...d, subtitle: e.target.value }))} />
      </Field>
      <Field label="סוג התשובה">
        <div className="flex flex-wrap gap-1.5">
          {CUSTOM_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => setDraft((d) => ({ ...d, kind: k.value }))}
              className={cn('rounded-full border px-3 py-1 text-xs font-semibold', draft.kind === k.value ? 'border-primary bg-primary/10 text-primary' : 'border-border')}
            >
              {k.label}
            </button>
          ))}
        </div>
      </Field>
      {withOptions && (
        <Field label="התשובות, כל אחת בשורה">
          <Textarea rows={4} value={draft.options} onChange={(e) => setDraft((d) => ({ ...d, options: e.target.value }))} />
        </Field>
      )}
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={draft.required} onCheckedChange={(v) => setDraft((d) => ({ ...d, required: v }))} />
        חובה לענות
      </label>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave}>שמירה</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>ביטול</Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
