import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Check, Layers, LayoutGrid, Lock, Rocket, RotateCcw, X } from 'lucide-react';
import { DECKS, fontOf, getDeck, langAttr } from './decks';
import { AuthDialog, useAccount } from './account';
import Landing from './Landing';
import Asteroids from './Asteroids';
import Admin from './Admin';
import Dashboard, { Emblem, Panel, Shell } from './Dashboard';
import { browseLesson, studyLesson } from './lesson';

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

  const [auth, setAuth] = useState(null); // sign-in modal: null | 'signin' | 'signup'
  const [lesson, setLesson] = useState(null); // the open card or deck as text, for the study helper (lesson.js)
  const deck = route[0] === 'd' && getDeck(route[1]);
  const play = route[0] === 'play';
  const admin = route[0] === 'admin';
  // Whitelist: only approved accounts get past the landing page. No client ID (local dev) = open.
  const member = account.approved || !account.enabled;
  useEffect(() => { if (deck) save('moji.last', deck.id); }, [deck]); // the dashboard's "Continue" deck

  let page;
  if (account.enabled && !account.ready) { // wait for /api/me so members don't see the landing page flash first
    page = <main className="grid min-h-screen place-items-center"><span className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" aria-label="Loading" /></main>;
  } else if (!member) {
    page = deck || play || admin ? <Gate account={account} openAuth={setAuth} /> : <Landing known={known} account={account} openAuth={setAuth} />;
  } else {
    page = (
      <Shell here={deck ? deck.id : play ? 'play' : admin ? 'admin' : 'home'} account={account} known={known} lesson={lesson}>
        {admin ? <Admin account={account} />
          : play ? <Asteroids key={route[1] || ''} initialDeck={getDeck(route[1])?.id} />
          : deck ? <DeckView deck={deck} tab={route[2] === 'browse' ? 'browse' : 'study'} known={known}
            updateKnown={updateKnown} reverse={reverse} toggleReverse={toggleReverse} setLesson={setLesson} />
          : <Dashboard known={known} account={account} last={getDeck(load('moji.last', null)) || DECKS[0]} />}
      </Shell>
    );
  }

  return (
    <div className="min-h-screen">
      {page}
      <Scrollbar />
      {account.enabled && <AuthDialog mode={auth} setMode={setAuth} onClose={() => setAuth(null)} account={account} />}
      {account.notice && (
        <div role="status" className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-full border border-white/10 bg-[#1c1c1f] px-5 py-2.5 text-sm shadow-2xl">
          {account.notice}
        </div>
      )}
    </div>
  );
}

