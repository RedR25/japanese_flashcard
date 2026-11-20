import { ArrowRight, Cloud, Layers, MousePointer2, Repeat } from 'lucide-react';
import { DECKS, LANGS } from './decks';
import { UserMenu } from './account';

// Per-deck look for the landing page. Fan order is left → right; `lift` drops the outer cards.
const LOOK = {
  'kana-mixed': { from: '#2bd4a4', to: '#9be15d', glyph: 'かナ', rot: -13, lift: 56 },
  hiragana: { from: '#ff5f8f', to: '#ff9a6b', glyph: 'あ', rot: -4, lift: 0, hero: true },
  radicals: { from: '#ffb547', to: '#ff6a3d', glyph: '人', rot: 4, lift: 0 },
  katakana: { from: '#5b7cff', to: '#a77bff', glyph: 'ア', rot: 13, lift: 56 },
};
const FAN = Object.keys(LOOK).map((id) => DECKS.find((d) => d.id === id));
const fontOf = (deck) => LANGS.find((l) => l.id === deck.lang).font;
const langAttr = (deck) => (deck.lang === 'zh' ? 'zh-Hans' : deck.lang);
const learnedIn = (deck, known) => deck.cards.filter((c) => known.has(c.id)).length;
const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

export default function Landing({ known, account, openAuth: setAuth }) {
  const total = new Set(DECKS.flatMap((d) => d.cards.map((c) => c.id))).size;

  return (
    <>
      <div className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-20rem] h-[40rem] w-[60rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(255_95_143/0.18),transparent)]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.06)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />

        <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <a href="#/" className="flex items-center gap-2.5 font-semibold" aria-label="Moji home">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-seal to-[#ff9a5c] font-ja text-base font-bold text-white">文</span>
            <span className="hidden text-lg tracking-tight sm:block">Moji</span>
          </a>
          <nav className="hidden items-center rounded-full border border-white/10 bg-white/[0.04] p-1 text-sm backdrop-blur md:flex">
            <span className="rounded-full bg-white/10 px-4 py-1.5 font-medium">Home</span>
            {[['decks', 'Decks'], ['how', 'How it works']].map(([id, label]) => (
              <button key={id} onClick={() => scrollTo(id)} className="rounded-full px-4 py-1.5 text-muted transition hover:text-ink">{label}</button>
            ))}
            <a href="#/play" className="rounded-full px-4 py-1.5 text-muted transition hover:text-ink">Asteroids</a>
          </nav>
          <div className="flex items-center gap-2">
            {account.user ? <UserMenu account={account} /> : account.enabled && (
              <>
                <button onClick={() => setAuth('signin')} className="rounded-full px-4 py-2 text-sm font-medium text-ink/90 transition hover:bg-white/5">Sign in</button>
                <button onClick={() => setAuth('signup')} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90">Request access</button>
              </>
            )}
          </div>
        </header>

        <section className="relative z-10 mx-auto max-w-6xl px-4 pt-10 text-center sm:px-6 sm:pt-16">
          <button onClick={() => scrollTo('decks')}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-1 pr-3 text-xs text-muted transition hover:text-ink">
            <span className="rounded-full bg-jade/15 px-2 py-0.5 font-medium text-jade">New</span>
            50 Chinese radicals · Bộ thủ
          </button>
          <h1 className="mx-auto mt-6 max-w-3xl text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl md:text-7xl">
            Read every character,<br />
            <span className="font-display font-normal italic tracking-normal text-seal">one card</span> at a time
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-balance text-base text-muted sm:text-lg">
            Flashcards for hiragana, katakana and the 50 most common Chinese radicals. Flip, rate yourself, and Moji brings back the ones you miss.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href="#/d/hiragana" className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90">
              Start with hiragana<ArrowRight size={16} />
            </a>
            <button onClick={() => scrollTo('decks')} className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold transition hover:bg-white/5">Browse decks</button>
          </div>

          <Cursor className="left-[4%] top-[42%] animate-float" color="#ff5f8f" label="あ = a" />
          <Cursor className="right-[5%] top-[30%] animate-float [animation-delay:-3s]" color="#ffb547" label="人 = rén" flip />

          <div className="relative mt-16 flex h-[17rem] items-start justify-center sm:mt-20 sm:h-[22rem]">
            {FAN.map((d) => <FanCard key={d.id} deck={d} learned={learnedIn(d, known)} />)}
          </div>
        </section>
      </div>

      <section id="decks" className="mx-auto max-w-6xl scroll-mt-6 px-4 pb-8 pt-20 sm:px-6">
        <SectionTitle kicker="Decks" title="Pick a script" sub={`${total} unique cards. Progress is shared, so kana you learn in Kana mix count everywhere.`} />
        {LANGS.map((lang) => (
          <div key={lang.id} className="mt-10">
            <h3 className="mb-4 flex items-baseline gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              {lang.label}<span className={`${lang.font} text-sm normal-case tracking-normal`} lang={lang.id}>{lang.native}</span>
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {DECKS.filter((d) => d.lang === lang.id).map((d) => <DeckRow key={d.id} deck={d} learned={learnedIn(d, known)} />)}
            </div>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
        <a href="#/play" className="group flex flex-col gap-8 overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-[#5b7cff]/20 via-transparent to-[#a77bff]/10 p-8 transition hover:border-white/20 sm:flex-row sm:items-center sm:p-10">
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8ea2ff]">New game</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Asteroid Shooter</h2>
            <p className="mt-2 max-w-md text-muted">Characters rain down as asteroids. Type the reading, or the character itself, to blast them before they land.</p>
            <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black">Play now<ArrowRight size={16} className="transition group-hover:translate-x-0.5" /></span>
          </div>
          <div aria-hidden className="relative h-40 sm:w-72">
            {[['か', 'left-[8%] top-[10%] h-16 w-16', 'animate-float'], ['人', 'left-[52%] top-0 h-20 w-20', 'animate-float [animation-delay:-2s]'], ['ア', 'left-[30%] top-[58%] h-14 w-14', 'animate-float [animation-delay:-4s]']].map(([c, pos, anim]) => (
              <span key={c} className={`absolute grid place-items-center ${pos} ${anim}`}>
                <span className="rock absolute inset-0 rounded-[46%_54%_52%_48%/55%_45%_55%_45%]" />
                <span className="relative font-ja text-2xl font-bold">{c}</span>
              </span>
            ))}
          </div>
        </a>
      </section>

      <section id="how" className="mx-auto max-w-6xl scroll-mt-6 px-4 py-20 sm:px-6">
        <SectionTitle kicker="How it works" title="Three keys, zero friction" />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <Step icon={<Layers size={18} />} title="Flip" keys={['Space']}>See the character, recall the reading, flip to check.</Step>
          <Step icon={<Repeat size={18} />} title="Rate" keys={['1', '2']}>Missed it? It comes back a few cards later. Got it? It’s marked learned.</Step>
          <Step icon={<Cloud size={18} />} title="Sync">Sign in with Google and your progress follows you to every device.</Step>
        </div>
        {!account.user && account.enabled && (
          <div className="mt-12 flex flex-col items-center gap-4 rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent px-6 py-12 text-center">
            <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">Moji is invite-only</h3>
            <p className="max-w-md text-muted">Request access with your Google account. Once the admin approves you, your progress syncs to every device.</p>
            <button onClick={() => setAuth('signup')} className="mt-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90">Request access</button>
          </div>
        )}
      </section>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-muted">Moji · 文字 · Kana & Hanzi flashcards</footer>

    </>
  );
}

function Cursor({ className, color, label, flip }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute hidden lg:block ${className}`}>
      <MousePointer2 size={20} fill={color} stroke={color} className={flip ? 'ml-auto -scale-x-100' : ''} />
      <span className="mt-1 block rounded-full px-3 py-1 text-xs font-semibold text-black shadow-lg" style={{ background: color }}>{label}</span>
    </div>
  );
}

function FanCard({ deck, learned }) {
  const { from, to, glyph, rot, lift, hero } = LOOK[deck.id];
  return (
    <a href={`#/d/${deck.id}`} aria-label={`Study ${deck.title}`}
      style={{ '--r': `${rot}deg`, '--y': `${lift}px`, background: `linear-gradient(160deg, ${from}, ${to})` }}
      className={`group relative -mx-5 flex h-56 w-40 shrink-0 origin-bottom flex-col rounded-[26px] p-4 text-left text-white shadow-[0_30px_60px_-20px_rgb(0_0_0/0.8)] ring-1 ring-white/20 transition-transform duration-300 ease-out [transform:translateY(var(--y))_rotate(var(--r))] hover:z-10 hover:[transform:translateY(calc(var(--y)-18px))_rotate(0deg)] sm:-mx-3 sm:h-72 sm:w-56 sm:p-5 ${hero ? 'z-[5]' : ''}`}>
      <span className="text-base font-bold leading-tight sm:text-xl">{deck.title}</span>
      <span className="text-xs text-white/75">{deck.cards.length} cards</span>
      {hero && <span className="absolute -right-3 -top-3 hidden items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black shadow-lg sm:flex">Start here<ArrowRight size={12} /></span>}
      <span className={`${fontOf(deck)} m-auto whitespace-nowrap font-bold drop-shadow-[0_6px_0_rgb(0_0_0/0.15)] ${glyph.length > 1 ? 'text-5xl sm:text-7xl' : 'text-6xl sm:text-8xl'}`} lang={langAttr(deck)}>{glyph}</span>
      <span className="flex items-center gap-2 text-[11px] font-medium tabular-nums text-white/85">
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-black/20"><span className="block h-full rounded-full bg-white" style={{ width: `${(learned / deck.cards.length) * 100}%` }} /></span>
        {learned}/{deck.cards.length}
      </span>
    </a>
  );
}

