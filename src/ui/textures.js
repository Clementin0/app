import { SKINS } from '../config/cosmetics.js';

/**
 * Procedural 2D textures for the Phaser interface (HUD, menus, shop). The
 * 3D world has its own textures in src/three/textures3d.js.
 */

const PAD = 10;

function canvasTexture(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, Math.ceil(w), Math.ceil(h));
  const ctx = tex.getContext();
  ctx.save();
  draw(ctx, w, h);
  ctx.restore();
  tex.refresh();
  return key;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const css = (c) => `#${c.toString(16).padStart(6, '0')}`;

function glowStroke(ctx, color, blur, width) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

// --------------------------------------------------------------- pickups

function drawCoin(scene) {
  const r = 20;
  const S = r * 2 + PAD * 2;
  canvasTexture(scene, 'coin', S, S, (ctx) => {
    const c = S / 2;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(c - 6, c - 7, 2, c, c, r);
    g.addColorStop(0, '#fff7c2');
    g.addColorStop(0.45, '#ffd23f');
    g.addColorStop(1, '#e08a00');
    ctx.fillStyle = g;
    ctx.shadowColor = '#ffd23f';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#fff3a8';
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? 8 : 3.6;
      ctx.lineTo(c + Math.cos(a) * rad, c + Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
  });
}

function drawGem(scene) {
  const w = 44;
  const h = 48;
  canvasTexture(scene, 'gem', w + PAD * 2, h + PAD * 2, (ctx) => {
    const x = PAD;
    const y = PAD;
    const top = y + h * 0.32;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.25, y);
    ctx.lineTo(x + w * 0.75, y);
    ctx.lineTo(x + w, top);
    ctx.lineTo(x + w / 2, y + h);
    ctx.lineTo(x, top);
    ctx.closePath();
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#b6fbff');
    g.addColorStop(0.5, '#3fd0ff');
    g.addColorStop(1, '#8a2bff');
    ctx.fillStyle = g;
    ctx.shadowColor = '#3fd0ff';
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
  });
}

