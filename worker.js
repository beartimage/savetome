// ============================================================================
//  saveto.me — Cloudflare Worker
//  - OAuth sign-in (Google / GitHub)
//  - Per-user delta sync backed by D1 (per-bookmark rows with timestamps +
//    tombstones; a small settings blob for projects/tags) — merges concurrent
//    edits across devices instead of last-write-wins over the whole library
//  - Everything else falls through to the static assets (the SPA index.html)
//
//  Bindings expected (see wrangler.toml + SETUP.md):
//    ASSETS  (static assets)          DB (D1 database)
//  Vars:    GOOGLE_CLIENT_ID, GITHUB_CLIENT_ID
//  Secrets: GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_SECRET, SESSION_SECRET
// ============================================================================

const SESSION_COOKIE = 'st_sess';
const OAUTH_COOKIE = 'st_oauth';
const SESSION_TTL = 60 * 60 * 24 * 30;   // 30 days
const MAX_SYNC_BYTES = 8_000_000;        // per-request sync payload cap

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await handleApi(request, env, url); }
      catch (e) { return json({ error: e && e.message ? e.message : 'Server error' }, 500); }
    }
    return env.ASSETS.fetch(request);   // SPA + static files
  }
};

async function handleApi(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  let m = path.match(/^\/api\/auth\/(google|github)\/login$/);
  if (m && method === 'GET') return startOAuth(m[1], env, url);

  m = path.match(/^\/api\/auth\/(google|github)\/callback$/);
  if (m && method === 'GET') return oauthCallback(m[1], request, env, url);

  if (path === '/api/auth/logout' && method === 'POST') {
    return new Response(null, { status: 204, headers: { 'Set-Cookie': clearCookie(SESSION_COOKIE) } });
  }

  const uid = await getSession(request, env);

  if (path === '/api/me' && method === 'GET') {
    if (!uid) return json({ user: null }, 401);
    const user = await env.DB.prepare('SELECT id,email,name,avatar,provider FROM users WHERE id=?').bind(uid).first();
    return json({ user: user || null }, user ? 200 : 401);
  }

  if (path === '/api/sync') {
    if (!uid) return json({ error: 'unauthorized' }, 401);
    await migrateLegacy(env, uid);

    if (method === 'GET') {
      const since = Number(url.searchParams.get('since')) || 0;
      const now = Date.now();
      const irs = await env.DB.prepare(
        'SELECT id,data,updated_at,deleted FROM items WHERE user_id=? AND updated_at>?'
      ).bind(uid, since).all();
      const items = (irs.results || []).map(r => r.deleted
        ? { id: r.id, deleted: 1, updatedAt: r.updated_at }
        : { id: r.id, data: safeParse(r.data), updatedAt: r.updated_at });
      const srow = await env.DB.prepare('SELECT blob,updated_at FROM settings WHERE user_id=?').bind(uid).first();
      const settings = srow && srow.blob ? { blob: safeParse(srow.blob), updatedAt: srow.updated_at } : null;
      return json({ items, settings, now });
    }

    if (method === 'PUT') {
      const raw = await request.text();
      if (raw.length > MAX_SYNC_BYTES) return json({ error: 'payload too large' }, 413);
      let body; try { body = JSON.parse(raw); } catch (e) { return json({ error: 'invalid JSON' }, 400); }
      const now = Date.now();
      // Conditional upsert: only overwrite a row when the incoming change is at
      // least as new as the stored one — this is what makes the merge safe.
      const upItem = env.DB.prepare(
        'INSERT INTO items (user_id,id,data,updated_at,deleted) VALUES (?,?,?,?,?) ' +
        'ON CONFLICT(user_id,id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at, deleted=excluded.deleted ' +
        'WHERE excluded.updated_at >= items.updated_at'
      );
      const stmts = [];
      if (Array.isArray(body.items)) {
        for (const it of body.items) {
          if (!it || it.id == null) continue;
          const id = String(it.id);
          const ts = Number(it.updatedAt) || now;
          if (it.deleted) stmts.push(upItem.bind(uid, id, null, ts, 1));
          else stmts.push(upItem.bind(uid, id, JSON.stringify(it.data), ts, 0));
        }
      }
      if (body.settings && body.settings.blob !== undefined) {
        const ts = Number(body.settings.updatedAt) || now;
        stmts.push(env.DB.prepare(
          'INSERT INTO settings (user_id,blob,updated_at) VALUES (?,?,?) ' +
          'ON CONFLICT(user_id) DO UPDATE SET blob=excluded.blob, updated_at=excluded.updated_at ' +
          'WHERE excluded.updated_at >= settings.updated_at'
        ).bind(uid, JSON.stringify(body.settings.blob), ts));
      }
      if (stmts.length) await runBatched(env, stmts);
      return json({ ok: true, now });
    }
  }

  return json({ error: 'not found' }, 404);
}

