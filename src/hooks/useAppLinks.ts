import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const KEYS = ['public_site_url', 'privacy_policy_url', 'terms_url', 'support_whatsapp_url', 'referral_reward'] as const;
export type AppLinkKey = (typeof KEYS)[number];

/** Admin-editable links/texts from app_settings. Empty values come back as ''. */
export function useAppLinks() {
  const [links, setLinks] = useState<Record<AppLinkKey, string> | null>(null);
  useEffect(() => {
    supabase
      .from('app_settings')
      .select('key, value')
      .in('key', [...KEYS])
      .then(({ data }) => {
        const map = Object.fromEntries(KEYS.map((k) => [k, ''])) as Record<AppLinkKey, string>;
        for (const row of data || []) map[row.key as AppLinkKey] = (row.value || '').trim();
        setLinks(map);
      });
  }, []);
  return links;
}
