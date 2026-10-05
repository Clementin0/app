/** Axis-aligned rectangle overlap. Rects are { x, y, w, h } with x/y = top-left. */
export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Circle (cx, cy, r) vs rectangle overlap. */
export function circleRectOverlap(cx, cy, r, rect) {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

/** Horizontal span overlap. */
export function spansOverlap(aMin, aMax, bMin, bMax) {
  return aMin < bMax && aMax > bMin;
}
