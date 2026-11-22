// First-person gloved hands holding the USP in a two-hand, thumbs-forward grip. Built in the gun's space (metres,
// -Z muzzle, +Y up, +X right) so they ride under `gun` through kick and sway. Generic dark tactical gloves and
// sleeves, no logos. Fingers are swept tubes that follow the grip's real outline (grip maths from gun.js).
import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';

const RAD = Math.PI / 180;
const COS = Math.cos(17 * RAD);
const SIN = Math.sin(17 * RAD);
const fz = (y) => 0.008 - (y + 0.03) * (SIN / COS); // front strap z at height y (gun.js)
const AXIS = new Vector3(0, -COS, SIN); // down the raked grip
const FWD = new Vector3(0, -SIN, -COS); // toward the front strap, square to the grip
const X = new Vector3(1, 0, 0);
const UP = new Vector3(0, 1, 0);
const HD = 0.0245 * COS; // grip half depth, square to its axis
const HW = 0.01425; // grip half width over the stippled panels
const CR = 0.002; // grip edge radius
const GAP = 0.0008; // glove clearance off the gun

// A point in the grip's cross-section through its centre line at height y: u across (+x), v forward.
const sec = (y, u, v) => new Vector3(u, y, fz(y) + 0.0245).addScaledVector(FWD, v);

// The grip outline grown by o, walked anticlockwise (seen from above) by arc length s from the middle of the right
// side: forward, round the front strap, back down the left side, round the back strap. Returns [u, v].
function outline(o, s) {
  const R = CR + o, cu = HW - CR, cv = HD - CR, q = (R * Math.PI) / 2;
  const arc = (cx, cy, a0) => (t) => [cx + R * Math.cos(a0 + t / R), cy + R * Math.sin(a0 + t / R)];
  const legs = [
    [cv, (t) => [HW + o, t]], [q, arc(cu, cv, 0)], [2 * cu, (t) => [cu - t, HD + o]], [q, arc(-cu, cv, Math.PI / 2)],
    [2 * cv, (t) => [-HW - o, cv - t]], [q, arc(-cu, -cv, Math.PI)], [2 * cu, (t) => [t - cu, -HD - o]],
    [q, arc(cu, -cv, 1.5 * Math.PI)], [cv, (t) => [HW + o, t - cv]],
  ];
  let t = ((s % (4 * (cu + cv + q))) + 4 * (cu + cv + q)) % (4 * (cu + cv + q));
  for (const [len, at] of legs) {
    if (t <= len) return at(t);
    t -= len;
  }
  return [HW + o, 0];
}
// Points along that outline from s0 to s1 at section height y (a number or a function of t); m = -1 mirrors it.
const along = (o, s0, s1, y, m = 1, n = 30) => Array.from({ length: n + 1 }, (_, i) => {
  const [u, v] = outline(o, s0 + ((s1 - s0) * i) / n);
  return sec(typeof y === 'function' ? y(i / n) : y, m * u, v);
});

