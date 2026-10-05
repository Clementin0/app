/** Neon palette and typography shared by every scene. */
export const COLORS = Object.freeze({
  bgTop: 0x07021a,
  bgMid: 0x1b0840,
  bgBottom: 0x3a0d5c,
  cyan: 0x00f5ff,
  pink: 0xff2bd6,
  yellow: 0xffd23f,
  green: 0x39ff88,
  purple: 0x9d4dff,
  orange: 0xff8a3d,
  red: 0xff3860,
  white: 0xffffff,
  ink: 0x0b0420,
  panel: 0x140934,
  panelEdge: 0x6d3cff,
});

export const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

export const FONT_FAMILY = '"Trebuchet MS", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Text style factory with an outline for readability on busy backgrounds. */
export function textStyle(size, color = '#ffffff', extra = {}) {
  return {
    fontFamily: FONT_FAMILY,
    fontSize: `${Math.round(size)}px`,
    fontStyle: 'bold',
    color,
    stroke: '#0b0420',
    strokeThickness: Math.max(2, Math.round(size / 9)),
    ...extra,
  };
}

/** Adds a soft neon glow to a Text object. */
export function glow(text, color = COLORS.pink, blur = 16) {
  text.setShadow(0, 0, hex(color), blur, true, true);
  return text;
}
