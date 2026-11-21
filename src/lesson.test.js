// Run: node --test src/lesson.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS, getDeck } from './decks.js';
import { browseLesson, studyLesson } from './lesson.js';

const hira = getDeck('hiragana');
const rad = getDeck('radicals');
const a = hira.cards[0]; // あ = a

test('study: tells the helper whether the back is hidden; the chip label never shows the hidden side', () => {
  const hidden = studyLesson(hira, a, { reverse: false, flipped: false });
  assert.equal(hidden.label, 'あ · Hiragana');
  assert.match(hidden.text, /Card front: あ\nCard back \(hidden, not flipped yet\): a$/);
  assert.match(studyLesson(hira, a, { reverse: false, flipped: true }).text, /Card back \(flipped, visible\): a$/);
  const rev = studyLesson(hira, a, { reverse: true, flipped: false });
  assert.equal(rev.label, 'a · Hiragana', 'reversed: the chip shows the reading, not the character to recall');
  assert.match(rev.text, /Card front: a\nCard back \(hidden, not flipped yet\): あ$/);
  assert.match(studyLesson(rad, rad.cards[0], { reverse: false, flipped: true }).text,
    /Card front: 人 \(also written 亻\)\nCard back \(flipped, visible\): Nhân \(rén · person · người\)\nExample characters on the back: 他 你 休 体$/);
});

test('browse: ticks learned cards, and every deck fits the server limit', () => {
  assert.match(browseLesson(hira, new Set(['h0'])).text, /1 marked learned \(✓\):\nあ a ✓, い i, う u,/);
  for (const d of DECKS) {
    const all = browseLesson(d, new Set(d.cards.map((c) => c.id))).text;
    assert.ok(all.length <= 4000, `${d.id}: ${all.length} chars`); // server/index.js validScreen caps it at 4000
  }
});
