// Word Range 3D: a dark grid room, floating word discs and a suppressed pistol. This file only renders, aims and
// shoots; Game.jsx decides which words appear and how they score (rules in logic.js).
import {
  AdditiveBlending, AmbientLight, BackSide, BoxGeometry, CanvasTexture, Color, CylinderGeometry, DirectionalLight,
  Fog, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, RepeatWrapping, Scene, Sprite,
  SpriteMaterial, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { CS2_VFOV, VM_VFOV, YAW, placeTargets } from './logic.js';

const RAD = Math.PI / 180;
const EYE = 1.6;
const ROOM = { w: 72, h: 24, d: 72 };
const DIST = 14; // metres to the targets
const FIRE_MS = 170; // like tapping a USP-S: clicking faster doesn't fire faster
const MAG = 12;
const RELOAD_MS = 2200;
const SIZES = { s: 0.75, m: 1, l: 1.3 }; // disc radius in metres
const FAMILY = { zh: '"Noto Serif SC", serif', ja: '"Noto Serif JP", serif', kana: '"Noto Serif JP", serif' };
const family = (side) => FAMILY[side] || 'Inter, system-ui, sans-serif';

const canvas2d = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
};
const toTexture = (c) => {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

// Walls and floor: a faint line every metre, a stronger one every 4 m, so turning has something to read against.
function gridTexture(width, height, tint) {
  const [c, g] = canvas2d(256, 256);
  g.fillStyle = tint;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.045)';
  g.lineWidth = 2;
  g.beginPath();
  for (let i = 64; i < 256; i += 64) { g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); }
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.11)';
  g.lineWidth = 4;
  g.strokeRect(0, 0, 256, 256);
  const t = toTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(width / 4, height / 4);
  return t;
}

function textSprite(text, color, height) {
  const [c, g] = canvas2d(256, 128);
  g.font = '700 64px Inter, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(text, 128, 64);
  const s = new Sprite(new SpriteMaterial({ map: toTexture(c), transparent: true, depthWrite: false }));
  s.scale.set(height * 2, height, 1);
  return s;
}

const wrap = (g, text, maxW) => {
  if (g.measureText(text).width <= maxW || !text.includes(' ')) return [text];
  const lines = [''];
  for (const word of text.split(' ')) {
    const next = lines.at(-1) ? `${lines.at(-1)} ${word}` : word;
    if (lines.at(-1) && g.measureText(next).width > maxW) lines.push(word);
    else lines[lines.length - 1] = next;
  }
  return lines;
};
// The biggest font size (one or two lines) that fits the box.
function fit(g, text, fam, weight, maxW, maxH, start) {
  for (let size = start; size > 26; size -= 4) {
    g.font = `${weight} ${size}px ${fam}`;
    const lines = wrap(g, text, maxW);
    if (lines.length <= 2 && lines.length * size * 1.12 <= maxH && lines.every((l) => g.measureText(l).width <= maxW)) return { lines, size };
  }
  g.font = `${weight} 26px ${fam}`;
  return { lines: wrap(g, text, maxW).slice(0, 2), size: 26 };
}

// A word disc: a glossy seal-red orb with the word (and its reading). Dark red once it's revealed as a wrong pick.
function discTexture(face, wrong) {
  const S = 512;
  const [c, g] = canvas2d(S, S);
  const R = S * 0.46;
  const shade = g.createRadialGradient(S * 0.36, S * 0.3, S * 0.04, S / 2, S / 2, R);
  shade.addColorStop(0, wrong ? '#7a2438' : '#ff9cad');
  shade.addColorStop(1, wrong ? '#2c0c16' : '#d8385a');
  g.beginPath();
  g.arc(S / 2, S / 2, R, 0, Math.PI * 2);
  g.fillStyle = shade;
  g.fill();
  g.lineWidth = S * 0.022;
  g.strokeStyle = wrong ? '#ff5f78' : 'rgba(255,255,255,0.85)';
  g.stroke();
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.45)';
  g.shadowBlur = 12;
  g.shadowOffsetY = 3;
  const main = fit(g, face.text, family(face.side), 700, S * 0.72, face.sub ? S * 0.38 : S * 0.52, 172);
  const sub = face.sub && fit(g, face.sub.text, family(face.sub.side), 500, S * 0.66, S * 0.12, Math.min(60, Math.round(main.size * 0.5)));
  const mainH = main.lines.length * main.size * 1.12;
  const subH = sub ? sub.size * 1.4 : 0;
  let y = S / 2 - (mainH + subH) / 2;
  g.font = `700 ${main.size}px ${family(face.side)}`;
  for (const line of main.lines) { g.fillText(line, S / 2, y + main.size * 0.56); y += main.size * 1.12; }
  if (sub) {
    g.globalAlpha = 0.85;
    g.font = `500 ${sub.size}px ${family(face.sub.side)}`;
    g.fillText(sub.lines[0], S / 2, y + subH / 2);
  }
  return toTexture(c);
}

