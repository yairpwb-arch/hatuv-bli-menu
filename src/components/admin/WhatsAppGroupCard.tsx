import { useEffect, useState } from 'react';
import { Loader2, MessageCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// whatsapp_groups isn't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface GroupRow {
  chat_id: string;
  name: string | null;
  user_id: string | null;
  bot_enabled: boolean;
  draft_mode: boolean;
}

const NONE = '__none__';

/**
 * A trainee's WhatsApp group (the one the bot sits in, with us and the trainee),
 * and the bot's switches for it. Admin dashboard only: the bot has no screen in the app.
 */
export function WhatsAppGroupCard({ userId }: { userId: string }) {
  const [groups, setGroups] = useState<{ chat_id: string; name: string }[]>([]);
  const [taken, setTaken] = useState<Map<string, string | null>>(new Map());
  const [mine, setMine] = useState<GroupRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setListError(null);
    const [rows, list] = await Promise.all([
      db.from('whatsapp_groups').select('chat_id, name, user_id, bot_enabled, draft_mode'),
      supabase.functions.invoke('whatsapp-admin', { body: { action: 'list_groups' } }),
    ]);
    const all = (rows.data ?? []) as GroupRow[];
    setMine(all.find((g) => g.user_id === userId) ?? null);
    setTaken(new Map(all.map((g) => [g.chat_id, g.user_id])));
    if (list.error || !list.data?.groups) setListError('לא הצלחנו לקבל את רשימת הקבוצות מ-Green API');
    setGroups((list.data?.groups ?? []) as { chat_id: string; name: string }[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /** Links the trainee to a group (or unlinks): the bot starts off, in draft mode. */
  const choose = async (chatId: string) => {
    setSaving(true);
    let error: { message: string } | null = null;
    if (mine) ({ error } = await db.from('whatsapp_groups').update({ user_id: null, bot_enabled: false }).eq('chat_id', mine.chat_id));
    if (!error && chatId !== NONE) {
      const name = groups.find((g) => g.chat_id === chatId)?.name ?? null;
      ({ error } = await db
        .from('whatsapp_groups')
        .upsert({ chat_id: chatId, name, user_id: userId, bot_enabled: false, draft_mode: true }, { onConflict: 'chat_id' }));
    }
    setSaving(false);
    if (error) toast({ title: 'שגיאה', description: error.message, variant: 'destructive' });
    await load();
  };

  const setFlag = async (key: 'bot_enabled' | 'draft_mode', value: boolean) => {
    if (!mine) return;
    setMine({ ...mine, [key]: value });
    const { error } = await db.from('whatsapp_groups').update({ [key]: value }).eq('chat_id', mine.chat_id);
    if (error) {
      toast({ title: 'שגיאה', description: error.message, variant: 'destructive' });
      await load();
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <MessageCircle className="h-4 w-4 text-primary" />
          קבוצת וואטסאפ
        </p>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />רענון
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-3"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : (
        <>
          <Select value={mine?.chat_id ?? NONE} onValueChange={(v) => void choose(v)} disabled={saving}>
            <SelectTrigger><SelectValue placeholder="בחירת קבוצה" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>ללא קבוצה</SelectItem>
              {/* Its saved group, even if Green API didn't list it this time */}
              {mine && !groups.some((g) => g.chat_id === mine.chat_id) && (
                <SelectItem value={mine.chat_id}>{mine.name ?? mine.chat_id}</SelectItem>
              )}
              {groups.map((g) => {
                const owner = taken.get(g.chat_id);
                const otherTrainee = !!owner && owner !== userId;
                return (
                  <SelectItem key={g.chat_id} value={g.chat_id} disabled={otherTrainee}>
                    {g.name}{otherTrainee ? ' (משויכת למתאמן אחר)' : ''}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {listError && <p className="text-xs text-destructive">{listError}</p>}

          <div className="flex items-center justify-between gap-3">
            <div>
              <Label>בוט פעיל</Label>
              <p className="text-xs text-muted-foreground">הבוט קורא ועונה בקבוצה הזו</p>
            </div>
            <Switch checked={!!mine?.bot_enabled} disabled={!mine} onCheckedChange={(v) => void setFlag('bot_enabled', v)} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label>מצב טיוטה</Label>
              <p className="text-xs text-muted-foreground">התשובות נשלחות קודם אלינו לאישור, לא לקבוצה</p>
            </div>
            <Switch checked={mine?.draft_mode ?? true} disabled={!mine} onCheckedChange={(v) => void setFlag('draft_mode', v)} />
          </div>
        </>
      )}
      <ClientProfile userId={userId} />
    </div>
  );
}

/** What the bot knows about the client: written weekly, and editable here. */
function ClientProfile({ userId }: { userId: string }) {
  const [text, setText] = useState('');
  const [saved, setSaved] = useState('');
  const [meta, setMeta] = useState<{ updated_at?: string; edited_at?: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    db.from('client_profiles').select('profile, updated_at, edited_at').eq('user_id', userId).maybeSingle()
      .then(({ data }: { data: { profile: string; updated_at: string; edited_at: string | null } | null }) => {
        setText(data?.profile ?? '');
        setSaved(data?.profile ?? '');
        setMeta(data);
      });
  }, [userId]);
  const save = async () => {
    setSaving(true);
    const { data: who } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const { error } = await db.from('client_profiles').upsert(
      { user_id: userId, profile: text, edited_by: who.user?.id ?? null, edited_at: now },
      { onConflict: 'user_id' },
    );
    setSaving(false);
    if (error) return toast({ title: 'שגיאה', description: error.message, variant: 'destructive' });
    setSaved(text);
    setMeta((m) => ({ ...m, edited_at: now }));
    toast({ title: 'נשמר', description: 'העדכון השבועי הבא יתחיל מהגרסה שלך' });
  };
  const when = (d?: string | null) => (d ? new Date(d).toLocaleDateString('he-IL') : null);
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Label>מה שאנחנו יודעים על הלקוח</Label>
          <p className="text-xs text-muted-foreground">
            {meta?.updated_at ? `עודכן אוטומטית ${when(meta.updated_at)}` : 'מתעדכן אוטומטית במוצאי שבת'}
            {meta?.edited_at ? ` · נערך ידנית ${when(meta.edited_at)}` : ''}
          </p>
        </div>
        <Button size="sm" onClick={save} disabled={saving || text === saved}>
          {saving && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}שמירה
        </Button>
      </div>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder="עוד אין תיק. הוא נכתב אחרי שבוע של שיחות בקבוצה." className="text-sm" />
    </div>
  );
}
