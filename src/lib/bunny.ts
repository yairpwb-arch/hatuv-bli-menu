/**
 * Bunny Stream videos. A content item points at one with
 * video_url = "bunny:<video guid>"; the player link is signed by the
 * bunny-video function and stops working 2 hours later.
 */
import { supabase } from '@/integrations/supabase/client';

const PREFIX = 'bunny:';

export const bunnyId = (videoUrl: string | null | undefined): string | null =>
  videoUrl?.startsWith(PREFIX) ? videoUrl.slice(PREFIX.length).trim() : null;

export async function signedPlayerUrl(videoId: string): Promise<{ url: string; expires: number; signed: boolean } | null> {
  const { data, error } = await supabase.functions.invoke('bunny-video', { body: { action: 'sign', videoId } });
  if (error || !data?.url) return null;
  return data;
}

/* ── Where the trainee stopped (per video, on this device) ──────────────────── */
const posKey = (userId: string, videoId: string) => `videoPos:${userId}:${videoId}`;

export function savedPosition(userId: string, videoId: string): number {
  try {
    return Number(localStorage.getItem(posKey(userId, videoId))) || 0;
  } catch {
    return 0;
  }
}

export function savePosition(userId: string, videoId: string, seconds: number) {
  try {
    localStorage.setItem(posKey(userId, videoId), String(Math.floor(seconds)));
  } catch {
    /* storage unavailable: the video starts from the top next time */
  }
}
