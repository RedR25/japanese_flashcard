// Run: node --test src/range/logic.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CS2_VFOV, GAP, LIFE_MS, SIDES, VM_VFOV, buildQueue, cmPer360, fixTo, hintFor, hitPoints, nextPrompt, pairAllowed, pairName, pickOptions,
  placeTargets, usable,
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

test('a round asks every usable word once, with a pair it works for', () => {
  const words = hsk1[0].words;
  assert.equal(buildQueue(words, [['zh', 'ja']], seeded(1)).length, usable(words, 'zh', 'ja').length);
  const mix = buildQueue(words, [['zh', 'ja'], ['en', 'zh']], seeded(2));
  assert.equal(new Set(mix.map((q) => q.word)).size, mix.length);
  assert.ok(mix.every((q) => usable([q.word], q.from, q.to).length));
});

// Deals n prompts the way Game.jsx does, putting a missed word back at the front of the queue.
const deal = (words, n, missRate, rand) => {
  let queue = [];
  const recent = [];
  for (let k = 0; k < n; k++) {
    const r = nextPrompt(queue, recent, () => buildQueue(words, [['zh', 'en']], rand));
    queue = r.queue;
    recent.push(r.item.word);
    if (rand() < missRate) queue = [r.item, ...queue];
  }
  return recent;
};

test('a minute never shows a word again until GAP others have passed', () => {
  for (const [words, missRate] of [[hsk1[0].words, 0], [hsk1[0].words, 0.3], [hsk1[3].words.slice(0, GAP + 1), 0.5]]) {
    for (let s = 1; s < 30; s++) {
      const seq = deal(words, 200, missRate, seeded(s));
      seq.forEach((w, i) => assert.ok(!seq.slice(Math.max(0, i - GAP), i).includes(w), `seed ${s}: ${w.zh} back after fewer than ${GAP}`));
    }
  }
  const words = hsk1[0].words;
  assert.equal(new Set(deal(words, words.length, 0, seeded(4))).size, words.length, 'every word shows before any repeats');
});

test('a missed word comes back right after GAP others', () => {
  const words = hsk1[0].words;
  const recent = [];
  let queue = [];
  const take = () => { const r = nextPrompt(queue, recent, () => buildQueue(words, [['zh', 'en']], seeded(7))); queue = r.queue; recent.push(r.item.word); return r.item; };
  const missed = take();
  queue = [missed, ...queue];
  for (let k = 0; k < GAP; k++) assert.notEqual(take().word, missed.word);
  assert.equal(take().word, missed.word);
  assert.deepEqual(nextPrompt([], words.slice(0, 2), () => []), { item: null, queue: [] }, 'nothing left to deal');
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
  assert.equal(hitPoints(0, false), 100, 'instant hit: the whole disc');
  assert.equal(hitPoints(LIFE_MS / 2, false), 50, 'half the area left');
  assert.ok(hitPoints(1000, false) > hitPoints(2000, false), 'faster scores more');
  assert.equal(hitPoints(LIFE_MS - 1, false), 1, 'a last-moment hit still counts');
  assert.equal(hitPoints(200, true), 0, 'nothing after a wrong shot');
  assert.equal(pairName('zh>en'), '中文 → English');
  assert.equal(pairName('mix'), 'Mix');
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