// Page scrollbar drawn in JS (index.css hides the native one). Wheel, keys and touch still scroll natively;
// this draws the thumb, shows it on scroll/hover, fades it when idle, and handles thumb drags and track clicks.
function Scrollbar() {
  const bar = useRef(null);
  const thumb = useRef(null);
  useEffect(() => {
    const el = bar.current;
    const root = document.documentElement;
    let drag = null;
    let idle;
    const geo = () => {
      const view = window.innerHeight;
      const h = Math.max(40, (view * view) / root.scrollHeight);
      return { view, max: root.scrollHeight - view, track: view - h, h };
    };
    const draw = () => {
      const { max, track, h } = geo();
      el.hidden = max <= 0;
      thumb.current.style.height = `${h}px`;
      thumb.current.style.transform = `translateY(${max > 0 ? (window.scrollY / max) * track : 0}px)`;
    };
    const wake = () => {
      el.dataset.on = '';
      clearTimeout(idle);
      idle = setTimeout(() => { if (!drag) delete el.dataset.on; }, 1200);
    };
    const onScroll = () => { draw(); wake(); };
    const onDown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const { view, max, track } = geo();
      const t = thumb.current.getBoundingClientRect();
      if (e.clientY < t.top || e.clientY > t.bottom) { // track click pages up/down, like the native bar
        window.scrollBy(0, (e.clientY < t.top ? -0.9 : 0.9) * view);
        return;
      }
      drag = { y: e.clientY, top: window.scrollY, ratio: max / track };
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e) => { if (drag) window.scrollTo(0, drag.top + (e.clientY - drag.y) * drag.ratio); };
    const onUp = () => { drag = null; wake(); };
    const on = [[window, 'scroll', onScroll], [window, 'resize', draw], [el, 'pointerdown', onDown],
      [el, 'pointermove', onMove], [el, 'pointerup', onUp], [el, 'pointercancel', onUp]];
    on.forEach(([t, ev, fn]) => t.addEventListener(ev, fn, { passive: ev !== 'pointerdown' }));
    const ro = new ResizeObserver(draw);
    ro.observe(document.body);
    draw();
    return () => { on.forEach(([t, ev, fn]) => t.removeEventListener(ev, fn)); ro.disconnect(); clearTimeout(idle); };
  }, []);
  return (
    <div ref={bar} aria-hidden className="group fixed inset-y-0 right-0 z-40 w-3 select-none opacity-0 transition-opacity duration-300 hover:opacity-100 data-[on]:opacity-100 [@media(pointer:coarse)]:pointer-events-none">
      <div ref={thumb} className="absolute right-0.5 top-0 w-1.5 rounded-full bg-white/25 transition-[width,background-color] duration-150 group-hover:w-2 group-hover:bg-white/45" />
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

function Gate({ account, openAuth }) {
  const { user } = account;
  const primary = 'rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90';
  const secondary = 'rounded-full border border-white/15 px-6 py-3 text-sm font-semibold transition hover:bg-white/5';
  const [title, body, actions] = !user
    ? ['Members only', 'Moji is invite-only. Sign in, or request access and the admin will let you in.',
      <><button onClick={() => openAuth('signin')} className={primary}>Sign in</button><button onClick={() => openAuth('signup')} className={secondary}>Request access</button></>]
    : user.status === 'denied'
      ? ['Access not approved', `${user.email} wasn’t approved for Moji.`, <button onClick={account.signOut} className={secondary}>Sign out</button>]
      : ['Request pending', `You’ll get in as soon as the admin approves ${user.email}.`,
        <><button onClick={account.refresh} className={primary}>Check again</button><button onClick={account.signOut} className={secondary}>Sign out</button></>];
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.06]"><Lock size={22} /></span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-muted">{body}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">{actions}</div>
      <a href="#/" className="mt-6 text-sm text-muted hover:text-ink">Back to home</a>
    </main>
  );
}

function DeckView({ deck, tab, known, updateKnown, reverse, toggleReverse, setLesson }) {
  const font = fontOf(deck);
  const learned = deck.cards.filter((c) => known.has(c.id)).length;
  const tabClass = (t) => `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === t ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink'}`;

  return (
    <>
      <header className="mb-6 flex flex-wrap items-center gap-4">
        <Emblem deck={deck} className="h-12 w-12 rounded-2xl text-xl" />
        <div className="mr-auto min-w-0">
          <h1 className="flex items-baseline gap-2 text-2xl font-semibold tracking-tight">
            {deck.title}<span className={`${font} text-base font-medium text-muted`} lang={langAttr(deck)}>{deck.native}</span>
          </h1>
          <p className="text-xs tabular-nums text-muted">{learned} of {deck.cards.length} learned</p>
        </div>
        <nav className="flex rounded-xl bg-line/60 p-1">
          <a href={`#/d/${deck.id}`} className={tabClass('study')}><Layers size={15} />Study</a>
          <a href={`#/d/${deck.id}/browse`} className={tabClass('browse')}><LayoutGrid size={15} />Browse</a>
          <a href={`#/play/${deck.id}`} className={tabClass('play')}><Rocket size={15} />Play</a>
        </nav>
      </header>

      {tab === 'study' ? (
        <Study key={`${deck.id}-${reverse}`} deck={deck} font={font} reverse={reverse} toggleReverse={toggleReverse} known={known} updateKnown={updateKnown} setLesson={setLesson} />
      ) : (
        <Browse deck={deck} font={font} known={known} updateKnown={updateKnown} setLesson={setLesson} />
      )}
    </>
  );
}

