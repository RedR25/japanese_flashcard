// The viewmodel pistol: a procedural, real-size H&K USP Tactical with a screw-on suppressor (the real gun CS2's USP-S
// depicts), built from real-world proportions. No game mesh, textures or markings.
// Gun space is metres: -Z is the muzzle direction, +Y up, +X right.
import {
  BoxGeometry, BufferAttribute, CircleGeometry, CylinderGeometry, DataTexture, DirectionalLight, ExtrudeGeometry, Group,
  LatheGeometry, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshStandardMaterial, PMREMGenerator, RepeatWrapping,
  Shape, SRGBColorSpace, TorusGeometry, Vector2, Vector3,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const BORE = 0.02; // bore axis height
const TOP = BORE + 0.0135; // slide top: the bore sits 13.5 mm below it
const REAR = 0.07; // slide rear face
const FRONT = REAR - 0.192; // slide front face (192 mm slide)
const S = 0.0135; // half the 27 mm slide width
const FW = 0.0255; // frame width under the slide, just inside it
const MUZZLE = -0.305; // suppressor front face
const RAKE = Math.tan((17 * Math.PI) / 180); // grip angle from vertical
const fz = (y) => 0.008 - (y + 0.03) * RAKE; // front strap z at height y
const bz = (y) => fz(y) + 0.049; // back strap: a ~50 mm deep grip
const CREASE = 0.6; // radians: smooth shading across curve/bevel facets, real edges stay sharp

// Polygon of [a, b, radius?] -> Shape; a radius rounds that corner with a quadratic curve.
function shapeOf(pts) {
  const s = new Shape();
  pts.forEach(([x, y, r = 0], i) => {
    const [px, py] = pts.at(i - 1);
    const [qx, qy] = pts[(i + 1) % pts.length];
    const a = r / Math.hypot(px - x, py - y);
    const b = r / Math.hypot(qx - x, qy - y);
    s[i ? 'lineTo' : 'moveTo'](x + (px - x) * a, y + (py - y) * a);
    if (r) s.quadraticCurveTo(x, y, x + (qx - x) * b, y + (qy - y) * b);
  });
  return s;
}

// Smooth normals shared only between faces within CREASE of each other, weighted by face area, so a big flat wall keeps
// its own normal next to a thin bevel strip. (three's toCreasedNormals snaps positions to a 1 cm grid: too coarse here.)
function creased(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = g.attributes.position.array;
  const area = new Float64Array(p.length / 3); // per face: normal × 2·area
  const at = new Map(); // exact position -> vertices there
  for (let i = 0; i < p.length; i += 9) {
    const [ux, uy, uz, vx, vy, vz] = [p[i + 3] - p[i], p[i + 4] - p[i + 1], p[i + 5] - p[i + 2], p[i + 6] - p[i], p[i + 7] - p[i + 1], p[i + 8] - p[i + 2]];
    area.set([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx], i / 3);
    for (let k = i; k < i + 9; k += 3) {
      const key = `${Math.round(p[k] * 1e7)},${Math.round(p[k + 1] * 1e7)},${Math.round(p[k + 2] * 1e7)}`;
      if (!at.has(key)) at.set(key, []);
      at.get(key).push(k / 3);
    }
  }
  const unit = (v) => { const f = 3 * Math.floor(v / 3); const l = Math.hypot(area[f], area[f + 1], area[f + 2]) || 1; return [area[f] / l, area[f + 1] / l, area[f + 2] / l]; };
  const n = new Float32Array(p.length);
  const cos = Math.cos(CREASE);
  for (const verts of at.values()) {
    for (const v of verts) {
      const a = unit(v);
      const sum = [0, 0, 0];
      for (const w of verts) {
        const b = unit(w);
        const f = 3 * Math.floor(w / 3);
        if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] >= cos) for (let c = 0; c < 3; c++) sum[c] += area[f + c];
      }
      const l = Math.hypot(...sum) || 1;
      n.set(sum.map((s) => s / l), v * 3);
    }
  }
  g.setAttribute('normal', new BufferAttribute(n, 3));
  return g;
}

