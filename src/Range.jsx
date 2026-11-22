import { useEffect, useState } from 'react';
import { ArrowLeftRight, Crosshair as CrosshairIcon, MousePointer2, Plus, Target, Volume2, X } from 'lucide-react';
import hsk1 from './data/range/hsk1.js';
import n5 from './data/range/n5.js';
import Game, { Boards, Crosshair } from './range/Game.jsx';
import { GAP, SIDES, STILL, cmPer360, fixTo, getBoards, pairAllowed, pairName, usable } from './range/logic.js';

// Word Range lobby: pick a level, a chapter, how words are shown (Show → Shoot) or a mix of pairs, and the aim
// settings, with the leaderboards in a rail down the right. Launch opens the 3D range (range/Game.jsx).
const LEVELS = [
  { id: 'hsk1', title: 'HSK 1', native: '汉语', lang: 'zh', font: 'font-zh', chapters: hsk1 },
  { id: 'n5', title: 'JLPT N5', native: '日本語', lang: 'ja', font: 'font-ja', chapters: n5 },
].map((l) => ({ ...l, words: l.chapters.reduce((n, c) => n + c.words.length, 0) }));
const LANG_NAME = { zh: 'Chinese', ja: 'Japanese' };
const SIDE = Object.fromEntries(SIDES.map((s) => [s.id, s]));
const FONT = { zh: 'font-zh', ja: 'font-ja', kana: 'font-ja' };
const LANG_ATTR = { zh: 'zh-Hans', ja: 'ja', kana: 'ja', vi: 'vi' };

// Aim settings. sens and dpi stay as typed (strings) so decimals type cleanly, and are parsed when used. Disc size and
// ammo aren't settings: every run has medium discs and ammo that never runs out.
const AIM = { sens: '1', dpi: '800', targets: 4, motion: 'still', volume: 0.6, xhair: { color: '#34d399', size: 4, gap: 1, thickness: 1, dot: false, outline: true } };
const COLORS = ['#34d399', '#22d3ee', '#facc15', '#ffffff', '#ff5f78'];
const num = (v, fallback, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(hi, Math.max(lo, n)) : fallback; };
const field = 'h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm tabular-nums text-ink outline-none transition focus:border-white/25';
// The crosshair preview: the range's gridded wall with a word disc, so you see the crosshair against both.
const WALL = {
  backgroundColor: '#0d0f16',
  backgroundImage: 'linear-gradient(rgb(255 255 255 / 0.05) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.05) 1px, transparent 1px)',
  backgroundSize: '16px 16px',
  backgroundPosition: 'center',
};
const DISC = { background: 'radial-gradient(circle at 36% 30%, #ff9cad, #d8385a 72%)' };

const KEY = 'moji.range';
const store = {
  get: () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } },
  set: (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage blocked: settings just won't stick */ } },
};
const initial = () => {
  const s = store.get();
  return {
    level: LEVELS.some((l) => l.id === s.level) ? s.level : 'hsk1',
    chapter: { hsk1: 0, n5: 0, ...s.chapter },
    from: SIDE[s.from] ? s.from : 'zh',
    to: SIDE[s.to] ? s.to : 'en',
    mix: Boolean(s.mix),
    pairs: Array.isArray(s.pairs) ? s.pairs.filter((p) => p.split('>').every((id) => SIDE[id])) : ['zh>ja', 'ja>en'],
    hints: s.hints ?? true,
    aim: { ...AIM, ...s.aim, xhair: { ...AIM.xhair, ...s.aim?.xhair } },
  };
};

const Heading = ({ children }) => <h2 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-muted">{children}</h2>;
const Say = ({ side, className = '', children }) => <span lang={LANG_ATTR[side]} className={`${FONT[side] || ''} ${className}`}>{children}</span>;
const card = (on) => `rounded-2xl border p-4 text-left transition ${on ? 'border-seal bg-seal/10' : 'border-white/10 bg-white/[0.03] hover:border-white/25'}`;
const chip = (on) => `rounded-full border px-3.5 py-1.5 text-sm transition disabled:pointer-events-none disabled:opacity-30 ${on ? 'border-seal bg-seal/10 text-ink' : 'border-white/10 text-muted hover:border-white/25 hover:text-ink'}`;
// One block of aim settings.
const Box = ({ icon, title, className = '', children }) => (
  <section className={`flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 ${className}`}>
    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted">{icon}{title}</h3>
    {children}
  </section>
);

