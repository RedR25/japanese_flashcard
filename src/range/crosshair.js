// The crosshair as whole device-pixel rectangles, so the canvas in Game.jsx draws it crisp and centred at any window
// size and devicePixelRatio. Same maths as CS:GO's: arms sit `gap` px off a centre band `th` px wide, so they mirror
// exactly about the centre line whatever the parity. c = { color, size, gap, thickness, dot, outline } from the lobby.
// Returns [{ x, y, w, h, fill }]: the black outlines first (when on), then the colour rects in the order left, right,
// up, down, dot. The outlines follow the same order, one per colour rect.
export function crosshairRects(width, height, c, dpr) {
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const th = Math.max(1, Math.round(c.thickness * 2 * dpr)); // bar thickness: 2 CSS px per step, never under 1 device px
  const len = Math.max(0, Math.round(c.size * 2 * dpr)); // arm length: 2 CSS px per step
  const g = Math.round((c.gap + 3) * dpr); // gap between each arm and the centre band: 1 CSS px per step, 0 at -3
  const x0 = cx - Math.floor(th / 2); // the up/down arms (and the dot) fill columns [x0, x0 + th)
  const y0 = cy - Math.floor(th / 2); // the left/right arms fill rows [y0, y0 + th)
  const fill = c.color;
  const rects = [
    { x: x0 - g - len, y: y0, w: len, h: th, fill }, // a negative g makes the arms overlap the centre, still mirrored
    { x: x0 + th + g, y: y0, w: len, h: th, fill },
    { x: x0, y: y0 - g - len, w: th, h: len, fill },
    { x: x0, y: y0 + th + g, w: th, h: len, fill },
  ];
  if (c.dot) rects.push({ x: x0, y: y0, w: th, h: th, fill });
  if (!c.outline) return rects;
  const ow = Math.max(1, Math.round(dpr)); // outline: 1 CSS px, in whole device px
  return [...rects.map((r) => ({ x: r.x - ow, y: r.y - ow, w: r.w + 2 * ow, h: r.h + 2 * ow, fill: '#000' })), ...rects];
}
