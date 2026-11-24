// Run: node --test src/vocab.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VOCAB, learnedIn, vocabDeck, vocabPrefs, wordId, wordsIn } from './vocab.js';

const CARD_ID = /^[a-z][a-z0-9-]{0,31}$/; // what server/index.js accepts in PUT /api/progress
const [ja, zh] = VOCAB;
const [n5] = ja.levels;
const [hsk] = zh.levels;
const levels = VOCAB.flatMap((v) => v.levels);
const lists = Object.fromEntries(await Promise.all(levels.map(async (l) => [l.id, (await l.load()).default])));

test('split by language: Japanese then Chinese, each with its levels in its own language', () => {
  assert.deepEqual(VOCAB.map((v) => [v.id, v.title, v.levels.map((l) => l.title)]), [['ja', 'Japanese', ['JLPT N5']], ['zh', 'Chinese', ['HSK 1']]]);
  assert.ok(VOCAB.every((v) => v.lang === v.id && v.levels.every((l) => l.lang === v.lang)));
});

test('every word gets its own server-valid id, and the sidebar totals match the lists', () => {
  for (const level of levels) {
    const words = lists[level.id].flatMap((c) => c.words);
    const ids = words.map((w) => wordId(level, w));
    assert.ok(ids.every((id) => CARD_ID.test(id) && id.startsWith(`${level.id}-`)), level.id);
    assert.equal(new Set(ids).size, words.length, `${level.id}: no two words share an id`);
    assert.equal(level.words, words.length, `${level.id}: words is the list's size`);
  }
  assert.deepEqual(VOCAB.map(wordsIn), [668, 300]);
  const hello = lists.hsk1[0].words[0];
  assert.equal(wordId(hsk, hello), 'hsk1-kgyqav', 'ids already saved to accounts stay the same');
  assert.equal(wordId(hsk, { ...hello, en: 'hi', vi: 'chào' }), wordId(hsk, hello), 'editing a translation keeps the progress');
});

test('a chapter in a pair: front, back, and the readings neither side shows', () => {
  const first = (from, to) => vocabDeck(zh, hsk, lists.hsk1, 0, from, to).cards[0];
  assert.deepEqual(first('zh', 'en'), { id: wordId(hsk, lists.hsk1[0].words[0]), glyph: '你好', answer: 'hello', answerSub: 'nǐ hǎo' });
  assert.equal(first('en', 'zh').answerSub, 'nǐ hǎo', 'the hanzi on the back gets its pinyin');
  assert.equal(first('zh', 'pinyin').answerSub, undefined, 'pinyin is the answer, not a hint');
  assert.equal(first('pinyin', 'zh').answerSub, undefined);

  const deck = vocabDeck(zh, hsk, lists.hsk1, 2, 'en', 'zh');
  assert.equal(deck.id, 'hsk1.2.en>zh');
  assert.equal(deck.heading, 'Chinese');
  assert.equal(deck.title, `HSK 1 · ${lists.hsk1[2].title}`);
  assert.deepEqual([deck.href, deck.lang, deck.emblem, deck.glyphFont, deck.glyphAttr, deck.answerFont, deck.answerAttr],
    ['#/v/zh', 'zh', '词', '', 'en', 'font-zh', 'zh-Hans']);

  const little = lists.hsk1.findIndex((c) => c.words.some((w) => !w.ja)); // 吧 了 呢 have no Japanese
  const cards = vocabDeck(zh, hsk, lists.hsk1, little, 'zh', 'ja').cards;
  assert.equal(cards.length, lists.hsk1[little].words.filter((w) => w.ja).length);
  assert.ok(cards.length < lists.hsk1[little].words.length && cards.every((c) => c.answer));

  const ci = lists.n5.findIndex((c) => c.words.some((w) => w.ja !== w.kana)); // the first chapter with kanji
  const word = lists.n5[ci].words.find((w) => w.ja !== w.kana);
  const card = vocabDeck(ja, n5, lists.n5, ci, 'ja', 'en').cards.find((c) => c.glyph === word.ja);
  assert.equal(card.answerSub, word.kana, 'kanji get their kana on the back');
  assert.equal(vocabDeck(ja, n5, lists.n5, 0, 'ja', 'en').cards[0].answerSub, undefined, 'はい: the kana would just repeat it');
});

test('remembered level, chapter and pair are checked before use', () => {
  assert.deepEqual(vocabPrefs(zh, null), { level: 'hsk1', chapter: 0, from: 'zh', to: 'en' });
  assert.deepEqual(vocabPrefs(ja, {}), { level: 'n5', chapter: 0, from: 'ja', to: 'en' });
  assert.deepEqual(vocabPrefs(zh, { zh: { level: 'hsk1', chapter: 4, from: 'vi', to: 'pinyin' } }), { level: 'hsk1', chapter: 4, from: 'vi', to: 'pinyin' });
  assert.deepEqual(vocabPrefs(zh, { zh: { level: 'n5', chapter: -1, from: 'xx', to: 7 } }), { level: 'hsk1', chapter: 0, from: 'zh', to: 'en' });
  assert.deepEqual(vocabPrefs(zh, { zh: { chapter: 1.5, from: 'en', to: 'vi' } }), { level: 'hsk1', chapter: 0, from: 'en', to: 'zh' }, 'English → Vietnamese has no Chinese');
  assert.deepEqual(vocabPrefs(ja, { zh: { from: 'en' }, ja: 'junk', hsk1: { chapter: 3 } }), { level: 'n5', chapter: 0, from: 'ja', to: 'en' });
});

test("a language's learned count only counts its own levels' words", () => {
  const known = new Set(['h0', 'r1', 'hsk1-abc', 'n5-abc', 'hsk1-def']);
  assert.equal(learnedIn(zh, known), 2);
  assert.equal(learnedIn(ja, known), 1);
  assert.equal(learnedIn(ja, new Set(['h0', 'hsk1-abc'])), 0);
});
