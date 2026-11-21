/* global process */
import crypto from 'node:crypto';
import express from 'express';
import pg from 'pg';
import { OAuth2Client } from 'google-auth-library';

const { DATABASE_URL, GOOGLE_CLIENT_ID, ADMIN_EMAILS = '', PORT = 3000, NODE_ENV,
  OPENROUTER_API_KEY, OPENROUTER_MODEL = 'nvidia/nemotron-3.5-lightning:free' } = process.env;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

const db = new pg.Pool({ connectionString: DATABASE_URL });
const google = new OAuth2Client();
const COOKIE = 'moji_session';
const SESSION_DAYS = 30;
const CARD_ID = /^[a-z][a-z0-9-]{0,31}$/;
const MAX_CARDS = 5000;
const ADMINS = new Set(ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
const isAdmin = (email) => ADMINS.has(email.toLowerCase());
const approved = (u) => u.status === 'approved' || isAdmin(u.email);
const STATUSES = ['pending', 'approved', 'denied'];

await db.query(`
  create table if not exists users (
    id bigserial primary key,
    google_sub text unique not null,
    email text not null,
    name text,
    picture text,
    created_at timestamptz not null default now()
  );
  alter table users add column if not exists status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied'));
  create table if not exists sessions (
    token_hash text primary key,
    user_id bigint not null references users(id) on delete cascade,
    expires_at timestamptz not null
  );
  create table if not exists progress (
    user_id bigint primary key references users(id) on delete cascade,
    known text[] not null default '{}',
    updated_at timestamptz not null default now()
  );
`);

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const readToken = (req) => {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return null;
};

// Requests arrive via Vercel's /api rewrite, so this cookie lives on the Vercel domain and stays first-party.
const setCookie = (res, value, maxAge) => res.append('Set-Cookie',
  `${COOKIE}=${value}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${NODE_ENV === 'production' ? '; Secure' : ''}`);

const validKnown = (known) =>
  Array.isArray(known) && known.length <= MAX_CARDS && known.every((id) => typeof id === 'string' && CARD_ID.test(id));

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  // State-changing requests must be JSON: a form on another site can't send that without a CORS preflight.
  if (req.method !== 'GET' && !req.is('application/json')) return res.status(415).json({ error: 'json required' });
  next();
});
app.use(express.json({ limit: '100kb' }));

const auth = async (req, res, next) => {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'unauthenticated' });
  const { rows } = await db.query(
    `select u.id, u.email, u.name, u.picture, u.status from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now()`, [sha256(token)]);
  if (!rows[0]) return res.status(401).json({ error: 'unauthenticated' });
  req.user = rows[0];
  next();
};

const knownFor = async (userId) =>
  (await db.query('select known from progress where user_id = $1', [userId])).rows[0]?.known ?? [];

const publicUser = (u) => ({ email: u.email, name: u.name, picture: u.picture, status: approved(u) ? 'approved' : u.status, isAdmin: isAdmin(u.email) });

