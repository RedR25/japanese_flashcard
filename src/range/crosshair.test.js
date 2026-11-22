// Run: node --test src/range/crosshair.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crosshairRects } from './crosshair.js';

const COLOR = '#34d399';
const steps = (lo, hi) => Array.from({ length: (hi - lo) * 2 + 1 }, (_, i) => lo + i / 2); // the lobby sliders' 0.5 steps
const OW = { 1: 1, 1.25: 1, 1.5: 2, 2: 2 }; // outline width in device px: 1 CSS px, rounded

test('the default crosshair at DPR 1 keeps today\'s sizes', () => {
  // th 2, len 8, gap 4 around the centre (50, 40): the up/down arms fill columns 49-50, the left/right arms rows 39-40.
  assert.deepEqual(crosshairRects(100, 80, { color: COLOR, size: 4, gap: 1, thickness: 1, dot: true, outline: false }, 1), [
    { x: 37, y: 39, w: 8, h: 2, fill: COLOR },
    { x: 55, y: 39, w: 8, h: 2, fill: COLOR },
    { x: 49, y: 27, w: 2, h: 8, fill: COLOR },
    { x: 49, y: 45, w: 2, h: 8, fill: COLOR },
    { x: 49, y: 39, w: 2, h: 2, fill: COLOR },
  ]);
});

test('at DPR 1.5 everything scales to whole device px, with a 2 px outline', () => {
  // th 3, len 12, gap 6, outline 2 on an odd 1365x767 canvas: the 3 px bars straddle its exact centre (682.5, 383.5).
  const K = '#000';
  assert.deepEqual(crosshairRects(1365, 767, { color: COLOR, size: 4, gap: 1, thickness: 1, dot: false, outline: true }, 1.5), [
    { x: 661, y: 380, w: 16, h: 7, fill: K },
    { x: 688, y: 380, w: 16, h: 7, fill: K },
    { x: 679, y: 362, w: 7, h: 16, fill: K },
    { x: 679, y: 389, w: 7, h: 16, fill: K },
    { x: 663, y: 382, w: 12, h: 3, fill: COLOR },
    { x: 690, y: 382, w: 12, h: 3, fill: COLOR },
    { x: 681, y: 364, w: 3, h: 12, fill: COLOR },
    { x: 681, y: 391, w: 3, h: 12, fill: COLOR },
  ]);
});

test('every setting draws whole pixels, mirrored about the centre lines, on the canvas centre', () => {
  let runs = 0;
  for (const dpr of [1, 1.25, 1.5, 2]) {
    for (const [width, height] of [[1366, 768], [1365, 767], [1920, 1081], [261, 200]]) {
      const cx = Math.floor(width / 2);
      const cy = Math.floor(height / 2);
      // gap goes past the slider's -3 so the arms also overlap the centre
      for (const thickness of steps(0.5, 3)) for (const gap of steps(-6, 6)) for (const size of steps(1, 10)) {
        for (const dot of [false, true]) for (const outline of [false, true]) {
          const c = { color: COLOR, size, gap, thickness, dot, outline };
          const at = `${JSON.stringify(c)} at DPR ${dpr} on ${width}x${height}`;
          const rects = crosshairRects(width, height, c, dpr);
          for (const r of rects) {
            assert.ok([r.x, r.y, r.w, r.h].every(Number.isInteger), `whole pixels: ${at}`);
            assert.ok(r.w >= 0 && r.h >= 0, `no negative size: ${at}`);
          }

          const n = dot ? 5 : 4;
          assert.equal(rects.length, outline ? 2 * n : n, at);
          const colour = rects.slice(-n);
          const [left, right, up, down, dotRect] = colour;
          assert.ok(colour.every((r) => r.fill === COLOR), at);

          // Bar thickness, from the up arm: every arm (and the dot) is that thick, on the centre band.
          const th = up.w;
          assert.ok(th >= 1, at);
          assert.deepEqual([left.h, right.h, down.w], [th, th, th], `arm thickness: ${at}`);
          assert.deepEqual([up.x, down.x], [cx - Math.floor(th / 2), cx - Math.floor(th / 2)], `columns: ${at}`);
          assert.deepEqual([left.y, right.y], [cy - Math.floor(th / 2), cy - Math.floor(th / 2)], `rows: ${at}`);
          assert.deepEqual([right.w, up.h, down.h], [left.w, left.w, left.w], `arm length: ${at}`);

          // Left and right mirror about the vertical centre line, up and down about the horizontal one.
          const mx = up.x + th / 2;
          const my = left.y + th / 2;
          assert.equal(mx - (left.x + left.w), right.x - mx, `left/right mirror: ${at}`);
          assert.equal(my - (up.y + up.h), down.y - my, `up/down mirror: ${at}`);

          // The centre lines sit on the canvas centre, where the aim ray is: exactly when the bar and the canvas have
          // the same parity, else half a pixel off (an odd bar can't straddle a pixel edge).
          assert.equal(Math.abs(mx - width / 2), width % 2 === th % 2 ? 0 : 0.5, `centred across: ${at}`);
          assert.equal(Math.abs(my - height / 2), height % 2 === th % 2 ? 0 : 0.5, `centred down: ${at}`);

          if (dot) assert.deepEqual([dotRect.x + dotRect.w / 2, dotRect.y + dotRect.h / 2, dotRect.w, dotRect.h], [mx, my, th, th], `dot: ${at}`);

          if (outline) {
            const ow = OW[dpr];
            rects.slice(0, n).forEach((o, i) => {
              const r = colour[i];
              assert.deepEqual(o, { x: r.x - ow, y: r.y - ow, w: r.w + 2 * ow, h: r.h + 2 * ow, fill: '#000' }, `outline ${i}: ${at}`);
            });
          }
          runs++;
        }
      }
    }
  }
  assert.ok(runs > 100_000, `ran ${runs} combinations`);
});

test('a broken saved size never makes a negative rect', () => {
  for (const size of [0, -1, -10]) {
    for (const r of crosshairRects(100, 100, { color: COLOR, size, gap: -6, thickness: 1, dot: true, outline: true }, 1.5)) {
      assert.ok(r.w >= 0 && r.h >= 0, `size ${size}`);
    }
  }
});
