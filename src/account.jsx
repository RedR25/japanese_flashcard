import { useCallback, useEffect, useRef, useState } from 'react';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const api = async (path, body, method = 'POST') => {
  const res = await fetch(`/api${path}`, body === undefined ? {} : {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.json();
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
  const [sync, setSync] = useState('idle'); // idle | saving | saved | error
  const synced = useRef(null);

  const adopt = useCallback((u, remote) => {
    synced.current = [...remote].sort().join();
    replaceKnown((local) => new Set([...local, ...remote]));
    setUser(u);
  }, [replaceKnown]);

  useEffect(() => {
    api('/me').then((r) => adopt(r.user, r.known)).catch(() => { /* 401 = signed out; no backend = local-only mode */ });
  }, [adopt]);

  useEffect(() => {
    if (!user) return;
    const ids = [...known].sort();
    if (ids.join() === synced.current) return;
    setSync('saving');
    const t = setTimeout(() => {
      api('/progress', { known: ids }, 'PUT')
        .then(() => { synced.current = ids.join(); setSync('saved'); })
        .catch((e) => { setSync('error'); if (e.status === 401) setUser(null); });
    }, 800);
    return () => clearTimeout(t);
  }, [known, user]);

  const signIn = useCallback((credential) =>
    api('/auth/google', { credential }).then((r) => adopt(r.user, r.known)).catch(() => setSync('error')), [adopt]);

  const signOut = async () => {
    await api('/auth/logout', {}).catch(() => {});
    window.google?.accounts.id.disableAutoSelect();
    setUser(null);
    setSync('idle');
    replaceKnown(() => new Set()); // don't leave this account's progress on a shared device
  };

  return { user, sync, signIn, signOut, enabled: Boolean(CLIENT_ID) };
}

function GoogleButton({ onCredential }) {
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadGis().then(() => {
      if (!live) return;
      window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: (r) => onCredential(r.credential) });
      window.google.accounts.id.renderButton(ref.current, {
        theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'filled_black' : 'outline',
        size: 'large', shape: 'pill', text: 'signin_with',
      });
    }).catch(() => setFailed(true));
    return () => { live = false; };
  }, [onCredential]);
  return failed ? <span className="text-xs text-muted">Sign-in unavailable</span> : <div ref={ref} className="h-10" />;
}

const SYNC_LABEL = { saving: 'Saving…', saved: 'Synced', error: 'Sync failed, will retry on next change' };

export function AccountBar({ account }) {
  if (!account.enabled) return null;
  if (!account.user) {
    return (
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <GoogleButton onCredential={account.signIn} />
        <span className="text-xs text-muted">{account.sync === 'error' ? 'Sign-in failed, try again' : 'Sign in to save progress across devices'}</span>
      </div>
    );
  }
  const { name, email, picture } = account.user;
  return (
    <div className="flex items-center gap-3">
      {picture && <img src={picture} alt="" referrerPolicy="no-referrer" className="h-9 w-9 rounded-full border border-line" />}
      <div className="min-w-0 text-sm">
        <div className="truncate font-medium">{name || email}</div>
        <div className={`text-xs ${account.sync === 'error' ? 'text-seal' : 'text-muted'}`}>{SYNC_LABEL[account.sync] || email}</div>
      </div>
      <button onClick={account.signOut} className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted hover:border-ink/30 hover:text-ink">Sign out</button>
    </div>
  );
}
