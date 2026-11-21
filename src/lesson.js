// What the study helper is told about the open lesson: the deck and card on screen, as text.
// The app already knows exactly what it renders, so no screenshot is needed and nothing outside the lesson is sent.
const glyphOf = (c) => (c.glyphAlt ? `${c.glyph} (also written ${c.glyphAlt})` : c.glyph);
const answerOf = (c) => (c.answerSub ? `${c.answer} (${c.answerSub})` : c.answer);

// Study tab. The label (shown on the chat chip) is always the card's front, so it can't spoil the hidden side.
// An unflipped card's back is left out entirely: a small model leaks any answer it's handed, hint or not.
export function studyLesson(deck, card, { reverse, flipped }) {
  const [front, back] = reverse ? [answerOf(card), glyphOf(card)] : [glyphOf(card), answerOf(card)];
  const label = `${reverse ? card.answer : card.glyph} · ${deck.title}`;
  const head = `Studying the ${deck.title} deck.\nCard front: ${front}\n`;
  if (!flipped) return { label, text: `${head}Card back: hidden. The learner hasn't flipped it and is trying to recall it.${hintFor(deck, card)}` };
  const examples = card.examples?.length ? `\nExample characters on the back: ${card.examples.join(' ')}` : '';
  return { label, text: `${head}Card back (flipped, visible): ${back}${examples}` };
}

// Facts a hint can be built from without the answer, so the model doesn't guess them (it once called じ "ひ + dakuten").
function hintFor(deck, card) {
  const [base, mark] = card.glyph.normalize('NFD'); // じ → し + combining dakuten
  const plain = mark && deck.cards.find((c) => c.glyph === base);
  if (plain) return `\nHint material: it's ${base} (${plain.answer}) plus the ${mark === '゙' ? 'dakuten ゛' : 'handakuten ゜'} mark.`;
  if (card.examples?.length) return `\nHint material: characters that contain it: ${card.examples.join(' ')}`;
  return '';
}

// Browse tab: the whole grid, learned cards ticked.
export function browseLesson(deck, known) {
  const learned = deck.cards.filter((c) => known.has(c.id)).length;
  const cards = deck.cards.map((c) => `${glyphOf(c)} ${answerOf(c)}${known.has(c.id) ? ' ✓' : ''}`).join(', ');
  return {
    label: `all ${deck.title} cards`,
    text: `Browsing all ${deck.cards.length} cards of the ${deck.title} deck, ${learned} marked learned (✓):\n${cards}`,
  };
}