const admin = (req, res, next) => (isAdmin(req.user.email) ? next() : res.status(403).json({ error: 'forbidden' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/auth/google', async (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'google login not configured' });
  const { accessToken, mode = 'signin' } = req.body ?? {};
  if (typeof accessToken !== 'string' || accessToken.length > 4096 || !['signin', 'signup'].includes(mode)) {
    return res.status(400).json({ error: 'bad request' });
  }

  // The custom button uses Google's token flow, so we get an access token, not an ID token.
  // The aud check is what stops a token minted for some other app being replayed here.
  let profile;
  try {
    const info = await google.getTokenInfo(accessToken);
    if (info.aud !== GOOGLE_CLIENT_ID) throw new Error('wrong audience');
    const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${accessToken}` } });
    if (!r.ok) throw new Error('userinfo failed');
    profile = await r.json();
  } catch {
    return res.status(401).json({ error: 'invalid google token' });
  }
  if (!profile?.sub || !profile.email || profile.email_verified !== true) return res.status(401).json({ error: 'unverified google account' });

  if (mode === 'signin' && !isAdmin(profile.email)) { // admins never need to request access
    const { rowCount } = await db.query('select 1 from users where google_sub = $1', [profile.sub]);
    if (!rowCount) return res.status(404).json({ error: 'no_account', email: profile.email });
  }

  const { rows: [user] } = await db.query(
    `insert into users (google_sub, email, name, picture, status) values ($1, $2, $3, $4, case when $5 then 'approved' else 'pending' end)
     on conflict (google_sub) do update set email = excluded.email, name = excluded.name, picture = excluded.picture,
       status = case when $5 then 'approved' else users.status end
     returning id, email, name, picture, status, (xmax = 0) as created`,
    [profile.sub, profile.email, profile.name ?? null, profile.picture ?? null, isAdmin(profile.email)]);

  const token = crypto.randomBytes(32).toString('base64url');
  await db.query('delete from sessions where expires_at < now()');
  await db.query(`insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))`,
    [sha256(token), user.id, SESSION_DAYS]);
  setCookie(res, token, SESSION_DAYS * 86400);
  res.json({ user: publicUser(user), known: approved(user) ? await knownFor(user.id) : [], created: user.created });
});

app.post('/api/auth/logout', async (req, res) => {
  const token = readToken(req);
  if (token) await db.query('delete from sessions where token_hash = $1', [sha256(token)]);
  setCookie(res, '', 0);
  res.json({ ok: true });
});

app.get('/api/me', auth, async (req, res) => {
  const u = publicUser(req.user);
  const out = { user: u, known: u.status === 'approved' ? await knownFor(req.user.id) : [] };
  if (u.isAdmin) out.pendingCount = (await db.query("select count(*)::int n from users where status = 'pending' and lower(email) <> all($1)", [[...ADMINS]])).rows[0].n;
  res.json(out);
});

app.put('/api/progress', auth, async (req, res) => {
  if (!approved(req.user)) return res.status(403).json({ error: 'not_approved' });
  const { known } = req.body ?? {};
  if (!validKnown(known)) return res.status(400).json({ error: 'invalid progress' });
  await db.query(
    `insert into progress (user_id, known, updated_at) values ($1, $2, now())
     on conflict (user_id) do update set known = excluded.known, updated_at = now()`,
    [req.user.id, [...new Set(known)]]);
  res.json({ ok: true });
});

app.get('/api/admin/users', auth, admin, async (_req, res) => {
  const { rows } = await db.query(
    `select id, email, name, picture, status, created_at from users order by (status = 'pending') desc, created_at desc`);
  res.json({ users: rows });
});

app.patch('/api/admin/users/:id', auth, admin, async (req, res) => {
  const { status } = req.body ?? {};
  if (!/^[1-9]\d{0,17}$/.test(req.params.id) || !STATUSES.includes(status)) return res.status(400).json({ error: 'bad request' });
  const { rows } = await db.query(
    'update users set status = $1 where id = $2 returning id, email, name, picture, status, created_at', [status, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.json({ user: rows[0] });
});

// Study helper chat. The OpenRouter key never leaves this server, and the system prompt is set here, not by the client.
const CHAT_PROMPT = [
  'You are the study helper inside Moji, a flashcard app for Japanese hiragana and katakana and the 50 most common Chinese radicals (bộ thủ). Radicals are taught with their Hán Việt name, pinyin, and English and Vietnamese meanings.',
  'Only help with the language side of that: reading and writing kana and hanzi, romaji, pinyin, Hán Việt readings, what a radical means and which characters use it, stroke order, pronunciation, look-alike characters, mnemonics, and example words or short sentences.',
  'If a message is about anything else, say in one sentence that you only help with Japanese and Chinese characters, then suggest a related study question.',
  'Reply in the language the user writes in. Keep replies short: a few sentences or a short list. Show the characters themselves with the reading in parentheses, like か (ka) or 人 (rén, Nhân). Plain text only, no markdown.',
].join('\n');
const CHAT_PER_MINUTE = 10;
const chatTimes = new Map(); // user id → recent request times. ponytail: per-process; move to Postgres if Railway runs >1 instance
const validChat = (m) => Array.isArray(m) && m.length >= 1 && m.length <= 20
  && m.every((x) => ['user', 'assistant'].includes(x?.role) && typeof x.content === 'string' && x.content.trim())
  && m.at(-1).role === 'user' && m.at(-1).content.length <= 2000;

app.post('/api/chat', auth, async (req, res) => {
  if (!approved(req.user)) return res.status(403).json({ error: 'not_approved' });
  const { messages } = req.body ?? {};
  if (!validChat(messages)) return res.status(400).json({ error: 'bad request' });
  if (!OPENROUTER_API_KEY) return res.status(503).json({ error: 'chat not configured' });
  const now = Date.now();
  const recent = (chatTimes.get(req.user.id) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= CHAT_PER_MINUTE) return res.status(429).json({ error: 'slow down' });
  chatTimes.set(req.user.id, [...recent, now]);

  let r;
  try {
    r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${OPENROUTER_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{ role: 'system', content: CHAT_PROMPT }, ...messages.map(({ role, content }) => ({ role, content: content.slice(0, 4000) }))],
        max_tokens: 1500,
        temperature: 0.3,
        reasoning: { effort: 'low', exclude: true }, // a reasoning model: keep the thinking short and out of the reply
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    return res.status(504).json({ error: 'chat timed out' });
  }
  const data = await r.json().catch(() => ({}));
  const reply = data.choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, '').trim(); // some hosts inline the thinking
  if (!r.ok || !reply) {
    console.error('openrouter', r.status, data.error?.message ?? 'empty reply'); // never log the user's messages
    return res.status(r.status === 429 ? 429 : 502).json({ error: 'chat failed' });
  }
  res.json({ reply });
});

// Express 5 forwards async errors here. Never leak internals. (4-arg signature is how Express recognises it.)
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const client = err.status >= 400 && err.status < 500;
  if (!client) console.error(err);
  res.status(client ? err.status : 500).json({ error: client ? 'bad request' : 'server error' });
});

app.listen(PORT, () => console.log(`moji-api listening on ${PORT}`));
