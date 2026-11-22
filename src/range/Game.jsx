import { useEffect, useRef, useState } from 'react';
import { HINT, PENALTY, RUN_MS, SIDES, buildQueue, cmPer360, getBoards, hintFor, hitPoints, nextPrompt, pairName, pickOptions, postScore } from './logic.js';

// The Word Range run: loads the 3D engine (three.js, only now), deals one chapter's words for a minute, draws the HUD.
const SIDE = Object.fromEntries(SIDES.map((s) => [s.id, s]));
const FONT = { zh: 'font-zh', ja: 'font-ja', kana: 'font-ja' };
const LANG = { zh: 'zh-Hans', ja: 'ja', kana: 'ja', vi: 'vi' };
const MAG = 12;
const chromium = () => Boolean(navigator.userAgentData?.brands?.some((b) => /Chromium/.test(b.brand)));

// A disc shows the word on the shoot side, plus its reading when that doesn't give the answer away.
const face = (w, side, other, hints) => {
  const hint = hints ? hintFor(w, side, other) : null;
  return { text: w[side], side, sub: hint && { text: hint, side: HINT[side] } };
};
// A wrong disc then reveals what it was in the prompt's language.
const reveal = (w, { from, to }) => ({ text: w[from] || w.en, side: w[from] ? from : 'en', sub: { text: w[to], side: to } });

// Canvas text can't wait for web fonts, so load every glyph the discs will need before the run starts.
const loadFonts = (words) => {
  if (!document.fonts?.load) return Promise.resolve();
  const text = (sides) => words.flatMap((w) => sides.map((s) => w[s] || '')).join('') || 'a';
  const sets = [['"Noto Serif SC"', text(['zh'])], ['"Noto Serif JP"', text(['ja', 'kana'])], ['Inter', text(['pinyin', 'en', 'vi'])]];
  return Promise.all(sets.flatMap(([fam, t]) => [700, 500].map((wt) => document.fonts.load(`${wt} 64px ${fam}`, t)))).catch(() => {});
};

// CS2-style crosshair: four bars around a gap, optional centre dot and black outline.
export function Crosshair({ c }) {
  const len = Math.round(c.size * 2);
  const th = Math.max(1, Math.round(c.thickness * 2));
  const gap = Math.round(c.gap + 3);
  const o = -Math.floor(th / 2);
  const bar = (key, style) => <span key={key} className="absolute" style={{ background: c.color, outline: c.outline ? '1px solid #000' : 'none', ...style }} />;
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0">
      {bar('r', { left: gap, top: o, width: len, height: th })}
      {bar('l', { left: -gap - len, top: o, width: len, height: th })}
      {bar('d', { top: gap, left: o, width: th, height: len })}
      {bar('u', { top: -gap - len, left: o, width: th, height: len })}
      {c.dot && bar('dot', { left: o, top: o, width: th, height: th })}
    </div>
  );
}

