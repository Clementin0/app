import { CanvasTexture, ClampToEdgeWrapping, LinearFilter, RepeatWrapping, SRGBColorSpace } from 'three';

/**
 * Procedural textures for the 3D world, drawn on 2D canvases (no image
 * files). Each texture is created once and cached.
 */

const cache = new Map();

function make(key, w, h, draw, { repeat = false } = {}) {
  if (cache.has(key)) return cache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

/** Road: dark asphalt with dashed neon lane separators (scrolls on T). */
export function roadTexture(roadColor, lineColor) {
  return make(`road_${roadColor}_${lineColor}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = hex(roadColor);
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = hex(lineColor);
    ctx.lineWidth = 2;
    for (let y = 0; y < h; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = hex(lineColor);
    for (const x of [w / 3, (2 * w) / 3]) ctx.fillRect(x - 3, 0, 6, h * 0.55);
    ctx.fillRect(0, 0, 8, h);
    ctx.fillRect(w - 8, 0, 8, h);
  }, { repeat: true });
}

/** Synthwave grid for the ground beside the road. */
export function gridTexture(baseColor, gridColor) {
  return make(`grid_${baseColor}_${gridColor}`, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = hex(baseColor);
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = hex(gridColor);
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, w, h);
  }, { repeat: true });
}

/** Building façade with lit windows. */
export function windowsTexture(colors) {
  return make(`win_${colors.join('_')}`, 128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#05010f';
    ctx.fillRect(0, 0, w, h);
    let seed = colors[0] % 997;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 8; y < h - 8; y += 18) {
      for (let x = 8; x < w - 8; x += 16) {
        if (rand() < 0.35) {
          ctx.fillStyle = hex(colors[rand() < 0.5 ? 0 : 1]);
          ctx.globalAlpha = 0.5 + rand() * 0.5;
          ctx.fillRect(x, y, 8, 10);
        }
      }
    }
  }, { repeat: true });
}

/** Black/yellow hazard stripes for barriers. */
export function hazardTexture() {
  return make('hazard', 128, 64, (ctx, w, h) => {
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffd23f';
    for (let x = -h; x < w + h; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + 16, h);
      ctx.lineTo(x + 16 + h, 0);
      ctx.lineTo(x + h, 0);
      ctx.closePath();
      ctx.fill();
    }
  });
}

/** Sci-fi crate panel. */
export function crateTexture() {
  return make('crate', 128, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#3b2a6b');
    g.addColorStop(1, '#1b1038');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ff8a3d';
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(14, 14);
    ctx.lineTo(w - 14, h - 14);
    ctx.moveTo(w - 14, 14);
    ctx.lineTo(14, h - 14);
    ctx.stroke();
  });
}

/** Wall / platform panel with glowing chevrons. */
export function panelTexture(color) {
  return make(`panel_${color}`, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#0d0820';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = hex(color);
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.85;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.globalAlpha = 0.5;
    for (let y = 30; y < h; y += 34) {
      ctx.beginPath();
      ctx.moveTo(24, y);
      ctx.lineTo(w / 2, y - 16);
      ctx.lineTo(w - 24, y);
      ctx.stroke();
    }
  });
}

/** Vertical sky gradient (redrawn when the zone changes). */
export function drawSky(canvas, colors) {
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, colors[0]);
  g.addColorStop(0.55, colors[1]);
  g.addColorStop(1, colors[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/** Synthwave sun with horizontal cuts. */
export function sunTexture(colors) {
  return make(`sun_${colors.join('_')}`, 256, 256, (ctx, w) => {
    const c = w / 2;
    const g = ctx.createLinearGradient(0, 20, 0, w - 20);
    g.addColorStop(0, colors[0]);
    g.addColorStop(0.5, colors[1]);
    g.addColorStop(1, colors[2]);
    ctx.shadowColor = colors[2];
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(c, c, 100, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 7; i++) ctx.fillRect(0, c + 8 + i * 14, w, 2 + i * 1.3);
  });
}

/** Soft round dot for particles and glows. */
export function dotTexture() {
  const tex = make('dot', 64, 64, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
  tex.minFilter = LinearFilter;
  return tex;
}

/** Icons shown inside power-up bubbles. */
export function powerupIconTexture(type) {
  return make(`pu_${type}`, 128, 128, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const c = 64;
    switch (type) {
      case 'shield':
        ctx.beginPath();
        ctx.moveTo(c, 20);
        ctx.lineTo(c + 36, 32);
        ctx.quadraticCurveTo(c + 34, 82, c, 108);
        ctx.quadraticCurveTo(c - 34, 82, c - 36, 32);
        ctx.closePath();
        ctx.fill();
        break;
      case 'magnet':
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.arc(c, 56, 26, Math.PI, 0);
        ctx.moveTo(c - 26, 56);
        ctx.lineTo(c - 26, 92);
        ctx.moveTo(c + 26, 56);
        ctx.lineTo(c + 26, 92);
        ctx.stroke();
        break;
      case 'rapid':
        ctx.beginPath();
        ctx.moveTo(c + 10, 14);
        ctx.lineTo(c - 26, 70);
        ctx.lineTo(c, 70);
        ctx.lineTo(c - 12, 114);
        ctx.lineTo(c + 30, 52);
        ctx.lineTo(c + 4, 52);
        ctx.closePath();
        ctx.fill();
        break;
      case 'heart':
        ctx.beginPath();
        ctx.moveTo(c, 104);
        ctx.bezierCurveTo(10, 70, 18, 22, c, 42);
        ctx.bezierCurveTo(110, 22, 118, 70, c, 104);
        ctx.fill();
        break;
      default:
        ctx.font = 'bold 64px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('x2', c, c + 4);
    }
  });
}
