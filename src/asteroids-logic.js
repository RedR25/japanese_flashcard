// Pure answer-matching rules for the Asteroid Shooter game (no React, so plain Node can test it).

// Accept common alternate romanisations.
const ALIAS = { shi: ['si'], chi: ['ti'], tsu: ['tu'], fu: ['hu'], ji: ['zi'], di: ['ji', 'dji'], du: ['zu', 'dzu'], wo: ['o'], n: ['nn'] };

// Case, accents/tones (rén → ren, Nhân → nhan) and spaces don't matter. Kana dakuten survive (U+3099 isn't stripped).
export const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, '').normalize('NFC');

// forward: type the reading (the chosen one for radicals: Hán Việt name or pinyin, not both) or a radical's meaning.
// reverse: type the character; any card in the deck with the same reading counts (kana mix: a → あ or ア).
export const acceptFor = (card, deck, dir) => {
  if (dir === 'forward') {
    const parts = [card.answer, ...(card.meanings || [])].map(norm);
    return [...new Set(parts.flatMap((p) => [p, ...(ALIAS[p] || [])]))];
  }
  const a = norm(card.answer);
  return [...new Set(deck.cards.filter((c) => norm(c.answer) === a).flatMap((c) => [c.glyph, ...(c.glyphAlt || '')]).map(norm))];
};

// Exact match fires right away unless a longer answer of ANOTHER asteroid starts with it (n vs na); then only Enter
// (force) fires. A hit's own longer aliases don't count (ん accepts n and nn, so "n" fires). Several hits: shoot the lowest.
export const pickTarget = (rocks, typed, force) => {
  const t = norm(typed);
  if (!t) return null;
  const hits = rocks.filter((r) => r.accept.includes(t));
  if (!hits.length) return null;
  if (!force && rocks.some((r) => !hits.includes(r) && r.accept.some((a) => a.startsWith(t)))) return null;
  return hits.reduce((a, b) => (b.y > a.y ? b : a));
};