// One-time expansion of a legacy full-state blob into the per-object tables.
// No-op once the user has any items/settings row (i.e. after first migration).
async function migrateLegacy(env, uid) {
  const it = await env.DB.prepare('SELECT 1 FROM items WHERE user_id=? LIMIT 1').bind(uid).first();
  if (it) return;
  const st = await env.DB.prepare('SELECT 1 FROM settings WHERE user_id=? LIMIT 1').bind(uid).first();
  if (st) return;
  const row = await env.DB.prepare('SELECT blob,updated_at FROM state WHERE user_id=?').bind(uid).first();
  if (!row || !row.blob) return;
  const blob = safeParse(row.blob);
  if (!blob) return;
  const ts = row.updated_at || Date.now();
  const stmts = [];
  const items = Array.isArray(blob.items) ? blob.items : [];
  const upItem = env.DB.prepare('INSERT OR IGNORE INTO items (user_id,id,data,updated_at,deleted) VALUES (?,?,?,?,0)');
  for (const b of items) {
    if (!b || b.id == null) continue;
    stmts.push(upItem.bind(uid, String(b.id), JSON.stringify(b), Number(b.updatedAt) || ts));
  }
  const settings = {};
  for (const k of ['customProjects', 'priorityProjects', 'projectParent', 'projectCollapsed', 'tagOrder', 'projectMeta']) {
    if (blob[k] !== undefined) settings[k] = blob[k];
  }
  stmts.push(env.DB.prepare('INSERT OR IGNORE INTO settings (user_id,blob,updated_at) VALUES (?,?,?)')
    .bind(uid, JSON.stringify(settings), ts));
  if (stmts.length) await runBatched(env, stmts);
}

function safeParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

// D1 caps the number of statements per batch(); run them in bounded chunks so a
// large first-time/full sync doesn't blow the limit.
const BATCH_SIZE = 50;
async function runBatched(env, stmts) {
  for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
    await env.DB.batch(stmts.slice(i, i + BATCH_SIZE));
  }
}

// ---------------------------------------------------------------- OAuth flow

function providerCfg(provider, env, origin) {
  const redirectUri = origin + '/api/auth/' + provider + '/callback';
  if (provider === 'google') return {
    clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET,
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile', redirectUri
  };
  return {
    clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET,
    authorize: 'https://github.com/login/oauth/authorize',
    token: 'https://github.com/login/oauth/access_token',
    scope: 'read:user user:email', redirectUri
  };
}

