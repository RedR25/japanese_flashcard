// Run: node --test src/asteroids-logic.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDeck, withReading } from './decks.js';
import { acceptFor, norm, pickTarget } from './asteroids-logic.js';

const card = (deck, glyph) => deck.cards.find((c) => c.glyph === glyph);
const hira = getDeck('hiragana');
const mix = getDeck('kana-mixed');
const rad = getDeck('radicals');
const radPy = withReading(rad, 'pinyin');

test('pinyin radicals are the same cards answered by pinyin', () => {
  assert.deepEqual(radPy.cards.map((c) => c.id), rad.cards.map((c) => c.id), 'same ids, so progress is shared');
  assert.equal(card(radPy, '人').answer, 'rén');
  assert.equal(withReading(rad, 'pinyin'), radPy, 'stable identity');
  assert.equal(withReading(hira, 'pinyin'), hira, 'kana decks are unaffected');
});

test('forward accepts the chosen reading, common alternates and meanings', () => {
  assert.ok(acceptFor(card(hira, 'し'), hira, 'forward').includes('si'));
  assert.ok(acceptFor(card(hira, 'を'), hira, 'forward').includes('o'));
  const hv = acceptFor(card(rad, '人'), rad, 'forward');
  for (const typed of ['Nhân', 'nhan', 'person', 'người']) assert.ok(hv.includes(norm(typed)), typed);
  assert.ok(!hv.includes('ren'), 'Hán Việt chosen: pinyin is not the answer');
  const py = acceptFor(card(radPy, '人'), radPy, 'forward');
  for (const typed of ['rén', 'ren', 'person']) assert.ok(py.includes(norm(typed)), typed);
  assert.ok(!py.includes('nhan'), 'pinyin chosen: Hán Việt is not the answer');
  assert.ok(acceptFor(card(rad, '巾'), rad, 'forward').includes('towel'), 'each meaning on its own');
  const city = rad.cards.find((c) => c.answerSub.includes('city (right side)'));
  assert.ok(acceptFor(city, rad, 'forward').includes('city'), 'notes in brackets are dropped');
});

test('reverse accepts every character with that reading', () => {
  assert.deepEqual(acceptFor(card(mix, 'あ'), mix, 'reverse').sort(), ['あ', 'ア'].sort());
  assert.ok(acceptFor(card(rad, '人'), rad, 'reverse').includes('亻'));
  assert.notEqual(norm('が'), norm('か'), 'dakuten must not be stripped');
});

test('targeting waits on ambiguous prefixes and shoots the lowest', () => {
  const rock = (a, y) => ({ accept: [a], y });
  const n = rock('n', 0.5), na = rock('na', 0.2);
  assert.equal(pickTarget([n, na], 'n', false), null, 'n could still become na');
  assert.equal(pickTarget([n, na], 'n', true), n, 'Enter fires');
  assert.equal(pickTarget([n, na], 'na', false), na);
  const nAlone = { accept: acceptFor(card(hira, 'ん'), hira, 'forward'), y: 0.3 };
  assert.equal(pickTarget([nAlone], 'n', false), nAlone, "own alias 'nn' doesn't block 'n'");
  const high = rock('a', 0.1), low = rock('a', 0.8);
  assert.equal(pickTarget([high, low], 'A', false), low);
  assert.equal(pickTarget([high], 'x', true), null);
  assert.equal(pickTarget([high], '  ', true), null);
});
