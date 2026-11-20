import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowLeftRight, Check, Layers, LayoutGrid, RotateCcw, X } from 'lucide-react';
import { LANGS, getDeck } from './decks';
import { useAccount } from './account';
import Landing from './Landing';

const load = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};
const save = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked: progress just won't persist */ }
};

const shuffle = (array) => {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const langOf = (deck) => LANGS.find((l) => l.id === deck.lang);
const htmlLang = (deck) => (deck.lang === 'zh' ? 'zh-Hans' : deck.lang);

function useRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => { setRoute(read()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export default function App() {
  const route = useRoute();
  // Learned card ids, shared across decks (so "Kana mix" progress counts toward hiragana/katakana too).
  const [known, setKnown] = useState(() => new Set(load('moji.known', [])));
  const [reverse, setReverse] = useState(() => load('moji.reverse', false));

  const updateKnown = useCallback((fn) => setKnown((prev) => {
    const next = new Set(prev);
    fn(next);
    save('moji.known', [...next]);
    return next;
  }), []);

  const replaceKnown = useCallback((fn) => setKnown((prev) => {
    const next = fn(prev);
    save('moji.known', [...next]);
    return next;
  }), []);
  const account = useAccount(known, replaceKnown);

  const toggleReverse = () => setReverse((r) => { save('moji.reverse', !r); return !r; });

  const deck = route[0] === 'd' && getDeck(route[1]);
  return (
    <div className="min-h-screen">
      {deck ? (
        <DeckView deck={deck} tab={route[2] === 'browse' ? 'browse' : 'study'} known={known}
          updateKnown={updateKnown} reverse={reverse} toggleReverse={toggleReverse} />
      ) : (
        <Landing known={known} account={account} />
      )}
      {account.notice && (
        <div role="status" className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-full border border-white/10 bg-[#1c1c1f] px-5 py-2.5 text-sm shadow-2xl">
          {account.notice}
        </div>
      )}
    </div>
  );
}

function Progress({ value, total, className = '' }) {
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-line ${className}`} role="progressbar"
      aria-valuemin={0} aria-valuemax={total} aria-valuenow={value}>
      <div className="h-full rounded-full bg-jade transition-[width] duration-500" style={{ width: `${total ? (value / total) * 100 : 0}%` }} />
    </div>
  );
}

function DeckView({ deck, tab, known, updateKnown, reverse, toggleReverse }) {
  const font = langOf(deck).font;
  const learned = deck.cards.filter((c) => known.has(c.id)).length;
  const tabClass = (t) => `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === t ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink'}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 pb-10 pt-4">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <a href="#/" className="-ml-2 rounded-lg p-2 text-muted hover:text-ink" aria-label="Back to decks"><ArrowLeft size={20} /></a>
        <div className="mr-auto min-w-0">
          <h1 className="flex items-baseline gap-2 text-xl font-bold">
            {deck.title}<span className={`${font} text-base font-medium text-muted`} lang={htmlLang(deck)}>{deck.native}</span>
          </h1>
          <p className="text-xs tabular-nums text-muted">{learned} of {deck.cards.length} learned</p>
        </div>
        <nav className="flex rounded-xl bg-line/60 p-1">
          <a href={`#/d/${deck.id}`} className={tabClass('study')}><Layers size={15} />Study</a>
          <a href={`#/d/${deck.id}/browse`} className={tabClass('browse')}><LayoutGrid size={15} />Browse</a>
        </nav>
      </header>

      {tab === 'study' ? (
        <Study key={`${deck.id}-${reverse}`} deck={deck} font={font} reverse={reverse} toggleReverse={toggleReverse} known={known} updateKnown={updateKnown} />
      ) : (
        <Browse deck={deck} font={font} known={known} updateKnown={updateKnown} />
      )}
    </main>
  );
}

function Study({ deck, font, reverse, toggleReverse, known, updateKnown }) {
  const [unlearnedOnly, setUnlearnedOnly] = useState(false);
  const [queue, setQueue] = useState(() => shuffle(deck.cards));
  const [total, setTotal] = useState(deck.cards.length);
  const [flipped, setFlipped] = useState(false);
  const [missed, setMissed] = useState(0);
  const [turn, setTurn] = useState(0); // remount key so the next card never animates its answer into view

  const unlearnedCards = deck.cards.filter((c) => !known.has(c.id));
  const restart = (cards) => {
    setQueue(shuffle(cards)); setTotal(cards.length); setFlipped(false); setMissed(0); setTurn((t) => t + 1);
  };

  const card = queue[0];
  const answer = useCallback((ok) => {
    if (!card) return;
    updateKnown((s) => (ok ? s.add(card.id) : s.delete(card.id)));
    if (!ok) setMissed((m) => m + 1);
    setQueue(([head, ...rest]) => {
      if (ok) return rest;
      // Missed: bring it back a few cards later in this session.
      const at = Math.min(rest.length, 3 + Math.floor(Math.random() * 3));
      return [...rest.slice(0, at), head, ...rest.slice(at)];
    });
    setFlipped(false);
    setTurn((t) => t + 1);
  }, [card, updateKnown]);

  const keys = useRef();
  keys.current = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); if (card) setFlipped((f) => !f); }
    else if (flipped && (e.key === '1' || e.key === 'ArrowLeft')) answer(false);
    else if (flipped && (e.key === '2' || e.key === 'ArrowRight')) answer(true);
  };
  useEffect(() => {
    const h = (e) => keys.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const toolBtn = 'flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-ink/30 hover:text-ink';

  return (
    <div className="flex flex-1 flex-col items-center">
      <div className="mb-5 flex w-full max-w-md flex-wrap items-center justify-center gap-2">
        <button onClick={toggleReverse} className={toolBtn} aria-pressed={reverse}>
          <ArrowLeftRight size={14} />{reverse ? 'Answer → Character' : 'Character → Answer'}
        </button>
        <button onClick={() => { const next = !unlearnedOnly; setUnlearnedOnly(next); restart(next ? unlearnedCards : deck.cards); }}
          className={`${toolBtn} ${unlearnedOnly ? 'border-seal/50 text-seal' : ''}`} aria-pressed={unlearnedOnly}>
          Unlearned only ({unlearnedCards.length})
        </button>
        <button onClick={() => restart(unlearnedOnly ? unlearnedCards : deck.cards)} className={toolBtn}><RotateCcw size={14} />Restart</button>
      </div>

      <div className="mb-6 flex w-full max-w-md items-center gap-3 text-xs tabular-nums text-muted">
        <Progress value={total - queue.length} total={total} />
        <span className="shrink-0">{total - queue.length}/{total}</span>
      </div>

      {card ? (
        <>
          <Flashcard key={turn} card={card} deck={deck} font={font} reverse={reverse} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />
          <div className="mt-6 flex h-14 w-full max-w-md gap-3">
            {flipped ? (
              <>
                <button onClick={() => answer(false)} className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-seal/40 font-semibold text-seal transition hover:bg-seal/10">
                  <X size={18} />Again
                </button>
                <button onClick={() => answer(true)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-jade font-semibold text-white transition hover:brightness-110">
                  <Check size={18} />Got it
                </button>
              </>
            ) : (
              <button onClick={() => setFlipped(true)} className="flex-1 rounded-xl bg-ink font-semibold text-paper transition hover:opacity-90">Show answer</button>
            )}
          </div>
          <p className="mt-4 hidden text-xs text-muted sm:block">
            <Kbd>Space</Kbd> flip · <Kbd>1</Kbd> again · <Kbd>2</Kbd> got it
          </p>
        </>
      ) : (
        <div className="flex w-full max-w-md flex-col items-center rounded-2xl border border-line bg-card px-6 py-12 text-center shadow-sm">
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-jade/15 text-jade"><Check size={28} /></div>
          <h2 className="text-xl font-bold">{total ? 'Session complete' : 'Nothing left to learn here'}</h2>
          <p className="mt-1 text-sm text-muted">
            {total ? `${total} cards cleared · ${missed} ${missed === 1 ? 'miss' : 'misses'} along the way` : 'Every card in this deck is marked learned.'}
          </p>
          <div className="mt-6 flex gap-3">
            <button onClick={() => { setUnlearnedOnly(false); restart(deck.cards); }} className="rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-paper hover:opacity-90">Study again</button>
            <a href="#/" className="rounded-xl border border-line px-5 py-2.5 text-sm font-semibold hover:border-ink/30">All decks</a>
          </div>
        </div>
      )}
    </div>
  );
}

const Kbd = ({ children }) => <kbd className="rounded border border-line bg-card px-1.5 py-0.5 font-sans text-[11px]">{children}</kbd>;

function Glyph({ card, deck, font, size }) {
  return (
    <span className="flex items-end justify-center gap-3" lang={htmlLang(deck)}>
      <span className={`${font} ${size} font-bold leading-none`}>{card.glyph}</span>
      {card.glyphAlt && <span className={`${font} text-3xl font-medium text-muted`}>{card.glyphAlt}</span>}
    </span>
  );
}

function Flashcard({ card, deck, font, reverse, flipped, onFlip }) {
  const face = 'face absolute inset-0 flex flex-col items-center justify-center rounded-3xl border border-line bg-card p-6 shadow-[0_8px_30px_-12px_rgb(0_0_0/0.25)]';
  return (
    <button onClick={onFlip} className="flip h-[22rem] w-full max-w-md rounded-3xl sm:h-[24rem]" aria-label={flipped ? 'Hide answer' : 'Show answer'}>
      <span className={`flip-inner relative block h-full w-full ${flipped ? 'is-flipped' : ''}`}>
        <span className={face}>
          {reverse ? (
            <>
              <span className="text-5xl font-semibold">{card.answer}</span>
              {card.answerSub && <span className="mt-3 text-sm text-muted">{card.answerSub}</span>}
            </>
          ) : (
            <Glyph card={card} deck={deck} font={font} size="text-[8rem]" />
          )}
          <span className="absolute bottom-5 text-xs text-muted/70">tap to flip</span>
        </span>
        <span className={`${face} face-back border-seal/30`}>
          <Glyph card={card} deck={deck} font={font} size={reverse ? 'text-[7rem]' : 'text-6xl'} />
          <span className={`mt-5 font-semibold ${reverse ? 'text-2xl' : 'text-5xl'}`}>{card.answer}</span>
          {card.answerSub && <span className="mt-2 text-sm text-muted">{card.answerSub}</span>}
          {card.examples && (
            <span className={`${font} mt-5 flex gap-3 text-2xl text-ink/80`} lang={htmlLang(deck)}>
              {card.examples.map((c) => <span key={c}>{c}</span>)}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function Browse({ deck, font, known, updateKnown }) {
  const rich = Boolean(deck.cards[0]?.answerSub);
  const learned = deck.cards.filter((c) => known.has(c.id)).length;
  return (
    <>
      <div className="mb-4 flex items-center justify-between text-xs text-muted">
        <span>Tap a card to toggle learned.</span>
        {learned > 0 && (
          <button onClick={() => { if (confirm(`Reset progress for ${deck.title}?`)) updateKnown((s) => deck.cards.forEach((c) => s.delete(c.id))); }}
            className="flex items-center gap-1 hover:text-seal"><RotateCcw size={12} />Reset progress</button>
        )}
      </div>
      <ul className={`grid gap-2 ${rich ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4' : 'grid-cols-4 sm:grid-cols-6 md:grid-cols-8'}`}>
        {deck.cards.map((c) => {
          const isKnown = known.has(c.id);
          return (
            <li key={c.id}>
              <button onClick={() => updateKnown((s) => (isKnown ? s.delete(c.id) : s.add(c.id)))} aria-pressed={isKnown}
                className={`relative flex h-full w-full flex-col items-center rounded-xl border bg-card px-2 py-3 text-center transition hover:border-ink/30 ${isKnown ? 'border-jade/50' : 'border-line'}`}>
                {isKnown && <Check size={12} className="absolute right-2 top-2 text-jade" />}
                <span className={`${font} font-bold leading-tight ${rich ? 'text-4xl' : 'text-3xl'}`} lang={htmlLang(deck)}>
                  {c.glyph}{c.glyphAlt && <span className="ml-1.5 text-xl font-medium text-muted">{c.glyphAlt}</span>}
                </span>
                <span className={`mt-1.5 font-medium ${rich ? 'text-sm' : 'text-xs text-muted'}`}>{c.answer}</span>
                {rich && <span className="mt-0.5 text-xs text-muted">{c.answerSub}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