// A smooth tube through `pts` with rounded caps. radius(t) gives [rn, rb]: rb lies along `side` (made square to the
// tube), rn across it, so an ellipse can be a flat palm or a forearm. Indexed with no seam, so normals come out smooth.
function tube(pts, radius, side, sides = 14, step = 0.004) {
  const curve = new CatmullRomCurve3(pts, false, 'centripetal');
  const n = Math.max(2, Math.round(curve.getLength() / step));
  const rings = [];
  for (let i = 0; i <= n; i++) {
    const T = curve.getTangentAt(i / n);
    const B = side.clone().addScaledVector(T, -side.dot(T)).normalize();
    rings.push([curve.getPointAt(i / n), new Vector3().crossVectors(B, T), B, radius(i / n)]);
  }
  const ends = [[rings[0], curve.getTangentAt(0).negate()], [rings[n], curve.getTangentAt(1)]];
  const cap = ([[p, N, B, [rn, rb]], dir], k) => {
    const a = (k / 4) * (Math.PI / 2); // quarter-circle cap
    return [p.clone().addScaledVector(dir, rn * Math.sin(a)), N, B, [rn * Math.cos(a), rb * Math.cos(a)]];
  };
  const all = [...[3, 2, 1].map((k) => cap(ends[0], k)), ...rings, ...[1, 2, 3].map((k) => cap(ends[1], k))];
  const pos = [];
  for (const [p, N, B, [rn, rb]] of all) {
    for (let j = 0; j < sides; j++) {
      const c = rn * Math.cos((j / sides) * 2 * Math.PI), s = rb * Math.sin((j / sides) * 2 * Math.PI);
      pos.push(p.x + N.x * c + B.x * s, p.y + N.y * c + B.y * s, p.z + N.z * c + B.z * s);
    }
  }
  for (const [[p, , , [rn]], dir] of ends) pos.push(...p.clone().addScaledVector(dir, rn).toArray());
  const idx = [];
  const m = all.length;
  for (let i = 0; i < m - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j, b = i * sides + ((j + 1) % sides);
      idx.push(a, b, a + sides, b, b + sides, a + sides);
    }
  }
  for (let j = 0; j < sides; j++) {
    const k = (j + 1) % sides;
    idx.push(m * sides, k, j, (m - 1) * sides + j, (m - 1) * sides + k, m * sides + 1);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const bump = (t, c) => Math.exp(-(((t - c) / 0.07) ** 2));
// Gloved finger: tapers to the tip, a slight swell over the two knuckles.
const finger = (r) => (t) => {
  const k = r * (1 - 0.15 * t) * (1 + 0.05 * (bump(t, 0.5) + bump(t, 0.79)));
  return [k, k];
};
const taper = (r0, r1) => (t) => [r0 + (r1 - r0) * t, r0 + (r1 - r0) * t];
const V = (x, y, z) => new Vector3(x, y, z);
// Piecewise-linear lookup through [t, ...values] keys.
const keys = (k) => (t) => {
  const i = Math.max(1, k.findIndex(([kt]) => kt >= t));
  const [t0, ...a] = k[i - 1];
  const [t1, ...b] = k[i];
  return a.map((v, j) => v + ((b[j] - v) * Math.min(1, Math.max(0, (t - t0) / (t1 - t0)))));
};

export function buildHands() {
  const glove = new MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.85, metalness: 0 });
  const pad = new MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.6, metalness: 0 }); // knuckle armour, cuffs
  const sleeve = new MeshStandardMaterial({ color: 0x2d3127, roughness: 0.9, metalness: 0 });
  const hands = new Group();
  const add = (name, geometry, material) => {
    const m = new Mesh(geometry, material);
    m.name = name;
    hands.add(m);
  };
  const arm = (side, base, dir) => {
    const at = (d) => base.clone().addScaledVector(dir, d);
    add(`${side}.wrist`, tube([at(0), at(0.05)], () => [0.021, 0.026], X, 16, 0.01), glove);
    add(`${side}.cuff`, tube([at(0.04), at(0.068)], () => [0.025, 0.03], X, 18, 0.007), pad);
    add(`${side}.sleeve`, tube([at(0.062), at(0.45)], (t) => [0.029 + 0.008 * t, 0.034 + 0.01 * t], X, 18, 0.03), sleeve);
  };

  // ---- right (firing) hand ----
  // Palm: a band round the back strap from the thumb's root on the left side to the knuckles on the right. Keys give
  // its centre height and half height along the grip: short at the thumb's root, its top edge (the web of the hand)
  // just under the beavertail at the back (a section's back edge sits ~10 mm above its centre on this rake).
  const o = 0.0128, cu = HW - CR, cv = HD - CR, q = ((CR + o) * Math.PI) / 2;
  const band = keys([[0, -0.037, 0.0225], [0.28, -0.0556, 0.038], [0.62, -0.0556, 0.038], [1, -0.0519, 0.0419]]);
  add('R.palm', tube(along(o, 2 * (cv + cu + q) + 0.012, 4 * (cv + cu + q) + 0.004, (t) => band(t)[0]), (t) => [0.012, band(t)[1]], AXIS, 20), glove);
  // Middle, ring and little finger wrap the front strap under the trigger guard; the tips end on the left panel.
  for (const [name, y, r, v0, len] of [['middle', -0.041, 0.0086, -0.003, 0.09], ['ring', -0.0573, 0.0083, -0.006, 0.086], ['little', -0.0726, 0.0074, -0.01, 0.07]]) {
    add(`R.${name}`, tube(along(r + GAP, v0, v0 + len, y), finger(r), AXIS), glove);
  }
  add('R.index', tube([V(0.0228, -0.0225, 0.026), V(0.0228, -0.0195, -0.012), V(0.0085, -0.0185, -0.0255), V(-0.0025, -0.018, -0.02)],
    taper(0.008, 0.0068), UP), glove); // trigger finger, pad on the trigger
  // Thumb: forward along the left of the frame just under the slide, 1 mm off the slide stop; above the slide's bottom
  // edge it stays outside the slide's path.
  add('R.thumb', tube([V(-0.0262, -0.021, 0.047), V(-0.025, -0.004, 0.028), V(-0.0245, 0.0005, 0.004), V(-0.0243, 0.001, -0.017)],
    taper(0.0112, 0.0088), UP), glove);
  add('R.thumbpad', tube([V(-0.0301, 0.008, 0.006), V(-0.0299, 0.0085, -0.013)], () => [0.0018, 0.0045], V(0.8, 0.6, 0), 10), pad); // grip patch
  add('R.knuckles', tube([-0.026, -0.042, -0.058, -0.072].map((y, i) => sec(y, 0.0395, [0.002, 0, -0.003, -0.007][i])), () => [0.0035, 0.009], FWD, 10, 0.006), pad);
  arm('R', sec(-0.06, 0.004, -(HD + 0.026)), V(0.32, -0.38, 1).normalize());

  // ---- left (support) hand ----
  // Palm heel on the left panel; it tilts out toward the front to clear the firing hand's finger tips.
  add('L.palm', tube([[-0.02, 0.0133, -0.06], [-0.01, 0.0145, -0.058], [0, 0.018, -0.056], [0.009, 0.0245, -0.054]].map(([v, off, y]) => sec(y, -HW - off, v)),
    () => [0.0125, 0.034], AXIS, 20), glove);
  // Four fingers wrap the firing hand's fingers from the front; the index presses up under the trigger guard.
  for (const [name, y, r, v0, len] of [['index', -0.031, 0.0082, 0.011, 0.08], ['middle', -0.047, 0.0084, 0.009, 0.088], ['ring', -0.0628, 0.008, 0.006, 0.083], ['little', -0.0775, 0.007, 0.002, 0.066]]) {
    add(`L.${name}`, tube(along(0.0188 + r, v0, v0 + len, y, -1), finger(r), AXIS), glove);
  }
  add('L.thumb', tube([V(-0.031, -0.031, 0.032), V(-0.0262, -0.0175, 0.01), V(-0.0245, -0.0155, -0.016), V(-0.0235, -0.0125, -0.04)],
    taper(0.0108, 0.008), UP), glove); // forward alongside the frame, tucked under the firing thumb
  add('L.thumbpad', tube([V(-0.0333, -0.0155, -0.018), V(-0.0323, -0.0125, -0.037)], () => [0.0018, 0.0045], UP, 10), pad);
  add('L.knuckles', tube([-0.028, -0.044, -0.06, -0.076].map((y, i) => sec(y, -0.0515, [0.015, 0.013, 0.01, 0.006][i])), () => [0.0035, 0.009], FWD, 10, 0.006), pad);
  arm('L', sec(-0.07, -0.04, -(HD + 0.01)), V(-0.3, -0.45, 1).normalize());
  return hands;
}