function Study({ deck, font, reverse, toggleReverse, known, updateKnown, setLesson }) {
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
  useEffect(() => {
    setLesson(card ? studyLesson(deck, card, { reverse, flipped }) : null);
    return () => setLesson(null);
  }, [deck, card, reverse, flipped, setLesson]);

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
    // Typing in the lookup or anything in the chat panel isn't a shortcut, and Space/Enter on a link or button keep their normal job.
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input, textarea, select, [role="dialog"]')) return;
    if ((e.code === 'Space' || e.key === 'Enter') && !e.target.closest('a, button')) { e.preventDefault(); if (card) setFlipped((f) => !f); }
    else if (flipped && (e.key === '1' || e.key === 'ArrowLeft')) answer(false);
    else if (flipped && (e.key === '2' || e.key === 'ArrowRight')) answer(true);
  };
  useEffect(() => {
    const h = (e) => keys.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const opt = (on) => `flex h-10 w-full items-center gap-2 rounded-xl border px-3 text-sm transition ${on ? 'border-seal/50 text-seal' : 'border-white/10 text-muted hover:border-white/25 hover:text-ink'}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <section className="flex flex-col items-center rounded-3xl border border-white/[0.06] bg-white/[0.02] px-4 py-6 sm:p-8">
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
              <a href="#/" className="rounded-xl border border-line px-5 py-2.5 text-sm font-semibold hover:border-ink/30">Dashboard</a>
            </div>
          </div>
        )}
      </section>

      <aside className="grid content-start gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <Panel title="Options">
          <div className="grid gap-2">
            <button onClick={toggleReverse} className={opt(false)} aria-pressed={reverse}>
              <ArrowLeftRight size={15} />{reverse ? 'Answer → Character' : 'Character → Answer'}
            </button>
            <button onClick={() => { const next = !unlearnedOnly; setUnlearnedOnly(next); restart(next ? unlearnedCards : deck.cards); }}
              className={opt(unlearnedOnly)} aria-pressed={unlearnedOnly}>
              Unlearned only<span className="ml-auto tabular-nums">{unlearnedCards.length}</span>
            </button>
            <button onClick={() => restart(unlearnedOnly ? unlearnedCards : deck.cards)} className={opt(false)}><RotateCcw size={15} />Restart</button>
          </div>
        </Panel>
        <Panel title="Keys" className="hidden sm:block">
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2.5 text-sm text-muted">
            <dt><Kbd>Space</Kbd></dt><dd>Flip the card</dd>
            <dt><Kbd>1</Kbd></dt><dd>Again, it comes back soon</dd>
            <dt><Kbd>2</Kbd></dt><dd>Got it, marks it learned</dd>
          </dl>
        </Panel>
      </aside>
    </div>
  );
}

const Kbd = ({ children }) => <kbd className="rounded border border-line bg-card px-1.5 py-0.5 font-sans text-[11px]">{children}</kbd>;

function Glyph({ card, deck, font, size }) {
  return (
    <span className="flex items-end justify-center gap-3" lang={langAttr(deck)}>
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
            <span className={`${font} mt-5 flex gap-3 text-2xl text-ink/80`} lang={langAttr(deck)}>
              {card.examples.map((c) => <span key={c}>{c}</span>)}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function Browse({ deck, font, known, updateKnown, setLesson }) {
  const rich = Boolean(deck.cards[0]?.answerSub);
  const learned = deck.cards.filter((c) => known.has(c.id)).length;
  useEffect(() => {
    setLesson(browseLesson(deck, known));
    return () => setLesson(null);
  }, [deck, known, setLesson]);
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
                <span className={`${font} font-bold leading-tight ${rich ? 'text-4xl' : 'text-3xl'}`} lang={langAttr(deck)}>
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
