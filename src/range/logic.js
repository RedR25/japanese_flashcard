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
