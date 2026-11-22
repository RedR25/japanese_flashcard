import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Cloud, LogOut, ShieldCheck, X } from 'lucide-react';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const api = async (path, body, method = 'POST') => {
  const res = await fetch(`/api${path}`, body === undefined ? {} : {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
  return data;
};

let gis;
const loadGis = () => (gis ??= new Promise((resolve, reject) => {
  const s = Object.assign(document.createElement('script'), { src: 'https://accounts.google.com/gsi/client', async: true });
  s.onload = resolve;
  s.onerror = () => { gis = null; reject(new Error('Google sign-in failed to load')); };
  document.head.append(s);
}));

// Signed out: progress lives in localStorage only. Signed in: merged with the account, then synced on every change.
export function useAccount(known, replaceKnown) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState('idle'); // idle | saving | saved | error
  const [notice, setNotice] = useState(null);
  const synced = useRef(null);

  const approved = Boolean(user && (user.status === 'approved' || user.isAdmin));

  const adopt = useCallback((r) => {
    synced.current = [...r.known].sort().join();
    replaceKnown((local) => new Set([...local, ...r.known]));
    setUser({ ...r.user, pendingCount: r.pendingCount });
  }, [replaceKnown]);

  const refresh = useCallback(() => api('/me').then(adopt).catch((e) => { if (e.status === 401) setUser(null); }), [adopt]);

  useEffect(() => {
    // 401 = signed out; no backend = local-only mode
    api('/me').then(adopt).catch(() => {}).finally(() => setReady(true));
  }, [adopt]);

  useEffect(() => {
    if (!approved) return;
    const ids = [...known].sort();
    if (ids.join() === synced.current) return;
    setSync('saving');
    const t = setTimeout(() => {
      api('/progress', { known: ids }, 'PUT')
        .then(() => { synced.current = ids.join(); setSync('saved'); })
        .catch((e) => { setSync('error'); if (e.status === 401) setUser(null); else if (e.status === 403) refresh(); });
    }, 800);
    return () => clearTimeout(t);
  }, [known, approved, refresh]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // mode 'signin' 404s (no_account) for unknown Google accounts; 'signup' creates the account, or just signs in if it exists.
  const authenticate = useCallback(async (accessToken, mode) => {
    const r = await api('/auth/google', { accessToken, mode });
    adopt(r);
    const first = (r.user.name || r.user.email).split(' ')[0];
    setNotice(r.user.status === 'approved' ? `Welcome back, ${first}`
      : r.user.status === 'denied' ? 'Your request wasn’t approved'
      : r.created ? 'Request sent — you’ll get in once it’s approved' : 'Your request is still pending');
  }, [adopt]);

  const signOut = async () => {
    await api('/auth/logout', {}).catch(() => {});
    setUser(null);
    setSync('idle');
    replaceKnown(() => new Set()); // don't leave this account's progress on a shared device
    setNotice('Signed out');
  };

  return { ready, user, approved, sync, notice, authenticate, signOut, refresh, enabled: Boolean(CLIENT_ID) };
}

const GoogleG = () => (
  <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

const ERRORS = {
  'invalid google token': 'Google couldn’t verify that sign-in. Try again.',
  'unverified google account': 'Google didn’t share a verified email. Allow email access and try again.',
  'google login not configured': 'Sign-in is not available right now.',
};

export function AuthDialog({ mode, setMode, onClose, account }) {
  const ref = useRef(null);
  const client = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null); // { token, email } after a sign-in hit no_account
  const open = mode !== null;

  useEffect(() => {
    const d = ref.current;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    if (!open) { setBusy(false); setError(null); setPending(null); }
  }, [open]);

  const submit = useCallback(async (token, m) => {
    setBusy(true); setError(null);
    try {
      await account.authenticate(token, m);
      onClose();
    } catch (e) {
      if (e.data?.error === 'no_account') { setPending({ token, email: e.data.email }); setMode('signup'); }
      else setError(ERRORS[e.message] || 'Something went wrong. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }, [account, onClose, setMode]);

  // Preload GIS on open: requestAccessToken must run synchronously inside the click or the popup gets blocked.
  const latest = useRef();
  latest.current = { mode, submit };
  useEffect(() => {
    if (!open || client.current) return;
    loadGis().then(() => {
      client.current = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: 'openid email profile',
        callback: (r) => {
          if (r.error) { setBusy(false); setError('Google sign-in was cancelled.'); }
          else latest.current.submit(r.access_token, latest.current.mode);
        },
        error_callback: () => setBusy(false), // popup closed or blocked
      });
    }).catch(() => setError('Couldn’t reach Google. Check your connection or ad blocker.'));
  }, [open]);

  const google = () => {
    if (!client.current) return setError('Still loading Google, try again in a second.');
    setError(null); setPending(null); setBusy(true);
    client.current.requestAccessToken();
  };

  const signup = mode === 'signup';
  const switchTo = (m) => { setMode(m); setError(null); };
  const tab = (m, label) => (
    <button type="button" onClick={() => switchTo(m)} aria-pressed={mode === m}
      className={`flex-1 rounded-full py-2 text-sm font-medium transition ${mode === m ? 'bg-white text-black' : 'text-muted hover:text-ink'}`}>{label}</button>
  );

  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-labelledby="auth-title"
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-[28px] border border-white/10 bg-[#141416] p-0 text-ink shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm">
      {open && (
        <div className="relative p-7">
          <button onClick={onClose} className="absolute right-4 top-4 rounded-full p-2 text-muted hover:bg-white/5 hover:text-ink" aria-label="Close"><X size={18} /></button>
          <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-seal to-[#ff9a5c] font-ja text-xl font-bold text-white" aria-hidden>文</div>
          <h2 id="auth-title" className="text-2xl font-semibold tracking-tight">{signup ? 'Request access' : 'Welcome back'}</h2>
          <p className="mt-1.5 text-sm text-muted">{signup ? 'New accounts are approved by the admin.' : 'Sign in to sync your learned cards.'}</p>

          <div className="mt-6 flex rounded-full border border-white/10 bg-white/[0.03] p-1">{tab('signin', 'Sign in')}{tab('signup', 'Request access')}</div>

          {pending && signup ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-sm">No Moji account for <span className="font-medium">{pending.email}</span> yet.</p>
              <button onClick={() => submit(pending.token, 'signup')} disabled={busy}
                className="mt-3 flex h-11 w-full items-center justify-center rounded-full bg-white text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-60">
                {busy ? <Spinner /> : 'Request access'}
              </button>
              <button onClick={google} disabled={busy} className="mt-2 w-full text-xs text-muted hover:text-ink">Use a different Google account</button>
            </div>
          ) : (
            <button onClick={google} disabled={busy}
              className="mt-5 flex h-12 w-full items-center justify-center gap-3 rounded-full bg-white text-sm font-semibold text-black transition hover:bg-white/90 active:scale-[.98] disabled:opacity-60">
              {busy ? <Spinner /> : <><GoogleG />{signup ? 'Request access with Google' : 'Sign in with Google'}</>}
            </button>
          )}

          {error && <p role="alert" className="mt-3 rounded-xl bg-seal/10 px-3 py-2 text-xs text-seal">{error}</p>}

          {signup && (
            <ul className="mt-5 space-y-2 text-sm text-muted">
              {['You’ll get in once the admin approves you', 'Progress synced across phone and desktop', 'No password to remember'].map((t) => (
                <li key={t} className="flex items-center gap-2"><Check size={15} className="shrink-0 text-jade" />{t}</li>
              ))}
            </ul>
          )}

          <p className="mt-6 text-center text-xs text-muted/80">
            {signup ? 'Already approved? ' : 'New to Moji? '}
            <button onClick={() => switchTo(signup ? 'signin' : 'signup')} className="font-medium text-ink underline-offset-2 hover:underline">{signup ? 'Sign in' : 'Request access'}</button>
          </p>
          <p className="mt-3 text-center text-[11px] leading-relaxed text-muted/60">We store only your email, name, photo, which cards you’ve learned and your Word Range best scores.</p>
        </div>
      )}
    </dialog>
  );
}

const Spinner = () => <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black" aria-label="Loading" />;

const SYNC_LABEL = { idle: 'Synced', saving: 'Saving…', saved: 'Synced', error: 'Sync failed, retrying on next change' };

export function UserMenu({ account }) {
  const { name, email, picture, status, isAdmin, pendingCount } = account.user;
  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3 text-sm hover:bg-white/10 [&::-webkit-details-marker]:hidden">
        {picture
          ? <img src={picture} alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded-full" />
          : <span className="grid h-7 w-7 place-items-center rounded-full bg-seal text-xs font-bold text-white">{(name || email)[0].toUpperCase()}</span>}
        <span className="hidden max-w-[8rem] truncate sm:block">{name?.split(' ')[0] || email}</span>
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-64 rounded-2xl border border-white/10 bg-[#141416] p-2 shadow-2xl">
        <div className="px-3 py-2">
          <div className="truncate text-sm font-medium">{name || email}</div>
          <div className="truncate text-xs text-muted">{email}</div>
        </div>
        {account.approved ? (
          <div className={`flex items-center gap-2 px-3 pb-2 text-xs ${account.sync === 'error' ? 'text-seal' : 'text-muted'}`}>
            <Cloud size={13} />{SYNC_LABEL[account.sync]}
          </div>
        ) : (
          <div className={`px-3 pb-2 text-xs ${status === 'denied' ? 'text-seal' : 'text-muted'}`}>{status === 'denied' ? 'Not approved' : 'Pending approval'}</div>
        )}
        {isAdmin && (
          <a href="#/admin" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted hover:bg-white/5 hover:text-ink">
            <ShieldCheck size={15} />Manage access
            {pendingCount > 0 && <span className="ml-auto rounded-full bg-seal px-1.5 text-[11px] font-semibold text-white">{pendingCount}</span>}
          </a>
        )}
        <button onClick={account.signOut} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted hover:bg-white/5 hover:text-ink">
          <LogOut size={15} />Sign out
        </button>
      </div>
    </details>
  );
}
