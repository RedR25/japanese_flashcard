import { useEffect, useRef, useState } from 'react';
import { ArrowUp, MessageCircle, X } from 'lucide-react';

// Floating study helper. The browser only talks to /api/chat; the OpenRouter key and system prompt live on the server.
const HELLO = 'Hi! Ask me about kana, radicals, readings or example words. For example: “How do I tell シ and ツ apart?”';
const ERRORS = {
  413: 'This chat got too long. Clear it and ask again.',
  429: 'Too many questions at once. Wait a minute and try again.',
  503: 'The study helper isn’t switched on yet.',
};

const Bubble = ({ mine, children }) => (
  <div className={`w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 leading-relaxed ${mine ? 'ml-auto rounded-br-md bg-white text-black' : 'rounded-bl-md bg-white/[0.06]'}`}>
    {children}
  </div>
);

export default function Chat() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]); // [{ role: 'user' | 'assistant', content }]
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const list = useRef(null);
  const input = useRef(null);

  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [msgs, busy, open]);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);

  const send = async (e) => {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    const next = [...msgs, { role: 'user', content: q }];
    setMsgs(next); setText(''); setError(null); setBusy(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next.slice(-8) }), // recent turns are enough context, and keep the request small
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.reply) throw Object.assign(new Error('chat failed'), { status: res.status });
      setMsgs([...next, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setMsgs(msgs); setText(q); // put the question back so Enter retries it
      setError(ERRORS[err.status] || 'Couldn’t get an answer. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {open && (
        <section role="dialog" aria-label="Study helper" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          className="fixed bottom-24 right-4 z-40 flex h-[min(34rem,calc(100dvh-8rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#141416] shadow-2xl sm:right-6">
          <header className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-4">
            <span aria-hidden className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-seal to-[#ff9a5c] font-ja text-base font-bold text-white">文</span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Study helper</h2>
              <p className="truncate text-xs text-muted">Kana, radicals and readings</p>
            </div>
            {msgs.length > 0 && (
              <button onClick={() => { setMsgs([]); setError(null); }} className="rounded-full px-3 py-1 text-xs text-muted transition hover:bg-white/5 hover:text-ink">Clear</button>
            )}
          </header>

          <div ref={list} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 text-sm [scrollbar-width:thin]">
            <Bubble>{HELLO}</Bubble>
            {msgs.map((m, i) => <Bubble key={i} mine={m.role === 'user'}>{m.content}</Bubble>)}
            {busy && (
              <Bubble>
                <span className="flex h-5 items-center gap-1" aria-label="Thinking">
                  {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" style={{ animationDelay: `${i * 0.2}s` }} />)}
                </span>
              </Bubble>
            )}
          </div>

          {error && <p role="alert" className="mx-4 mb-2 rounded-xl bg-seal/10 px-3 py-2 text-xs text-seal">{error}</p>}
          <form onSubmit={send} className="flex items-end gap-2 border-t border-white/[0.06] p-3">
            <textarea ref={input} value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={2000}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) send(e); }}
              placeholder="Ask about a character…" aria-label="Your question"
              className="max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm outline-none transition [field-sizing:content] placeholder:text-muted/70 focus:border-white/25" />
            <button type="submit" disabled={busy || !text.trim()} aria-label="Send"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-black transition hover:bg-white/90 disabled:opacity-40">
              <ArrowUp size={18} />
            </button>
          </form>
          <p className="px-4 pb-3 text-center text-[11px] leading-snug text-muted/60">AI answers via OpenRouter can be wrong. Don’t share personal info.</p>
        </section>
      )}

      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? 'Close study helper' : 'Open study helper'}
        className="fixed bottom-5 right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-seal to-[#ff9a5c] text-white shadow-[0_12px_32px_-8px_rgb(255_95_120/0.65)] transition hover:scale-105 active:scale-95 sm:right-6">
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>
    </>
  );
}
