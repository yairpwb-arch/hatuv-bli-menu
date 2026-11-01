// One-off: move every trainee's body ("before / now") photos from the public
// profile_photos bucket to the private body-photos bucket.
//
//   1. Copy everything to this computer first (the DB backup has no files):
//        node scripts/move-body-photos.mjs download
//   2. See what would move (changes nothing):
//        node scripts/move-body-photos.mjs migrate
//   3. Move them:
//        node scripts/move-body-photos.mjs migrate --apply
//
// Needs the service role key in the environment for this terminal only —
// never in code or in a file in the repo (PowerShell):
//   $env:SUPABASE_SERVICE_ROLE_KEY = "<Supabase > Project Settings > API > service_role>"
//
// Per photo: copy → check the copy (same size) → point the row at it → only
// then delete the original. Anything that fails is left exactly as it was.

import fs from 'node:fs';
import path from 'node:path';

const envFile = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
const URL_ = (process.env.SUPABASE_URL || envFile.match(/^VITE_SUPABASE_URL="?([^"\n]+)"?/m)?.[1] || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL in .env) / SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const FROM = 'profile_photos';
const TO = 'body-photos';
const PUBLIC_MARK = `/storage/v1/object/public/${FROM}/`;
const STORED_PREFIX = `storage://${TO}/`;
const auth = { apikey: KEY, authorization: `Bearer ${KEY}` };
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

async function api(method, url, { body, headers } = {}) {
  const res = await fetch(`${URL_}${url}`, { method, headers: { ...auth, ...headers }, body });
  return res;
}

async function download(bucket, objectPath) {
  const res = await api('GET', `/storage/v1/object/${bucket}/${enc(objectPath)}`);
  if (!res.ok) throw new Error(`download ${bucket}/${objectPath}: ${res.status} ${await res.text()}`);
  return { bytes: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') || 'application/octet-stream' };
}

/** Every object in a bucket (recursing into folders). */
async function listAll(bucket, prefix = '') {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await api('POST', `/storage/v1/object/list/${bucket}`, {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!res.ok) throw new Error(`list ${bucket}/${prefix}: ${res.status} ${await res.text()}`);
    const items = await res.json();
    for (const it of items) {
      const full = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id === null) out.push(...(await listAll(bucket, full))); // a folder
      else out.push(full);
    }
    if (items.length < 1000) break;
  }
  return out;
}

async function cmdDownload() {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const root = path.join('backups', `photos-${stamp}`);
  let ok = 0;
  let failed = 0;
  for (const bucket of [FROM, TO]) {
    const files = await listAll(bucket);
    console.log(`${bucket}: ${files.length} files`);
    for (const f of files) {
      try {
        const { bytes } = await download(bucket, f);
        const dest = path.join(root, bucket, ...f.split('/'));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, bytes);
        ok++;
      } catch (e) {
        failed++;
        console.error('  ✗', bucket, f, e.message);
      }
    }
  }
  console.log(`\nSaved ${ok} files to ${root}${failed ? `, ${failed} failed` : ''}.`);
}

async function cmdMigrate(apply) {
  const res = await api('GET', `/rest/v1/transformation_photos?select=id,user_id,photo_url&photo_url=like.*${encodeURIComponent(PUBLIC_MARK)}*`);
  if (!res.ok) throw new Error(`read transformation_photos: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  console.log(`${rows.length} body photos still in the public bucket.${apply ? '' : ' (dry run — add --apply to move them)'}\n`);

  let moved = 0;
  const failures = [];
  for (const row of rows) {
    const objectPath = decodeURIComponent(row.photo_url.split(PUBLIC_MARK)[1].split('?')[0]);
    if (!apply) {
      console.log(`  would move ${objectPath}`);
      continue;
    }
    try {
      // 1. copy
      const src = await download(FROM, objectPath);
      const up = await api('POST', `/storage/v1/object/${TO}/${enc(objectPath)}`, {
        headers: { 'content-type': src.type, 'x-upsert': 'true' },
        body: src.bytes,
      });
      if (!up.ok) throw new Error(`upload: ${up.status} ${await up.text()}`);
      // 2. check the copy
      const copy = await download(TO, objectPath);
      if (copy.bytes.length !== src.bytes.length) throw new Error(`copy check: ${copy.bytes.length} ≠ ${src.bytes.length} bytes`);
      // 3. point the row at it
      const patch = await api('PATCH', `/rest/v1/transformation_photos?id=eq.${row.id}`, {
        headers: { 'content-type': 'application/json', prefer: 'return=minimal' },
        body: JSON.stringify({ photo_url: STORED_PREFIX + objectPath }),
      });
      if (!patch.ok) throw new Error(`row update: ${patch.status} ${await patch.text()}`);
      // 4. only now remove the original
      const del = await api('DELETE', `/storage/v1/object/${FROM}/${enc(objectPath)}`);
      if (!del.ok) throw new Error(`moved, but the original wasn't deleted: ${del.status} ${await del.text()}`);
      moved++;
      console.log(`  ✓ ${objectPath}`);
    } catch (e) {
      failures.push({ id: row.id, objectPath, error: e.message });
      console.error(`  ✗ ${objectPath}: ${e.message}`);
    }
  }

  if (apply) {
    console.log(`\nMoved: ${moved}   Failed: ${failures.length}   Total: ${rows.length}`);
    if (failures.length) {
      const report = path.join('backups', `move-body-photos-failures-${Date.now()}.json`);
      fs.mkdirSync('backups', { recursive: true });
      fs.writeFileSync(report, JSON.stringify(failures, null, 2));
      console.log(`Details: ${report}  (safe to run again — moved photos are skipped)`);
    }
  }
}

const [cmd, flag] = process.argv.slice(2);
if (cmd === 'download') await cmdDownload();
else if (cmd === 'migrate') await cmdMigrate(flag === '--apply');
else console.log('Usage: node scripts/move-body-photos.mjs download | migrate [--apply]');
