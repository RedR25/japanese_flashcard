import { RADICALS } from './data/radicals.js';

// To add a deck: push { id, lang, title, native, blurb, cards: [{ id, glyph, answer, glyphAlt?, answerSub?, examples? }] }
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
  { id: 'hiragana', lang: 'ja', title: 'Hiragana', native: 'ひらがな', blurb: 'The core phonetic script', cards: hiragana },
  { id: 'katakana', lang: 'ja', title: 'Katakana', native: 'カタカナ', blurb: 'Script for loanwords', cards: katakana },
  { id: 'kana-mixed', lang: 'ja', title: 'Kana mix', native: 'かな', blurb: 'Hiragana and katakana together', cards: [...hiragana, ...katakana] },
  { id: 'radicals', lang: 'zh', title: '50 Radicals', native: '部首', blurb: 'Bộ thủ — the building blocks of hanzi', cards: RADICALS },
];

export const getDeck = (id) => DECKS.find((d) => d.id === id);
