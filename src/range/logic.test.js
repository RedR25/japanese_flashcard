// Run: node --test src/range/logic.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CS2_VFOV, SIDES, VM_VFOV, buildQueue, cmPer360, fixTo, hintFor, hitPoints, pairAllowed, pickOptions, placeTargets, requeue, usable,
} from './logic.js';

const seeded = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
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

test('hints never give the answer away', () => {
  const chi = { zh: '吃', pinyin: 'chī', ja: '食べる', kana: 'たべる', en: 'to eat' };
  assert.equal(hintFor(chi, 'zh', 'en'), 'chī');
  assert.equal(hintFor(chi, 'zh', 'pinyin'), null, '中文 → Pinyin: the pinyin is the answer');
  assert.equal(hintFor(chi, 'ja', 'zh'), 'たべる');
  assert.equal(hintFor({ ja: 'これ', kana: 'これ' }, 'ja', 'en'), null, 'kana-only word: nothing to add');
  assert.equal(hintFor(chi, 'en', 'zh'), null);
});

test('a run asks every usable word once, with a pair it works for', () => {
  const words = hsk1[0].words;
  assert.equal(buildQueue(words, [['zh', 'ja']], seeded(1)).length, usable(words, 'zh', 'ja').length);
  const mix = buildQueue(words, [['zh', 'ja'], ['en', 'zh']], seeded(2));
  assert.equal(new Set(mix.map((q) => q.word)).size, mix.length);
  assert.ok(mix.every((q) => usable([q.word], q.from, q.to).length));
  for (let s = 1; s < 20; s++) {
    const at = requeue(['a', 'b', 'c', 'd', 'e', 'f'], 'x', seeded(s)).indexOf('x');
    assert.ok(at >= 3 && at <= 5, `missed word comes back 3-5 later, got ${at}`);
  }
  assert.deepEqual(requeue(['a'], 'x', seeded(3)), ['a', 'x']);
});

test('options: the answer plus different labels that never repeat the prompt', () => {
  for (const [chapters, pair] of [[hsk1, ['zh', 'en']], [n5, ['en', 'ja']], [n5, ['zh', 'kana']]]) {
    for (const c of chapters) {
      for (const item of buildQueue(c.words, [pair], seeded(5))) {
        const opts = pickOptions(item, c.words, 4, seeded(9));
        assert.ok(opts.includes(item.word));
        assert.equal(opts.length, 4);
        assert.equal(new Set(opts.map((w) => w[item.to])).size, 4, 'labels differ');
        assert.ok(opts.every((w) => w === item.word || w[item.from] !== item.word[item.from]));
      }
    }
  }
});

test('scoring and CS2 aim maths', () => {
  assert.equal(hitPoints(0, false), 200);
  assert.equal(hitPoints(1500, false), 150);
  assert.equal(hitPoints(5000, false), 100);
  assert.equal(hitPoints(200, true), 50);
  assert.ok(Math.abs(cmPer360(1.25, 800) - 41.56) < 0.01, 'sens 1.25 at 800 DPI is 41.56 cm/360');
  assert.ok(Math.abs(CS2_VFOV - 73.74) < 0.01, 'CS2: 90° wide at 4:3');
  assert.ok(Math.abs(VM_VFOV - 53.67) < 0.05, 'viewmodel FOV 68');
});

test('targets spread out and never overlap', () => {
  for (const [radius, gap] of [[4.09, 3], [4.09, 6], [5.3, 6]]) {
    for (let s = 1; s < 40; s++) {
      const spots = placeTargets(6, radius, gap, seeded(s));
      assert.ok(spots.length >= 5, `radius ${radius} gap ${gap} seed ${s}: only ${spots.length} spots`);
      for (const a of spots) {
        assert.ok(Math.abs(a.yaw) <= 40 && a.pitch >= -8 && a.pitch <= 18);
        for (const b of spots) if (a !== b) assert.ok(Math.hypot(a.yaw - b.yaw, a.pitch - b.pitch) >= 2 * radius + gap);
      }
    }
  }
});
