import { useEffect, useRef, useState } from 'react';
import { HINT, SIDES, WRONG_POINTS, buildQueue, cmPer360, hintFor, hitPoints, pickOptions, requeue, saveBest } from './logic.js';

// The Word Range run: loads the 3D engine (three.js, only now), runs the words of one chapter, draws the HUD.
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

const clock = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const Panel = ({ children }) => <div className="absolute inset-0 grid place-items-center bg-black/55 p-6 backdrop-blur-[2px]">{children}</div>;
const Say = ({ side, className = '', children }) => <span lang={LANG[side]} className={`${FONT[side] || ''} ${className}`}>{children}</span>;

export default function Game({ run, onAgain, onExit }) {
  const canvas = useRef(null);
  const eng = useRef(null);
  const st = useRef(null); // the round: queue, current prompt, score… (mutable, read by the engine callbacks)
  const [phase, setPhase] = useState('loading'); // loading | ready | play | paused | done | error
  const [, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);
  const [ammo, setAmmo] = useState({ n: MAG, reloading: false });
  const [pop, setPop] = useState(null);
  const [raw, setRaw] = useState(null);
  const [lockFailed, setLockFailed] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const { aim } = run;

  const finish = () => {
    const s = st.current;
    s.over = true;
    eng.current.spawn([]);
    eng.current.unlock();
    const acc = s.shots ? s.hits / s.shots : 0;
    const ms = s.times.length ? s.times.reduce((a, b) => a + b, 0) / s.times.length : 0;
    const prev = saveBest(run.bestKey, { score: s.score, acc, ms });
    setResult({ score: s.score, acc, ms, time: performance.now() - s.t0 - s.paused, missed: [...s.missed.values()], prev });
    setPhase('done');
  };

  const next = () => {
    const s = st.current;
    if (!s || s.over || !eng.current) return;
    if (!s.queue.length) { finish(); return; }
    const [item, ...rest] = s.queue;
    s.queue = rest;
    s.item = item;
    s.hadWrong = false;
    s.shown = performance.now();
    const options = pickOptions(item, run.words, aim.targets);
    eng.current.spawn(options.map((w, id) => ({ id, correct: w === item.word, face: face(w, item.to, item.from, run.hints), reveal: reveal(w, item) })));
    bump();
  };

  const handlers = useRef(null);
  handlers.current = {
    onShot: (hit) => {
      const s = st.current;
      if (!s?.item) return;
      s.shots++;
      if (hit?.correct) {
        const ms = performance.now() - s.shown;
        const pts = hitPoints(ms, s.hadWrong);
        s.score += pts;
        s.hits++;
        s.done++;
        s.times.push(ms);
        s.item = null;
        setPop({ text: `+${pts}`, good: true, key: s.shots });
        setTimeout(next, 140);
      } else if (hit) {
        s.score = Math.max(0, s.score - WRONG_POINTS);
        if (!s.hadWrong) { s.hadWrong = true; s.missed.set(s.item.word, s.item); s.queue = requeue(s.queue, s.item); }
        setPop({ text: `−${WRONG_POINTS}`, good: false, key: s.shots });
      }
      bump();
    },
    onLock: (locked, isRaw) => {
      setRaw(isRaw);
      const s = st.current;
      if (locked) {
        setLockFailed(false);
        if (!s) { // first lock starts the run
          st.current = { queue: buildQueue(run.words, run.pairs), item: null, done: 0, score: 0, shots: 0, hits: 0, times: [], missed: new Map(), t0: performance.now(), paused: 0, pauseAt: 0, over: false };
          setPhase('play');
          next();
          return;
        }
        if (s.pauseAt) { const d = performance.now() - s.pauseAt; s.paused += d; s.shown += d; s.pauseAt = 0; }
        setPhase('play');
      } else if (s && !s.over) {
        s.pauseAt = performance.now();
        setPhase('paused');
      }
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
          onLock: (l, r) => handlers.current.onLock(l, r),
          onAmmo: (n, r) => handlers.current.onAmmo(n, r),
          onLockError: () => handlers.current.onLockError(),
        });
        setPhase('ready');
      })
      .catch((e) => { if (!dead) { setError(e?.message || String(e)); setPhase('error'); } });
    return () => { dead = true; eng.current?.destroy(); eng.current = null; };
  }, [run]);

  useEffect(() => { // tick the HUD clock
    if (phase !== 'play') return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [phase]);

  const s = st.current;
  const item = s?.item;
  const left = s ? s.queue.length + (item ? 1 : 0) : 0;
  const elapsed = s ? (s.pauseAt || performance.now()) - s.t0 - s.paused : 0;
  const hint = item && run.hints ? hintFor(item.word, item.from, item.to) : null;
  const noRaw = raw === false || (raw === null && !chromium());
  const newBest = result && (!result.prev || result.score > result.prev.score);

  return (
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-[#090a10] text-ink">
      <canvas ref={canvas} className="block h-full w-full" />

      {(phase === 'play' || phase === 'paused') && s && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-5 top-4">
            <p className="text-sm font-semibold">{run.title}</p>
            <p className="text-xs tabular-nums text-white/60">{s.done} cleared · {left} left</p>
          </div>
          <div className="absolute right-5 top-4 text-right">
            <p className="text-2xl font-semibold tabular-nums">{s.score.toLocaleString()}</p>
            <p className="text-xs tabular-nums text-white/60">{clock(elapsed)} · {s.shots ? Math.round((s.hits / s.shots) * 100) : 100}% accuracy</p>
          </div>
          {item && (
            <div className="absolute inset-x-0 top-[5%] flex flex-col items-center px-4 text-center [text-shadow:0_2px_14px_rgb(0_0_0/0.7)]">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">{SIDE[item.from].label} → {SIDE[item.to].label}</span>
              <Say side={item.from} className="mt-1 text-5xl font-bold">{item.word[item.from]}</Say>
              {hint && <Say side={HINT[item.from]} className="mt-1 text-lg text-white/75">{hint}</Say>}
            </div>
          )}
          <div className="absolute bottom-5 right-6 text-right">
            <p className="text-3xl font-semibold tabular-nums">{aim.infinite ? '∞' : `${ammo.n} / ${MAG}`}</p>
            <p className="text-xs text-white/60">{ammo.reloading ? 'Reloading…' : aim.infinite ? 'Infinite ammo' : 'R to reload'}</p>
          </div>
          {phase === 'play' && <Crosshair c={aim.xhair} />}
          {phase === 'play' && pop && (
            <span key={pop.key} className={`range-pop absolute left-1/2 top-[calc(50%+20px)] text-lg font-bold ${pop.good ? 'text-jade' : 'text-seal'}`}>{pop.text}</span>
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
                {lockFailed ? 'Click again. The browser needs a moment after Esc.' : phase === 'ready' ? 'Shoot the disc that matches the word at the top.' : 'Click to resume'}
              </span>
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
            <p className={`text-sm ${newBest ? 'text-jade' : 'text-white/60'}`}>
              {!result.prev ? 'First run with this setup' : newBest ? `New best! (was ${result.prev.score.toLocaleString()})` : `Best: ${result.prev.score.toLocaleString()}`}
            </p>
            <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
              {[['Accuracy', `${Math.round(result.acc * 100)}%`], ['Avg to hit', `${Math.round(result.ms).toLocaleString()} ms`], ['Time', clock(result.time)]].map(([k, v]) => (
                <div key={k} className="rounded-2xl bg-white/[0.04] px-2 py-3">
                  <dt className="text-[11px] uppercase tracking-wider text-white/50">{k}</dt>
                  <dd className="mt-1 font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
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
