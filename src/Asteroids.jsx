import { useEffect, useReducer, useRef, useState } from 'react';
import { ArrowLeft, Heart, Pause, Rocket } from 'lucide-react';
import { DECKS, LANGS, getDeck } from './decks';
import { acceptFor, norm, pickTarget } from './asteroids-logic.js';

// Typing game: asteroids carry a prompt; type its match to shoot it before it reaches the ground.
// forward: prompt = character, type the reading.  reverse: prompt = reading, type the character (needs an IME).

const GROUND = 0.9; // fraction of field height where asteroids hit
const LIVES = 3;
const KILLS_PER_LEVEL = 8;
const SHAPES = ['46% 54% 52% 48% / 55% 45% 55% 45%', '58% 42% 38% 62% / 47% 60% 40% 53%', '40% 60% 60% 40% / 60% 40% 60% 40%', '52% 48% 44% 56% / 40% 58% 42% 60%'];

const shuffle = (a) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
};

const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
};
const bestKey = (deckId, dir) => `moji.astro.best.${deckId}.${dir}`;
const fontOf = (deck) => LANGS.find((l) => l.id === deck.lang).font;
const langAttr = (deck) => (deck.lang === 'zh' ? 'zh-Hans' : deck.lang);

export default function Asteroids({ initialDeck }) {
  const [setup, setSetup] = useState(() => {
    const saved = store.get('moji.astro.setup', {});
    return { deck: initialDeck || (getDeck(saved.deck) ? saved.deck : 'hiragana'), dir: saved.dir === 'reverse' ? 'reverse' : 'forward' };
  });
  const [phase, setPhase] = useState('setup'); // setup | play | over
  const [round, setRound] = useState(0);
  const [result, setResult] = useState(null);
  const deck = getDeck(setup.deck);

  const start = () => { store.set('moji.astro.setup', setup); setRound((r) => r + 1); setPhase('play'); };
  const end = (r) => {
    const best = store.get(bestKey(setup.deck, setup.dir), 0);
    if (r.score > best) store.set(bestKey(setup.deck, setup.dir), r.score);
    setResult({ ...r, best: Math.max(best, r.score), newBest: r.score > best && r.score > 0 });
    setPhase('over');
  };

  if (phase === 'play') return <Game key={round} deck={deck} dir={setup.dir} onEnd={end} onQuit={() => setPhase('setup')} />;
  if (phase === 'over') return <Over result={result} deck={deck} dir={setup.dir} onAgain={start} onSetup={() => setPhase('setup')} />;
  return <Setup setup={setup} setSetup={setSetup} onStart={start} />;
}

