import { useState } from 'react';
import { ArrowRight, Crosshair, Layers, LayoutDashboard, LayoutGrid, Rocket, Search as SearchIcon, ShieldCheck } from 'lucide-react';
import { DECKS, LANGS, fontOf, gradient, langAttr } from './decks';
import { norm } from './asteroids-logic.js';
import { UserMenu } from './account';
import Chat from './Chat';

// Every card once, under the first deck that lists it (Kana mix only repeats hiragana + katakana).
const seen = new Set();
const SCRIPTS = DECKS.map((deck) => ({ deck, cards: deck.cards.filter((c) => !seen.has(c.id) && seen.add(c.id)) }))
  .filter((s) => s.cards.length);
const TOTAL = SCRIPTS.reduce((n, s) => n + s.cards.length, 0);
const ENTRIES = SCRIPTS.flatMap(({ deck, cards }) => cards.map((card) => ({ deck, card })));
const count = (cards, known) => cards.filter((c) => known.has(c.id)).length;
const pct = (n, d) => Math.round((n / d) * 100);

// Lookup: the glyph itself (or a radical variant / example hanzi), or a reading or meaning by prefix: "ka" → か カ, "ren" or "person" → 人.
const matches = (c, t) => [c.glyph, ...(c.glyphAlt || ''), ...(c.examples || [])].includes(t)
  || [c.answer, ...(c.answerSub || '').split(/[·,]/)].some((w) => norm(w).startsWith(t));

const Logo = () => (
  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-seal to-[#ff9a5c] font-ja text-base font-bold text-white">文</span>
);

export const Emblem = ({ deck, className = '' }) => (
  <span aria-hidden lang={langAttr(deck)} style={{ background: gradient(deck) }}
    className={`${fontOf(deck)} grid shrink-0 place-items-center font-bold text-white ${className}`}>{deck.emblem}</span>
);

export const Panel = ({ title, className = '', style, children }) => (
  <section style={style} className={`rounded-3xl border border-white/[0.06] bg-card/60 p-5 ${className}`}>
    {title && <h2 className="mb-4 text-sm font-semibold">{title}</h2>}
    {children}
  </section>
);

// Frame for every signed-in page: sidebar (a scrolling strip on phones), top bar with lookup + account, then the page.
export function Shell({ here, account, known, lesson, children }) {
  const { user } = account;
  const link = (href, id, label, lead, tail) => (
    <a key={id} href={href} aria-current={here === id ? 'page' : undefined}
      className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${here === id ? 'bg-white/[0.08] text-ink' : 'text-muted hover:bg-white/[0.04] hover:text-ink'}`}>
      {lead}<span className="truncate">{label}</span>{tail}
    </a>
  );
  const group = (title) => <p className="hidden px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted/60 lg:block">{title}</p>;

  return (
    <>
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[16rem_minmax(0,1fr)] lg:grid-rows-[5.75rem_1fr]">
        {/* The top bar stays put while the page scrolls. A sticky grid item can't leave its own grid area, so on wide
            screens it spans both rows of its column, and row 1 is exactly its height (py-6 + the h-11 search box). */}
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-paper/80 px-4 py-4 backdrop-blur-md sm:px-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mx-auto lg:w-full lg:max-w-6xl lg:self-start lg:px-8 lg:py-6">
          <a href="#/" aria-label="Moji dashboard" className="lg:hidden"><Logo /></a>
          <Search />
          {user && <div className="ml-auto shrink-0"><UserMenu account={account} /></div>}
        </header>

        <aside className="border-y border-white/[0.06] lg:sticky lg:top-0 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:h-screen lg:overflow-y-auto lg:border-y-0 lg:border-r lg:bg-white/[0.015]">
          <a href="#/" className="hidden items-center gap-2.5 px-6 pt-6 text-lg font-semibold tracking-tight lg:flex"><Logo />Moji</a>
          <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none] lg:flex-col lg:py-5">
            {link('#/', 'home', 'Dashboard', <LayoutDashboard size={18} className="shrink-0" />)}
            {group('Decks')}
            {DECKS.map((d) => link(`#/d/${d.id}`, d.id, d.title, <Emblem deck={d} className="h-6 w-6 rounded-md text-[11px]" />,
              <span className="ml-auto hidden pl-2 text-xs tabular-nums text-muted lg:block">{pct(count(d.cards, known), d.cards.length)}%</span>))}
            {group('Practice')}
            {link('#/play', 'play', 'Asteroid Shooter', <Rocket size={18} className="shrink-0" />)}
            {link('#/range', 'range', 'Word Range', <Crosshair size={18} className="shrink-0" />)}
            {user?.isAdmin && group('Admin')}
            {user?.isAdmin && link('#/admin', 'admin', 'Manage access', <ShieldCheck size={18} className="shrink-0" />,
              user.pendingCount > 0 && <span className="ml-auto rounded-full bg-seal px-1.5 text-[11px] font-semibold text-white">{user.pendingCount}</span>)}
          </nav>
        </aside>

        <main className="px-4 pb-24 pt-5 sm:px-6 lg:col-start-2 lg:row-start-2 lg:mx-auto lg:w-full lg:max-w-6xl lg:px-8 lg:pt-0">{children}</main>
      </div>
      <Chat lesson={lesson} />
    </>
  );
}