async function startOAuth(provider, env, url) {
  const cfg = providerCfg(provider, env, url.origin);
  if (!cfg.clientId || !cfg.clientSecret) return redirect('/?auth=unconfigured');
  const state = randHex(16);
  const authUrl = new URL(cfg.authorize);
  authUrl.searchParams.set('client_id', cfg.clientId);
  authUrl.searchParams.set('redirect_uri', cfg.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', cfg.scope);
  authUrl.searchParams.set('state', state);
  if (provider === 'google') { authUrl.searchParams.set('access_type', 'online'); authUrl.searchParams.set('prompt', 'select_account'); }
  const cookie = cookieStr(OAUTH_COOKIE, await signJwt({ state, provider, exp: nowSec() + 600 }, env), 600);
  return new Response(null, { status: 302, headers: { Location: authUrl.toString(), 'Set-Cookie': cookie } });
}

async function oauthCallback(provider, request, env, url) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const saved = await verifyJwt(getCookie(request, OAUTH_COOKIE), env);
  if (!code || !state || !saved || saved.state !== state || saved.provider !== provider) {
    console.error('oauth state check failed', provider, { hasCode: !!code, hasState: !!state, hasCookie: !!saved, stateMatch: saved ? saved.state === state : null });
    return redirect('/?auth=error&e=state');
  }

  const cfg = providerCfg(provider, env, url.origin);
  const tokenRes = await fetch(cfg.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: new URLSearchParams({
      client_id: cfg.clientId, client_secret: cfg.clientSecret,
      code, redirect_uri: cfg.redirectUri, grant_type: 'authorization_code'
    })
  });
  const tok = await tokenRes.json().catch(() => null);
  if (!tok || (!tok.access_token && !tok.id_token)) {
    console.error('oauth token exchange failed', provider, tokenRes.status, JSON.stringify(tok));
    return redirect('/?auth=error&e=token');
  }

  let profile;
  if (provider === 'google') {
    const claims = decodeJwtPayload(tok.id_token);
    if (!claims || !claims.sub) { console.error('google id_token decode failed'); return redirect('/?auth=error&e=gclaims'); }
    // The id_token comes straight from Google's token endpoint over TLS, but
    // validate audience/issuer anyway so a token minted for another client can
    // never be accepted here.
    const issOk = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
    if (claims.aud !== env.GOOGLE_CLIENT_ID || !issOk) {
      console.error('google id_token claim mismatch', { aud: claims.aud, iss: claims.iss });
      return redirect('/?auth=error&e=gclaims');
    }
    profile = { pid: claims.sub, email: claims.email || '', name: claims.name || claims.email || 'Account', avatar: claims.picture || '' };
  } else {
    const ghHeaders = { Authorization: 'Bearer ' + tok.access_token, 'User-Agent': 'saveto-me-app/1.0', Accept: 'application/vnd.github+json' };
    const gu = await (await fetch('https://api.github.com/user', { headers: ghHeaders })).json().catch(() => null);
    if (!gu || !gu.id) { console.error('github /user fetch failed', JSON.stringify(gu)); return redirect('/?auth=error&e=ghuser'); }
    let email = gu.email || '';
    if (!email) {
      const emails = await (await fetch('https://api.github.com/user/emails', { headers: ghHeaders })).json().catch(() => []);
      const primary = Array.isArray(emails) ? (emails.find(e => e.primary && e.verified) || emails.find(e => e.verified)) : null;
      email = primary ? primary.email : '';
    }
    profile = { pid: String(gu.id), email, name: gu.name || gu.login || 'Account', avatar: gu.avatar_url || '' };
  }

  const uid = provider + ':' + profile.pid;
  await env.DB.prepare(
    'INSERT INTO users (id,email,name,avatar,provider,created_at) VALUES (?,?,?,?,?,?) ' +
    'ON CONFLICT(id) DO UPDATE SET email=excluded.email, name=excluded.name, avatar=excluded.avatar'
  ).bind(uid, profile.email, profile.name, profile.avatar, provider, Date.now()).run();

  const sess = await signJwt({ uid, exp: nowSec() + SESSION_TTL }, env);
  const headers = new Headers();
  headers.append('Set-Cookie', cookieStr(SESSION_COOKIE, sess, SESSION_TTL));
  headers.append('Set-Cookie', clearCookie(OAUTH_COOKIE));
  headers.set('Location', '/');
  return new Response(null, { status: 302, headers });
}

async function getSession(request, env) {
  const p = await verifyJwt(getCookie(request, SESSION_COOKIE), env);
  return p ? p.uid : null;
}

// ---------------------------------------------------------------- JWT (HS256)

function reqSecret(env) { if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET not set'); return env.SESSION_SECRET; }

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signJwt(payload, env) {
  const h = b64urlStr(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64urlStr(JSON.stringify(payload));
  const data = h + '.' + p;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(reqSecret(env)), enc(data));
  return data + '.' + b64url(sig);
}
async function verifyJwt(token, env) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const data = parts[0] + '.' + parts[1];
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(reqSecret(env)), b64urlBytes(parts[2]), enc(data));
  if (!ok) return null;
  let payload; try { payload = JSON.parse(dec(b64urlBytes(parts[1]))); } catch (e) { return null; }
  if (payload.exp && payload.exp < nowSec()) return null;
  return payload;
}
function decodeJwtPayload(jwt) { try { return JSON.parse(dec(b64urlBytes(String(jwt).split('.')[1]))); } catch (e) { return null; } }

// ---------------------------------------------------------------- utilities

function enc(s) { return new TextEncoder().encode(s); }
function dec(b) { return new TextDecoder().decode(b); }
function b64url(buf) {
  const a = new Uint8Array(buf); let s = '';
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlStr(str) { return b64url(enc(str)); }
function b64urlBytes(s) {
  s = String(s || '').replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  let bin; try { bin = atob(s); } catch (e) { return new Uint8Array(0); }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function nowSec() { return Math.floor(Date.now() / 1000); }
function randHex(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, '0')).join(''); }
function cookieStr(name, val, maxAge) { return `${name}=${val}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`; }
function clearCookie(name) { return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`; }
function getCookie(request, name) {
  const h = request.headers.get('Cookie') || '';
  const m = h.match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return m ? m[1] : null;
}
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } }); }
function redirect(loc) { return new Response(null, { status: 302, headers: { Location: loc } }); }
