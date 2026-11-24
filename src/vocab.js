import { FONT, LANG_ATTR, SIDES, fixTo, hintFor, usable } from './range/logic.js';

// Vocabulary, split by language: each language's word lists (the Word Range lists) studied as flip cards, one chapter
// at a time, in the pair of sides you pick (中文 → English, English → 中文, 日本語 → Tiếng Việt…). A language's lists load
// only when it's opened. More levels (HSK 2, N4…) go in its levels.
export const VOCAB = [
  {
    id: 'ja', lang: 'ja', title: 'Japanese', native: '日本語', emblem: '語', colors: ['#22d3ee', '#6366f1'], pair: ['ja', 'en'],
    levels: [{ id: 'n5', lang: 'ja', title: 'JLPT N5', words: 668, load: () => import('./data/range/n5.js') }],
  },
  {
    id: 'zh', lang: 'zh', title: 'Chinese', native: '中文', emblem: '词', colors: ['#ef4444', '#f59e0b'], pair: ['zh', 'en'],
    levels: [{ id: 'hsk1', lang: 'zh', title: 'HSK 1', words: 300, load: () => import('./data/range/hsk1.js') }],
  },
];

// A word is one card, learned once whichever pair it's studied in. Its id is its level plus a hash of the language's
// own sides (FNV-1a over 汉字|pinyin or 日本語|kana), so progress survives reordering the lists and editing translations.
const OWN = { zh: ['zh', 'pinyin'], ja: ['ja', 'kana'] };
export const wordId = (level, word) => {
  let h = 0x811c9dc5;
  for (const ch of OWN[level.lang].map((k) => word[k]).join('|')) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193);
  return `${level.id}-${(h >>> 0).toString(36)}`;
};

// Sidebar progress: words learned across a language's levels, out of all of them.
export const learnedIn = (vocab, known) => [...known].filter((id) => vocab.levels.some((v) => id.startsWith(`${v.id}-`))).length;
export const wordsIn = (vocab) => vocab.levels.reduce((n, v) => n + v.words, 0);

// A language's remembered level, chapter and pair (saved = the whole moji.vocab object), checked: anything unknown falls
// back to the first level's first chapter and the default pair, and a pair without the language gets a back side that
// has it.
export const vocabPrefs = (vocab, saved) => {
  const s = saved?.[vocab.id] ?? {};
  const side = (id, fallback) => (SIDES.some((x) => x.id === id) ? id : fallback);
  const from = side(s.from, vocab.pair[0]);
  return {
    level: vocab.levels.some((v) => v.id === s.level) ? s.level : vocab.levels[0].id,
    chapter: Number.isInteger(s.chapter) && s.chapter >= 0 ? s.chapter : 0,
    from,
    to: fixTo(vocab.lang, from, side(s.to, vocab.pair[1])),
  };
};

// One chapter in one pair, shaped like a deck for App.jsx's Study and Browse: headed by the language, titled by its level
// and chapter. The back adds the `to` side and any reading (pinyin, kana) neither side already gives; words missing a
// side are left out.
export const vocabDeck = (vocab, level, chapters, ci, from, to) => ({
  ...vocab,
  id: `${level.id}.${ci}.${from}>${to}`,
  heading: vocab.title,
  title: `${level.title} · ${chapters[ci].title}`,
  href: `#/v/${vocab.id}`,
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