function dotTexture() {
  const [c, g] = canvas2d(64, 64);
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return toTexture(c);
}

// An original low-poly suppressed pistol (USP-S-like silhouette: long can, raked grip) with seal-red grip panels.
function buildGun() {
  const steel = new MeshStandardMaterial({ color: 0x24262d, roughness: 0.42, metalness: 0.55 });
  const frame = new MeshStandardMaterial({ color: 0x30333b, roughness: 0.7, metalness: 0.2 });
  const panel = new MeshStandardMaterial({ color: 0xff5f78, roughness: 0.6, metalness: 0.05 });
  const gun = new Group();
  const slide = new Group();
  gun.add(slide);
  const box = (parent, [w, h, d], mat, [x, y, z], rx = 0) => {
    const m = new Mesh(new BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    parent.add(m);
  };
  box(slide, [0.034, 0.034, 0.2], steel, [0, 0.02, -0.03]);
  box(slide, [0.007, 0.008, 0.012], steel, [0, 0.041, 0.06]); // rear sight
  box(slide, [0.004, 0.008, 0.008], steel, [0, 0.041, -0.12]); // front sight
  box(gun, [0.03, 0.02, 0.17], frame, [0, -0.005, -0.02]);
  box(gun, [0.008, 0.026, 0.05], frame, [0, -0.026, -0.04]); // trigger guard
  box(gun, [0.029, 0.118, 0.048], frame, [0, -0.07, 0.045], -0.3); // raked grip
  box(gun, [0.032, 0.08, 0.034], panel, [0, -0.072, 0.047], -0.3);
  const tube = (r, len, z) => {
    const m = new Mesh(new CylinderGeometry(r, r, len, 24), steel);
    m.rotation.x = Math.PI / 2;
    m.position.set(0, 0.02, z);
    gun.add(m);
  };
  tube(0.0155, 0.17, -0.215); // suppressor
  tube(0.0168, 0.01, -0.145);
  tube(0.0168, 0.01, -0.29);
  return { gun, slide, muzzle: new Vector3(0, 0.02, -0.305) };
}

// Shot, hit and reload sounds synthesised with WebAudio (no recorded game audio).
function makeSounds(volume) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return { resume() {}, shot() {}, hit() {}, wrong() {}, dry() {}, reload() {}, close() {} };
  const ctx = new AC();
  const out = ctx.createGain();
  out.gain.value = volume;
  out.connect(ctx.destination);
  const noise = ctx.createBuffer(1, ctx.sampleRate / 4, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const envelope = (node, t, peak, decay) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    node.connect(g);
    g.connect(out);
  };
  const hiss = (t, freq, q, peak, decay) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f);
    envelope(f, t, peak, decay);
    src.start(t);
    src.stop(t + decay + 0.02);
  };
  const tone = (t, type, f0, f1, peak, decay) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + decay);
    envelope(o, t, peak, decay);
    o.start(t);
    o.stop(t + decay + 0.02);
  };
  const now = () => ctx.currentTime;
  return {
    resume: () => ctx.resume(),
    shot: () => { const t = now(); hiss(t, 1300, 0.8, 0.55, 0.09); tone(t, 'sine', 150, 50, 0.4, 0.1); hiss(t + 0.03, 3600, 3, 0.12, 0.03); },
    hit: () => { const t = now(); tone(t, 'sine', 988, 988, 0.16, 0.16); tone(t + 0.06, 'sine', 1480, 1480, 0.12, 0.22); },
    wrong: () => tone(now(), 'square', 160, 90, 0.06, 0.24),
    dry: () => hiss(now(), 2600, 5, 0.25, 0.03),
    reload: () => { const t = now(); hiss(t + 0.3, 1700, 4, 0.3, 0.04); hiss(t + 1.35, 1400, 4, 0.35, 0.05); hiss(t + 1.9, 2300, 4, 0.35, 0.04); },
    close: () => ctx.close(),
  };
}

