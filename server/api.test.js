// Integration check against a running server + its DB.
// Run: DATABASE_URL=... node index.js & DATABASE_URL=... API=http://localhost:3000 npm test
/* global process */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';

const API = process.env.API || 'http://localhost:3000';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const json = { 'content-type': 'application/json' };

test('auth, validation and progress round-trip', async (t) => {
  t.after(() => db.end());
  // Google login can't run offline, so seed a user + session the same way /api/auth/google does.
  const sub = `test-${crypto.randomUUID()}`;
  const { rows: [u] } = await db.query("insert into users (google_sub, email) values ($1, 't@example.com') returning id", [sub]);
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query("insert into sessions values ($1, $2, now() + interval '1 day')", [crypto.createHash('sha256').update(token).digest('hex'), u.id]);
  const cookie = { cookie: `moji_session=${token}` };

  assert.equal((await fetch(`${API}/api/me`)).status, 401, 'no cookie → 401');
  assert.equal((await fetch(`${API}/api/me`, { headers: { cookie: 'moji_session=forged' } })).status, 401, 'bad token → 401');
  assert.equal((await fetch(`${API}/api/progress`, { method: 'PUT', headers: json, body: '{"known":["h1"]}' })).status, 401);
  assert.equal((await fetch(`${API}/api/progress`, { method: 'PUT', headers: { ...cookie, 'content-type': 'text/plain' }, body: '{"known":[]}' })).status, 415, 'non-JSON write rejected');
  assert.equal((await fetch(`${API}/api/progress`, { method: 'PUT', headers: { ...cookie, ...json }, body: '{"known":["<script>"]}' })).status, 400, 'bad card id rejected');
  assert.equal((await fetch(`${API}/api/progress`, { method: 'PUT', headers: { ...cookie, ...json }, body: '{bad json' })).status, 400, 'malformed JSON → 400');
  assert.equal((await fetch(`${API}/api/auth/google`, { method: 'POST', headers: json, body: '{"accessToken":"nope"}' })).status, 401, 'fake google token rejected');
  assert.equal((await fetch(`${API}/api/auth/google`, { method: 'POST', headers: json, body: '{"accessToken":"x","mode":"admin"}' })).status, 400, 'unknown mode rejected');

  const put = await fetch(`${API}/api/progress`, { method: 'PUT', headers: { ...cookie, ...json }, body: JSON.stringify({ known: ['h0', 'r12', 'h0'] }) });
  assert.equal(put.status, 200);
  const me = await (await fetch(`${API}/api/me`, { headers: cookie })).json();
  assert.deepEqual(me.known.sort(), ['h0', 'r12'], 'stored + deduped');
  assert.equal(me.user.email, 't@example.com');

  const out = await fetch(`${API}/api/auth/logout`, { method: 'POST', headers: { ...cookie, ...json }, body: '{}' });
  assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await fetch(`${API}/api/me`, { headers: cookie })).status, 401, 'session revoked after logout');

  await db.query('delete from users where id = $1', [u.id]);
});
