/**
 * The walk's share image: the route on a dark card, three numbers and the
 * logo — sized for a story (1080×1920). Optionally without the first and last
 * 200 m, so it doesn't show where you live.
 */
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { trimEnds } from '@/lib/walkTrack';

type LngLat = { lat: number; lng: number };

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function renderShareImage(route: LngLat[], stats: { label: string; value: string }[], hideEnds: boolean): Promise<string> {
  const W = 1080;
  const H = 1920;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0E0E11';
  g.fillRect(0, 0, W, H);

  // Route, fitted into the top area.
  const pts = hideEnds ? trimEnds(route) : route;
  if (pts.length > 1) {
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    const k = Math.cos(((Math.min(...lats) + Math.max(...lats)) / 2) * (Math.PI / 180));
    const w = (Math.max(...lngs) - Math.min(...lngs)) * k || 1e-6;
    const h = Math.max(...lats) - Math.min(...lats) || 1e-6;
    const box = { x: 120, y: 260, w: W - 240, h: 1000 };
    const scale = Math.min(box.w / w, box.h / h);
    const ox = box.x + (box.w - w * scale) / 2;
    const oy = box.y + (box.h - h * scale) / 2;
    const px = (p: LngLat) => [ox + (p.lng - Math.min(...lngs)) * k * scale, oy + (Math.max(...lats) - p.lat) * scale] as const;
    g.strokeStyle = '#FF8A2A';
    g.lineWidth = 18;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(...px(p)) : g.moveTo(...px(p))));
    g.stroke();
  }

  // Three numbers.
  g.textAlign = 'center';
  g.direction = 'rtl';
  stats.slice(0, 3).forEach((s, i) => {
    const x = W - (W / 3) * (i + 0.5);
    g.fillStyle = '#F5F3EE';
    g.font = 'bold 96px system-ui, sans-serif';
    g.fillText(s.value, x, 1460);
    g.fillStyle = '#A9A7AE';
    g.font = '44px system-ui, sans-serif';
    g.fillText(s.label, x, 1530);
  });

  // Logo + name.
  const logo = await loadImage('/logo.png');
  if (logo) {
    g.save();
    g.beginPath();
    g.arc(W / 2, 1700, 60, 0, Math.PI * 2);
    g.clip();
    g.drawImage(logo, W / 2 - 60, 1640, 120, 120);
    g.restore();
  }
  g.fillStyle = '#F5F3EE';
  g.font = 'bold 48px system-ui, sans-serif';
  g.fillText('חטוב בלי תפריט', W / 2, 1830);

  return c.toDataURL('image/png');
}

/** Shares (or, on the web without sharing, downloads) the image. */
export async function shareImage(dataUrl: string) {
  const name = `walk-${Date.now()}.png`;
  if (Capacitor.isNativePlatform()) {
    const saved = await Filesystem.writeFile({ path: name, data: dataUrl.split(',')[1], directory: Directory.Cache });
    await Share.share({ files: [saved.uri], title: 'ההליכה שלי' });
    return;
  }
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'ההליכה שלי' });
    return;
  }
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = name;
  a.click();
}
