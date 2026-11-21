// What the study helper is told about the open lesson: the deck and card on screen, as text.
// The app already knows exactly what it renders, so no screenshot is needed and nothing outside the lesson is sent.
const glyphOf = (c) => (c.glyphAlt ? `${c.glyph} (also written ${c.glyphAlt})` : c.glyph);
const answerOf = (c) => (c.answerSub ? `${c.answer} (${c.answerSub})` : c.answer);

// Study tab. The label (shown on the chat chip) is always the card's front, so it can't spoil the hidden side.
export function studyLesson(deck, card, { reverse, flipped }) {
  const [front, back] = reverse ? [answerOf(card), glyphOf(card)] : [glyphOf(card), answerOf(card)];
  const examples = card.examples?.length ? `\nExample characters on the back: ${card.examples.join(' ')}` : '';
  return {
    label: `${reverse ? card.answer : card.glyph} · ${deck.title}`,
    text: `Studying the ${deck.title} deck.\nCard front: ${front}\nCard back (${flipped ? 'flipped, visible' : 'hidden, not flipped yet'}): ${back}${examples}`,
  };
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