function Search() {
  const [q, setQ] = useState('');
  const t = norm(q);
  const hits = t ? ENTRIES.filter(({ card }) => matches(card, t))
    .sort((a, b) => (norm(b.card.answer) === t) - (norm(a.card.answer) === t)).slice(0, 8) : [];
  return (
    <div className="group relative min-w-0 flex-1 lg:max-w-sm">
      <SearchIcon size={16} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')}
        placeholder="Look up あ, ka, 人, person…" aria-label="Look up a character" autoComplete="off" spellCheck={false}
        className="h-11 w-full rounded-full border border-white/10 bg-white/[0.04] pl-11 pr-4 text-sm outline-none transition placeholder:text-muted/70 focus:border-white/25 focus:bg-white/[0.06]" />
      {t && (
        // Shown while the box has focus; mousedown is cancelled so clicking a result doesn't blur it away first.
        <ul onMouseDown={(e) => e.preventDefault()}
          className="absolute inset-x-0 top-full z-30 mt-2 hidden max-h-96 overflow-y-auto rounded-2xl border border-white/10 bg-[#141416] p-1.5 shadow-2xl group-focus-within:block">
          {hits.length ? hits.map(({ deck, card }) => (
            <li key={card.id}>
              <a href={`#/d/${deck.id}/browse`} onClick={() => setQ('')} className="flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-white/5">
                <span className={`${fontOf(deck)} w-10 shrink-0 text-center text-2xl font-bold`} lang={langAttr(deck)}>{card.glyph}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{card.answer}</span>
                  {card.answerSub && <span className="block truncate text-xs text-muted">{card.answerSub}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted">{deck.title}</span>
              </a>
            </li>
          )) : <li className="px-3 py-2 text-sm text-muted">Nothing matches “{q.trim()}”.</li>}
        </ul>
      )}
    </div>
  );
}

export default function Dashboard({ known, account, last }) {
  const first = account.user?.name?.split(' ')[0];
  const learned = SCRIPTS.reduce((n, s) => n + count(s.cards, known), 0);
  const left = last.cards.filter((c) => !known.has(c.id));
  const fan = (left.length ? left : last.cards).slice(0, 3);
  const line = !learned ? `Nothing learned yet. ${last.title} is a good first deck.`
    : `You know ${learned} of ${TOTAL} characters. ${left.length ? `${last.title} has ${left.length} left.` : `${last.title} is done.`}`;
  const features = [
    [<Layers size={18} />, 'Study', `Flip and rate ${last.title}`, `#/d/${last.id}`],
    [<LayoutGrid size={18} />, 'Browse', `Every card in ${last.title}`, `#/d/${last.id}/browse`],
    [<Rocket size={18} />, 'Asteroid Shooter', 'Type the reading to shoot', '#/play'],
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-6">
        <section className="enter relative flex overflow-hidden rounded-[28px] bg-[linear-gradient(110deg,#a3214a,#e0475f_55%,#ff7a6b)] p-6 text-white sm:p-8">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.16)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_left,black,transparent_75%)]" />
          <div className="relative min-w-0 flex-1">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {learned ? 'Welcome back' : 'Welcome'}{first && <>, <span className="font-display font-normal italic tracking-normal">{first}</span></>}
            </h1>
            <p className="mt-2 max-w-md text-sm text-white/85 sm:text-base">{line}</p>
            <a href={`#/d/${last.id}`} className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90">
              {learned ? 'Continue' : 'Start'} {last.title}<ArrowRight size={16} />
            </a>
          </div>
          {/* The next cards still to learn, fanned like the landing page and cropped by the banner's bottom edge. */}
          <div aria-hidden className="relative -mb-14 ml-6 hidden shrink-0 items-end self-end sm:flex">
            {fan.map((c, i) => (
              <span key={c.id} lang={langAttr(last)} style={{ transform: `rotate(${(i - 1) * 10}deg) translateY(${i === 1 ? -14 : 0}px)` }}
                className={`${fontOf(last)} -mx-2.5 grid h-32 w-24 origin-bottom place-items-center rounded-2xl text-5xl font-bold ring-1 ring-white/30 backdrop-blur-sm ${i === 1 ? 'z-10 bg-white/25' : 'bg-white/15'}`}>
                {c.glyph}
              </span>
            ))}
          </div>
        </section>

        <div className="enter grid gap-3 sm:grid-cols-3" style={{ '--i': 1 }}>
          {features.map(([icon, title, sub, href]) => (
            <a key={title} href={href} className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-card/60 p-4 transition hover:border-white/15 hover:bg-card">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.06]">{icon}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{title}</span>
                <span className="block truncate text-xs text-muted">{sub}</span>
              </span>
            </a>
          ))}
        </div>

        <section className="enter" style={{ '--i': 2 }}>
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Your decks</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {DECKS.map((d) => <DeckCard key={d.id} deck={d} learned={count(d.cards, known)} />)}
          </div>
        </section>
      </div>

      <div className="grid content-start gap-6 md:grid-cols-2 xl:grid-cols-1">
        <Overview known={known} learned={learned} />
        <UpNext known={known} />
      </div>
    </div>
  );
}

