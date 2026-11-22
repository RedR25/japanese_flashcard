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

// One prompt per usable word, each with its pair (in a mix, a random pair that word works for).
export const buildQueue = (words, pairs, rand = Math.random) => shuffle(words.flatMap((word) => {
  const ok = pairs.filter(([from, to]) => usable([word], from, to).length);
  if (!ok.length) return [];
  const [from, to] = ok[Math.floor(rand() * ok.length)];
  return [{ word, from, to }];
}), rand);

// A missed word comes back 3-5 prompts later, like in Study.
export const requeue = (queue, item, rand = Math.random) => {
  const at = Math.min(queue.length, 3 + Math.floor(rand() * 3));
  return [...queue.slice(0, at), item, ...queue.slice(at)];
};

// The answer plus up to n-1 other chapter words. Every option shows a different label, and none shares the prompt.
export const pickOptions = ({ word, from, to }, words, n, rand = Math.random) => {
  const seen = new Set([word[to]]);
  const others = shuffle(words, rand).filter((w) => w !== word && w[to] && w[from] !== word[from] && !seen.has(w[to]) && seen.add(w[to]));
  return shuffle([word, ...others.slice(0, n - 1)], rand);
};

// Best score per setup (level, chapter, pair or mix), kept in this browser.
const BEST_KEY = 'moji.range.best';
export const loadBests = () => { try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch { return {}; } };
export const saveBest = (key, result) => {
  const all = loadBests();
  const prev = all[key];
  if (!prev || result.score > prev.score) {
    all[key] = result;
    try { localStorage.setItem(BEST_KEY, JSON.stringify(all)); } catch { /* storage blocked: no best this time */ }
  }
  return prev;
};

// 100 for the right word plus up to 100 for speed (gone after 3 s); a flat 50 once a wrong one was hit.
export const hitPoints = (ms, hadWrong) => (hadWrong ? 50 : 100 + Math.round(100 * Math.max(0, 1 - ms / 3000)));
export const WRONG_POINTS = 50;

// ---- Aim, matched to CS2 ----

// CS2 turns 0.022° per mouse count × sensitivity (m_yaw and m_pitch), reading raw mouse input.
export const YAW = 0.022;
export const cmPer360 = (sens, dpi) => (360 / (YAW * sens) / dpi) * 2.54;
// CS2's view is 90° wide at 4:3, i.e. 73.74° tall on every screen (wider screens see more to the sides).
const deg = (rad) => (rad * 180) / Math.PI;
export const CS2_VFOV = 2 * deg(Math.atan(Math.tan(Math.PI / 4) * 0.75));
// The gun uses CS2's default viewmodel FOV, 68 (also 4:3-wide), so 53.7° tall.
export const VM_VFOV = 2 * deg(Math.atan(Math.tan((68 * Math.PI) / 360) * 0.75));

// Where targets float: yaw ±40°, pitch -8° to 18° (clear of the prompt at the top), never closer than sep°.
export const placeTargets = (n, radiusDeg, gapDeg, rand = Math.random) => {
  const sep = 2 * radiusDeg + gapDeg;
  const spots = [];
  for (let tries = 0; spots.length < n && tries < 600; tries++) {
    const spot = { yaw: (rand() * 2 - 1) * 40, pitch: -8 + rand() * 26 };
    if (spots.every((s) => Math.hypot(s.yaw - spot.yaw, s.pitch - spot.pitch) >= sep)) spots.push(spot);
  }
  return spots;
};
