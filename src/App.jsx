import { lazy, Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Check, Layers, LayoutGrid, Lock, Rocket, RotateCcw, X } from 'lucide-react';
import { DECKS, READINGS, fontOf, getDeck, langAttr, withReading } from './decks';
import { AuthDialog, useAccount } from './account';
import Landing from './Landing';
import Asteroids from './Asteroids';
import Admin from './Admin';
import Dashboard, { Emblem, Panel, Shell } from './Dashboard';
import { browseLesson, studyLesson } from './lesson';
import { VOCAB, vocabDeck, vocabPrefs, wordId } from './vocab';
import { FONT, LANG_ATTR, SIDES, fixTo, pairAllowed } from './range/logic.js';

const Range = lazy(() => import('./Range')); // its word lists (~100 KB) load only when the range is opened
const Loading = () => <div className="grid place-items-center py-24"><span className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" aria-label="Loading" /></div>;

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
  const [reading, setReading] = useState(() => load('moji.reading', 'hv')); // radicals: answer by Hán Việt name or pinyin

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
  const chooseReading = (r) => { save('moji.reading', r); setReading(r); };

  const [auth, setAuth] = useState(null); // sign-in modal: null | 'signin' | 'signup'
  const [lesson, setLesson] = useState(null); // the open card or deck as text, for the study helper (lesson.js)
  const deck = route[0] === 'd' && withReading(getDeck(route[1]), reading);
  const play = route[0] === 'play';
  const admin = route[0] === 'admin';
  const range = route[0] === 'range';
  const vocab = route[0] === 'v' && VOCAB.find((l) => l.id === route[1]);
  // Whitelist: only approved accounts get past the landing page. No client ID (local dev) = open.
  const member = account.approved || !account.enabled;
  useEffect(() => { if (deck) save('moji.last', deck.id); }, [deck]); // the dashboard's "Continue" deck

  let page;
  if (account.enabled && !account.ready) { // wait for /api/me so members don't see the landing page flash first
    page = <main className="grid min-h-screen place-items-center"><span className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" aria-label="Loading" /></main>;
  } else if (!member) {
    page = deck || vocab || play || range || admin ? <Gate account={account} openAuth={setAuth} /> : <Landing known={known} account={account} openAuth={setAuth} />;
  } else {
    page = (
      <Shell here={deck ? deck.id : vocab ? vocab.id : play ? 'play' : range ? 'range' : admin ? 'admin' : 'home'} account={account} known={known} lesson={lesson}>
        {admin ? <Admin account={account} />
          : play ? <Asteroids key={route[1] || ''} initialDeck={getDeck(route[1])?.id} reading={reading} setReading={chooseReading} />
          : range ? <Suspense fallback={<Loading />}><Range /></Suspense>
          : vocab ? <Suspense fallback={<Loading />}><Vocab key={vocab.id} level={vocab} tab={route[2] === 'browse' ? 'browse' : 'study'} known={known} updateKnown={updateKnown} setLesson={setLesson} /></Suspense>
          : deck ? <DeckView deck={deck} tab={route[2] === 'browse' ? 'browse' : 'study'} known={known} updateKnown={updateKnown}
            reverse={reverse} toggleReverse={toggleReverse} reading={reading} setReading={chooseReading} setLesson={setLesson} />
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

// Vocab: one chapter of a word list (vocab.js) as flip cards, in the pair of sides you pick (front → back), on the deck
// page's Study and Browse. The list loads on first visit; the chapter and pair are remembered per level.
const lists = new Map(); // level id → promise of its chapters (null if the list failed to load), fetched once
const LABEL = 'w-16 shrink-0 text-xs font-semibold uppercase tracking-wider text-muted';
const chip = (on) => `rounded-full border px-3.5 py-1.5 text-sm transition disabled:pointer-events-none disabled:opacity-30 ${on ? 'border-seal bg-seal/10 text-ink' : 'border-white/10 text-muted hover:border-white/25 hover:text-ink'}`;
const cjk = (side) => (side === 'zh' || side === 'ja' ? side : null); // only the 中文 and 日本語 labels are CJK text

function Vocab({ level, tab, known, updateKnown, setLesson }) {
  if (!lists.has(level.id)) lists.set(level.id, level.load().then((m) => m.default, () => null));
  const chapters = use(lists.get(level.id));
  const [pref, setPref] = useState(() => vocabPrefs(level, load('moji.vocab', {})));
  const ci = Math.min(pref.chapter, (chapters?.length ?? 1) - 1);
  const { from, to } = pref;
  const deck = useMemo(() => chapters && vocabDeck(level, chapters, ci, from, to), [level, chapters, ci, from, to]);
  if (!chapters) {
    return (
      <p className="py-24 text-center text-sm text-muted">
        Couldn’t load the {level.title} words.{' '}
        <button onClick={() => window.location.reload()} className="font-semibold text-ink hover:underline">Reload</button>
      </p>
    );
  }

  const update = (patch) => setPref((p) => {
    const next = { ...p, ...patch };
    save('moji.vocab', { ...load('moji.vocab', {}), [level.id]: next });
    return next;
  });
  const example = deck.cards[0];
  return (
    <DeckView deck={deck} tab={tab} known={known} updateKnown={updateKnown} reverse={false} setLesson={setLesson}>
      <div className="mb-6 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <label className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className={LABEL}>Chapter</span>
          <select value={ci} onChange={(e) => update({ chapter: Number(e.target.value) })}
            className="h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-ink outline-none transition focus:border-white/25 sm:w-auto">
            {chapters.map((c, i) => (
              <option key={i} value={i}>{i + 1}. {c.title} · {c.words.filter((w) => known.has(wordId(level, w))).length}/{c.words.length}</option>
            ))}
          </select>
        </label>
        {[['Front', from, (id) => update({ from: id, to: fixTo(level.lang, id, to) }), () => true],
          ['Back', to, (id) => update({ to: id }), (id) => pairAllowed(level.lang, from, id)]].map(([name, value, pick, ok]) => (
          <div key={name} role="group" aria-label={name} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className={LABEL}>{name}</span>
            <div className="flex flex-wrap gap-2">
              {SIDES.map((x) => (
                <button key={x.id} onClick={() => pick(x.id)} disabled={!ok(x.id)} aria-pressed={value === x.id} className={chip(value === x.id)}>
                  <span lang={LANG_ATTR[cjk(x.id)]} className={FONT[cjk(x.id)]}>{x.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-3 border-t border-white/[0.06] pt-3">
          <button onClick={() => update({ from: to, to: from })} aria-label="Swap front and back" title="Swap front and back"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-muted transition hover:border-white/25 hover:text-ink"><ArrowLeftRight size={16} /></button>
          {example && (
            <span className="min-w-0 truncate text-lg font-semibold">
              <span lang={deck.glyphAttr} className={deck.glyphFont}>{example.glyph}</span>
              <span className="mx-2 text-muted">→</span>
              <span lang={deck.answerAttr} className={deck.answerFont}>{example.answer}</span>
            </span>
          )}
          <span className="ml-auto shrink-0 text-xs tabular-nums text-muted">{deck.cards.length} cards</span>
        </div>
      </div>
    </DeckView>
  );
}

// A deck's page: header and tabs, an optional toolbar (children), then Study or Browse. Vocab decks (vocab.js) bring
// their own link and a font per side, and have no Asteroid Shooter tab.
function DeckView({ deck, tab, known, updateKnown, reverse, toggleReverse, reading, setReading, setLesson, children }) {
  const font = deck.glyphFont ?? fontOf(deck);
  const href = deck.href ?? `#/d/${deck.id}`;
  const learned = deck.cards.filter((c) => known.has(c.id)).length;
  const tabClass = (t) => `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === t ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink'}`;

  return (
    <>
      <header className="mb-6 flex flex-wrap items-center gap-4">
        <Emblem deck={deck} className="h-12 w-12 rounded-2xl text-xl" />
        <div className="mr-auto min-w-0">
          <h1 className="flex items-baseline gap-2 text-2xl font-semibold tracking-tight">
            {deck.title}<span className={`${fontOf(deck)} text-base font-medium text-muted`} lang={langAttr(deck)}>{deck.native}</span>
          </h1>
          <p className="text-xs tabular-nums text-muted">{learned} of {deck.cards.length} learned</p>
        </div>
        <nav className="flex rounded-xl bg-line/60 p-1">
          <a href={href} className={tabClass('study')}><Layers size={15} />Study</a>
          <a href={`${href}/browse`} className={tabClass('browse')}><LayoutGrid size={15} />Browse</a>
          {!deck.href && <a href={`#/play/${deck.id}`} className={tabClass('play')}><Rocket size={15} />Play</a>}
        </nav>
      </header>
      {children}

      {tab === 'study' ? (
        <Study key={`${deck.id}-${reverse}-${reading}`} deck={deck} font={font} reverse={reverse} toggleReverse={toggleReverse} known={known} updateKnown={updateKnown}
          reading={reading} setReading={setReading} setLesson={setLesson} />
      ) : (
        <Browse deck={deck} font={font} known={known} updateKnown={updateKnown} setLesson={setLesson} />
      )}
    </>
  );
}

function Study({ deck, font, reverse, toggleReverse, known, updateKnown, reading, setReading, setLesson }) {
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
            {deck.pinyinCards && (
              <div role="group" aria-label="Answer with" className="grid h-10 grid-cols-2 gap-1 rounded-xl border border-white/10 p-1 text-sm">
                {READINGS.map(([id, name]) => (
                  <button key={id} onClick={() => setReading(id)} aria-pressed={reading === id}
                    className={`rounded-lg transition ${reading === id ? 'bg-white/[0.08] font-medium text-ink' : 'text-muted hover:text-ink'}`}>{name}</button>
                ))}
              </div>
            )}
            {toggleReverse && (
              <button onClick={toggleReverse} className={opt(false)} aria-pressed={reverse}>
                <ArrowLeftRight size={15} />{reverse ? 'Answer → Character' : 'Character → Answer'}
              </button>
            )}
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

// Font size for a word: up to `max` rem, smaller the longer it is so it stays on one line of its card (the nearest
// [container-type:inline-size], less `pad` rem of padding), counting 1em per CJK character and ~0.6em per Latin one.
// It stops shrinking at 1.25rem and wraps instead. A single character keeps its class size.
const fit = (text, max, pad = 3) => {
  const ems = [...text].reduce((n, ch) => n + (ch >= '⺀' ? 1 : 0.6), 0);
  return ems > 1 ? { fontSize: `clamp(1.25rem, calc((100cqw - ${pad}rem) / ${ems.toFixed(2)}), ${max}rem)` } : undefined;
};

function Glyph({ card, deck, font, size, max }) {
  return (
    <span className="flex items-end justify-center gap-3" lang={deck.glyphAttr ?? langAttr(deck)}>
      <span className={`${font} ${size} text-balance font-bold leading-none`} style={fit(card.glyph, max)}>{card.glyph}</span>
      {card.glyphAlt && <span className={`${font} text-3xl font-medium text-muted`}>{card.glyphAlt}</span>}
    </span>
  );
}

function Flashcard({ card, deck, font, reverse, flipped, onFlip }) {
  const face = 'face absolute inset-0 flex flex-col items-center justify-center rounded-3xl border border-line bg-card p-6 shadow-[0_8px_30px_-12px_rgb(0_0_0/0.25)]';
  return (
    <button onClick={onFlip} className="flip h-[22rem] w-full max-w-md rounded-3xl [container-type:inline-size] sm:h-[24rem]" aria-label={flipped ? 'Hide answer' : 'Show answer'}>
      <span className={`flip-inner relative block h-full w-full ${flipped ? 'is-flipped' : ''}`}>
        <span className={face}>
          {reverse ? (
            <>
              <span className="text-5xl font-semibold">{card.answer}</span>
              {card.answerSub && <span className="mt-3 text-sm text-muted">{card.answerSub}</span>}
            </>
          ) : (
            <Glyph card={card} deck={deck} font={font} size="text-[8rem]" max={8} />
          )}
          <span className="absolute bottom-5 text-xs text-muted/70">tap to flip</span>
        </span>
        <span className={`${face} face-back border-seal/30`}>
          <Glyph card={card} deck={deck} font={font} size={reverse ? 'text-[7rem]' : 'text-6xl'} max={reverse ? 7 : 3.75} />
          <span className={`mt-5 text-balance font-semibold ${deck.answerFont ?? ''} ${reverse ? 'text-2xl' : 'text-5xl'}`} lang={deck.answerAttr}
            style={fit(card.answer, reverse ? 1.5 : 3)}>{card.answer}</span>
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
  const rich = deck.rich || Boolean(deck.cards[0]?.answerSub);
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
                className={`relative flex h-full w-full flex-col items-center rounded-xl border bg-card px-2 py-3 text-center transition [container-type:inline-size] hover:border-ink/30 ${isKnown ? 'border-jade/50' : 'border-line'}`}>
                {isKnown && <Check size={12} className="absolute right-2 top-2 text-jade" />}
                <span className={`${font} font-bold leading-tight ${rich ? 'text-4xl' : 'text-3xl'}`} lang={deck.glyphAttr ?? langAttr(deck)} style={fit(c.glyph, rich ? 2.25 : 1.875, 1)}>
                  {c.glyph}{c.glyphAlt && <span className="ml-1.5 text-xl font-medium text-muted">{c.glyphAlt}</span>}
                </span>
                <span className={`mt-1.5 font-medium ${deck.answerFont ?? ''} ${rich ? 'text-sm' : 'text-xs text-muted'}`} lang={deck.answerAttr}>{c.answer}</span>
                {rich && <span className="mt-0.5 text-xs text-muted">{c.answerSub}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
