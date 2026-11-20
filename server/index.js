/* global process */
import crypto from 'node:crypto';
import express from 'express';
import pg from 'pg';
import { OAuth2Client } from 'google-auth-library';

const { DATABASE_URL, GOOGLE_CLIENT_ID, PORT = 3000, NODE_ENV } = process.env;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

const db = new pg.Pool({ connectionString: DATABASE_URL });
const google = new OAuth2Client();
const COOKIE = 'moji_session';
const SESSION_DAYS = 30;
const CARD_ID = /^[a-z][a-z0-9-]{0,31}$/;
const MAX_CARDS = 5000;

await db.query(`
  create table if not exists users (
    id bigserial primary key,
    google_sub text unique not null,
    email text not null,
    name text,
    picture text,
    created_at timestamptz not null default now()
  );
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
    `select u.id, u.email, u.name, u.picture from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now()`, [sha256(token)]);
  if (!rows[0]) return res.status(401).json({ error: 'unauthenticated' });
  req.user = rows[0];
  next();
};

const knownFor = async (userId) =>
  (await db.query('select known from progress where user_id = $1', [userId])).rows[0]?.known ?? [];

const publicUser = ({ email, name, picture }) => ({ email, name, picture });

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

  if (mode === 'signin') {
    const { rowCount } = await db.query('select 1 from users where google_sub = $1', [profile.sub]);
    if (!rowCount) return res.status(404).json({ error: 'no_account', email: profile.email });
  }

  const { rows: [user] } = await db.query(
    `insert into users (google_sub, email, name, picture) values ($1, $2, $3, $4)
     on conflict (google_sub) do update set email = excluded.email, name = excluded.name, picture = excluded.picture
     returning id, email, name, picture, (xmax = 0) as created`,
    [profile.sub, profile.email, profile.name ?? null, profile.picture ?? null]);

  const token = crypto.randomBytes(32).toString('base64url');
  await db.query('delete from sessions where expires_at < now()');
  await db.query(`insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))`,
    [sha256(token), user.id, SESSION_DAYS]);
  setCookie(res, token, SESSION_DAYS * 86400);
  res.json({ user: publicUser(user), known: await knownFor(user.id), created: user.created });
});

app.post('/api/auth/logout', async (req, res) => {
  const token = readToken(req);
  if (token) await db.query('delete from sessions where token_hash = $1', [sha256(token)]);
  setCookie(res, '', 0);
  res.json({ ok: true });
});

app.get('/api/me', auth, async (req, res) => {
  res.json({ user: publicUser(req.user), known: await knownFor(req.user.id) });
});

app.put('/api/progress', auth, async (req, res) => {
  const { known } = req.body ?? {};
  if (!validKnown(known)) return res.status(400).json({ error: 'invalid progress' });
  await db.query(
    `insert into progress (user_id, known, updated_at) values ($1, $2, now())
     on conflict (user_id) do update set known = excluded.known, updated_at = now()`,
    [req.user.id, [...new Set(known)]]);
  res.json({ ok: true });
});

// Express 5 forwards async errors here. Never leak internals. (4-arg signature is how Express recognises it.)
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const client = err.status >= 400 && err.status < 500;
  if (!client) console.error(err);
  res.status(client ? err.status : 500).json({ error: client ? 'bad request' : 'server error' });
});

app.listen(PORT, () => console.log(`moji-api listening on ${PORT}`));
