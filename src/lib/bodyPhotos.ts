/**
 * Body ("before / now") photos live in the private body-photos bucket: only
 * the trainee and admins can read them, through short-lived signed links.
 * transformation_photos.photo_url holds "storage://body-photos/<user>/<file>";
 * rows still holding an old public URL are shown as they are until the
 * one-off move (scripts/move-body-photos.mjs) has run.
 */
import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'body-photos';
const PREFIX = `storage://${BUCKET}/`;
const SIGNED_SECONDS = 60 * 60;

export const isPrivatePhoto = (stored: string) => stored.startsWith(PREFIX);

/** Uploads a body photo; returns the value to store in photo_url. */
export async function uploadBodyPhoto(userId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return PREFIX + path;
}

/** Rows with photo_url swapped for a viewable link (stored_url keeps the original). */
export async function withSignedUrls<T extends { photo_url: string }>(rows: T[]): Promise<(T & { stored_url: string })[]> {
  const paths = rows.filter((r) => isPrivatePhoto(r.photo_url)).map((r) => r.photo_url.slice(PREFIX.length));
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_SECONDS);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  }
  return rows.map((r) => ({
    ...r,
    stored_url: r.photo_url,
    photo_url: isPrivatePhoto(r.photo_url) ? signed.get(r.photo_url.slice(PREFIX.length)) ?? '' : r.photo_url,
  }));
}

/** Deletes the file behind a stored value (private photos only; old public ones are left to the move script). */
export async function removeBodyPhoto(stored: string) {
  if (!isPrivatePhoto(stored)) return;
  await supabase.storage.from(BUCKET).remove([stored.slice(PREFIX.length)]);
}