export default function Range() {
  const [s, set] = useState(initial);
  const [run, setRun] = useState(null); // the game in progress, if any
  const [boards, setBoards] = useState(null); // the server's last reply: { board, chapter, total, mine }, or { off: true }
  useEffect(() => store.set(s), [s]);
  const update = (patch) => set((p) => ({ ...p, ...patch }));

  const level = LEVELS.find((l) => l.id === s.level);
  const ci = Math.min(s.chapter[s.level] ?? 0, level.chapters.length - 1);
  const chapter = level.chapters[ci];
  const board = `${s.level}.${ci}`;
  const playing = Boolean(run);
  useEffect(() => { // fetch this chapter's board, and again after a run
    if (playing) return undefined;
    let live = true;
    getBoards(board).then((b) => live && setBoards({ ...b, board }), () => live && setBoards({ off: true }));
    return () => { live = false; };
  }, [board, playing]);
  const mine = boards?.mine ?? {};
  const { from } = s;
  const to = fixTo(level.lang, from, s.to); // a saved pair may not suit this level (N5 needs Japanese on one side)
  const pair = `${from}>${to}`;
  const words = usable(chapter.words, from, to);
  const example = words[0];
  const okPairs = s.pairs.filter((p) => pairAllowed(level.lang, ...p.split('>')));
  const mixOn = s.mix && okPairs.length >= 2;
  const pairs = mixOn ? okPairs.map((p) => p.split('>')) : [[from, to]];
  const playable = chapter.words.filter((w) => pairs.some(([a, b]) => usable([w], a, b).length)).length;
  const fine = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(any-pointer: fine)').matches); // a mouse
  const aim = { ...s.aim, sens: num(s.aim.sens, 1, 0.01, 20), dpi: num(s.aim.dpi, 800, 50, 64000) };
  const setAim = (patch) => update({ aim: { ...s.aim, ...patch } });
  const setX = (patch) => setAim({ xhair: { ...s.aim.xhair, ...patch } });
  const launch = () => setRun({ id: Date.now(), title: `${level.title} · ${chapter.title}`, words: chapter.words, pairs, hints: s.hints, aim, board, mode: mixOn ? 'mix' : pair });

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_min(25vw,30rem)] xl:items-start xl:gap-8">
      <div className="mx-auto max-w-3xl xl:max-w-none">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-seal to-[#ff9a5c]"><CrosshairIcon size={22} /></span>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Word Range</h1>
            <p className="text-sm text-muted">One-minute rounds: shoot the matching word before its disc shrinks away.</p>
          </div>
        </div>

        <Heading>Level</Heading>
        <div className="grid grid-cols-2 gap-3">
          {LEVELS.map((l) => (
            <button key={l.id} onClick={() => update({ level: l.id, to: fixTo(l.lang, from, to) })} aria-pressed={s.level === l.id} className={card(s.level === l.id)}>
              <span lang={l.lang === 'zh' ? 'zh-Hans' : 'ja'} className={`${l.font} block text-2xl font-bold`}>{l.native}</span>
              <span className="mt-1 block font-medium">{l.title}</span>
              <span className="text-xs tabular-nums text-muted">{l.words} words · {l.chapters.length} chapters</span>
            </button>
          ))}
        </div>

        <Heading>Chapter</Heading>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {level.chapters.map((c, i) => (
            <button key={c.title} onClick={() => update({ chapter: { ...s.chapter, [s.level]: i } })} aria-pressed={i === ci}
              className={`rounded-xl border px-3 py-2 text-left transition ${i === ci ? 'border-seal bg-seal/10' : 'border-white/10 bg-white/[0.02] hover:border-white/25'}`}>
              <span className="block text-[11px] tabular-nums text-muted">Chapter {i + 1} · {mine[`${s.level}.${i}`] ? `best ${mine[`${s.level}.${i}`].toLocaleString()}` : `${c.words.length} words`}</span>
              <span className="block truncate text-sm font-medium">{c.title}</span>
            </button>
          ))}
        </div>

        <Heading>Show → Shoot</Heading>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          {[['Show', from, (id) => update({ from: id, to: fixTo(level.lang, id, to) }), () => true],
            ['Shoot', to, (id) => update({ to: id }), (id) => pairAllowed(level.lang, from, id)]].map(([name, value, pick, ok]) => (
            <div key={name} role="group" aria-label={name} className="flex flex-col gap-2 py-1.5 sm:flex-row sm:items-center">
              <span className="w-14 shrink-0 text-xs font-semibold uppercase tracking-wider text-muted">{name}</span>
              <div className="flex flex-wrap gap-2">
                {SIDES.map((x) => (
                  <button key={x.id} onClick={() => pick(x.id)} disabled={!ok(x.id)} aria-pressed={value === x.id} className={chip(value === x.id)}>
                    <Say side={x.id === 'zh' || x.id === 'ja' ? x.id : 'en'}>{x.label}</Say>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-4">
            <button onClick={() => update({ from: to, to: from })} aria-label="Swap show and shoot" title="Swap"
              className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-muted transition hover:border-white/25 hover:text-ink"><ArrowLeftRight size={16} /></button>
            {example
              ? <span className="text-lg font-semibold"><Say side={from}>{example[from]}</Say> <span className="text-muted">→</span> <Say side={to}>{example[to]}</Say></span>
              : <span className="text-sm text-muted">No words in this chapter work for this pair.</span>}
            <span className="ml-auto text-xs tabular-nums text-muted">{words.length} of {chapter.words.length} words work for this pair</span>
          </div>
          <p className="mt-2 text-xs text-muted/70">One side has to be {LANG_NAME[level.lang]} for {level.title}.</p>
        </div>

        <Heading>Mix</Heading>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={s.mix} onChange={(e) => update({ mix: e.target.checked })} className="h-4 w-4 accent-[#ff5f78]" />
            Switch to a random pair from this list on every prompt
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            {s.pairs.map((p) => {
              const ok = okPairs.includes(p);
              return (
                <span key={p} title={ok ? undefined : `Needs ${LANG_NAME[level.lang]} on one side`}
                  className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-3 pr-1.5 text-sm ${ok ? 'border-white/15' : 'border-white/5 text-muted/50 line-through'}`}>
                  {pairName(p)}
                  <button onClick={() => update({ pairs: s.pairs.filter((x) => x !== p) })} aria-label={`Remove ${pairName(p)}`}
                    className="grid h-5 w-5 place-items-center rounded-full text-muted hover:bg-white/10 hover:text-ink"><X size={12} /></button>
                </span>
              );
            })}
            <button onClick={() => update({ pairs: [...s.pairs, pair] })} disabled={s.pairs.includes(pair)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-white/20 px-3 py-1 text-sm text-muted transition hover:text-ink disabled:opacity-40">
              <Plus size={13} />Add {pairName(pair)}
            </button>
          </div>
          {s.mix && okPairs.length < 2 && <p className="mt-2 text-xs text-seal">Add at least two pairs that work for {level.title} to mix.</p>}
        </div>

        <label className="mt-6 flex items-center gap-3 text-sm">
          <input type="checkbox" checked={s.hints} onChange={(e) => update({ hints: e.target.checked })} className="h-4 w-4 accent-[#ff5f78]" />
          Show pinyin / kana under words (hidden when it would give the answer away)
        </label>

        <Heading>Aim</Heading>
        <div className="grid gap-3 md:grid-cols-2">
          <Box icon={<MousePointer2 size={14} aria-hidden />} title="Mouse">
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5 text-xs text-muted">CS2 sensitivity
                <input type="number" inputMode="decimal" min="0.01" max="20" step="0.01" value={s.aim.sens} onChange={(e) => setAim({ sens: e.target.value })} className={field} />
              </label>
              <label className="grid gap-1.5 text-xs text-muted">Mouse DPI
                <input type="number" inputMode="numeric" min="50" max="64000" step="50" value={s.aim.dpi} onChange={(e) => setAim({ dpi: e.target.value })} className={field} />
              </label>
            </div>
            <div className="flex items-end justify-between gap-3 rounded-xl bg-black/25 px-4 py-3">
              <p className="leading-none"><span className="text-3xl font-semibold tabular-nums tracking-tight">{cmPer360(aim.sens, aim.dpi).toFixed(1)}</span><span className="ml-1.5 text-sm text-muted">cm per 360°</span></p>
              <p className="text-xs tabular-nums text-muted">eDPI {Math.round(aim.sens * aim.dpi).toLocaleString()}</p>
            </div>
            <p className="text-xs leading-relaxed text-muted/80">
              Same sensitivity and DPI as CS2 means the same turn per centimetre, with CS2&apos;s field of view. Chrome and Edge read raw mouse input like CS2;
              in other browsers turn off Windows &quot;Enhance pointer precision&quot;. Flick to the red 180° stripe behind you to check.
            </p>
          </Box>
          <Box icon={<Target size={14} aria-hidden />} title="Targets">
            {[['Count', 'targets', [[3, '3'], [4, '4'], [5, '5'], [6, '6']]], ['Movement', 'motion', [['still', 'Still', `×${STILL}`], ['drift', 'Drifting', '×1']]]].map(([name, k, opts]) => (
              <div key={k} role="group" aria-label={name} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted">{name}</span>
                <div className="inline-flex rounded-xl border border-white/10 bg-black/20 p-1">
                  {opts.map(([v, label, note]) => (
                    <button key={v} onClick={() => setAim({ [k]: v })} aria-pressed={s.aim[k] === v}
                      className={`rounded-lg px-3 py-1.5 text-sm transition ${s.aim[k] === v ? 'bg-white/10 text-ink' : 'text-muted hover:text-ink'}`}>
                      {label}{note && <span className="ml-1.5 text-[11px] tabular-nums opacity-60">{note}</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-xs leading-relaxed text-muted/80">
              Drifting discs score full points, still ones {Math.round(STILL * 100)}%. Every run has medium discs and ammo that never runs out.
            </p>
            <label className="mt-auto flex items-center gap-3 border-t border-white/[0.06] pt-4">
              <Volume2 size={16} aria-hidden className="shrink-0 text-muted" />
              <span className="sr-only">Volume</span>
              <input type="range" min="0" max="1" step="0.05" value={s.aim.volume} onChange={(e) => setAim({ volume: Number(e.target.value) })} className="min-w-0 flex-1 accent-[#ff5f78]" />
              <span className="w-9 text-right text-xs tabular-nums text-muted">{Math.round(s.aim.volume * 100)}%</span>
            </label>
          </Box>
          <Box icon={<CrosshairIcon size={14} aria-hidden />} title="Crosshair" className="md:col-span-2">
            <div className="grid gap-4 sm:grid-cols-[13rem_minmax(0,1fr)] sm:items-center">
              <div className="relative h-40 overflow-hidden rounded-xl border border-white/10" style={WALL}>
                <span aria-hidden className="absolute left-[calc(50%-1.25rem)] top-1/2 h-24 w-24 -translate-y-1/2 rounded-full ring-2 ring-white/80" style={DISC} />
                <Crosshair c={s.aim.xhair} />
              </div>
              <div className="grid gap-3 text-sm">
                <div role="group" aria-label="Crosshair colour" className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-xs text-muted">Colour</span>
                  {COLORS.map((c) => (
                    <button key={c} onClick={() => setX({ color: c })} aria-label={`Colour ${c}`} aria-pressed={s.aim.xhair.color === c}
                      className={`h-6 w-6 rounded-full border-2 transition ${s.aim.xhair.color === c ? 'border-white' : 'border-transparent hover:border-white/40'}`} style={{ background: c }} />
                  ))}
                </div>
                {[['Length', 'size', 1, 10], ['Gap', 'gap', -3, 6], ['Thickness', 'thickness', 0.5, 3]].map(([name, k, min, max]) => (
                  <label key={k} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-xs text-muted">{name}</span>
                    <input type="range" min={min} max={max} step="0.5" value={s.aim.xhair[k]} onChange={(e) => setX({ [k]: Number(e.target.value) })} className="min-w-0 flex-1 accent-[#ff5f78]" />
                    <span className="w-8 text-right text-xs tabular-nums text-muted">{s.aim.xhair[k]}</span>
                  </label>
                ))}
                <div className="flex gap-2 pl-[5.5rem]">
                  {[['dot', 'Centre dot'], ['outline', 'Outline']].map(([k, label]) => (
                    <button key={k} onClick={() => setX({ [k]: !s.aim.xhair[k] })} aria-pressed={s.aim.xhair[k]} className={chip(s.aim.xhair[k])}>{label}</button>
                  ))}
                </div>
              </div>
            </div>
          </Box>
        </div>

        <button onClick={launch} disabled={!fine || playable <= GAP}
          className="mt-10 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-white text-base font-semibold text-black transition hover:bg-white/90 disabled:opacity-40">
          <CrosshairIcon size={18} />Launch
        </button>
        <p className="mt-3 text-center text-xs text-muted">
          {!fine ? 'Word Range needs a mouse and keyboard.' : playable <= GAP ? `Needs at least ${GAP + 1} words that work for this pair.` : `1 minute · ${playable} words · Esc pauses`}
        </p>
        <p className="mt-8 text-center text-[11px] leading-relaxed text-muted/60">
          HSK 1: HSK 3.0 syllabus (2025). N5 word list: Jonathan Waller, tanos.co.uk (CC BY).
        </p>
        {run && <Game key={run.id} run={run} onAgain={() => setRun({ ...run, id: Date.now() })} onExit={() => setRun(null)} />}
      </div>

      {/* A quarter of the screen down the right, full height, staying put while the lobby scrolls (below it on narrower screens). */}
      <aside aria-label="Leaderboards" className="mx-auto mt-12 max-w-3xl rounded-3xl border border-white/[0.06] bg-card/60 p-5 xl:sticky xl:top-6 xl:mt-0 xl:h-[calc(100vh-3rem)] xl:max-w-none xl:overflow-y-auto xl:pb-20">
        <Boards title={`${level.title} · ${chapter.title}`} chapter={boards?.off ? null : boards?.board === board ? boards.chapter : undefined} total={boards?.off ? null : boards?.total} />
      </aside>
    </div>
  );
}