/** Round badges for power-ups (HUD timers). */
function drawPowerupBadges(scene) {
  const S = 56 + PAD * 2;
  const badge = (key, color, drawIcon) =>
    canvasTexture(scene, key, S, S, (ctx) => {
      const c = S / 2;
      ctx.beginPath();
      ctx.arc(c, c, 28, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(c - 8, c - 10, 4, c, c, 28);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(20,9,52,0.9)');
      ctx.fillStyle = g;
      ctx.fill();
      glowStroke(ctx, color, 14, 3);
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      drawIcon(ctx, c);
    });

  badge('shield', '#39ff88', (ctx, c) => {
    ctx.beginPath();
    ctx.moveTo(c, c - 16);
    ctx.lineTo(c + 13, c - 10);
    ctx.quadraticCurveTo(c + 12, c + 10, c, c + 17);
    ctx.quadraticCurveTo(c - 12, c + 10, c - 13, c - 10);
    ctx.closePath();
    ctx.fill();
  });
  badge('magnet', '#ff3860', (ctx, c) => {
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(c, c - 2, 11, Math.PI, 0);
    ctx.moveTo(c - 11, c - 2);
    ctx.lineTo(c - 11, c + 10);
    ctx.moveTo(c + 11, c - 2);
    ctx.lineTo(c + 11, c + 10);
    ctx.stroke();
  });
  badge('rapid', '#ff8a3d', (ctx, c) => {
    ctx.beginPath();
    ctx.moveTo(c + 4, c - 18);
    ctx.lineTo(c - 10, c + 2);
    ctx.lineTo(c, c + 2);
    ctx.lineTo(c - 5, c + 18);
    ctx.lineTo(c + 11, c - 4);
    ctx.lineTo(c + 1, c - 4);
    ctx.closePath();
    ctx.fill();
  });
  badge('double', '#ffd23f', (ctx, c) => {
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('x2', c, c + 1);
  });
}

function drawHearts(scene) {
  const heart = (key, fill, stroke) =>
    canvasTexture(scene, key, 52, 48, (ctx) => {
      ctx.beginPath();
      ctx.moveTo(26, 42);
      ctx.bezierCurveTo(4, 28, 6, 6, 26, 16);
      ctx.bezierCurveTo(46, 6, 48, 28, 26, 42);
      ctx.closePath();
      if (fill) {
        ctx.fillStyle = fill;
        ctx.shadowColor = fill;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.lineWidth = 3;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    });
  heart('heart', '#ff3d7f', '#ffd0e0');
  heart('heart_empty', null, 'rgba(255,255,255,0.45)');
}

/** Small runner portrait for each skin (shop cards). */
function drawSkinSwatches(scene) {
  for (const skin of SKINS) {
    canvasTexture(scene, `swatch_${skin.id}`, 80, 80, (ctx) => {
      const S = 60;
      const x = PAD;
      const y = PAD;
      roundRect(ctx, x, y, S, S, 16);
      const g = ctx.createLinearGradient(0, y, 0, y + S);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.15, css(skin.body));
      g.addColorStop(1, css(skin.accent));
      ctx.fillStyle = g;
      ctx.shadowColor = css(skin.glow);
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.stroke();
      for (const ex of [x + 22, x + 38]) {
        ctx.beginPath();
        ctx.ellipse(ex, y + 26, 7, 9, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex + 1.5, y + 27, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#120530';
        ctx.fill();
      }
    });
  }
}

function drawEffects(scene) {
  canvasTexture(scene, 'spark', 24, 24, (ctx) => {
    const g = ctx.createRadialGradient(12, 12, 0, 12, 12, 12);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 24, 24);
  });
  // Red vignette shown when the player loses a heart.
  canvasTexture(scene, 'vignette', 256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 60, 128, 128, 180);
    g.addColorStop(0, 'rgba(255,0,60,0)');
    g.addColorStop(1, 'rgba(255,0,60,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
}

// ------------------------------------------------------------------ icons

function drawIcons(scene) {
  const S = 64;
  const icon = (key, draw) =>
    canvasTexture(scene, key, S, S, (ctx) => {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      draw(ctx);
    });

  icon('icon_pause', (ctx) => {
    roundRect(ctx, 16, 12, 11, 40, 4);
    ctx.fill();
    roundRect(ctx, 37, 12, 11, 40, 4);
    ctx.fill();
  });
  icon('icon_play', (ctx) => {
    ctx.beginPath();
    ctx.moveTo(20, 12);
    ctx.lineTo(52, 32);
    ctx.lineTo(20, 52);
    ctx.closePath();
    ctx.fill();
  });
  icon('icon_home', (ctx) => {
    ctx.beginPath();
    ctx.moveTo(32, 8);
    ctx.lineTo(58, 32);
    ctx.lineTo(50, 32);
    ctx.lineTo(50, 56);
    ctx.lineTo(38, 56);
    ctx.lineTo(38, 40);
    ctx.lineTo(26, 40);
    ctx.lineTo(26, 56);
    ctx.lineTo(14, 56);
    ctx.lineTo(14, 32);
    ctx.lineTo(6, 32);
    ctx.closePath();
    ctx.fill();
  });
  icon('icon_retry', (ctx) => {
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(32, 34, 19, -0.35 * Math.PI, 1.35 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(36, 4);
    ctx.lineTo(50, 16);
    ctx.lineTo(34, 24);
    ctx.closePath();
    ctx.fill();
  });
  icon('icon_video', (ctx) => {
    roundRect(ctx, 4, 16, 40, 32, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(46, 28);
    ctx.lineTo(60, 18);
    ctx.lineTo(60, 46);
    ctx.lineTo(46, 36);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0b0420';
    ctx.beginPath();
    ctx.moveTo(19, 24);
    ctx.lineTo(32, 32);
    ctx.lineTo(19, 40);
    ctx.closePath();
    ctx.fill();
  });
  icon('icon_privacy', (ctx) => {
    ctx.beginPath();
    ctx.moveTo(32, 6);
    ctx.lineTo(54, 14);
    ctx.quadraticCurveTo(54, 44, 32, 58);
    ctx.quadraticCurveTo(10, 44, 10, 14);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0b0420';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(22, 32);
    ctx.lineTo(30, 40);
    ctx.lineTo(43, 24);
    ctx.stroke();
  });
  icon('icon_trophy', (ctx) => {
    ctx.beginPath();
    ctx.moveTo(16, 8);
    ctx.lineTo(48, 8);
    ctx.lineTo(46, 30);
    ctx.quadraticCurveTo(32, 44, 18, 30);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(28, 38, 8, 10);
    roundRect(ctx, 18, 48, 28, 8, 3);
    ctx.fill();
  });
  icon('icon_gear', (ctx) => {
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 2 === 0 ? 28 : 21;
      ctx.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(32, 32, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  });
  icon('icon_shop', (ctx) => {
    roundRect(ctx, 10, 22, 44, 36, 7);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(32, 22, 11, Math.PI, 0);
    ctx.stroke();
  });
  icon('icon_back', (ctx) => {
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(36, 12);
    ctx.lineTo(16, 32);
    ctx.lineTo(36, 52);
    ctx.moveTo(18, 32);
    ctx.lineTo(54, 32);
    ctx.stroke();
  });
  icon('icon_lock', (ctx) => {
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(32, 26, 12, Math.PI, 0);
    ctx.lineTo(44, 32);
    ctx.moveTo(20, 32);
    ctx.lineTo(20, 26);
    ctx.stroke();
    roundRect(ctx, 12, 30, 40, 28, 6);
    ctx.fill();
  });
  icon('icon_hat', (ctx) => {
    roundRect(ctx, 4, 44, 56, 8, 4);
    ctx.fill();
    roundRect(ctx, 16, 12, 32, 36, 4);
    ctx.fill();
  });
  icon('icon_weapon', (ctx) => {
    roundRect(ctx, 6, 20, 40, 16, 4);
    ctx.fill();
    ctx.fillRect(44, 24, 16, 8);
    roundRect(ctx, 12, 30, 12, 24, 3);
    ctx.fill();
  });
  icon('icon_trail', (ctx) => {
    ctx.lineWidth = 7;
    for (const [y, x0] of [
      [18, 10],
      [32, 4],
      [46, 12],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(44, y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(50, 32, 9, 0, Math.PI * 2);
    ctx.fill();
  });
  icon('icon_up', (ctx) => {
    ctx.beginPath();
    ctx.moveTo(32, 6);
    ctx.lineTo(56, 32);
    ctx.lineTo(42, 32);
    ctx.lineTo(42, 58);
    ctx.lineTo(22, 58);
    ctx.lineTo(22, 32);
    ctx.lineTo(8, 32);
    ctx.closePath();
    ctx.fill();
  });
  icon('icon_target', (ctx) => {
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(32, 32, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(32, 32, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(32, 32, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Generates every UI texture. Idempotent. */
export function generateTextures(scene) {
  drawCoin(scene);
  drawGem(scene);
  drawPowerupBadges(scene);
  drawHearts(scene);
  drawSkinSwatches(scene);
  drawEffects(scene);
  drawIcons(scene);
}
