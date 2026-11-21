// Run: node --test src/lesson.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS, getDeck } from './decks.js';
import { browseLesson, studyLesson } from './lesson.js';

const hira = getDeck('hiragana');
const rad = getDeck('radicals');
const ji = hira.cards.find((c) => c.glyph === 'じ');
const pa = hira.cards.find((c) => c.glyph === 'ぱ');
const person = rad.cards[0]; // 人

test('study: an unflipped card never carries its answer, only hint material', () => {
  const hidden = studyLesson(hira, ji, { reverse: false, flipped: false });
  assert.equal(hidden.label, 'じ · Hiragana');
  assert.match(hidden.text, /Card front: じ\nCard back: hidden/);
  assert.doesNotMatch(hidden.text, /\bji\b/, 'the reading to recall is left out');
  assert.match(hidden.text, /Hint material: it's し \(shi\) plus the dakuten ゛ mark\.$/);
  assert.match(studyLesson(hira, pa, { reverse: false, flipped: false }).text, /it's は \(ha\) plus the handakuten ゜ mark\.$/);

  const rev = studyLesson(hira, ji, { reverse: true, flipped: false });
  assert.equal(rev.label, 'ji · Hiragana', 'reversed: the chip shows the reading, not the character to recall');
  assert.ok(!rev.text.includes('じ'), 'reversed: the character to recall is left out');

  const radical = studyLesson(rad, person, { reverse: false, flipped: false }).text;
  assert.doesNotMatch(radical, /Nhân|rén|person|người/, 'radical name, pinyin and meaning left out');
  assert.match(radical, /Hint material: characters that contain it: 他 你 休 体$/);
  assert.doesNotMatch(studyLesson(hira, hira.cards[0], { reverse: false, flipped: false }).text, /Hint material/, 'plain kana: nothing to add');
});

test('study: a flipped card shows its back', () => {
  assert.match(studyLesson(hira, ji, { reverse: false, flipped: true }).text, /Card front: じ\nCard back \(flipped, visible\): ji$/);
  assert.match(studyLesson(rad, person, { reverse: false, flipped: true }).text,
    /Card front: 人 \(also written 亻\)\nCard back \(flipped, visible\): Nhân \(rén · person · người\)\nExample characters on the back: 他 你 休 体$/);
});

test('browse: ticks learned cards, and every deck fits the server limit', () => {
  assert.match(browseLesson(hira, new Set(['h0'])).text, /1 marked learned \(✓\):\nあ a ✓, い i, う u,/);
  for (const d of DECKS) {
    const all = browseLesson(d, new Set(d.cards.map((c) => c.id))).text;
    assert.ok(all.length <= 4000, `${d.id}: ${all.length} chars`); // server/index.js validScreen caps it at 4000
  }
});
