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

/**
 * Road: dark asphalt with fine noise, glowing dashed lane separators (with a
 * soft halo for the bloom), neon edge bands and faint "wet" reflections.
 * Scrolls on T.
 */
export function roadTexture(roadColor, lineColor) {
  return make(`road_${roadColor}_${lineColor}`, 512, 512, (ctx, w, h) => {
    ctx.fillStyle = hex(roadColor);
    ctx.fillRect(0, 0, w, h);
    // Asphalt grain.
    let seed = roadColor % 9973 || 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.12)';
      ctx.fillRect(rand() * w, rand() * h, 2, 2);
    }
    // Wet reflections: soft vertical streaks of the neon color.
    const line = hex(lineColor);
    for (const x of [w * 0.18, w * 0.5, w * 0.82]) {
      const g = ctx.createLinearGradient(x - 40, 0, x + 40, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, line);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = g;
      ctx.fillRect(x - 40, 0, 80, h);
    }
    // Cross lines (sense of speed).
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    for (let y = 0; y < h; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // Dashed lane separators with a halo.
    for (const x of [w / 3, (2 * w) / 3]) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = line;
      ctx.fillRect(x - 10, 0, 20, h * 0.55);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 2, 0, 4, h * 0.55);
      ctx.fillStyle = line;
      ctx.fillRect(x - 5, 0, 3, h * 0.55);
      ctx.fillRect(x + 2, 0, 3, h * 0.55);
    }
    // Edge bands.
    ctx.globalAlpha = 1;
    ctx.fillStyle = line;
    ctx.fillRect(0, 0, 12, h);
    ctx.fillRect(w - 12, 0, 12, h);
    ctx.globalAlpha = 0.4;
    ctx.fillRect(12, 0, 10, h);
    ctx.fillRect(w - 22, 0, 10, h);
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

/**
 * Sky (redrawn when the zone changes): gradient, glowing horizon bands and
 * stars in the upper part.
 */
export function drawSky(canvas, colors, { stars = 0.5 } = {}) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, colors[0]);
  g.addColorStop(0.5, colors[1]);
  g.addColorStop(0.82, colors[2]);
  g.addColorStop(1, colors[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Horizon glow.
  const hz = ctx.createLinearGradient(0, h * 0.62, 0, h * 0.86);
  hz.addColorStop(0, 'rgba(255,255,255,0)');
  hz.addColorStop(0.7, colors[2]);
  hz.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = hz;
  ctx.fillRect(0, h * 0.62, w, h * 0.24);
  // Stars.
  let seed = 4242;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260 * stars; i++) {
    const y = rand() * h * 0.6;
    ctx.globalAlpha = (1 - y / (h * 0.6)) * (0.3 + rand() * 0.7);
    ctx.fillStyle = '#ffffff';
    const r = rand() < 0.08 ? 2 : 1;
    ctx.fillRect(rand() * w, y, r, r);
  }
  ctx.globalAlpha = 1;
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
      case 'jetpack':
        // Two tanks with flames below.
        for (const x of [c - 22, c + 22]) {
          ctx.fillRect(x - 14, 22, 28, 56);
          ctx.beginPath();
          ctx.arc(x, 22, 14, Math.PI, 0);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(x - 12, 84);
          ctx.lineTo(x, 116);
          ctx.lineTo(x + 12, 84);
          ctx.closePath();
          ctx.fill();
        }
        break;
      case 'rockets':
        // A rocket pointing up-right, with fins and a flame.
        ctx.translate(c, c);
        ctx.rotate(Math.PI / 4);
        ctx.beginPath();
        ctx.moveTo(0, -50);
        ctx.quadraticCurveTo(18, -30, 16, 18);
        ctx.lineTo(-16, 18);
        ctx.quadraticCurveTo(-18, -30, 0, -50);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-16, 2);
        ctx.lineTo(-30, 30);
        ctx.lineTo(-14, 24);
        ctx.moveTo(16, 2);
        ctx.lineTo(30, 30);
        ctx.lineTo(14, 24);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-9, 26);
        ctx.lineTo(0, 52);
        ctx.lineTo(9, 26);
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

/**
 * Glowing chevrons pointing forward (turbo pads, ramps), on a dark plate.
 * Repeats on T so the arrows can scroll.
 */
export function chevronTexture(color) {
  return make(
    `chev_${color}`,
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#0a0614';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = hex(color);
      ctx.lineJoin = 'miter';
      ctx.shadowColor = hex(color);
      ctx.shadowBlur = 12;
      for (const [lw, a] of [[22, 0.35], [12, 1]]) {
        ctx.globalAlpha = a;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(18, h * 0.78);
        ctx.lineTo(w / 2, h * 0.3);
        ctx.lineTo(w - 18, h * 0.78);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    { repeat: true },
  );
}

/** Pyramid faces: dark stone with glowing edges along the cone seams. */
export function pyramidTexture(base, edge) {
  return make(`pyr_${base}_${edge}`, 256, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, hex(edge));
    g.addColorStop(0.08, hex(base));
    g.addColorStop(1, '#05010a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = hex(edge);
    ctx.lineWidth = 5;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo((i * w) / 4, 0);
      ctx.lineTo((i * w) / 4, h);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    for (let y = h * 0.3; y < h; y += h * 0.18) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  });
}

/** Thin vertical streak (rain, warp speed lines). */
export function streakTexture() {
  const tex = make('streak', 16, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(w / 2 - 2, 0, 4, h);
  });
  tex.minFilter = LinearFilter;
  return tex;
}

/** Ringed planet for the orbit zone sky. */
export function planetTexture(c1, c2, ring) {
  return make(`planet_${c1}_${c2}`, 512, 512, (ctx, w) => {
    const c = w / 2;
    const drawRing = (front) => {
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(-0.35);
      ctx.scale(1, 0.28);
      ctx.beginPath();
      ctx.arc(0, 0, 220, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
      ctx.lineWidth = 26;
      ctx.strokeStyle = hex(ring);
      ctx.globalAlpha = 0.75;
      ctx.stroke();
      ctx.lineWidth = 6;
      ctx.globalAlpha = 1;
      ctx.stroke();
      ctx.restore();
    };
    drawRing(false);
    const g = ctx.createRadialGradient(c - 50, c - 60, 20, c, c, 140);
    g.addColorStop(0, hex(c1));
    g.addColorStop(1, hex(c2));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, 140, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#ffffff';
    for (let y = c - 120; y < c + 130; y += 26) {
      ctx.beginPath();
      ctx.moveTo(c - 140, y);
      ctx.quadraticCurveTo(c, y + 18, c + 140, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    drawRing(true);
  });
}

/** Neon sign (holographic billboard) with a short word. */
export function signTexture(text, color) {
  return make(`sign_${text}_${color}`, 256, 128, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(10,4,30,0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = hex(color);
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.font = 'bold 64px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = hex(color);
    ctx.shadowBlur = 18;
    ctx.fillStyle = hex(color);
    ctx.fillText(text, w / 2, h / 2 + 4);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.6;
    ctx.fillText(text, w / 2, h / 2 + 4);
  });
}
