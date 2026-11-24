import { FONT, LANG_ATTR, SIDES, fixTo, hintFor, usable } from './range/logic.js';

// Vocabulary: the Word Range word lists studied as flip cards, one chapter at a time, in the pair of sides you pick
// (中文 → English, English → 中文, 日本語 → Tiếng Việt…). A list loads only when its level is opened.
export const VOCAB = [
  { id: 'hsk1', lang: 'zh', title: 'HSK 1', native: '汉语', emblem: '词', colors: ['#ef4444', '#f59e0b'], words: 300, pair: ['zh', 'en'], load: () => import('./data/range/hsk1.js') },
  { id: 'n5', lang: 'ja', title: 'JLPT N5', native: '日本語', emblem: '語', colors: ['#22d3ee', '#6366f1'], words: 668, pair: ['ja', 'en'], load: () => import('./data/range/n5.js') },
];

// A word is one card, learned once whichever pair it's studied in. Its id hashes the level's own sides (FNV-1a over
// 汉字|pinyin or 日本語|kana), so progress survives reordering the lists and editing the translations.
const OWN = { zh: ['zh', 'pinyin'], ja: ['ja', 'kana'] };
export const wordId = (level, word) => {
  let h = 0x811c9dc5;
  for (const ch of OWN[level.lang].map((k) => word[k]).join('|')) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193);
  return `${level.id}-${(h >>> 0).toString(36)}`;
};
export const learnedIn = (level, known) => [...known].filter((id) => id.startsWith(`${level.id}-`)).length;

// A level's remembered chapter and pair (saved = the whole moji.vocab object), checked: anything unknown falls back to
// the first chapter and the level's default pair, and a pair without the level's language gets a back side that has it.
export const vocabPrefs = (level, saved) => {
  const s = saved?.[level.id] ?? {};
  const side = (id, fallback) => (SIDES.some((x) => x.id === id) ? id : fallback);
  const from = side(s.from, level.pair[0]);
  return { chapter: Number.isInteger(s.chapter) && s.chapter >= 0 ? s.chapter : 0, from, to: fixTo(level.lang, from, side(s.to, level.pair[1])) };
};

// One chapter in one pair, shaped like a deck for App.jsx's Study and Browse. The back adds the `to` side and any
// reading (pinyin, kana) neither side already gives; words missing a side are left out.
export const vocabDeck = (level, chapters, ci, from, to) => ({
  ...level,
  id: `${level.id}.${ci}.${from}>${to}`,
  title: `${level.title} · ${chapters[ci].title}`,
  href: `#/v/${level.id}`,
  rich: true,
  glyphFont: FONT[from] ?? '',
  glyphAttr: LANG_ATTR[from] ?? 'en',
  answerFont: FONT[to] ?? '',
  answerAttr: LANG_ATTR[to] ?? 'en',
  cards: usable(chapters[ci].words, from, to).map((w) => ({
    id: wordId(level, w),
    glyph: w[from],
    answer: w[to],
    answerSub: [hintFor(w, from, to), hintFor(w, to, from)].filter(Boolean).join(' · ') || undefined,
  })),
});
