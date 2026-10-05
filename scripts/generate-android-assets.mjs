#!/usr/bin/env node
/**
 * Renders the launcher icons, the splash screens and the Play Store
 * graphics procedurally (same neon art as the game) with headless Chromium,
 * replacing Capacitor's default images. Run once after `npx cap add android`
 * (the PNGs are committed).
 *
 * Usage: node scripts/generate-android-assets.mjs   (CHROMIUM_PATH optional)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = resolve(import.meta.dirname, '..');
const RES = join(ROOT, 'android', 'app', 'src', 'main', 'res');

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const list = existsSync(pw) ? readdirSync(pw).filter((d) => d.startsWith('chromium-')).map((d) => join(pw, d, 'chrome-linux', 'chrome')) : [];
  return [...list, '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));
}

/** Width/height from a PNG header. */
function pngSize(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// Drawing code executed inside the browser page.
const DRAW = `
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function background(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#07021a'); g.addColorStop(0.6, '#1b0840'); g.addColorStop(1, '#4a0f6b');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
function hero(ctx, cx, cy, s) {
  const x = cx - s / 2, y = cy - s / 2;
  ctx.save();
  roundRect(ctx, x, y, s, s, s * 0.27);
  const body = ctx.createLinearGradient(0, y, 0, y + s);
  body.addColorStop(0, '#5ffbff'); body.addColorStop(0.55, '#00c8ff'); body.addColorStop(1, '#2a5cff');
  ctx.fillStyle = body; ctx.shadowColor = '#00f5ff'; ctx.shadowBlur = s * 0.25; ctx.fill(); ctx.shadowBlur = 0;
  ctx.lineWidth = s * 0.05; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
  roundRect(ctx, x + s * 0.12, y + s * 0.08, s * 0.76, s * 0.3, s * 0.16); ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fill();
  for (const ex of [x + s * 0.5, x + s * 0.77]) {
    ctx.beginPath(); ctx.ellipse(ex, y + s * 0.43, s * 0.125, s * 0.16, 0, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(ex + s * 0.04, y + s * 0.45, s * 0.07, 0, Math.PI * 2); ctx.fillStyle = '#120530'; ctx.fill();
  }
  ctx.beginPath(); ctx.arc(x + s * 0.65, y + s * 0.64, s * 0.12, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.lineWidth = s * 0.05; ctx.lineCap = 'round'; ctx.strokeStyle = '#120530'; ctx.stroke();
  ctx.restore();
}
function speedLines(ctx, cx, cy, s) {
  ctx.save(); ctx.lineCap = 'round';
  [[-0.95, -0.15, 0.35, '#ff2bd6'], [-1.05, 0.12, 0.45, '#00f5ff'], [-0.9, 0.36, 0.28, '#ffd23f']].forEach(([dx, dy, len, c]) => {
    ctx.beginPath(); ctx.moveTo(cx + dx * s, cy + dy * s); ctx.lineTo(cx + (dx + len) * s, cy + dy * s);
    ctx.strokeStyle = c; ctx.lineWidth = s * 0.07; ctx.shadowColor = c; ctx.shadowBlur = s * 0.12; ctx.stroke();
  });
  ctx.restore();
}
function title(ctx, cx, cy, size) {
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold ' + size + 'px "Trebuchet MS", "DejaVu Sans", Arial, sans-serif';
  const neonW = ctx.measureText('NEON ').width, dashW = ctx.measureText('DASH').width;
  const left = cx - (neonW + dashW) / 2;
  ctx.textAlign = 'left';
  ctx.lineWidth = size * 0.1; ctx.strokeStyle = '#0b0420';
  ctx.shadowColor = '#00f5ff'; ctx.shadowBlur = size * 0.3; ctx.fillStyle = '#7ffcff';
  ctx.strokeText('NEON', left, cy); ctx.fillText('NEON', left, cy);
  ctx.shadowColor = '#ff2bd6'; ctx.fillStyle = '#ff8ef0';
  ctx.strokeText('DASH', left + neonW, cy); ctx.fillText('DASH', left + neonW, cy);
  ctx.restore();
}
window.render = (kind, w, h) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const m = Math.min(w, h);
  if (kind === 'legacy' || kind === 'round' || kind === 'store') {
    ctx.save();
    if (kind === 'round') { ctx.beginPath(); ctx.arc(w / 2, h / 2, m / 2, 0, Math.PI * 2); ctx.clip(); }
    else if (kind === 'legacy') { roundRect(ctx, 0, 0, w, h, m * 0.18); ctx.clip(); }
    background(ctx, w, h);
    speedLines(ctx, w * 0.5, h * 0.52, m * 0.42);
    hero(ctx, w * 0.56, h * 0.52, m * 0.5);
    ctx.restore();
  } else if (kind === 'foreground') {
    // Adaptive icon: 108dp canvas, keep the art inside the 66dp safe zone.
    speedLines(ctx, w * 0.5, h * 0.5, m * 0.26);
    hero(ctx, w * 0.54, h * 0.5, m * 0.34);
  } else if (kind === 'splash' || kind === 'feature') {
    background(ctx, w, h);
    const t = Math.min(w * 0.13, h * 0.16);
    title(ctx, w / 2, h * 0.38, t);
    speedLines(ctx, w / 2 - t * 0.3, h * 0.66, t * 0.8);
    hero(ctx, w / 2, h * 0.66, t * 0.9);
  }
  return c.toDataURL('image/png');
};
`;

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

async function main() {
  if (!existsSync(RES)) {
    console.error('android/ not found: run `npx cap add android` first.');
    process.exit(1);
  }
  const executablePath = findChromium();
  if (!executablePath) {
    console.error('No Chromium found. Set CHROMIUM_PATH.');
    process.exit(1);
  }
  const browser = await chromium.launch({ executablePath });
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ content: DRAW });

  const jobs = [];
  for (const [d, scale] of Object.entries(DENSITIES)) {
    const icon = Math.round(48 * scale);
    const fg = Math.round(108 * scale);
    jobs.push([join(RES, `mipmap-${d}`, 'ic_launcher.png'), 'legacy', icon, icon]);
    jobs.push([join(RES, `mipmap-${d}`, 'ic_launcher_round.png'), 'round', icon, icon]);
    jobs.push([join(RES, `mipmap-${d}`, 'ic_launcher_foreground.png'), 'foreground', fg, fg]);
  }
  for (const dir of readdirSync(RES).filter((d) => d.startsWith('drawable'))) {
    const file = join(RES, dir, 'splash.png');
    if (existsSync(file)) {
      const { w, h } = pngSize(file);
      jobs.push([file, 'splash', w, h]);
    }
  }
  jobs.push([join(ROOT, 'store', 'play-store-icon-512.png'), 'store', 512, 512]);
  jobs.push([join(ROOT, 'store', 'feature-graphic-1024x500.png'), 'feature', 1024, 500]);

  for (const [file, kind, w, h] of jobs) {
    const dataUrl = await page.evaluate(([k, ww, hh]) => window.render(k, ww, hh), [kind, w, h]);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  }
  await browser.close();
  console.log(`Generated ${jobs.length} images (launcher icons, splash screens, store graphics).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