function DeckCard({ deck, learned }) {
  const p = pct(learned, deck.cards.length);
  return (
    <a href={`#/d/${deck.id}`} className="group overflow-hidden rounded-3xl border border-white/[0.06] bg-card/60 transition hover:border-white/15">
      <div className="relative h-32 overflow-hidden" style={{ background: gradient(deck) }}>
        <span lang={langAttr(deck)}
          className={`${fontOf(deck)} absolute -bottom-5 right-4 font-bold leading-none text-white/90 drop-shadow-[0_8px_0_rgb(0_0_0/0.12)] transition duration-500 ease-out group-hover:-translate-y-1.5 group-hover:-rotate-3 ${deck.emblem.length > 1 ? 'text-[5.5rem]' : 'text-[7.5rem]'}`}>
          {deck.emblem}
        </span>
        <span className="absolute left-3 top-3 rounded-full bg-black/25 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
          {LANGS.find((l) => l.id === deck.lang).label}
        </span>
      </div>
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-semibold">{deck.title}</h3>
          <span className={`${fontOf(deck)} text-sm text-muted`} lang={langAttr(deck)}>{deck.native}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">{deck.blurb}</p>
        <div className="mt-4 flex items-center gap-3 text-xs tabular-nums text-muted">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${p}%`, background: deck.colors[0] }} />
          </span>
          {p}%
        </div>
      </div>
    </a>
  );
}

// Donut: one arc per script, sized by how many of its cards you know.
function Overview({ known, learned }) {
  const R = 42;
  const C = 2 * Math.PI * R;
  let at = 0;
  const parts = SCRIPTS.map(({ deck, cards }) => {
    const n = count(cards, known);
    const part = { deck, n, total: cards.length, len: (n / TOTAL) * C, at };
    at += part.len;
    return part;
  });
  return (
    <Panel title="Learning progress" className="enter" style={{ '--i': 3 }}>
      <div className="relative mx-auto aspect-square w-44">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={R} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth="8" />
          {parts.map((p) => p.n > 0 && (
            <circle key={p.deck.id} cx="50" cy="50" r={R} fill="none" stroke={p.deck.colors[0]} strokeWidth="8"
              strokeDasharray={`${p.len} ${C}`} strokeDashoffset={-p.at} />
          ))}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <span className="text-3xl font-semibold tabular-nums tracking-tight">{pct(learned, TOTAL)}%</span>
          <span className="text-xs tabular-nums text-muted">{learned} of {TOTAL}</span>
        </div>
      </div>
      <ul className="mt-5 grid grid-cols-3 gap-2 text-center">
        {parts.map((p) => (
          <li key={p.deck.id} className="rounded-2xl bg-white/[0.03] px-1 py-3">
            <span className="mx-auto mb-2 block h-1 w-5 rounded-full" style={{ background: p.deck.colors[0] }} />
            <span className="block text-sm font-semibold tabular-nums">{p.n}<span className="font-normal text-muted">/{p.total}</span></span>
            <span className="block truncate px-1 text-[11px] text-muted">{p.deck.title}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function UpNext({ known }) {
  return (
    <Panel title="Up next" className="enter" style={{ '--i': 4 }}>
      <ul className="-mx-2 space-y-1">
        {SCRIPTS.map(({ deck, cards }) => {
          const left = cards.filter((c) => !known.has(c.id));
          return (
            <li key={deck.id}>
              <a href={`#/d/${deck.id}`} className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-white/[0.04]">
                <Emblem deck={deck} className="h-10 w-10 rounded-xl text-base" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{deck.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {left.length
                      ? <><span className={fontOf(deck)} lang={langAttr(deck)}>{left.slice(0, 5).map((c) => c.glyph).join(' ')}</span> · {left.length} left</>
                      : 'All learned'}
                  </span>
                </span>
                <ArrowRight size={15} className="shrink-0 text-muted" />
              </a>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