function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const m = new Mesh(creased(geometry), material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// Extruded `depth` along its local z, centred on 0. The bevel rounds the outline's edges without growing the outline.
function extrude(pts, depth, bevel, holes = []) {
  const shape = shapeOf(pts);
  shape.holes = holes.map(shapeOf);
  return new ExtrudeGeometry(shape, {
    depth: depth - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel,
    bevelSegments: 3, curveSegments: 6,
  }).translate(0, 0, bevel - depth / 2);
}
// Side profile (points are [z, y]) extruded across the gun, `width` wide, centred on x.
const side = (parent, pts, width, bevel, mat, x = 0, holes) => mesh(parent, extrude(pts, width, bevel, holes).rotateY(-Math.PI / 2), mat, x);
// Cross-section (points are [x, y]) extruded along the bore from z1 to z2.
const section = (parent, pts, z1, z2, bevel, mat) => mesh(parent, extrude(pts, z2 - z1, bevel).translate(0, 0, (z1 + z2) / 2), mat);
// Profile (points are [radius, distance forward of z = 0]) turned around the bore.
const lathe = (parent, pts, segments, mat) =>
  mesh(parent, new LatheGeometry(pts.map(([r, t]) => new Vector2(r, t)), segments).rotateX(-Math.PI / 2).translate(0, BORE, 0), mat);

// Moulded grip stipple as a subtle albedo grain (no bump/normal map). Extrude UVs are in metres, hence the big repeat.
function stipple() {
  const N = 32;
  const data = new Uint8Array(N * N * 4).fill(255);
  let seed = 9;
  for (let i = 0; i < N * N; i++) {
    seed = (seed * 16807) % 2147483647;
    data.fill(170 + (seed % 86), i * 4, i * 4 + 3);
  }
  const t = new DataTexture(data, N, N);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(70, 70); // one 32-texel tile per ~14 mm: ~0.45 mm grain
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export function buildGun() {
  const steel = new MeshStandardMaterial({ color: 0x35383d, metalness: 0.75, roughness: 0.38 }); // nitrided slide steel
  const bright = new MeshStandardMaterial({ color: 0x8a8d93, metalness: 0.85, roughness: 0.3 }); // barrel steel
  const polymer = new MeshStandardMaterial({ color: 0x1c1d20, metalness: 0, roughness: 0.75 });
  const grip = new MeshStandardMaterial({ color: 0x232428, metalness: 0, roughness: 0.9, map: stipple() });
  const can = new MeshStandardMaterial({ color: 0x1f2023, metalness: 0.5, roughness: 0.45 }); // black anodised
  const groove = new MeshStandardMaterial({ color: 0x08080a, metalness: 0.3, roughness: 0.8 });
  const dot = new MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5, emissive: 0x777777 });
  const gun = new Group();
  const slide = new Group();
  gun.add(slide);

  // ---- slide: everything in here rides back on blowback ----
  const R = 0.0035; // rounded top edges
  const full = [[-S, 0.0125], [S, 0.0125], [S, TOP, R], [-S, TOP, R]];
  section(slide, full, 0.004, REAR, 0.0008, steel);
  // Ejection port: the right side and right half of the top are open over the barrel hood. This piece overlaps its
  // neighbours by their bevel so the left side stays seamless.
  section(slide, [[-S, 0.0125], [S, 0.0125], [S, 0.0145], [0.0005, 0.0145], [0.0005, TOP], [-S, TOP, R]], -0.0488, 0.0048, 0, steel);
  section(slide, full, FRONT, -0.048, 0.0008, steel);
  // Lower rails, with the USP's slanted nose under the muzzle.
  side(slide, [[REAR, 0.0045], [REAR, 0.0135], [FRONT, 0.0135], [FRONT, 0.0125], [FRONT + 0.008, 0.0045]], 2 * S, 0.0004, steel);
  section(slide, [[-0.0075, 0.0103], [0.0095, 0.0103], [0.0095, 0.0332, 0.0015], [-0.0075, 0.0332, 0.0015]], -0.0475, 0.0035, 0.0004, bright); // barrel hood
  mesh(slide, new BoxGeometry(0.0009, 0.0042, 0.022), steel, S + 0.0003, 0.0215, 0.0155); // extractor, behind the port
  for (let i = 0; i < 10; i++) {
    for (const sx of [-1, 1]) mesh(slide, new BoxGeometry(0.0002, 0.0235, 0.0011), groove, sx * (S + 0.00005), 0.0178, 0.0635 - i * 0.0028); // cocking serrations
  }
  // Suppressor-height sights: a notched rear sight with two white dots and a front post with one. Both stand above the can.
  section(slide, [[-0.0095, 0.0333], [0.0095, 0.0333], [0.0085, 0.0432, 0.0008], [0.0024, 0.0432], [0.0024, 0.0397, 0.0004],
    [-0.0024, 0.0397, 0.0004], [-0.0024, 0.0432], [-0.0085, 0.0432, 0.0008]], 0.0515, 0.0612, 0.0004, steel);
  for (const x of [-0.0056, 0.0056]) mesh(slide, new CircleGeometry(0.0011, 16), dot, x, 0.0409, 0.06125);
  section(slide, [[-0.0045, 0.0333], [0.0045, 0.0333], [0.0045, 0.0352], [0.0018, 0.0362], [0.0018, 0.0432, 0.0006],
    [-0.0018, 0.0432, 0.0006], [-0.0018, 0.0362], [-0.0045, 0.0352]], -0.1125, -0.105, 0.0003, steel);
  mesh(slide, new CircleGeometry(0.00095, 16), dot, 0, 0.0408, -0.10495);

  // ---- polymer frame ----
  // Receiver and dust cover with the USP's accessory-rail groove (a slit over a narrower floor), web and beavertail tang.
  side(gun, [[-0.1095, 0.0055], [-0.10648, -0.0022], [-0.0555, -0.0022, 0.0011], [-0.0555, -0.0046, 0.0011], [-0.10553, -0.0046],
    [-0.104, -0.0085], [0.047, -0.0085], [0.0498, -0.0082], [0.057, -0.0072, 0.006], [0.0735, -0.0012, 0.0018],
    [0.0742, 0.0036, 0.0015], [0.0705, 0.0055]], FW, 0.0008, polymer);
  mesh(gun, new BoxGeometry(FW - 0.003, 0.003, 0.0505), polymer, 0, -0.0034, -0.0805); // rail groove floor
  // Big squared trigger guard; the finger opening is a real hole. Its rear runs on inside the grip: the bevel needs that
  // meat, or the contracted outline crosses the hole and the cap fills it in.
  side(gun, [[-0.04, -0.005], [-0.0412, -0.018], [-0.044, -0.0368, 0.0045], [0.016, -0.0368], [0.016, -0.02], [0.01, -0.005]], 0.012, 0.0015, polymer, 0,
    [[[-0.0362, -0.008], [fz(-0.008) + 0.0005, -0.008], [fz(-0.0328) + 0.0005, -0.0328], [-0.0385, -0.0328, 0.003], [-0.0374, -0.018]]]);
  side(gun, [[-0.0135, -0.007], [-0.0105, -0.017, 0.006], [-0.0138, -0.0265, 0.0015], [-0.0105, -0.0282, 0.0015],
    [-0.0062, -0.0175, 0.006], [-0.008, -0.007]], 0.0065, 0.0008, steel); // curved trigger
  // Raked grip (17°, ~50 mm deep) with raised stippled panels, magazine baseplate and the paddle magazine release.
  side(gun, [[fz(-0.006), -0.006], [fz(-0.088), -0.088, 0.004], [bz(-0.081), -0.081, 0.005], [bz(-0.006), -0.006]], 0.0265, 0.002, polymer);
  side(gun, [[fz(-0.0165) + 0.0045, -0.0165, 0.003], [fz(-0.0805) + 0.004, -0.0805, 0.004], [bz(-0.0745) - 0.0045, -0.0745, 0.004],
    [bz(-0.0165) - 0.0045, -0.0165, 0.003]], 0.0285, 0.0007, grip);
  side(gun, [[fz(-0.0875) - 0.0012, -0.0875], [fz(-0.0875) - 0.0016, -0.0955, 0.0015], [bz(-0.081) + 0.0004, -0.0885, 0.0015],
    [bz(-0.081) + 0.0004, -0.0805]], 0.0262, 0.0012, polymer);
  side(gun, [[0.002, -0.0345], [0.0095, -0.0345], [0.0122, -0.0398, 0.0015], [0.006, -0.0412, 0.0015], [0.0012, -0.0385]], 0.0185, 0.0008, polymer);

  // ---- controls and hammer ----
  mesh(gun, new CylinderGeometry(0.0022, 0.0022, 0.0012, 16).rotateZ(Math.PI / 2), steel, FW / 2 + 0.0002, -0.0005, -0.032); // takedown pin end (right)
  side(gun, [[-0.036, 0.001, 0.002], [-0.0345, -0.0045, 0.002], [-0.028, -0.005], [-0.006, -0.003], [0.0005, -0.0042, 0.0015],
    [0.004, -0.001, 0.0015], [0.0035, 0.0044], [-0.0335, 0.0044, 0.002]], 0.0016, 0.0003, steel, -(FW / 2 + 0.0007)); // slide stop (left)
  side(gun, [[0.064, 0.003, 0.002], [0.063, -0.004, 0.002], [0.054, -0.006], [0.042, -0.009, 0.0015], [0.0385, -0.006, 0.0015],
    [0.04, -0.003], [0.052, 0], [0.0575, 0.0042, 0.002]], 0.0018, 0.0003, steel, -(FW / 2 + 0.0008)); // decocking lever (left)
  side(gun, [[0.0615, 0.001], [0.068, -0.0005, 0.002], [0.0718, 0.008], [0.0752, 0.0175, 0.003], [0.0745, 0.024, 0.002],
    [0.07, 0.0255, 0.002], [0.0665, 0.0215], [0.064, 0.008]], 0.0078, 0.0008, steel); // rounded spur hammer

  // ---- barrel stub and suppressor ----
  const barrel = [[0, 0.11], [0.0068, 0.11]];
  for (let i = 0; i < 10; i++) barrel.push([0.0068, 0.1245 + i * 0.001], [0.0062, 0.125 + i * 0.001]); // muzzle thread
  barrel.push([0.0068, 0.1345], [0, 0.1345]);
  lathe(gun, barrel, 24, bright);
  mesh(gun, new TorusGeometry(0.0068, 0.0007, 8, 24), polymer, 0, BORE, -0.1236); // O-ring at the thread base
  const tube = [[0.007, 0.129], [0.0152, 0.129], [0.0163, 0.1302]];
  for (let i = 0; i < 7; i++) {
    const t = 0.133 + i * 0.0034; // grip grooves round the rear coupler
    tube.push([0.0163, t], [0.0155, t], [0.0155, t + 0.0012], [0.0163, t + 0.0012]);
  }
  // 35 mm tube, a groove marking off the front cap, then the bore hole.
  tube.push([0.0163, 0.158], [0.0175, 0.1592], [0.0175, 0.295], [0.0169, 0.2956], [0.0175, 0.2962], [0.0175, 0.3035],
    [0.0161, -MUZZLE], [0.006, -MUZZLE], [0.006, 0.299], [0, 0.299]);
  lathe(gun, tube, 40, can);

  return { gun, slide, muzzle: new Vector3(0, BORE, MUZZLE) };
}

// Image-based light so the metal has something to reflect, plus a neutral key and a cool fill. Returns dispose().
export function lightViewmodel(scene, renderer) {
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.8;
  const key = new DirectionalLight(0xffffff, 1.8);
  key.position.set(-1, 2, 1.5);
  const fill = new DirectionalLight(0xb8c8ff, 0.5);
  fill.position.set(0.4, -0.3, 1);
  scene.add(key, fill);
  return () => {
    scene.remove(key, fill);
    if (scene.environment === env) scene.environment = null;
    env.dispose();
    pmrem.dispose();
  };
}
