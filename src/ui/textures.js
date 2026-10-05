import { createRng } from '../logic/rng.js';
import { SIZES } from '../logic/Spawner.js';

/**
 * Procedural art: every texture is drawn at boot on a 2D canvas (gradients,
 * glows), so the game ships without any image file.
 */

const PAD = 10; // room for the glow around shapes

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

function glowStroke(ctx, color, blur, width) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

// ------------------------------------------------------------- characters

function drawPlayer(scene) {
  const S = 60;
  canvasTexture(scene, 'player', S + PAD * 2, S + PAD * 2, (ctx) => {
    const x = PAD;
    const y = PAD;
    roundRect(ctx, x, y, S, S, 16);
    const body = ctx.createLinearGradient(0, y, 0, y + S);
    body.addColorStop(0, '#5ffbff');
    body.addColorStop(0.55, '#00c8ff');
    body.addColorStop(1, '#2a5cff');
    ctx.fillStyle = body;
    ctx.shadowColor = '#00f5ff';
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();

    // Glossy highlight.
    roundRect(ctx, x + 7, y + 5, S - 14, S * 0.32, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fill();

    // Eyes looking forward.
    for (const ex of [x + 30, x + 46]) {
      ctx.beginPath();
      ctx.ellipse(ex, y + 26, 7.5, 9.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + 2.5, y + 27, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = '#120530';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + 4, y + 25, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    // Smile.
    ctx.beginPath();
    ctx.arc(x + 39, y + 39, 7, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#120530';
    ctx.lineCap = 'round';
    ctx.stroke();
  });

  canvasTexture(scene, 'bubble', 110, 110, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, 50);
    g.addColorStop(0, 'rgba(57,255,136,0)');
    g.addColorStop(0.75, 'rgba(57,255,136,0.12)');
    g.addColorStop(1, 'rgba(57,255,136,0.45)');
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 48, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    glowStroke(ctx, '#39ff88', 12, 3);
    ctx.beginPath();
    ctx.arc(w / 2 - 16, h / 2 - 18, 10, Math.PI, 1.5 * Math.PI);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 4;
    ctx.stroke();
  });
}

// --------------------------------------------------------------- hazards

function drawSpike(scene) {
  const { w, h } = SIZES.spike;
  canvasTexture(scene, 'spike', w + PAD * 2, h + PAD * 2, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(PAD, PAD + h);
    ctx.lineTo(PAD + w / 2, PAD);
    ctx.lineTo(PAD + w, PAD + h);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, PAD, 0, PAD + h);
    g.addColorStop(0, '#ffd1f4');
    g.addColorStop(0.35, '#ff2bd6');
    g.addColorStop(1, '#6a0f8f');
    ctx.fillStyle = g;
    ctx.shadowColor = '#ff2bd6';
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.stroke();
    // Facet.
    ctx.beginPath();
    ctx.moveTo(PAD + w / 2, PAD + 6);
    ctx.lineTo(PAD + w / 2 + 4, PAD + h - 4);
    ctx.lineTo(PAD + w - 6, PAD + h - 4);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fill();
  });
}

