// Word Range 3D: a dark grid room, floating word discs and a suppressed pistol. This file only renders, aims and
// shoots; Game.jsx decides which words appear and how they score (rules in logic.js).
import {
  AdditiveBlending, BackSide, BoxGeometry, CanvasTexture, Color, Fog, Group, Mesh, MeshBasicMaterial, PerspectiveCamera,
  RepeatWrapping, Scene, Sprite, SpriteMaterial, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { buildGun, lightViewmodel } from './gun.js';
import { buildHands } from './hands.js';
import { CS2_VFOV, LIFE_MS, VM_VFOV, YAW, discShades, placeTargets } from './logic.js';

const RAD = Math.PI / 180;
const EYE = 1.6;
const ROOM = { w: 72, h: 24, d: 72 };
const DIST = 14; // metres to the targets
const FIRE_MS = 170; // like tapping a USP-S: clicking faster doesn't fire faster (ammo never runs out)
const RADIUS = 1; // disc radius in metres
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

// A word disc is two sprites: the orb, which shrinks and is what you hit, and its word on top, which stays full size so
// it can be read to the end. The orb: a glossy ball shaded light to dark with a rim (one texture per engine and colour).
function orbTexture(light, dark, rim) {
  const S = 512;
  const [c, g] = canvas2d(S, S);
  const R = S * 0.46;
  const shade = g.createRadialGradient(S * 0.36, S * 0.3, S * 0.04, S / 2, S / 2, R);
  shade.addColorStop(0, light);
  shade.addColorStop(1, dark);
  g.beginPath();
  g.arc(S / 2, S / 2, R, 0, Math.PI * 2);
  g.fillStyle = shade;
  g.fill();
  g.lineWidth = S * 0.022;
  g.strokeStyle = rim;
  g.stroke();
  return toTexture(c);
}

// The word (and its reading): white with a dark outline and a soft shadow, so it reads on any orb colour and, once the
// orb has shrunk, on the dark wall behind it.
function labelTexture(face) {
  const S = 512;
  const [c, g] = canvas2d(S, S);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(6,7,12,0.9)';
  const main = fit(g, face.text, family(face.side), 700, S * 0.72, face.sub ? S * 0.38 : S * 0.52, 172);
  const sub = face.sub && fit(g, face.sub.text, family(face.sub.side), 500, S * 0.66, S * 0.12, Math.min(60, Math.round(main.size * 0.5)));
  const mainH = main.lines.length * main.size * 1.12;
  const subH = sub ? sub.size * 1.4 : 0;
  const draw = (text, y, size, fill) => {
    g.lineWidth = Math.max(6, size * 0.12);
    g.shadowColor = 'rgba(0,0,0,0.6)';
    g.shadowBlur = 16;
    g.shadowOffsetY = 3;
    g.strokeText(text, S / 2, y);
    g.shadowColor = 'transparent'; // the outline already casts the shadow
    g.fillStyle = fill;
    g.fillText(text, S / 2, y);
  };
  let y = S / 2 - (mainH + subH) / 2;
  g.font = `700 ${main.size}px ${family(face.side)}`;
  for (const line of main.lines) { draw(line, y + main.size * 0.56, main.size, '#fff'); y += main.size * 1.12; }
  if (sub) {
    g.font = `500 ${sub.size}px ${family(face.sub.side)}`;
    draw(sub.lines[0], y + subH / 2, sub.size, 'rgba(255,255,255,0.85)');
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

// Shot and hit sounds synthesised with WebAudio (no recorded game audio).
function makeSounds(volume) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return { resume() {}, shot() {}, hit() {}, wrong() {}, close() {} };
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
    close: () => ctx.close(),
  };
}

// on: { onShot({ id, correct, ms } | null), onExpire(), onLock(locked, raw), onLockError() }
export function createRange(canvas, { sens, motion, volume, disc }, on) {
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
  const unlight = lightViewmodel(vmScene, renderer); // room reflections for the metal, a key and a cool fill (gun.js)
  const { gun, slide, muzzle } = buildGun(); // a real-size suppressed USP Tactical (gun.js)
  gun.add(buildHands()); // gloved hands in a two-hand grip; on the gun, not the slide, so they ride the recoil (hands.js)
  // Low and near the middle, turned in to show the thumbs on the left side. Turned in only so far: the suppressor stays
  // ~39 px (1080p) clear of the crosshair even at full recoil kick plus sway (scratchpad muzzle-check).
  const REST = { x: 0.072, y: -0.095, z: -0.24, yaw: 0.08, pitch: 0.03 };
  vmScene.add(gun);
  const flash = new Sprite(new SpriteMaterial({ map: dot, color: 0xffd9b0, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
  flash.position.copy(muzzle);
  flash.scale.setScalar(0.05);
  gun.add(flash);

  // ---- targets ----
  const angR = Math.atan(RADIUS / DIST) / RAD;
  const gap = motion === 'drift' ? 6 : 3;
  const orbTex = orbTexture(...discShades(disc), 'rgba(255,255,255,0.85)');
  const wrongTex = orbTexture('#7a2438', '#2c0c16', '#ff5f78'); // a wrong pick goes dark red, whatever the disc colour
  let targets = [];
  const parts = [];
  const HOLD = { wrong: 900, correct: 0, clear: 0 };
  const FADE = { wrong: 350, correct: 200, clear: 130 };
  let clock = 0; // ms of play: it only runs while the mouse is locked, so Esc freezes the discs (and Game's minute)

  function retire(t, how) {
    t.alive = false;
    t.end = { how, at: performance.now() };
    if (how === 'wrong') {
      t.orb.material.map = wrongTex;
      t.label.material.map.dispose();
      t.label.material.map = labelTexture(t.reveal);
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
      const orb = new Sprite(new SpriteMaterial({ map: orbTex, transparent: true, depthWrite: false }));
      const label = new Sprite(new SpriteMaterial({ map: labelTexture(item.face), transparent: true, depthWrite: false }));
      label.renderOrder = 1; // the word draws over its orb
      const group = new Group(); // drifting moves the orb and its word together
      group.position.copy(base);
      group.add(orb, label);
      scene.add(group);
      targets.push({ ...item, group, orb, label, base, alive: true, born: clock, k: 1, phase: Math.random() * 6.28, end: null });
    });
  }

  function updateTargets(now) {
    const t = now / 1000;
    let expired = false;
    targets = targets.filter((tg) => {
      const age = clock - tg.born;
      if (tg.alive) {
        tg.k = Math.sqrt(Math.max(0, 1 - age / LIFE_MS)); // radius left: the orb's area shrinks linearly to nothing
        if (age >= LIFE_MS) { retire(tg, 'clear'); expired = true; }
      }
      if (motion === 'drift' && tg.alive) tg.group.position.set(tg.base.x + Math.sin(t * 0.8 + tg.phase) * 0.6, tg.base.y + Math.sin(t * 1.3 + tg.phase * 1.7) * 0.3, tg.base.z);
      const grow = Math.min(1, 0.6 + age / 300);
      let swell = 1;
      let opacity = 1;
      if (tg.end) {
        const f = Math.max(0, now - tg.end.at - HOLD[tg.end.how]) / FADE[tg.end.how];
        if (f >= 1) {
          scene.remove(tg.group);
          tg.label.material.map.dispose(); // the orb textures are shared: destroy() frees them
          tg.label.material.dispose();
          tg.orb.material.dispose();
          return false;
        }
        opacity = 1 - f;
        if (tg.end.how === 'correct') swell = 1 + f * 0.5; // only the word swells: a swelling orb could dip into the floor
      }
      tg.orb.material.opacity = tg.label.material.opacity = opacity;
      tg.orb.scale.setScalar(RADIUS * 2 * grow * tg.k);
      tg.label.scale.setScalar(RADIUS * 2 * grow * swell);
      return true;
    });
    if (expired) on.onExpire();
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
  let lastShot = 0;
  let kick = 0;
  let slideBack = 0;
  const ray = new Vector3();
  const toTarget = new Vector3();
  function fire() {
    const now = performance.now();
    if (now - lastShot < FIRE_MS) return;
    lastShot = now;
    kick = 1;
    slideBack = 1;
    sounds.shot();
    camera.rotation.set(pitch, yaw, 0); // aim as of this click, not the last frame
    camera.updateMatrixWorld();
    camera.getWorldDirection(ray);
    let hit = null;
    let nearest = Infinity;
    for (const tg of targets) {
      if (!tg.alive) continue;
      toTarget.subVectors(tg.group.position, camera.position);
      const along = toTarget.dot(ray);
      const r = RADIUS * tg.k; // the orb as big as it looks right now (its word stays full size, but isn't the target)
      if (along > 0 && along < nearest && toTarget.lengthSq() - along * along <= r * r) { hit = tg; nearest = along; }
    }
    if (hit?.correct) {
      burst(hit.group.position, 0x34d399);
      retire(hit, 'correct');
      for (const tg of targets) if (tg.alive) retire(tg, 'clear');
      sounds.hit();
    } else if (hit) {
      retire(hit, 'wrong');
      sounds.wrong();
    }
    on.onShot(hit && { id: hit.id, correct: hit.correct, ms: clock - hit.born });
  }
  const onDown = (e) => { if (locked && e.button === 0) fire(); };

  // ---- loop ----
  let raf = 0;
  let last = performance.now();
  let swayX = 0;
  let swayY = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    if (locked) clock += Math.min(100, Math.max(0, now - last)); // a long stall (GC, tab switch) can't eat a disc
    last = now;
    camera.rotation.set(pitch, yaw, 0);
    updateTargets(now);
    updateParts(dt);
    // viewmodel: recoil kick, slide blowback, and a little lag against mouse movement
    kick = Math.max(0, kick - dt * 8);
    slideBack = Math.max(0, slideBack - dt * 14);
    swayX += (Math.max(-0.012, Math.min(0.012, -moveX * 0.00025)) - swayX) * Math.min(1, dt * 10);
    swayY += (Math.max(-0.01, Math.min(0.01, moveY * 0.00025)) - swayY) * Math.min(1, dt * 10);
    moveX = 0;
    moveY = 0;
    const k = kick * kick;
    gun.position.set(REST.x + swayX, REST.y + swayY + k * 0.008 + Math.sin(now / 900) * 0.0015, REST.z + k * 0.03);
    gun.rotation.set(REST.pitch + k * 0.16, REST.yaw, 0);
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
  canvas.addEventListener('mousedown', onDown);
  raf = requestAnimationFrame(frame);

  function destroy() {
    cancelAnimationFrame(raf);
    ro.disconnect();
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('pointerlockchange', onLockChange);
    canvas.removeEventListener('mousedown', onDown);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    const free = (o) => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.dispose(); }
    };
    scene.traverse(free);
    vmScene.traverse(free);
    unlight();
    dot.dispose();
    orbTex.dispose();
    wrongTex.dispose();
    renderer.dispose();
    sounds.close();
  }

  return {
    spawn,
    lock,
    unlock: () => { if (document.pointerLockElement === canvas) document.exitPointerLock(); },
    time: () => clock,
    destroy,
  };
}
