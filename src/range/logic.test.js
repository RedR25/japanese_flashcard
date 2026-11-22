// Run: node --test src/range/logic.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIDES, fixTo, pairAllowed, usable } from './logic.js';
import hsk1 from '../data/range/hsk1.js';
import n5 from '../data/range/n5.js';

test('a pair must include the level language', () => {
  assert.ok(pairAllowed('zh', 'zh', 'en'));
  assert.ok(pairAllowed('zh', 'en', 'pinyin'));
  assert.ok(pairAllowed('ja', 'zh', 'ja'), 'cross-language works for N5 too');
  assert.ok(!pairAllowed('zh', 'en', 'vi'), 'no Chinese side: nothing to practise');
  assert.ok(!pairAllowed('ja', 'zh', 'pinyin'));
  assert.ok(!pairAllowed('zh', 'zh', 'zh'));
});

test('fixTo keeps a working pair and repairs a broken one', () => {
  assert.equal(fixTo('zh', 'zh', 'ja'), 'ja');
  assert.equal(fixTo('ja', 'zh', 'pinyin'), 'ja', 'switching to N5 repairs 中文 → Pinyin');
  assert.equal(fixTo('zh', 'en', 'vi'), 'zh');
  for (const lang of ['zh', 'ja']) for (const s of SIDES) assert.ok(pairAllowed(lang, s.id, fixTo(lang, s.id, s.id)), `${lang} ${s.id}`);
});

test('usable drops missing sides and give-aways', () => {
  const words = [
    { zh: '吃', ja: '食べる', en: 'to eat' },
    { zh: '了', ja: null, en: '(completed action)' },
    { zh: '学生', ja: '学生', en: 'student' },
  ];
  assert.deepEqual(usable(words, 'zh', 'ja').map((w) => w.zh), ['吃']);
  assert.equal(usable(words, 'zh', 'en').length, 3);
});

test('data: chapters are playable and never repeat a label', () => {
  for (const [name, chapters, side] of [['hsk1', hsk1, 'zh'], ['n5', n5, 'ja']]) {
    if (name === 'hsk1') assert.equal(chapters.reduce((n, c) => n + c.words.length, 0), 300);
    for (const [i, c] of chapters.entries()) {
      assert.ok(c.words.every((w) => w[side]), `${name} ${i + 1}: every word has its ${side}`);
      for (const s of SIDES) {
        const texts = c.words.map((w) => w[s.id]).filter(Boolean);
        assert.equal(new Set(texts).size, texts.length, `${name} ${i + 1}: duplicate ${s.id}`);
      }
      assert.ok(usable(c.words, side, 'en').length >= 15, `${name} ${i + 1}: enough words for the default pair`);
    }
  }
});