export function blockTextureKey(scene, w, h) {
  const key = `block_${w}x${h}`;
  return canvasTexture(scene, key, w + PAD * 2, h + PAD * 2, (ctx) => {
    roundRect(ctx, PAD, PAD, w, h, 10);
    const g = ctx.createLinearGradient(0, PAD, 0, PAD + h);
    g.addColorStop(0, '#3b1d8f');
    g.addColorStop(1, '#170a45');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    // Diagonal stripes.
    ctx.strokeStyle = 'rgba(0,245,255,0.13)';
    ctx.lineWidth = 8;
    for (let i = -h; i < w + h; i += 26) {
      ctx.beginPath();
      ctx.moveTo(PAD + i, PAD + h);
      ctx.lineTo(PAD + i + h, PAD);
      ctx.stroke();
    }
    ctx.restore();
    roundRect(ctx, PAD, PAD, w, h, 10);
    glowStroke(ctx, '#00f5ff', 14, 3.5);
    // Bright top edge: the landing surface.
    ctx.beginPath();
    ctx.moveTo(PAD + 8, PAD + 2);
    ctx.lineTo(PAD + w - 8, PAD + 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#c9fdff';
    ctx.lineCap = 'round';
    ctx.stroke();
  });
}

function drawSaw(scene) {
  const r = 38;
  const S = r * 2 + PAD * 2;
  canvasTexture(scene, 'saw', S, S, (ctx) => {
    const c = S / 2;
    const teeth = 14;
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const rad = i % 2 === 0 ? r : r - 9;
      ctx.lineTo(c + Math.cos(a) * rad, c + Math.sin(a) * rad);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(c - 8, c - 8, 4, c, c, r);
    g.addColorStop(0, '#ffe2c4');
    g.addColorStop(0.5, '#ff8a3d');
    g.addColorStop(1, '#c4123f');
    ctx.fillStyle = g;
    ctx.shadowColor = '#ff3860';
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c, c, r * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = '#2b0a2e';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffd23f';
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(c + Math.cos(a) * 7, c + Math.sin(a) * 7, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd23f';
      ctx.fill();
    }
  });
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
    ctx.arc(c, c, r - 6, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(160,80,0,0.55)';
    ctx.stroke();
    // Star emboss.
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
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + w, top);
    ctx.moveTo(x + w * 0.25, y);
    ctx.lineTo(x + w * 0.38, top);
    ctx.lineTo(x + w / 2, y + h);
    ctx.lineTo(x + w * 0.62, top);
    ctx.lineTo(x + w * 0.75, y);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}

function drawPowerups(scene) {
  const S = 56 + PAD * 2;
  const bubble = (ctx, color) => {
    const c = S / 2;
    ctx.beginPath();
    ctx.arc(c, c, 28, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(c - 8, c - 10, 4, c, c, 28);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(20,9,52,0.85)');
    ctx.fillStyle = g;
    ctx.fill();
    glowStroke(ctx, color, 14, 3);
  };

  canvasTexture(scene, 'shield', S, S, (ctx) => {
    bubble(ctx, '#39ff88');
    const c = S / 2;
    ctx.beginPath();
    ctx.moveTo(c, c - 16);
    ctx.lineTo(c + 13, c - 10);
    ctx.quadraticCurveTo(c + 12, c + 10, c, c + 17);
    ctx.quadraticCurveTo(c - 12, c + 10, c - 13, c - 10);
    ctx.closePath();
    ctx.fillStyle = '#39ff88';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#eafff2';
    ctx.stroke();
  });

  canvasTexture(scene, 'magnet', S, S, (ctx) => {
    bubble(ctx, '#ff3860');
    const c = S / 2;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.arc(c, c - 2, 11, Math.PI, 0, false);
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#ff3860';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(c - 11, c - 2);
    ctx.lineTo(c - 11, c + 10);
    ctx.moveTo(c + 11, c - 2);
    ctx.lineTo(c + 11, c + 10);
    ctx.stroke();
    ctx.fillStyle = '#e8e8f5';
    ctx.fillRect(c - 15.5, c + 8, 9, 7);
    ctx.fillRect(c + 6.5, c + 8, 9, 7);
  });
}

// ------------------------------------------------------------ environment

function drawEnvironment(scene) {
  canvasTexture(scene, 'spark', 24, 24, (ctx) => {
    const g = ctx.createRadialGradient(12, 12, 0, 12, 12, 12);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 24, 24);
  });

  canvasTexture(scene, 'pixel', 4, 4, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 4, 4);
  });

  canvasTexture(scene, 'sky', 4, 512, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#07021a');
    g.addColorStop(0.55, '#1b0840');
    g.addColorStop(0.85, '#4a0f6b');
    g.addColorStop(1, '#ff2bd6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 512);
  });

  canvasTexture(scene, 'stars', 512, 384, (ctx) => {
    const rng = createRng(7);
    for (let i = 0; i < 90; i++) {
      const r = rng.range(0.6, 1.8);
      ctx.beginPath();
      ctx.arc(rng.range(0, 512), rng.range(0, 384), r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${rng.range(0.25, 0.9).toFixed(2)})`;
      ctx.fill();
    }
  });

  // Synthwave sun.
  canvasTexture(scene, 'sun', 360, 360, (ctx) => {
    const c = 180;
    const g = ctx.createLinearGradient(0, 20, 0, 340);
    g.addColorStop(0, '#ffe86b');
    g.addColorStop(0.5, '#ff8a3d');
    g.addColorStop(1, '#ff2bd6');
    ctx.shadowColor = '#ff2bd6';
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(c, c, 150, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 7; i++) {
      const y = c + 10 + i * 20;
      ctx.fillRect(0, y, 360, 3 + i * 1.6);
    }
  });

  const skyline = (key, w, h, seed, color, windows) =>
    canvasTexture(scene, key, w, h, (ctx) => {
      const rng = createRng(seed);
      let x = 0;
      while (x < w) {
        const bw = rng.int(40, 110);
        const bh = rng.int(h * 0.3, h * 0.95);
        const bx = Math.min(x, w - bw);
        ctx.fillStyle = color;
        ctx.fillRect(bx, h - bh, bw, bh);
        if (rng.chance(0.3)) ctx.fillRect(bx + bw / 2 - 2, h - bh - rng.int(10, 30), 4, 30);
        if (windows) {
          for (let wy = h - bh + 10; wy < h - 8; wy += 16) {
            for (let wx = bx + 8; wx < bx + bw - 8; wx += 14) {
              if (rng.chance(0.18)) {
                ctx.fillStyle = rng.chance(0.5) ? 'rgba(0,245,255,0.55)' : 'rgba(255,43,214,0.5)';
                ctx.fillRect(wx, wy, 5, 7);
              }
            }
          }
        }
        x += bw + rng.int(0, 12);
      }
    });
  skyline('skyline_far', 1024, 260, 11, '#2a0f55', false);
  skyline('skyline_near', 1024, 220, 23, '#160733', true);

  const T = 128;
  canvasTexture(scene, 'ground', T, T, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, T);
    g.addColorStop(0, '#2a0b5c');
    g.addColorStop(1, '#0b0420');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, T, T);
    ctx.strokeStyle = 'rgba(255,43,214,0.35)';
    ctx.lineWidth = 2;
    for (let y = 24; y < T; y += 26) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(T, y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(T / 2, 6);
    ctx.lineTo(T / 2, T);
    ctx.moveTo(0, 6);
    ctx.lineTo(0, T);
    ctx.stroke();
    // Neon running surface.
    ctx.fillStyle = '#00f5ff';
    ctx.fillRect(0, 0, T, 5);
    ctx.fillStyle = 'rgba(0,245,255,0.35)';
    ctx.fillRect(0, 5, T, 6);
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
  const speaker = (ctx) => {
    ctx.beginPath();
    ctx.moveTo(8, 24);
    ctx.lineTo(18, 24);
    ctx.lineTo(32, 12);
    ctx.lineTo(32, 52);
    ctx.lineTo(18, 40);
    ctx.lineTo(8, 40);
    ctx.closePath();
    ctx.fill();
  };
  icon('icon_sound_on', (ctx) => {
    speaker(ctx);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(34, 32, 10, -0.9, 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(34, 32, 20, -0.9, 0.9);
    ctx.stroke();
  });
  icon('icon_sound_off', (ctx) => {
    speaker(ctx);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(40, 22);
    ctx.lineTo(56, 42);
    ctx.moveTo(56, 22);
    ctx.lineTo(40, 42);
    ctx.stroke();
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
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(14, 18, 7, 0.5 * Math.PI, 1.5 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(50, 18, 7, 1.5 * Math.PI, 0.5 * Math.PI);
    ctx.stroke();
  });
}

/** Generates every texture used by the game. Idempotent. */
export function generateTextures(scene) {
  drawPlayer(scene);
  drawSpike(scene);
  drawSaw(scene);
  drawCoin(scene);
  drawGem(scene);
  drawPowerups(scene);
  drawEnvironment(scene);
  drawIcons(scene);
  for (const s of [SIZES.blockLow, SIZES.blockTall]) blockTextureKey(scene, s.w, s.h);
}
