import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { BookOpenText, Bot, ClipboardList, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Card, SectionHeader } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PlanDraft, PlanDraftCard } from '@/components/admin/PlanDraftCard';

// bot_settings / workout_templates / bot_workout_plans aren't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface Template { id: string; name: string; audience: string | null; body: string; sort_order: number }

const PRINCIPLES_HINT = `למשל:
- מתחילים: 3 אימוני גוף מלא, 5–6 תרגילים, 2–3 סטים של 10–12, מנוחה 60–90 שנ׳.
- כל אימון מתחיל בתרגיל רגליים מרכזי, ואחריו דחיקה, משיכה, ליבה.
- בבית בלי ציוד: רק משקל גוף וגומיות.
- כאבי גב תחתון: בלי דדליפט וחתירה בכפיפה, במקום זה ...
- התקדמות: מוסיפים חזרות עד הקצה העליון, ואז משקל.`;

/**
 * The workout bot: what it builds plans from (the coaches' principles and
 * template workouts), and the plans it built that wait for a coach.
 */
export default function AdminWorkoutBot() {
  const [principles, setPrinciples] = useState('');
  const [savedPrinciples, setSavedPrinciples] = useState('');
  const [since, setSince] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Partial<Template> | null>(null);
  const [drafts, setDrafts] = useState<PlanDraft[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadDrafts = useCallback(async () => {
    const { data } = await db.from('bot_workout_plans').select('*').in('status', ['building', 'pending', 'failed']).order('created_at', { ascending: false }).limit(50);
    const rows = (data ?? []) as PlanDraft[];
    setDrafts(rows);
    const ids = [...new Set(rows.map((r) => r.user_id))];
    if (ids.length) {
      const { data: ps } = await db.from('profiles').select('id, full_name, email').in('id', ids);
      setNames(new Map(((ps ?? []) as { id: string; full_name: string | null; email: string }[]).map((p) => [p.id, p.full_name || p.email])));
    }
  }, []);

  const load = useCallback(async () => {
    const [s, t] = await Promise.all([
      db.from('bot_settings').select('key, value').in('key', ['workout_principles', 'workout_builder_since']),
      db.from('workout_templates').select('*').order('sort_order').order('created_at'),
    ]);
    const map = new Map(((s.data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
    const p = typeof map.get('workout_principles') === 'string' ? (map.get('workout_principles') as string) : '';
    setPrinciples(p);
    setSavedPrinciples(p);
    setSince(typeof map.get('workout_builder_since') === 'string' ? (map.get('workout_builder_since') as string) : null);
    setTemplates((t.data ?? []) as Template[]);
    await loadDrafts();
    setLoading(false);
  }, [loadDrafts]);

  useEffect(() => {
    void load();
  }, [load]);

  const savePrinciples = async () => {
    setSaving(true);
    const { error } = await db.from('bot_settings').upsert({ key: 'workout_principles', value: principles, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setSaving(false);
    if (error) return toast({ title: 'לא נשמר', description: error.message, variant: 'destructive' });
    setSavedPrinciples(principles);
    toast({ title: 'נשמר', description: 'התוכניות הבאות ייבנו לפי זה' });
  };

  const saveTemplate = async () => {
    if (!editing?.name?.trim() || !editing.body?.trim()) return;
    setSaving(true);
    const row = { name: editing.name.trim(), audience: editing.audience?.trim() || null, body: editing.body, updated_at: new Date().toISOString() };
    const { error } = editing.id
      ? await db.from('workout_templates').update(row).eq('id', editing.id)
      : await db.from('workout_templates').insert({ ...row, sort_order: templates.length });
    setSaving(false);
    if (error) return toast({ title: 'לא נשמר', description: error.message, variant: 'destructive' });
    setEditing(null);
    toast({ title: 'התבנית נשמרה' });
    void load();
  };

  const removeTemplate = async (t: Template) => {
    if (!window.confirm(`למחוק את התבנית "${t.name}"?`)) return;
    await db.from('workout_templates').delete().eq('id', t.id);
    void load();
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const ready = !!savedPrinciples.trim() || templates.length > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-card-gap" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Bot className="h-6 w-6 text-primary" />בוט אימונים</h1>
        <p className="mt-1 text-body text-muted-foreground">
          בונה תוכנית לכל מתאמן שמסיים את שאלון הפתיחה{since ? ` (מ-${format(new Date(since), 'd/M/yyyy')})` : ''}, לפי המסלול שלו. כל תוכנית מחכה לאישור שלכם.
          {!ready && ' כדאי לכתוב לו גם את העקרונות שלכם: בלי זה הוא בוחר תרגילים לפי ידע כללי.'}
        </p>
      </div>

      {/* The tracks (fixed in the code, by the questionnaire) */}
      <Card className="space-y-3">
        <SectionHeader title="המסלולים" icon={ClipboardList} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-label">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 text-right font-semibold">לפי השאלון</th>
                <th className="py-2 text-right font-semibold">בנים</th>
                <th className="py-2 text-right font-semibold">בנות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="py-2 font-semibold">לא מתאמנים כוח קבוע מעל חודשיים</td>
                <td className="py-2">פול באדי (גב וחזה) בשבוע 5–6, ועוד אחד בשבוע 9–10</td>
                <td className="py-2">פול באדי (רגליים ובטן) בשבוע 5–6, ועוד שניים בשבוע 9–10</td>
              </tr>
              <tr>
                <td className="py-2 font-semibold">כוח מעל חודשיים, עד 2 בשבוע</td>
                <td className="py-2">פול באדי אחד (גב וחזה), מיד</td>
                <td className="py-2">2 פול באדי (רגליים ובטן), מיד</td>
              </tr>
              <tr>
                <td className="py-2 font-semibold">כוח מעל חודשיים, 3+ בשבוע</td>
                <td className="py-2">ABC: רגליים / חזה, יד אחורית, כתפיים / גב, יד קדמית, בטן</td>
                <td className="py-2">LLU: רגליים ובטן ×2, פלג גוף עליון</td>
              </tr>
              <tr>
                <td className="py-2 font-semibold">הצעה בשבועות 9–10</td>
                <td className="py-2">עוד אימון מתח</td>
                <td className="py-2">עוד אימון בטן</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-label text-muted-foreground">הבוט קובע את התרגילים בתוך כל יום, לפי השאלון של המתאמן, העקרונות והתבניות שלכם.</p>
      </Card>

      {/* Waiting for a coach */}
      <Card className="space-y-3">
        <SectionHeader title={`מחכות לאישור${drafts.length ? ` (${drafts.length})` : ''}`} icon={ClipboardList} />
        {drafts.length === 0 ? (
          <p className="text-body text-muted-foreground">אין כרגע תוכניות שמחכות. כשהבוט יבנה תוכנית, היא תופיע כאן, וגם בכרטיס של המתאמן (לשונית "אימון").</p>
        ) : (
          drafts.map((d) => <PlanDraftCard key={d.id} draft={d} name={names.get(d.user_id)} onChanged={loadDrafts} />)
        )}
      </Card>

      {/* The coaches' method */}
      <Card className="space-y-3">
        <SectionHeader title="העקרונות שלכם" icon={BookOpenText} />
        <p className="text-label text-muted-foreground">
          איך אתם בונים אימונים: לפי רמה, מקום וציוד, סטים וחזרות, סדר התרגילים, ממה נזהרים בפציעות, איך מתקדמים. הבוט חייב לעבוד לפי זה, וזה גובר על כל ידע כללי שלו.
        </p>
        <Textarea value={principles} onChange={(e) => setPrinciples(e.target.value)} rows={14} placeholder={PRINCIPLES_HINT} className="text-body leading-relaxed" />
        <div className="flex justify-end">
          <Button onClick={savePrinciples} disabled={saving || principles === savedPrinciples}>
            {saving && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}שמירה
          </Button>
        </div>
      </Card>

      {/* Template workouts */}
      <Card className="space-y-3">
        <SectionHeader
          title="תבניות אימון"
          icon={ClipboardList}
          action={!editing ? { label: 'תבנית חדשה', icon: Plus, onClick: () => setEditing({ name: '', audience: '', body: '' }) } : undefined}
        />
        <p className="text-label text-muted-foreground">
          תוכניות בסיס שאתם כותבים. הבוט בוחר את המתאימה ביותר למתאמן ומתאים אותה אליו. אפשר לכתוב חופשי, למשל "אימון A: סקוואט גביע 3×10, שכיבות סמיכה 3×מקסימום…". שמות התרגילים צריכים להיות כמו בספריית התרגילים.
        </p>

        {editing && (
          <div className="space-y-3 rounded-inner border border-primary/40 bg-primary-tint/30 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>שם התבנית</Label>
                <Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="מתחילים · חדר כושר" />
              </div>
              <div className="space-y-1.5">
                <Label>למי היא מתאימה</Label>
                <Input value={editing.audience ?? ''} onChange={(e) => setEditing({ ...editing, audience: e.target.value })} placeholder="בלי ניסיון באימוני כוח, יש גישה לחדר כושר" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>התוכנית</Label>
              <Textarea value={editing.body ?? ''} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={12} className="text-body leading-relaxed" />
            </div>
            <div className="flex gap-2">
              <Button onClick={saveTemplate} disabled={saving || !editing.name?.trim() || !editing.body?.trim()}>
                {saving && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}שמירת התבנית
              </Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>ביטול</Button>
            </div>
          </div>
        )}

        {templates.length === 0 && !editing && <p className="text-body text-muted-foreground">עוד אין תבניות.</p>}
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="flex items-start gap-3 rounded-inner bg-card-inner px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-body font-semibold">{t.name}</p>
                {t.audience && <p className="text-label text-muted-foreground">{t.audience}</p>}
                <p className="mt-1 line-clamp-2 whitespace-pre-line text-label text-muted-foreground">{t.body}</p>
              </div>
              <Button size="icon" variant="ghost" aria-label="עריכה" onClick={() => setEditing(t)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" aria-label="מחיקה" className="text-destructive" onClick={() => removeTemplate(t)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