function Setup({ setup, setSetup, onStart }) {
  const deck = getDeck(setup.deck);
  const sample = deck.cards[0];
  const best = store.get(bestKey(setup.deck, setup.dir), 0);
  const opt = (active) => `rounded-2xl border p-4 text-left transition ${active ? 'border-seal bg-seal/10' : 'border-white/10 bg-white/[0.03] hover:border-white/25'}`;
  const glyph = <span className={fontOf(deck)} lang={langAttr(deck)}>{sample.glyph}</span>;

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-4">
      <a href="#/" className="-ml-2 inline-flex items-center gap-1 rounded-lg p-2 text-sm text-muted hover:text-ink"><ArrowLeft size={18} />Home</a>
      <div className="mt-6 flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#5b7cff] to-[#a77bff]"><Rocket size={22} /></span>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Asteroid Shooter</h1>
          <p className="text-sm text-muted">Type the match to blast each asteroid before it lands.</p>
        </div>
      </div>

      <h2 className="mb-3 mt-10 text-xs font-semibold uppercase tracking-[0.18em] text-muted">Deck</h2>
      <div className="grid grid-cols-2 gap-3">
        {DECKS.map((d) => (
          <button key={d.id} onClick={() => setSetup((s) => ({ ...s, deck: d.id }))} aria-pressed={setup.deck === d.id} className={opt(setup.deck === d.id)}>
            <span className={`${fontOf(d)} block text-2xl font-bold`} lang={langAttr(d)}>{d.native}</span>
            <span className="mt-1 block font-medium">{d.title}</span>
            <span className="text-xs text-muted">{d.cards.length} cards</span>
          </button>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-muted">Direction</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <button onClick={() => setSetup((s) => ({ ...s, dir: 'forward' }))} aria-pressed={setup.dir === 'forward'} className={opt(setup.dir === 'forward')}>
          <span className="block text-xl font-semibold">{glyph} → {sample.answer}</span>
          <span className="mt-1 block text-sm text-muted">See the character, type the {deck.lang === 'ja' ? 'romaji' : 'Hán Việt name, pinyin or meaning'}.</span>
        </button>
        <button onClick={() => setSetup((s) => ({ ...s, dir: 'reverse' }))} aria-pressed={setup.dir === 'reverse'} className={opt(setup.dir === 'reverse')}>
          <span className="block text-xl font-semibold">{sample.answer} → {glyph}</span>
          <span className="mt-1 block text-sm text-muted">See the reading, type the character. Needs a {deck.lang === 'ja' ? 'Japanese' : 'Chinese'} keyboard (IME).</span>
        </button>
      </div>

      <button onClick={onStart} className="mt-10 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-white text-base font-semibold text-black transition hover:bg-white/90 active:scale-[.99]">
        <Rocket size={18} />Launch
      </button>
      <p className="mt-4 text-center text-xs leading-relaxed text-muted">
        {best > 0 && <>Best here: <span className="font-semibold text-ink">{best}</span> · </>}
        Answers fire as you type · <Kbd>Enter</Kbd> when one answer starts another (n / na) · <Kbd>Esc</Kbd> pause
      </p>
    </main>
  );
}

const Kbd = ({ children }) => <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-sans text-[11px]">{children}</kbd>;

function Game({ deck, dir, onEnd, onQuit }) {
  const g = useRef(null);
  if (!g.current) g.current = { rocks: [], fx: [], bag: [], id: 0, time: 0, spawnIn: 0.4, score: 0, combo: 0, bestCombo: 0, kills: 0, lives: LIVES, missed: new Map(), paused: false };
  const [, frame] = useReducer((x) => x + 1, 0);
  const [text, setText] = useState('');
  const [miss, setMiss] = useState(0);
  const input = useRef(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const font = fontOf(deck);

  useEffect(() => {
    const spawn = (s, level) => {
      if (s.rocks.length >= 2 + level) return;
      if (!s.bag.length) s.bag = shuffle(deck.cards);
      const card = s.bag.pop();
      const prompt = dir === 'forward' ? card.glyph : card.answer;
      if (s.rocks.some((r) => r.prompt === prompt)) return;
      const fall = Math.max(3.2, 10 - level * 0.7) * (0.85 + Math.random() * 0.3); // seconds to reach the ground
      s.rocks.push({ id: ++s.id, card, prompt, accept: acceptFor(card, deck, dir), x: 8 + Math.random() * 84, y: -0.06, v: GROUND / fall, spin: (Math.random() - 0.5) * 50, shape: SHAPES[s.id % SHAPES.length] });
    };

    let raf;
    let last = performance.now();
    const step = (now) => {
      const s = g.current;
      const dt = Math.min(now - last, 50) / 1000; // clamp so a stalled frame doesn't teleport rocks
      last = now;
      if (!s.paused) {
        s.time += dt;
        const level = 1 + Math.floor(s.kills / KILLS_PER_LEVEL);
        if ((s.spawnIn -= dt) <= 0) { spawn(s, level); s.spawnIn = Math.max(0.7, 2.3 - level * 0.16) * (0.8 + Math.random() * 0.4); }
        for (const r of s.rocks) r.y += r.v * dt;
        for (const r of s.rocks) {
          if (r.y < GROUND) continue;
          s.lives--; s.combo = 0; s.missed.set(r.card.id, r.card);
          s.fx.push({ id: ++s.id, kind: 'crash', x: r.x, y: GROUND, t: s.time, card: r.card });
        }
        s.rocks = s.rocks.filter((r) => r.y < GROUND);
        s.fx = s.fx.filter((f) => s.time - f.t < 1);
        if (s.lives <= 0) {
          onEndRef.current({ score: s.score, kills: s.kills, level, bestCombo: s.bestCombo, missed: [...s.missed.values()] });
          return;
        }
      }
      frame();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const hide = () => { if (document.hidden) { g.current.paused = true; frame(); } };
    document.addEventListener('visibilitychange', hide);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', hide); };
  }, [deck, dir]);

  const fire = (value, force) => {
    const s = g.current;
    if (s.paused) return;
    const r = pickTarget(s.rocks, value, force);
    if (r) {
      s.rocks = s.rocks.filter((x) => x !== r);
      s.combo++; s.kills++;
      s.bestCombo = Math.max(s.bestCombo, s.combo);
      const pts = 10 * (1 + Math.floor((s.combo - 1) / 5));
      s.score += pts;
      s.fx.push({ id: ++s.id, kind: 'hit', x: r.x, y: r.y, t: s.time, card: r.card, pts });
      setText('');
    } else if (force && norm(value)) {
      s.combo = 0;
      setMiss((m) => m + 1);
      setText('');
    }
  };

  const togglePause = () => { g.current.paused = !g.current.paused; frame(); input.current?.focus(); };

  const s = g.current;
  const typed = norm(text);
  const level = 1 + Math.floor(s.kills / KILLS_PER_LEVEL);
  const mult = 1 + Math.floor(Math.max(s.combo - 1, 0) / 5);
  const dead = typed && !s.rocks.some((r) => r.accept.some((a) => a.startsWith(typed)));
  const flash = s.fx.some((f) => f.kind === 'crash' && s.time - f.t < 0.3);

  return (
    <div className="flex h-[100dvh] select-none flex-col bg-[#05050a]">
      <header className="flex items-center gap-2 border-b border-white/5 px-3 py-2 sm:gap-3 sm:px-5">
        <button onClick={onQuit} className="rounded-lg p-2 text-muted hover:text-ink" aria-label="Quit to setup"><ArrowLeft size={20} /></button>
        <div className="flex gap-1" role="img" aria-label={`${s.lives} lives left`}>
          {Array.from({ length: LIVES }, (_, i) => <Heart key={i} size={18} className={i < s.lives ? 'fill-seal text-seal' : 'text-white/15'} />)}
        </div>
        <div className="mx-auto text-center">
          <div className="text-2xl font-semibold tabular-nums leading-none">{s.score}</div>
          <div className="text-[11px] text-muted">Level {level}</div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${mult > 1 ? 'bg-seal/15 text-seal' : 'text-muted'}`}>{s.combo} combo · ×{mult}</span>
        <button onClick={togglePause} className="rounded-lg p-2 text-muted hover:text-ink" aria-label="Pause"><Pause size={18} /></button>
      </header>

      <div className="starfield relative flex-1 overflow-hidden" onPointerDown={(e) => { e.preventDefault(); input.current?.focus(); }}>
        <div className={`pointer-events-none absolute inset-0 bg-seal/15 transition-opacity duration-300 ${flash ? 'opacity-100' : 'opacity-0'}`} />
        <div className="absolute inset-x-0 border-t border-dashed border-seal/25" style={{ top: `${GROUND * 100}%` }} />

        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {s.fx.filter((f) => f.kind === 'hit' && s.time - f.t < 0.2).map((f) => (
            <line key={f.id} x1="50" y1="97" x2={f.x} y2={f.y * 100} stroke="rgb(255 95 120)" strokeWidth="3" vectorEffect="non-scaling-stroke" opacity={1 - (s.time - f.t) / 0.2} />
          ))}
        </svg>

        {s.rocks.map((r) => {
          const targeted = typed && r.accept.some((a) => a.startsWith(typed));
          return (
            <div key={r.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${r.x}%`, top: `${r.y * 100}%` }}>
              <div className="relative grid h-16 w-16 place-items-center sm:h-20 sm:w-20">
                <div className={`rock absolute inset-0 ${targeted ? 'rock-target' : ''}`} style={{ borderRadius: r.shape, transform: `rotate(${r.spin * s.time}deg)` }} />
                <span className={`relative font-bold text-white drop-shadow ${dir === 'forward' ? `${font} text-3xl sm:text-4xl` : 'text-base sm:text-lg'}`}
                  lang={dir === 'forward' ? langAttr(deck) : undefined}>{r.prompt}</span>
              </div>
            </div>
          );
        })}

        {s.fx.map((f) => (
          <div key={f.id} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${f.x}%`, top: `${f.y * 100}%` }}>
            {f.kind === 'hit' && <span className="boom absolute left-1/2 top-1/2 h-20 w-20 rounded-full border-2 border-[#ffb547]" />}
            <span className={`rise block whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-semibold ${f.kind === 'hit' ? 'text-[#ffb547]' : 'bg-seal text-white'}`}>
              {f.kind === 'hit' ? `+${f.pts}` : <><span className={font} lang={langAttr(deck)}>{f.card.glyph}</span> = {f.card.answer}</>}
            </span>
          </div>
        ))}

        <svg className="absolute bottom-[1.5%] left-1/2 h-8 w-8 -translate-x-1/2 drop-shadow-[0_0_12px_rgb(255_95_120/0.7)]" viewBox="0 0 24 24" aria-hidden>
          <path d="M12 2 20 21 12 17 4 21z" fill="rgb(255 95 120)" />
        </svg>

        {s.paused && (
          <button onClick={togglePause} className="absolute inset-0 grid place-items-center bg-black/60 backdrop-blur-sm">
            <span className="text-center"><span className="block text-2xl font-semibold">Paused</span><span className="text-sm text-muted">Click or press Esc to resume</span></span>
          </button>
        )}
      </div>

      <div className="border-t border-white/5 p-3 sm:p-4">
        <input key={miss} ref={input} autoFocus value={text} placeholder={dir === 'forward' ? 'Type the reading…' : 'Type the character…'}
          onChange={(e) => { setText(e.target.value); if (!e.nativeEvent.isComposing) fire(e.target.value, false); }}
          onCompositionEnd={(e) => fire(e.currentTarget.value, false)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return; // Enter/Space here belong to the IME
            if (e.key === 'Enter') { e.preventDefault(); fire(text, true); }
            if (e.key === 'Escape') togglePause();
          }}
          lang={dir === 'reverse' ? langAttr(deck) : 'en'} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="send"
          aria-label="Answer"
          className={`mx-auto block h-12 w-full max-w-md rounded-full border bg-white/[0.04] px-5 text-center text-lg outline-none transition placeholder:text-muted/60 focus:bg-white/[0.07] ${miss ? 'animate-shake' : ''} ${dead ? 'border-seal/60 text-seal' : 'border-white/10 focus:border-white/25'}`} />
      </div>
    </div>
  );
}

function Over({ result, deck, dir, onAgain, onSetup }) {
  const font = fontOf(deck);
  return (
    <main className="mx-auto max-w-xl px-4 py-12 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-seal">Game over</p>
      <div className="mt-3 text-7xl font-semibold tabular-nums tracking-tight">{result.score}</div>
      <p className="mt-2 text-sm text-muted">{result.newBest ? 'New best!' : `Best: ${result.best}`} · {deck.title} · {dir === 'forward' ? 'character → reading' : 'reading → character'}</p>

      <div className="mt-8 grid grid-cols-3 gap-3">
        {[['Destroyed', result.kills], ['Level', result.level], ['Best combo', result.bestCombo]].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.03] py-4">
            <div className="text-2xl font-semibold tabular-nums">{v}</div>
            <div className="text-xs text-muted">{k}</div>
          </div>
        ))}
      </div>

      {result.missed.length > 0 && (
        <div className="mt-8 text-left">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">These got through</h2>
          <div className="flex flex-wrap gap-2">
            {result.missed.map((c) => (
              <span key={c.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <span className={`${font} mr-2 text-xl font-bold`} lang={langAttr(deck)}>{c.glyph}</span><span className="text-sm text-muted">{c.answer}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <button onClick={onAgain} className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black hover:bg-white/90">Play again</button>
        <button onClick={onSetup} className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold hover:bg-white/5">Change setup</button>
        <a href={`#/d/${deck.id}`} className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold hover:bg-white/5">Study {deck.title}</a>
      </div>
    </main>
  );
}
