// Word Range rules shared by the lobby and the game (no React, so plain Node can test them).

// A side is one way of showing a word. Pinyin and Kana are the readings of 中文 and 日本語.
export const SIDES = [
  { id: 'zh', label: '中文', lang: 'zh' },
  { id: 'pinyin', label: 'Pinyin', lang: 'zh' },
  { id: 'ja', label: '日本語', lang: 'ja' },
  { id: 'kana', label: 'Kana', lang: 'ja' },
  { id: 'en', label: 'English' },
  { id: 'vi', label: 'Tiếng Việt' },
];
const LANG = Object.fromEntries(SIDES.map((s) => [s.id, s.lang]));
const LABEL = Object.fromEntries(SIDES.map((s) => [s.id, s.label]));
export const pairName = (p) => (p === 'mix' ? 'Mix' : p.split('>').map((id) => LABEL[id] ?? id).join(' → '));

// A pair has to practise the level's language: HSK needs 中文 or Pinyin on one side, N5 needs 日本語 or Kana.
export const pairAllowed = (lang, from, to) => from !== to && (LANG[from] === lang || LANG[to] === lang);

// Keep the shoot side if the pair still works (after a level or show change), else take the first side that does.
export const fixTo = (lang, from, to) => (pairAllowed(lang, from, to) ? to : SIDES.find((s) => pairAllowed(lang, from, s.id)).id);

// Words that work for a pair: both sides exist and the prompt doesn't already show the answer (学生 → 学生).
export const usable = (words, from, to) => words.filter((w) => w[from] && w[to] && w[from] !== w[to]);

// ---- A run ----

// The reading shown under 中文/日本語, unless it just repeats the text (kana-only words) or is the answer itself.
export const HINT = { zh: 'pinyin', ja: 'kana' };
export const hintFor = (word, side, other) => {
  const h = HINT[side];
  return h && h !== other && word[h] && word[h] !== word[side] ? word[h] : null;
};

const shuffle = (a, rand) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
};

// One round: a prompt per usable word, each with its pair (in a mix, a random pair that word works for).
export const buildQueue = (words, pairs, rand = Math.random) => shuffle(words.flatMap((word) => {
  const ok = pairs.filter(([from, to]) => usable([word], from, to).length);
  if (!ok.length) return [];
  const [from, to] = ok[Math.floor(rand() * ok.length)];
  return [{ word, from, to }];
}), rand);

// A run lasts a minute and deals rounds back to back. A word comes back only after GAP other prompts.
export const RUN_MS = 60_000;
export const GAP = 3;
// The first queued prompt whose word wasn't one of the last GAP prompts; when none can go, a fresh round joins the
// queue. A missed word is put back at the front, so it returns as soon as GAP others have passed.
export const nextPrompt = (queue, recent, round) => {
  const blocked = new Set(recent.slice(-GAP));
  let q = queue;
  let i = q.findIndex((p) => !blocked.has(p.word));
  if (i < 0) { q = [...q, ...round()]; i = q.findIndex((p) => !blocked.has(p.word)); }
  return { item: q[i] ?? null, queue: i < 0 ? q : [...q.slice(0, i), ...q.slice(i + 1)] };
};

// The answer plus up to n-1 other chapter words. Every option shows a different label, and none shares the prompt.
export const pickOptions = ({ word, from, to }, words, n, rand = Math.random) => {
  const seen = new Set([word[to]]);
  const others = shuffle(words, rand).filter((w) => w !== word && w[to] && w[from] !== word[from] && !seen.has(w[to]) && seen.add(w[to]));
  return shuffle([word, ...others.slice(0, n - 1)], rand);
};

// Discs shrink away over LIFE_MS (their area falls linearly), and a clean hit scores the share that's left: up to 100
// on drifting discs, STILL of that on still ones. After a wrong shot the word scores nothing; a wrong shot or a disc
// left to vanish costs PENALTY either way.
export const LIFE_MS = 8000; // 5 s went by too fast to read the words
export const PENALTY = 50;
export const STILL = 0.85;
export const hitPoints = (ms, missed, still = false) => (missed ? 0 : Math.max(1, Math.round(100 * (1 - ms / LIFE_MS) * (still ? STILL : 1))));

// ---- Aim, matched to CS2 ----

// CS2 turns 0.022° per mouse count × sensitivity (m_yaw and m_pitch), reading raw mouse input.
export const YAW = 0.022;
export const cmPer360 = (sens, dpi) => (360 / (YAW * sens) / dpi) * 2.54;
// CS2's view is 90° wide at 4:3, i.e. 73.74° tall on every screen (wider screens see more to the sides).
const deg = (rad) => (rad * 180) / Math.PI;
export const CS2_VFOV = 2 * deg(Math.atan(Math.tan(Math.PI / 4) * 0.75));
// The gun uses CS2's default viewmodel FOV, 68 (also 4:3-wide), so 53.7° tall.
export const VM_VFOV = 2 * deg(Math.atan(Math.tan((68 * Math.PI) / 360) * 0.75));

// Where targets float: yaw ±40°, pitch 0° to 20°, never closer than sep°. Discs sit 13-15 m out from a 1.6 m eye, so
// below about -2.5° part of one sinks into the floor; at 0° its bottom stays ~0.3 m up even while drifting, and 20°
// keeps its top edge clear of the prompt at the top.
export const placeTargets = (n, radiusDeg, gapDeg, rand = Math.random) => {
  const sep = 2 * radiusDeg + gapDeg;
  const spots = [];
  for (let tries = 0; spots.length < n && tries < 600; tries++) {
    const spot = { yaw: (rand() * 2 - 1) * 40, pitch: rand() * 20 };
    if (spots.every((s) => Math.hypot(s.yaw - spot.yaw, s.pitch - spot.pitch) >= sep)) spots.push(spot);
  }
  return spots;
};

// The disc colour picked in the lobby (#rrggbb; anything else is seal red) as the orb's shading: a light centre (45%
// white) to a darker edge (15% black). The engine paints it, the lobby's preview disc shows it.
export const discShades = (color) => {
  const hex = /^#[0-9a-f]{6}$/i.test(color) ? color : '#ff5f78';
  const mix = (to, f) => `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - f) + to * f).toString(16).padStart(2, '0')).join('')}`;
  return [mix(255, 0.45), mix(0, 0.15)];
};

// ---- Leaderboards: the server keeps each member's best per chapter; board = 'level.chapter', e.g. 'hsk1.0' ----

const call = async (path, body) => {
  const res = await fetch(`/api${path}`, body && { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};
// { chapter: top 10 (+ your row), total: same for all chapters added up, mine: { board: your best } }; a post adds prev
export const getBoards = (board) => call(`/range?board=${encodeURIComponent(board)}`);
export const postScore = (board, score, mode) => call('/range', { board, score, mode });
