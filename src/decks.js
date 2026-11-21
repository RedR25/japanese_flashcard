import { RADICALS, RADICALS_PINYIN } from './data/radicals.js';

// To add a deck: push { id, lang, title, native, emblem, colors: [from, to], blurb, cards: [{ id, glyph, answer, glyphAlt?, answerSub?, meanings?, examples? }], pinyinCards? }
const ROMAJI = 'a i u e o ka ki ku ke ko ga gi gu ge go sa shi su se so za ji zu ze zo ta chi tsu te to da di du de do na ni nu ne no ha hi fu he ho ba bi bu be bo pa pi pu pe po ma mi mu me mo ya yu yo ra ri ru re ro wa wo n'.split(' ');
const HIRA = [...'あいうえおかきくけこがぎぐげごさしすせそざじずぜぞたちつてとだぢづでどなにぬねのはひふへほばびぶべぼぱぴぷぺぽまみむめもやゆよらりるれろわをん'];
const KATA = [...'アイウエオカキクケコガギグゲゴサシスセソザジズゼゾタチツテトダヂヅデドナニヌネノハヒフヘホバビブベボパピプペポマミムメモヤユヨラリルレロワヲン'];

const kana = (chars, prefix) => chars.map((glyph, i) => ({ id: `${prefix}${i}`, glyph, answer: ROMAJI[i] }));
const hiragana = kana(HIRA, 'h');
const katakana = kana(KATA, 'k');

export const LANGS = [
  { id: 'ja', label: 'Japanese', native: '日本語', font: 'font-ja' },
  { id: 'zh', label: 'Chinese', native: '中文', font: 'font-zh' },
];

export const DECKS = [
  { id: 'hiragana', lang: 'ja', title: 'Hiragana', native: 'ひらがな', emblem: 'あ', colors: ['#ff5f8f', '#ff9a6b'], blurb: 'The core phonetic script', cards: hiragana },
  { id: 'katakana', lang: 'ja', title: 'Katakana', native: 'カタカナ', emblem: 'ア', colors: ['#5b7cff', '#a77bff'], blurb: 'Script for loanwords', cards: katakana },
  { id: 'kana-mixed', lang: 'ja', title: 'Kana mix', native: 'かな', emblem: 'かナ', colors: ['#2bd4a4', '#9be15d'], blurb: 'Hiragana and katakana together', cards: [...hiragana, ...katakana] },
  { id: 'radicals', lang: 'zh', title: '50 Radicals', native: '部首', emblem: '人', colors: ['#ffb547', '#ff6a3d'], blurb: 'Bộ thủ — the building blocks of hanzi', cards: RADICALS, pinyinCards: RADICALS_PINYIN },
];

// Decks with pinyinCards can be answered by Hán Việt name (default) or pinyin. Pass a deck from DECKS; the variants are
// built once here so their identity is stable (React effects depend on it).
export const READINGS = [['hv', 'Hán Việt'], ['pinyin', 'Pinyin']];
const BY_PINYIN = new Map(DECKS.filter((d) => d.pinyinCards).map((d) => [d.id, { ...d, cards: d.pinyinCards }]));
export const withReading = (deck, reading) => (reading === 'pinyin' && BY_PINYIN.get(deck?.id)) || deck;

export const getDeck = (id) => DECKS.find((d) => d.id === id);
export const fontOf = (deck) => LANGS.find((l) => l.id === deck.lang).font;
export const langAttr = (deck) => (deck.lang === 'zh' ? 'zh-Hans' : deck.lang);
export const gradient = (deck) => `linear-gradient(160deg, ${deck.colors[0]}, ${deck.colors[1]})`;