// A leaderboard: the top 10 (ties share a rank) with your row highlighted, and your row underneath when you're further
// down. rows: undefined while loading, null when the server can't be reached.
export function Leaderboard({ rows, empty, modes = false }) {
  const note = (text) => <p className="py-4 text-center text-sm text-white/50">{text}</p>;
  if (rows === undefined) return note('Loading…');
  if (rows === null) return note('Leaderboard unavailable right now.');
  if (!rows.length) return note(empty);
  return (
    <ol className="grid gap-1">
      {rows.map((r, i) => (
        <li key={i} className={`flex items-center gap-3 rounded-xl px-3 py-1.5 ${r.me ? 'bg-seal/15 ring-1 ring-inset ring-seal/40' : 'bg-white/[0.03]'} ${r.rank > 10 ? 'mt-2' : ''}`}>
          <span className="w-5 shrink-0 text-right text-xs tabular-nums text-white/50">{r.rank}</span>
          {r.picture
            ? <img src={r.picture} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-6 w-6 shrink-0 rounded-full" />
            : <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-seal text-[10px] font-bold text-white">{(r.name || '?')[0].toUpperCase()}</span>}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{r.name || 'Player'}{r.me && <span className="text-white/50"> · you</span>}</span>
            {modes && r.mode && <span className="block truncate text-[11px] text-white/45">{pairName(r.mode)}</span>}
          </span>
          <span className="text-sm font-semibold tabular-nums">{r.score.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}

// Time left, rounded up so the last second still reads 0:01.
const clock = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
// Blurred enough that Esc can't be used to study the discs.
const Panel = ({ children }) => <div className="absolute inset-0 grid place-items-center bg-black/60 p-6 backdrop-blur-md">{children}</div>;
const Say = ({ side, className = '', children }) => <span lang={LANG[side]} className={`${FONT[side] || ''} ${className}`}>{children}</span>;

export default function Game({ run, onAgain, onExit }) {
  const canvas = useRef(null);
  const eng = useRef(null);
  const st = useRef(null); // the run: queue, current prompt, score… (mutable, read by the engine callbacks)
  const [phase, setPhase] = useState('loading'); // loading | ready | play | paused | done | error
  const [, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);
  const [ammo, setAmmo] = useState({ n: MAG, reloading: false });
  const [pop, setPop] = useState(null);
  const [raw, setRaw] = useState(null);
  const [lockFailed, setLockFailed] = useState(false);
  const [result, setResult] = useState(null);
  const [board, setBoard] = useState(); // the server's reply after the run: undefined while saving, null if unreachable
  const [error, setError] = useState('');
  const { aim } = run;
  const played = () => eng.current.time() - st.current.start; // ms of play so far (Esc stops the engine's clock)

  const finish = () => {
    const s = st.current;
    if (s.over) return;
    s.over = true;
    eng.current.spawn([]);
    eng.current.unlock();
    const acc = s.shots ? s.hits / s.shots : 0;
    const ms = s.times.length ? s.times.reduce((a, b) => a + b, 0) / s.times.length : 0;
    setResult({ score: s.score, acc, ms, cleared: s.cleared, missed: [...s.missed.values()] });
    setPhase('done');
    // The server keeps each player's best per chapter; a run without points just reads the board.
    (s.score > 0 ? postScore(run.board, s.score, run.mode) : getBoards(run.board)).then(setBoard, () => setBoard(null));
  };

  const next = () => {
    const s = st.current;
    if (!s || s.over || !eng.current) return;
    const { item, queue } = nextPrompt(s.queue, s.recent, () => buildQueue(run.words, run.pairs));
    s.queue = queue;
    if (!item) { finish(); return; } // only with fewer than GAP + 1 words, which the lobby won't launch
    s.recent.push(item.word);
    Object.assign(s, { item, late: null, miss: false });
    const options = pickOptions(item, run.words, aim.targets);
    eng.current.spawn(options.map((w, id) => ({ id, correct: w === item.word, face: face(w, item.to, item.from, run.hints), reveal: reveal(w, item) })));
    bump();
  };

  // The first miss on a prompt lists the word and puts it first in line, so it's back once GAP others have passed.
  const flag = (s) => {
    if (s.miss) return;
    s.miss = true;
    s.missed.set(s.item.word, s.item);
    s.queue = [s.item, ...s.queue];
  };

  const handlers = useRef(null);
  handlers.current = {
    onShot: (hit) => {
      const s = st.current;
      if (!s?.item || s.over) return;
      if (played() >= RUN_MS) { finish(); return; } // the buzzer beat this click
      s.shots++;
      if (hit?.correct) {
        const pts = hitPoints(hit.ms, s.miss);
        s.score += pts;
        s.hits++;
        s.cleared++;
        s.times.push(hit.ms);
        s.item = null;
        setPop({ text: `+${pts}`, good: true, key: performance.now() });
        setTimeout(next, 140);
      } else if (hit) {
        s.score = Math.max(0, s.score - PENALTY);
        flag(s);
        setPop({ text: `−${PENALTY}`, good: false, key: performance.now() });
      }
      bump();
    },
    onExpire: () => { // the discs shrank away: points off, the answer shows for a moment, then the next word
      const s = st.current;
      if (!s?.item || s.over) return;
      s.score = Math.max(0, s.score - PENALTY);
      flag(s);
      s.late = s.item;
      s.item = null;
      setPop({ text: `Too slow −${PENALTY}`, good: false, key: performance.now() });
      setTimeout(next, 900);
      bump();
    },
    onTick: () => {
      const s = st.current;
      if (s && !s.over && played() >= RUN_MS) finish();
      else bump();
    },
    onLock: (locked, isRaw) => {
      setRaw(isRaw);
      const s = st.current;
      if (locked) {
        setLockFailed(false);
        setPhase('play');
        if (!s) { // the first lock starts the run
          st.current = { queue: [], recent: [], item: null, late: null, miss: false, cleared: 0, score: 0, shots: 0, hits: 0, times: [], missed: new Map(), start: eng.current.time(), over: false };
          next();
        }
      } else if (s && !s.over) setPhase('paused');
    },
    onAmmo: (n, reloading) => setAmmo({ n, reloading }),
    onLockError: () => setLockFailed(true),
  };

  useEffect(() => {
    let dead = false;
    Promise.all([import('./engine.js'), loadFonts(run.words)])
      .then(([{ createRange }]) => {
        if (dead) return;
        eng.current = createRange(canvas.current, run.aim, {
          onShot: (h) => handlers.current.onShot(h),
          onExpire: () => handlers.current.onExpire(),
          onLock: (l, r) => handlers.current.onLock(l, r),
          onAmmo: (n, r) => handlers.current.onAmmo(n, r),
          onLockError: () => handlers.current.onLockError(),
        });
        setPhase('ready');
      })
      .catch((e) => { if (!dead) { setError(e?.message || String(e)); setPhase('error'); } });
    return () => { dead = true; eng.current?.destroy(); eng.current = null; };
  }, [run]);

  useEffect(() => { // the HUD clock, and the buzzer at one minute
    if (phase !== 'play') return undefined;
    const id = setInterval(() => handlers.current.onTick(), 100);
    return () => clearInterval(id);
  }, [phase]);

  const s = st.current;
  const shown = s?.item || s?.late; // the prompt, or the one that just ran out (shown with its answer)
  const left = s && eng.current ? Math.max(0, RUN_MS - played()) : RUN_MS;
  const hint = s?.item && run.hints ? hintFor(s.item.word, s.item.from, s.item.to) : null;
  const noRaw = raw === false || (raw === null && !chromium());
  const newBest = result?.score > 0 && board && (board.prev == null || result.score > board.prev);
  const me = board?.total?.find((r) => r.me);
  const verdict = () => {
    if (!result.score) return 'No points this time.';
    if (board === undefined) return 'Saving…';
    if (board === null) return 'Couldn’t reach the leaderboard, so this score wasn’t saved.';
    if (board.prev == null) return 'First score on this chapter';
    return newBest ? `New best! (was ${board.prev.toLocaleString()})` : `Your best: ${board.prev.toLocaleString()}`;
  };

  return (
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-[#090a10] text-ink">
      <canvas ref={canvas} className="block h-full w-full" />

      {(phase === 'play' || phase === 'paused') && s && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-5 top-4">
            <p className="text-sm font-semibold">{run.title}</p>
            <p className="text-xs tabular-nums text-white/60">{s.cleared} cleared</p>
          </div>
          <div className="absolute right-5 top-4 text-right">
            <p className="text-2xl font-semibold tabular-nums">{s.score.toLocaleString()}</p>
            <p className={`text-lg font-semibold tabular-nums ${left <= 10_000 ? 'text-seal' : ''}`}>{clock(left)}</p>
            <p className="text-xs tabular-nums text-white/60">{s.shots ? Math.round((s.hits / s.shots) * 100) : 100}% accuracy</p>
          </div>
          {phase === 'play' && shown && (
            <div className="absolute inset-x-0 top-[5%] flex flex-col items-center px-4 text-center [text-shadow:0_2px_14px_rgb(0_0_0/0.7)]">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">{SIDE[shown.from].label} → {SIDE[shown.to].label}</span>
              <Say side={shown.from} className="mt-1 text-5xl font-bold">{shown.word[shown.from]}</Say>
              {s.late
                ? <Say side={shown.to} className="mt-2 text-2xl font-semibold text-seal">{shown.word[shown.to]}</Say>
                : hint && <Say side={HINT[shown.from]} className="mt-1 text-lg text-white/75">{hint}</Say>}
            </div>
          )}
          <div className="absolute bottom-5 right-6 text-right">
            <p className="text-3xl font-semibold tabular-nums">{aim.infinite ? '∞' : `${ammo.n} / ${MAG}`}</p>
            <p className="text-xs text-white/60">{ammo.reloading ? 'Reloading…' : aim.infinite ? 'Infinite ammo' : 'R to reload'}</p>
          </div>
          {phase === 'play' && <Crosshair c={aim.xhair} />}
          {phase === 'play' && pop && (
            <span key={pop.key} className={`range-pop absolute left-1/2 top-[calc(50%+20px)] whitespace-nowrap text-lg font-bold ${pop.good ? 'text-jade' : 'text-seal'}`}>{pop.text}</span>
          )}
        </div>
      )}

      {phase === 'loading' && <Panel><p className="text-sm text-white/70">Loading the range…</p></Panel>}

      {(phase === 'ready' || phase === 'paused') && (
        <Panel>
          <div className="w-full max-w-sm text-center">
            <button onClick={() => eng.current?.lock()} className="w-full rounded-3xl border border-white/10 bg-[#141416] px-6 py-8 transition hover:border-white/25">
              <span className="block text-2xl font-semibold">{phase === 'ready' ? 'Click to start' : 'Paused'}</span>
              <span className="mt-1 block text-sm text-white/60">
                {lockFailed ? 'Click again. The browser needs a moment after Esc.' : phase === 'ready' ? 'Shoot the disc that matches the word at the top.' : 'Click to resume. The clock is stopped.'}
              </span>
              {phase === 'ready' && (
                <span className="mt-3 block text-xs leading-relaxed text-white/60">
                  You have 1 minute. Discs shrink as time passes: hit the right one fast for up to 100. A wrong word or a disc you let vanish costs {PENALTY}.
                </span>
              )}
              <span className="mt-4 block text-xs text-white/45">
                Esc pauses · R reloads · CS2 sens {aim.sens} at {aim.dpi} DPI = {cmPer360(aim.sens, aim.dpi).toFixed(1)} cm/360°
              </span>
            </button>
            {noRaw && (
              <p className="mt-3 text-xs leading-relaxed text-white/55">
                This browser can&apos;t read raw mouse input, so Windows mouse settings apply. Turn off &quot;Enhance pointer precision&quot; to match CS2, or use Chrome or Edge.
              </p>
            )}
            <button onClick={onExit} className="mt-4 text-sm text-white/60 transition hover:text-white">Quit to lobby</button>
          </div>
        </Panel>
      )}

      {phase === 'error' && (
        <Panel>
          <div className="max-w-sm rounded-3xl border border-white/10 bg-[#141416] p-6 text-center">
            <p className="text-lg font-semibold">The range couldn&apos;t start</p>
            <p className="mt-1 text-sm text-white/60">It needs WebGL, which this browser or device didn&apos;t allow. ({error})</p>
            <button onClick={onExit} className="mt-5 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black">Back to lobby</button>
          </div>
        </Panel>
      )}

      {phase === 'done' && result && (
        <Panel>
          <div className="max-h-full w-full max-w-md overflow-y-auto rounded-3xl border border-white/10 bg-[#141416] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">{run.title}</p>
            <p className="mt-1 text-4xl font-semibold tabular-nums">{result.score.toLocaleString()}</p>
            <p className={`text-sm ${newBest ? 'text-jade' : 'text-white/60'}`}>{verdict()}</p>
            <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
              {[['Words', result.cleared], ['Accuracy', `${Math.round(result.acc * 100)}%`], ['Avg to hit', `${Math.round(result.ms).toLocaleString()} ms`]].map(([k, v]) => (
                <div key={k} className="rounded-2xl bg-white/[0.04] px-2 py-3">
                  <dt className="text-[11px] uppercase tracking-wider text-white/50">{k}</dt>
                  <dd className="mt-1 font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-white/50">Chapter leaderboard</h3>
            <Leaderboard rows={board === null ? null : board?.chapter} modes empty="No scores on this chapter yet." />
            {me && <p className="mt-2 text-xs tabular-nums text-white/60">Your total across all chapters: {me.score.toLocaleString()} · #{me.rank}</p>}
            {result.missed.length > 0 && (
              <>
                <h3 className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-white/50">Words you missed</h3>
                <ul className="mt-2 grid gap-1.5">
                  {result.missed.map((m) => (
                    <li key={m.word[m.from]} className="flex items-baseline justify-between gap-3 rounded-xl bg-white/[0.04] px-3 py-2">
                      <Say side={m.from} className="font-semibold">{m.word[m.from]}</Say>
                      <Say side={m.to} className="text-right text-sm text-white/70">{m.word[m.to]}</Say>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="mt-6 flex gap-3">
              <button onClick={onAgain} className="flex-1 rounded-full bg-white py-3 text-sm font-semibold text-black transition hover:bg-white/90">Play again</button>
              <button onClick={onExit} className="flex-1 rounded-full border border-white/15 py-3 text-sm font-semibold transition hover:bg-white/5">Lobby</button>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