function DeckRow({ deck, learned }) {
  const { from, to } = LOOK[deck.id];
  const pct = Math.round((learned / deck.cards.length) * 100);
  return (
    <a href={`#/d/${deck.id}`} className="group flex items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/20 hover:bg-white/[0.06]">
      <span className={`${fontOf(deck)} grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-2xl font-bold text-white`} style={{ background: `linear-gradient(160deg, ${from}, ${to})` }} lang={langAttr(deck)}>
        {deck.native.slice(0, 2)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="font-semibold">{deck.title}</span>
          <ArrowRight size={16} className="text-muted transition group-hover:translate-x-0.5 group-hover:text-ink" />
        </span>
        <span className="block truncate text-sm text-muted">{deck.blurb}</span>
        <span className="mt-2 flex items-center gap-2 text-xs tabular-nums text-muted">
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-jade transition-[width] duration-500" style={{ width: `${pct}%` }} /></span>
          {learned}/{deck.cards.length}
        </span>
      </span>
    </a>
  );
}

const SectionTitle = ({ kicker, title, sub }) => (
  <div>
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-seal">{kicker}</p>
    <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
    {sub && <p className="mt-2 max-w-xl text-muted">{sub}</p>}
  </div>
);

function Step({ icon, title, keys, children }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex items-center justify-between">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.06]">{icon}</span>
        {keys && <span className="flex gap-1">{keys.map((k) => <kbd key={k} className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 font-sans text-xs text-muted">{k}</kbd>)}</span>}
      </div>
      <h3 className="mt-5 text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </div>
  );
}