// on: { onShot({ id, correct } | null), onLock(locked, raw), onAmmo(left, reloading), onLockError() }
export function createRange(canvas, { sens, size, motion, infinite, volume }, on) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.autoClear = false;
  const sounds = makeSounds(volume);
  const dot = dotTexture();

  const scene = new Scene();
  scene.background = new Color(0x090a10);
  scene.fog = new Fog(0x090a10, 24, 90);
  const camera = new PerspectiveCamera(CS2_VFOV, 1, 0.05, 300);
  camera.position.set(0, EYE, 0);
  camera.rotation.order = 'YXZ';

  const { w, h, d } = ROOM;
  const wall = '#0d0f16';
  const faces = [[d, h, wall], [d, h, wall], [w, d, '#0a0b10'], [w, d, '#12141c'], [w, h, wall], [w, h, wall]]
    .map(([a, b, tint]) => new MeshBasicMaterial({ map: gridTexture(a, b, tint), side: BackSide }));
  const room = new Mesh(new BoxGeometry(w, h, d), faces);
  room.position.y = h / 2;
  scene.add(room);
  // Turn markers to check sensitivity against: flick to the red 180° stripe behind you and see where you land.
  for (const [x, z, label, strong] of [[0, -d / 2, '0°'], [-w / 2, 0, '90°'], [0, d / 2, '180°', true], [w / 2, 0, '90°']]) {
    const strip = new Mesh(new BoxGeometry(x ? 0.05 : 0.16, h, x ? 0.16 : 0.05), new MeshBasicMaterial({ color: strong ? 0xff5f78 : 0x353a50 }));
    strip.position.set(x * 0.999, h / 2, z * 0.999);
    scene.add(strip);
    const tag = textSprite(label, strong ? '#ff5f78' : '#7c8299', 2.4);
    tag.position.set(x * 0.97, EYE + 2, z * 0.97);
    scene.add(tag);
  }

  // The gun lives in its own scene and camera, drawn after the world with a cleared depth buffer, so it never clips.
  const vmScene = new Scene();
  const vmCamera = new PerspectiveCamera(VM_VFOV, 1, 0.01, 10);
  vmScene.add(new AmbientLight(0xffffff, 0.9));
  const key = new DirectionalLight(0xffffff, 2.4);
  key.position.set(-1, 2, 1.5);
  const rim = new DirectionalLight(0xff5f78, 1.2);
  rim.position.set(2, 0.5, -1);
  vmScene.add(key, rim);
  const { gun, slide, muzzle } = buildGun();
  const REST = { x: 0.115, y: -0.11, z: -0.3, yaw: 0.06 };
  vmScene.add(gun);
  const flash = new Sprite(new SpriteMaterial({ map: dot, color: 0xffd9b0, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
  flash.position.copy(muzzle);
  flash.scale.setScalar(0.05);
  gun.add(flash);

  // ---- targets ----
  const radius = SIZES[size] ?? 1;
  const angR = Math.atan(radius / DIST) / RAD;
  const gap = motion === 'drift' ? 6 : 3;
  let targets = [];
  const parts = [];
  const HOLD = { wrong: 900, correct: 0, clear: 0 };
  const FADE = { wrong: 350, correct: 200, clear: 130 };

  function retire(t, how) {
    t.alive = false;
    t.end = { how, at: performance.now() };
    if (how === 'wrong') {
      t.sprite.material.map.dispose();
      t.sprite.material.map = discTexture(t.reveal, true);
    }
  }

  // list: [{ id, correct, face, reveal }], face/reveal: { text, side, sub?: { text, side } }
  function spawn(list) {
    for (const t of targets) if (t.alive) retire(t, 'clear');
    const spots = placeTargets(list.length, angR, gap);
    const keep = [...list].sort((a, b) => b.correct - a.correct).slice(0, spots.length); // the right word always gets a spot
    keep.forEach((item, i) => {
      const { yaw, pitch } = spots[i];
      const dir = new Vector3(-Math.sin(yaw * RAD) * Math.cos(pitch * RAD), Math.sin(pitch * RAD), -Math.cos(yaw * RAD) * Math.cos(pitch * RAD));
      const base = new Vector3(0, EYE, 0).addScaledVector(dir, DIST + (Math.random() * 2 - 1));
      const sprite = new Sprite(new SpriteMaterial({ map: discTexture(item.face, false), transparent: true, depthWrite: false }));
      sprite.position.copy(base);
      scene.add(sprite);
      targets.push({ ...item, sprite, base, alive: true, born: performance.now(), phase: Math.random() * 6.28, end: null });
    });
  }

  function updateTargets(now) {
    const t = now / 1000;
    targets = targets.filter((tg) => {
      const s = tg.sprite;
      if (motion === 'drift' && tg.alive) s.position.set(tg.base.x + Math.sin(t * 0.8 + tg.phase) * 0.6, tg.base.y + Math.sin(t * 1.3 + tg.phase * 1.7) * 0.3, tg.base.z);
      let scale = Math.min(1, 0.6 + (now - tg.born) / 300);
      let opacity = 1;
      if (tg.end) {
        const k = Math.max(0, now - tg.end.at - HOLD[tg.end.how]) / FADE[tg.end.how];
        if (k >= 1) {
          scene.remove(s);
          s.material.map.dispose();
          s.material.dispose();
          return false;
        }
        opacity = 1 - k;
        if (tg.end.how === 'correct') scale *= 1 + k * 0.5;
      }
      s.material.opacity = opacity;
      s.scale.setScalar(radius * 2 * scale);
      return true;
    });
  }

  function burst(at, color) {
    for (let i = 0; i < 18; i++) {
      const s = new Sprite(new SpriteMaterial({ map: dot, color, transparent: true, blending: AdditiveBlending, depthWrite: false }));
      s.position.copy(at);
      s.scale.setScalar(0.3);
      const v = new Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(3 + Math.random() * 5);
      scene.add(s);
      parts.push({ s, v, life: 1 });
    }
  }

  function updateParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt / 0.5;
      if (p.life <= 0) {
        scene.remove(p.s);
        p.s.material.dispose();
        parts.splice(i, 1);
        continue;
      }
      p.v.y -= 6 * dt;
      p.s.position.addScaledVector(p.v, dt);
      p.s.material.opacity = p.life;
      p.s.scale.setScalar(0.3 * (0.4 + p.life * 0.6));
    }
  }

  // ---- aim: CS2's 0.022° per mouse count × sensitivity, on raw counts where the browser allows ----
  const turn = YAW * sens * RAD;
  const chromium = Boolean(navigator.userAgentData?.brands?.some((b) => /Chromium/.test(b.brand)));
  let yaw = 0;
  let pitch = 0;
  let locked = false;
  let raw = false;
  let skip = false;
  let moveX = 0;
  let moveY = 0;
  const onMove = (e) => {
    if (!locked) return;
    if (skip) { skip = false; return; } // the first event after locking can carry a bogus jump
    yaw -= e.movementX * turn;
    pitch = Math.max(-89 * RAD, Math.min(89 * RAD, pitch - e.movementY * turn));
    moveX += e.movementX;
    moveY += e.movementY;
  };
  const onLockChange = () => {
    locked = document.pointerLockElement === canvas;
    if (locked) skip = true;
    on.onLock(locked, raw);
  };
  async function lock() {
    sounds.resume();
    raw = chromium;
    try {
      await canvas.requestPointerLock({ unadjustedMovement: true });
    } catch (e) {
      raw = false;
      if (e?.name !== 'NotSupportedError') { on.onLockError(); return; }
      try { await canvas.requestPointerLock(); } catch { on.onLockError(); }
    }
  }

  // ---- shooting ----
  let ammo = MAG;
  let reloadAt = 0;
  let lastShot = 0;
  let kick = 0;
  let slideBack = 0;
  function reload() {
    if (infinite || reloadAt || ammo === MAG) return;
    reloadAt = performance.now();
    sounds.reload();
    on.onAmmo(ammo, true);
  }
  const ray = new Vector3();
  const toTarget = new Vector3();
  function fire() {
    const now = performance.now();
    if (reloadAt || now - lastShot < FIRE_MS) return;
    if (!infinite && ammo === 0) { sounds.dry(); reload(); return; }
    lastShot = now;
    kick = 1;
    slideBack = 1;
    sounds.shot();
    if (!infinite) { ammo--; on.onAmmo(ammo, false); }
    camera.rotation.set(pitch, yaw, 0); // aim as of this click, not the last frame
    camera.updateMatrixWorld();
    camera.getWorldDirection(ray);
    let hit = null;
    let nearest = Infinity;
    for (const tg of targets) {
      if (!tg.alive) continue;
      toTarget.subVectors(tg.sprite.position, camera.position);
      const along = toTarget.dot(ray);
      if (along > 0 && along < nearest && toTarget.lengthSq() - along * along <= radius * radius) { hit = tg; nearest = along; }
    }
    if (hit?.correct) {
      burst(hit.sprite.position, 0x34d399);
      retire(hit, 'correct');
      for (const tg of targets) if (tg.alive) retire(tg, 'clear');
      sounds.hit();
    } else if (hit) {
      retire(hit, 'wrong');
      sounds.wrong();
    }
    on.onShot(hit && { id: hit.id, correct: hit.correct });
    if (!infinite && ammo === 0) reload();
  }
  const onDown = (e) => { if (locked && e.button === 0) fire(); };
  const onKey = (e) => { if (locked && e.code === 'KeyR' && !e.repeat) reload(); };

  // ---- loop ----
  let raf = 0;
  let last = performance.now();
  let swayX = 0;
  let swayY = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    camera.rotation.set(pitch, yaw, 0);
    if (reloadAt && now - reloadAt >= RELOAD_MS) { reloadAt = 0; ammo = MAG; on.onAmmo(ammo, false); }
    updateTargets(now);
    updateParts(dt);
    // viewmodel: recoil kick, slide blowback, reload dip, and a little lag against mouse movement
    kick = Math.max(0, kick - dt * 8);
    slideBack = Math.max(0, slideBack - dt * 14);
    swayX += (Math.max(-0.012, Math.min(0.012, -moveX * 0.00025)) - swayX) * Math.min(1, dt * 10);
    swayY += (Math.max(-0.01, Math.min(0.01, moveY * 0.00025)) - swayY) * Math.min(1, dt * 10);
    moveX = 0;
    moveY = 0;
    const dip = reloadAt ? Math.sin(Math.min(1, (now - reloadAt) / RELOAD_MS) * Math.PI) : 0;
    const k = kick * kick;
    gun.position.set(REST.x + swayX, REST.y + swayY + k * 0.008 - dip * 0.1 + Math.sin(now / 900) * 0.0015, REST.z + k * 0.03);
    gun.rotation.set(k * 0.16 - dip * 0.55, REST.yaw, dip * 0.35);
    slide.position.z = slideBack * slideBack * 0.032;
    flash.material.opacity = Math.max(0, slideBack - 0.75) * 3.2;
    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    renderer.render(vmScene, vmCamera);
  }

  const resize = () => {
    const { clientWidth: cw, clientHeight: ch } = canvas;
    if (!cw || !ch) return;
    renderer.setSize(cw, ch, false);
    camera.aspect = vmCamera.aspect = cw / ch;
    camera.updateProjectionMatrix();
    vmCamera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  document.addEventListener('mousemove', onMove);
  document.addEventListener('pointerlockchange', onLockChange);
  window.addEventListener('keydown', onKey);
  canvas.addEventListener('mousedown', onDown);
  raf = requestAnimationFrame(frame);

  function destroy() {
    cancelAnimationFrame(raf);
    ro.disconnect();
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('pointerlockchange', onLockChange);
    window.removeEventListener('keydown', onKey);
    canvas.removeEventListener('mousedown', onDown);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    const free = (o) => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.dispose(); }
    };
    scene.traverse(free);
    vmScene.traverse(free);
    dot.dispose();
    renderer.dispose();
    sounds.close();
  }

  return {
    spawn,
    lock,
    unlock: () => { if (document.pointerLockElement === canvas) document.exitPointerLock(); },
    destroy,
  };
}
