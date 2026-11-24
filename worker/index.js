// Moji on Cloudflare. Files in dist (the built app) are served straight from the assets (wrangler.jsonc) without running
// this; anything else lands here. /api/* goes on to the Railway API carrying the shared secret the API checks
// (ORIGIN_SECRET), so nothing reaches it without passing Cloudflare's firewall, bot and rate-limit rules first.
const SECURITY = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404, headers: SECURITY });
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.set('x-origin-auth', env.ORIGIN_SECRET ?? '');
    const res = await fetch(`${env.API_ORIGIN}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual', // the API's own redirects (the admin unlock) go back to the browser as they are
    });
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
    return out;
  },
};
