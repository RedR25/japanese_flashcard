import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

const call = async (path, body) => {
  const res = await fetch(`/api${path}`, body === undefined ? {} : {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};

const TABS = [['pending', 'Pending'], ['approved', 'Approved'], ['denied', 'Denied']];
const EMPTY = { pending: 'No pending requests.', approved: 'Nobody approved yet.', denied: 'Nobody denied.' };
// [label, next status, style] per tab
const ACTIONS = {
  pending: [['Approve', 'approved', 'bg-white text-black hover:bg-white/90'], ['Deny', 'denied', 'border border-white/10 text-seal hover:bg-seal/10']],
  approved: [['Revoke', 'denied', 'border border-white/10 text-seal hover:bg-seal/10']],
  denied: [['Approve', 'approved', 'bg-white text-black hover:bg-white/90']],
};

const Avatar = ({ u }) => u.picture
  ? <img src={u.picture} alt="" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-full" />
  : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-seal text-sm font-bold text-white">{(u.name || u.email)[0].toUpperCase()}</span>;

export default function Admin({ account }) {
  const isAdmin = account.user?.isAdmin;
  const [users, setUsers] = useState(null);
  const [tab, setTab] = useState('pending');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(() => new Set());

  useEffect(() => {
    if (!isAdmin) return;
    call('/admin/users').then((r) => setUsers(r.users)).catch(() => setError('Couldn’t load requests.'));
  }, [isAdmin]);

  const setStatus = async (u, status) => {
    const prev = u.status;
    const patch = (s) => setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, status: s } : x)));
    setError(null); patch(status); setBusy((b) => new Set(b).add(u.id));
    try {
      await call(`/admin/users/${u.id}`, { status });
      account.refresh();
    } catch {
      patch(prev); setError(`Couldn’t update ${u.email}. Reverted.`);
    } finally {
      setBusy((b) => { const n = new Set(b); n.delete(u.id); return n; });
    }
  };

  const back = (
    <a href="#/" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-muted transition hover:bg-white/10 hover:text-ink">
      <ArrowLeft size={15} />Back to Moji
    </a>
  );

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        {back}
        <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-muted">Admins only.</div>
      </main>
    );
  }

  const count = (s) => users?.filter((u) => u.status === s).length ?? 0;
  const rows = users?.filter((u) => u.status === tab) ?? [];

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      {back}
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Manage access</h1>
      <p className="mt-1.5 text-sm text-muted">Only approved people get into Moji.</p>

      <div className="mt-6 flex rounded-full border border-white/10 bg-white/[0.03] p-1">
        {TABS.map(([s, label]) => (
          <button key={s} type="button" onClick={() => setTab(s)} aria-pressed={tab === s}
            className={`flex-1 rounded-full py-2 text-sm font-medium transition ${tab === s ? 'bg-white text-black' : 'text-muted hover:text-ink'}`}>
            {label} <span className={tab === s ? 'text-black/60' : s === 'pending' && count(s) ? 'text-seal' : ''}>{count(s)}</span>
          </button>
        ))}
      </div>

      {error && <p role="alert" className="mt-3 rounded-xl bg-seal/10 px-3 py-2 text-xs text-seal">{error}</p>}

      <ul className="mt-4 space-y-2">
        {users === null && !error && <li className="p-6 text-center text-sm text-muted">Loading…</li>}
        {users && !rows.length && <li className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-muted">{EMPTY[tab]}</li>}
        {rows.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
            <Avatar u={u} />
            <div className="min-w-0 flex-1 basis-40">
              <div className="truncate text-sm font-medium">{u.name || u.email}</div>
              <div className="truncate text-xs text-muted">{u.name && `${u.email} · `}{new Date(u.created_at).toLocaleDateString()}</div>
            </div>
            <div className="flex gap-2">
              {ACTIONS[tab].map(([label, next, cls]) => (
                <button key={label} onClick={() => setStatus(u, next)} disabled={busy.has(u.id)}
                  className={`h-9 rounded-full px-4 text-sm font-semibold transition disabled:opacity-60 ${cls}`}>{label}</button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
