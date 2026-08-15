// ============================================================================

import {
  deleteLibraryVectors,
  handleLibraryApi,
  libraryDeleteStatements,
  librarySyncStatements,
  markLinkHealthJobFailed,
  processLinkHealthQueueMessage
} from './worker/library.js';
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
const MAX_SYNC_BYTES = 1_500_000;        // bounded before JSON parsing
const MAX_SYNC_ITEMS = 500;
const MAX_ITEM_BYTES = 64_000;
const MAX_SETTINGS_BYTES = 256_000;
const SYNC_PAGE_SIZE = 500;
const APP_VERSION = '2026.08.14.1';
const PUBLIC_PAGES = new Set(['about', 'faq', 'contact', 'privacy', 'terms', 'cookies']);
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' https: data:; connect-src 'self' https:; font-src 'self' data: https://fonts.gstatic.com; upgrade-insecure-requests",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY'
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // `/app` is the only public application entry point. Keep the trailing
    // slash variant canonical without accidentally treating `/app-icon-*`
    // assets as private application routes.
    const redirectAppTrailingSlash = (request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/app/';
    if (redirectAppTrailingSlash) url.pathname = '/app';
    // Keep one canonical production origin. Besides preventing duplicate SEO
    // pages, this guarantees that OAuth always uses the single callback URI
    // registered with Google and GitHub.
    const normalizedHostname = url.hostname.replace(/\.$/, '');
    if (normalizedHostname === 'www.saveto.me' || (normalizedHostname === 'saveto.me' && url.hostname !== normalizedHostname)) {
      url.hostname = 'saveto.me';
      return withSecurityHeaders(new Response(null, {
        status: 308,
        headers: { Location: url.toString(), 'Cache-Control': 'public, max-age=3600' }
      }));
    }
    if (redirectAppTrailingSlash) {
      return withSecurityHeaders(new Response(null, {
        status: 308,
        headers: { Location: url.toString(), 'Cache-Control': 'public, max-age=3600' }
      }));
    }
    if (url.pathname === '/robots.txt') {
      return withSecurityHeaders(new Response(
        'User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /app/\nDisallow: /api/\n\nUser-agent: OAI-SearchBot\nAllow: /\nDisallow: /app\nDisallow: /app/\nDisallow: /api/\n\nUser-agent: GPTBot\nDisallow: /\n\nSitemap: https://saveto.me/sitemap.xml\n', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' }
      }));
    }
    if (url.pathname === '/sitemap.xml') {
      const pages = ['', 'about/', 'faq/', 'contact/', 'privacy/', 'terms/', 'cookies/'];
      // Do not publish a guessed last-modified date. Search engines can infer
      // freshness from the response and crawl schedule when no reliable source
      // of publication dates exists for every page.
      const urls = pages.map(page => `<url><loc>https://saveto.me/${page}</loc></url>`).join('');
      return withSecurityHeaders(new Response(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`,
        { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } }
      ));
    }
    if (url.pathname === '/llms.txt') {
      return withSecurityHeaders(new Response(
        '# saveto.me\n\n> saveto.me is an AI-powered smart bookmark manager and private Personal Internet Library. It imports browser bookmarks, preserves folder structure, adds smart organization and tags, supports exact, full-text, and semantic search, detects duplicates and broken links, and answers questions using saved sources.\n\n## Public pages\n- [Home](https://saveto.me/): Product overview and key features\n- [About](https://saveto.me/about/): Mission and product principles\n- [FAQ](https://saveto.me/faq/): Product, import, search, AI, and privacy questions\n- [Contact](https://saveto.me/contact/): Product, privacy, security, and legal contacts\n- [Privacy Policy](https://saveto.me/privacy/): Data processing and user rights\n- [Terms of Service](https://saveto.me/terms/): Service terms and acceptable use\n- [Cookie Policy](https://saveto.me/cookies/): Essential cookies and local storage\n\n## Product summary\n- Slogan: Save anything. Find everything.\n- Category: AI-powered smart bookmarks; Personal Internet Library\n- Supported imports: Chrome, Safari, Firefox, Edge, Brave, Opera, and compatible bookmark HTML files\n- Core features: browser bookmark import, preserved folder hierarchy, smart folders, smart tags, duplicate detection, link health, full-text search, semantic search, private synchronization, and Ask My Library\n- Privacy: personal libraries are private by default; the public website does not expose saved links\n\n## Crawling\nPublic marketing and policy pages may be indexed. The authenticated application at /app and API routes under /api/ are not public content and should not be indexed.\n',
        { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } }
      ));
    }
    if (url.pathname.startsWith('/api/')) {
      try { return withSecurityHeaders(await handleApi(request, env, url, ctx)); }
      catch (e) {
        console.error(JSON.stringify({
          event: 'api_error', version: APP_VERSION, path: url.pathname,
          method: request.method, ray: request.headers.get('cf-ray') || null,
          error: errorMessage(e)
        }));
        return json({ error: 'server_error' }, 500);
      }
    }
    const publicPage = url.pathname.replace(/^\/+|\/+$/g, '');
    if ((request.method === 'GET' || request.method === 'HEAD') && PUBLIC_PAGES.has(publicPage)) {
      if (!url.pathname.endsWith('/')) {
        url.pathname = `/${publicPage}/`;
        return withSecurityHeaders(new Response(null, {
          status: 308,
          headers: { Location: url.toString(), 'Cache-Control': 'public, max-age=3600' }
        }));
      }
      return withSecurityHeaders(await env.ASSETS.fetch(request));
    }
    // Keep the supplied marketing page isolated from the application bundle.
    // This prevents legacy SPA CSS from changing the landing design while
    // preserving the existing app shell and authentication flow at `/app`.
    const acceptsHtml = request.headers.get('Accept')?.includes('text/html');
    const isLandingRoute = url.pathname === '/' || url.pathname === '/landing' || url.pathname === '/landing/';
    if ((request.method === 'GET' || request.method === 'HEAD') && acceptsHtml && (isLandingRoute || url.pathname === '/app')) {
      const indexUrl = new URL(request.url);
      // Cloudflare Assets serves `landing.html` at the clean `/landing` URL.
      // Requesting `/landing.html` triggers its canonical redirect, so use the
      // clean asset path here to avoid a `/landing` redirect loop.
      indexUrl.pathname = isLandingRoute ? '/landing' : '/';
      const response = await env.ASSETS.fetch(new Request(indexUrl, request));
      const headers = new Headers(response.headers);
      // HTML must always revalidate so an open mobile browser never revives an
      // obsolete landing/app shell while hashed JS and CSS remain cacheable.
      headers.set('Cache-Control', 'no-store');
      if (url.pathname === '/app') {
        headers.set('X-Robots-Tag', 'noindex, nofollow');
        return withSecurityHeaders(new Response(response.body, { status: response.status, headers }));
      }
      return withSecurityHeaders(new Response(response.body, { status: response.status, headers }));
    }
    if ((request.method === 'GET' || request.method === 'HEAD') && acceptsHtml && !url.pathname.includes('.')) {
      return withSecurityHeaders(new Response(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | saveto.me</title></head><body><main><h1>Page not found</h1><p>The page you requested does not exist.</p><a href="/">Return to saveto.me</a></main></body></html>',
        { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' } }
      ));
    }
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        const result = await processLinkHealthQueueMessage(env, message.body);
        if (result && result.busy) message.retry({ delaySeconds: 20 });
        else message.ack();
      } catch (error) {
        console.error(JSON.stringify({
          event: 'link_health_queue_failed', version: APP_VERSION,
          jobId: message.body && message.body.jobId || null,
          attempt: message.attempts, error: errorMessage(error)
        }));
        if (message.attempts >= 5) {
          try { await markLinkHealthJobFailed(env, message.body && message.body.jobId, error); }
          catch (markError) {
            console.error(JSON.stringify({ event: 'link_health_failure_persist_failed', error: errorMessage(markError) }));
            message.retry({ delaySeconds: 60 });
            continue;
          }
          message.ack();
        } else message.retry({ delaySeconds: Math.min(15 * message.attempts, 60) });
      }
    }
  }
};

async function handleApi(request, env, url, ctx) {
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/healthz' && method === 'GET') {
    const started = Date.now();
    try {
      await env.DB.prepare('SELECT 1 AS ok').first();
      return json({ ok: true, version: APP_VERSION, database: 'ok', latencyMs: Date.now() - started });
    } catch (error) {
      console.error(JSON.stringify({ event: 'health_check_failed', version: APP_VERSION, error: errorMessage(error) }));
      return json({ ok: false, version: APP_VERSION, database: 'error' }, 503);
    }
  }

  let m = path.match(/^\/api\/auth\/(google|github)\/login$/);
  if (m && method === 'GET') return startOAuth(m[1], env, url);

  m = path.match(/^\/api\/auth\/(google|github)\/callback$/);
  if (m && method === 'GET') return oauthCallback(m[1], request, env, url);

  if (path === '/api/auth/logout' && method === 'POST') {
    // Revoke the session server-side, not just in the browser: bump the user's
    // token_version so any still-valid copy of the old cookie stops working.
    const p = await verifyJwt(getCookie(request, SESSION_COOKIE), env);
    if (p && p.uid) {
      try { await env.DB.prepare('UPDATE users SET token_version = COALESCE(token_version,0) + 1 WHERE id=?').bind(p.uid).run(); }
      catch (e) { if (!/no such column/i.test(errorMessage(e))) throw e; }
    }
    return new Response(null, { status: 204, headers: { 'Set-Cookie': clearCookie(SESSION_COOKIE) } });
  }

  const uid = await getSession(request, env);

  if (path === '/api/me' && method === 'GET') {
    if (!uid) return json({ user: null }, 401);
    const user = await env.DB.prepare('SELECT id,email,name,avatar,provider FROM users WHERE id=?').bind(uid).first();
    return json({ user: user || null }, user ? 200 : 401);
  }

  if (path === '/api/account' && method === 'DELETE') {
    if (!uid) return json({ error: 'unauthorized' }, 401);
    if (request.headers.get('Origin') !== url.origin) return json({ error: 'invalid_origin' }, 403);
    const raw = await readLimitedText(request, 1_024);
    if (raw == null) return json({ error: 'payload_too_large' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch (e) { return json({ error: 'invalid_json' }, 400); }
    if (!body || body.confirmation !== 'DELETE MY ACCOUNT') {
      return json({ error: 'confirmation_required' }, 400);
    }
    return deleteAccount(env, uid);
  }

  if (path === '/api/client-error' && method === 'POST') {
    if (request.headers.get('Origin') !== url.origin) return json({ error: 'invalid_origin' }, 403);
    const raw = await readLimitedText(request, 4_000);
    if (raw == null) return json({ error: 'payload_too_large' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch (e) { return json({ error: 'invalid_json' }, 400); }
    const scope = cleanDiagnostic(body && body.scope, 80);
    const errorName = cleanDiagnostic(body && body.name, 80);
    const message = cleanDiagnostic(body && body.message, 500);
    if (!scope || !message) return json({ error: 'invalid_error_report' }, 400);

    // Boot failures can occur before OAuth has established a session. Accept a
    // same-origin, size-bounded anonymous signal so the client reporter does
    // not silently fail, but keep the diagnostic journal strictly user-owned:
    // anonymous reports are neither persisted nor logged with their message.
    if (!uid) {
      console.warn(JSON.stringify({
        event: 'client_error_anonymous', version: APP_VERSION,
        scope, errorName: errorName || 'Error'
      }));
      return json({ ok: true }, 202);
    }

    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO client_errors (user_id,scope,error_name,message,app_version,created_at) VALUES (?,?,?,?,?,?)'
      ).bind(uid, scope, errorName || 'Error', message, APP_VERSION, now),
      env.DB.prepare('DELETE FROM client_errors WHERE user_id=? AND created_at<?')
        .bind(uid, now - 30 * 86_400_000)
    ]);
    console.warn(JSON.stringify({ event: 'client_error', version: APP_VERSION, scope, errorName: errorName || 'Error' }));
    return json({ ok: true }, 202);
  }

  if (path.startsWith('/api/library/')) {
    if (!uid) return json({ error: 'unauthorized' }, 401);
    await migrateLegacy(env, uid);
    return handleLibraryApi(request, env, url, uid);
  }

  if (path === '/api/sync') {
    if (!uid) return json({ error: 'unauthorized' }, 401);
    await migrateLegacy(env, uid);

    if (method === 'GET') {
      const page = parseSyncPage(url);
      if (!page) return json({ error: 'invalid_cursor' }, 400);
      // Clamp to [1, SYNC_PAGE_SIZE]. Without the lower bound a negative limit
      // becomes a negative SQL LIMIT, which SQLite treats as "no limit".
      const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || SYNC_PAGE_SIZE, SYNC_PAGE_SIZE));
      const irs = await env.DB.prepare(
        'SELECT id,data,updated_at,deleted FROM items ' +
        'WHERE user_id=? AND updated_at<=? AND (updated_at>? OR (updated_at=? AND id>?)) ' +
        'ORDER BY updated_at ASC, id ASC LIMIT ?'
      ).bind(uid, page.until, page.ts, page.ts, page.id, limit + 1).all();
      const rows = irs.results || [];
      const hasMore = rows.length > limit;
      const visibleRows = hasMore ? rows.slice(0, limit) : rows;
      const items = visibleRows.map(r => r.deleted
        ? { id: r.id, deleted: 1, updatedAt: r.updated_at }
        : { id: r.id, data: safeParse(r.data), updatedAt: r.updated_at });
      const srow = await env.DB.prepare('SELECT blob,updated_at FROM settings WHERE user_id=?').bind(uid).first();
      const settings = srow && srow.blob && srow.updated_at > page.since && srow.updated_at <= page.until
        ? { blob: safeParse(srow.blob), updatedAt: srow.updated_at }
        : null;
      const last = visibleRows[visibleRows.length - 1];
      const nextCursor = hasMore && last
        ? encodeCursor({ ts: last.updated_at, id: last.id, since: page.since, until: page.until })
        : null;
      return json({ items, settings, nextCursor, hasMore, now: hasMore ? null : page.until });
    }

    if (method === 'PUT') {
      // Same-origin guard for the main write path, matching /api/account and
      // /api/client-error. SameSite=Lax already blocks cross-site cookie sends,
      // but an explicit Origin check is defense-in-depth against CSRF writes.
      if (request.headers.get('Origin') !== url.origin) return json({ error: 'invalid_origin' }, 403);
      const contentLength = Number(request.headers.get('Content-Length'));
      if (Number.isFinite(contentLength) && contentLength > MAX_SYNC_BYTES) return json({ error: 'payload_too_large' }, 413);
      const raw = await readLimitedText(request, MAX_SYNC_BYTES);
      if (raw == null) return json({ error: 'payload_too_large' }, 413);
      let body; try { body = JSON.parse(raw); } catch (e) { return json({ error: 'invalid JSON' }, 400); }
      const validation = validateSyncBody(body);
      if (!validation.ok) return json({ error: 'invalid_payload', details: validation.errors }, 400);
      const now = Date.now();
      // The server owns conflict ordering. Client clocks are deliberately ignored:
      // a clock set years into the future must never freeze a bookmark forever.
      const upItem = env.DB.prepare(
        'INSERT INTO items (user_id,id,data,updated_at,deleted) VALUES (?,?,?,?,?) ' +
        'ON CONFLICT(user_id,id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at, deleted=excluded.deleted'
      );
      const stmts = [];
      const vectorDeleteIds = [];
      if (Array.isArray(body.items)) {
        for (const it of body.items) {
          const id = String(it.id);
          if (it.deleted) {
            stmts.push(upItem.bind(uid, id, null, now, 1));
            stmts.push(...libraryDeleteStatements(env, uid, id));
            vectorDeleteIds.push(id);
          } else {
            stmts.push(upItem.bind(uid, id, JSON.stringify(it.data), now, 0));
            stmts.push(...librarySyncStatements(env, uid, it.data, now));
          }
        }
      }
      if (body.settings && body.settings.blob !== undefined) {
        stmts.push(env.DB.prepare(
          'INSERT INTO settings (user_id,blob,updated_at) VALUES (?,?,?) ' +
          'ON CONFLICT(user_id) DO UPDATE SET blob=excluded.blob, updated_at=excluded.updated_at'
        ).bind(uid, JSON.stringify(body.settings.blob), now));
      }
      if (stmts.length) await runBatched(env, stmts);
      if (vectorDeleteIds.length && ctx) {
        ctx.waitUntil(deleteLibraryVectors(env, uid, vectorDeleteIds).catch(error => {
          console.error(JSON.stringify({ message: 'vector cleanup failed', error: errorMessage(error) }));
        }));
      }
      return json({ ok: true, appliedAt: now, now });
    }
  }

  return json({ error: 'not found' }, 404);
}

async function deleteAccount(env, uid) {
  // Vectorize is not relational, so remove those records first. If it fails,
  // keep the D1 account intact so the user can safely retry the deletion.
  const vectorRows = await env.DB.prepare(
    'SELECT vector_id FROM library_content WHERE user_id=? AND vector_id IS NOT NULL'
  ).bind(uid).all();
  const vectorIds = (vectorRows.results || []).map(row => row.vector_id).filter(Boolean);
  if (env.LIBRARY_INDEX) {
    for (let i = 0; i < vectorIds.length; i += 500) {
      await env.LIBRARY_INDEX.deleteByIds(vectorIds.slice(i, i + 500));
    }
  }

  // Delete every account-owned row in one D1 batch. The users row is last so
  // foreign-key-safe schemas and future migrations cannot leave child data.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM library_fts WHERE user_id=?').bind(uid),
    env.DB.prepare('DELETE FROM ask_history WHERE user_id=?').bind(uid),
    env.DB.prepare('DELETE FROM ai_usage_daily WHERE user_id=?').bind(uid),
    env.DB.prepare('DELETE FROM search_feedback WHERE user_id=?').bind(uid),
    env.DB.prepare('DELETE FROM search_positive_feedback WHERE user_id=?').bind(uid),
    env.DB.prepare('DELETE FROM client_errors WHERE user_id=?').bind(uid),
    env.DB.prepare('DELETE FROM link_health_results WHERE user_id=?').bind(uid),
    env.DB.prepare('DELETE FROM link_health_jobs WHERE user_id=?').bind(uid),
    env.DB.prepare('DELETE FROM library_content WHERE user_id=?').bind(uid),
    env.DB.prepare('DELETE FROM items WHERE user_id=?').bind(uid),
    env.DB.prepare('DELETE FROM settings WHERE user_id=?').bind(uid),
    env.DB.prepare('DELETE FROM state WHERE user_id=?').bind(uid),
    env.DB.prepare('DELETE FROM users WHERE id=?').bind(uid)
  ]);
  return new Response(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store', 'Set-Cookie': clearCookie(SESSION_COOKIE) }
  });
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
    stmts.push(...librarySyncStatements(env, uid, b, Number(b.updatedAt) || ts));
  }
  const settings = {};
  for (const k of ['folderSchemaVersion', 'folders', 'customProjects', 'priorityProjects', 'projectParent', 'projectCollapsed', 'tagOrder', 'projectMeta']) {
    if (blob[k] !== undefined) settings[k] = blob[k];
  }
  stmts.push(env.DB.prepare('INSERT OR IGNORE INTO settings (user_id,blob,updated_at) VALUES (?,?,?)')
    .bind(uid, JSON.stringify(settings), ts));
  if (stmts.length) await runBatched(env, stmts);
}

function safeParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

async function readLimitedText(request, maxBytes) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel('payload too large');
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function validateSyncBody(body) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, errors: ['body must be an object'] };
  const items = body.items === undefined ? [] : body.items;
  if (!Array.isArray(items)) errors.push('items must be an array');
  else if (items.length > MAX_SYNC_ITEMS) errors.push(`items must contain at most ${MAX_SYNC_ITEMS} entries`);
  else {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it || typeof it !== 'object' || Array.isArray(it)) { errors.push(`items[${i}] must be an object`); continue; }
      const id = String(it.id == null ? '' : it.id);
      if (!id || id.length > 128) errors.push(`items[${i}].id is invalid`);
      if (!it.deleted) {
        if (!it.data || typeof it.data !== 'object' || Array.isArray(it.data)) { errors.push(`items[${i}].data must be an object`); continue; }
        if (String(it.data.id) !== id) errors.push(`items[${i}].data.id must match id`);
        if (!isHttpUrl(it.data.url)) errors.push(`items[${i}].data.url must be http(s)`);
        validateText(it.data.title, 2_000, `items[${i}].data.title`, errors);
        validateText(it.data.description, 10_000, `items[${i}].data.description`, errors);
        validateText(it.data.note, 50_000, `items[${i}].data.note`, errors);
        validateText(it.data.project, 500, `items[${i}].data.project`, errors);
        validateText(it.data.folderId, 128, `items[${i}].data.folderId`, errors);
        validateText(it.data.projectName, 500, `items[${i}].data.projectName`, errors);
        validateTags(it.data.autoTags, `items[${i}].data.autoTags`, errors);
        validateTags(it.data.suggestedTags, `items[${i}].data.suggestedTags`, errors);
        if (byteLength(JSON.stringify(it.data)) > MAX_ITEM_BYTES) errors.push(`items[${i}].data is too large`);
      }
      if (errors.length >= 20) break;
    }
  }
  if (body.settings !== undefined) {
    if (!body.settings || typeof body.settings !== 'object' || Array.isArray(body.settings)) errors.push('settings must be an object');
    else if (body.settings.blob === undefined || !body.settings.blob || typeof body.settings.blob !== 'object' || Array.isArray(body.settings.blob)) errors.push('settings.blob must be an object');
    else if (byteLength(JSON.stringify(body.settings.blob)) > MAX_SETTINGS_BYTES) errors.push('settings.blob is too large');
  }
  return { ok: errors.length === 0, errors };
}

function validateText(value, max, path, errors) {
  if (value !== undefined && (typeof value !== 'string' || value.length > max)) errors.push(`${path} must be a string up to ${max} characters`);
}

function validateTags(value, path, errors) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 64 || value.some(tag => typeof tag !== 'string' || tag.length > 100)) {
    errors.push(`${path} must contain at most 64 short strings`);
  }
}

function isHttpUrl(value) {
  if (typeof value !== 'string' || value.length > 8_192) return false;
  try { const url = new URL(value); return url.protocol === 'http:' || url.protocol === 'https:'; }
  catch (_) { return false; }
}

function byteLength(value) { return new TextEncoder().encode(value).byteLength; }

function parseSyncPage(url) {
  const cursor = url.searchParams.get('cursor');
  if (cursor) return decodeCursor(cursor);
  const sinceRaw = url.searchParams.get('since');
  const since = sinceRaw == null || sinceRaw === '' ? 0 : Number(sinceRaw);
  if (!Number.isFinite(since) || since < 0) return null;
  return { ts: since, id: '', since, until: Date.now() };
}

function encodeCursor(value) { return b64urlStr(JSON.stringify(value)); }
function decodeCursor(value) {
  try {
    const parsed = JSON.parse(dec(b64urlBytes(value)));
    if (!parsed || !Number.isFinite(parsed.ts) || !Number.isFinite(parsed.since) || !Number.isFinite(parsed.until)) return null;
    if (parsed.ts < 0 || parsed.since < 0 || parsed.until < parsed.ts || typeof parsed.id !== 'string' || parsed.id.length > 128) return null;
    return parsed;
  } catch (_) { return null; }
}

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
  const onboarding = url.searchParams.get('onboarding') === '1';
  const cookie = cookieStr(OAUTH_COOKIE, await signJwt({ state, provider, onboarding, exp: nowSec() + 600 }, env), 600);
  return new Response(null, { status: 302, headers: { Location: authUrl.toString(), 'Set-Cookie': cookie } });
}

async function oauthCallback(provider, request, env, url) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const saved = await verifyJwt(getCookie(request, OAUTH_COOKIE), env);
  if (!code || !state || !saved || !timingSafeEqualStr(saved.state, state) || saved.provider !== provider) {
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
    const claims = await verifyGoogleIdToken(tok.id_token, env);
    if (!claims || !claims.sub) { console.error('google id_token verify failed'); return redirect('/?auth=error&e=gclaims'); }
    // Only trust the email address if Google asserts it is verified; otherwise
    // keep the account (keyed by the stable `sub`) but store no email.
    const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
    profile = { pid: claims.sub, email: emailVerified ? (claims.email || '') : '', name: claims.name || claims.email || 'Account', avatar: claims.picture || '' };
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

  // Bind the session to the user's current token_version so logout/deletion can
  // revoke it server-side (see getSession). Tolerate a not-yet-migrated DB.
  let tv = 0;
  try {
    const urow = await env.DB.prepare('SELECT token_version FROM users WHERE id=?').bind(uid).first();
    tv = (urow && urow.token_version) || 0;
  } catch (e) { if (!/no such column/i.test(errorMessage(e))) throw e; }

  const sess = await signJwt({ uid, tv, exp: nowSec() + SESSION_TTL }, env);
  const headers = new Headers();
  headers.append('Set-Cookie', cookieStr(SESSION_COOKIE, sess, SESSION_TTL));
  headers.append('Set-Cookie', clearCookie(OAUTH_COOKIE));
  headers.set('Location', saved.onboarding ? '/app?onboarding=1' : '/app');
  return new Response(null, { status: 302, headers });
}

async function getSession(request, env) {
  const p = await verifyJwt(getCookie(request, SESSION_COOKIE), env);
  if (!p || !p.uid) return null;
  // A signed JWT alone is not enough: the account may have been deleted (row
  // gone) or logged out (token_version bumped). Verify both so a captured
  // cookie cannot outlive either event.
  try {
    const row = await env.DB.prepare('SELECT token_version FROM users WHERE id=?').bind(p.uid).first();
    if (!row) return null;
    if ((row.token_version || 0) !== (p.tv || 0)) return null;
    return p.uid;
  } catch (e) {
    // token_version column absent (migration 0007 not applied yet): fall back to
    // signature-only verification so the app keeps working; revocation and the
    // deleted-user check activate automatically once the migration is applied.
    if (/no such column/i.test(errorMessage(e))) return p.uid;
    throw e;
  }
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
  // Pin the algorithm to HS256. Never let the token's own header select the
  // verification scheme (alg-confusion / "alg:none" defense).
  let header; try { header = JSON.parse(dec(b64urlBytes(parts[0]))); } catch (e) { return null; }
  if (!header || header.alg !== 'HS256') return null;
  const data = parts[0] + '.' + parts[1];
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(reqSecret(env)), b64urlBytes(parts[2]), enc(data));
  if (!ok) return null;
  let payload; try { payload = JSON.parse(dec(b64urlBytes(parts[1]))); } catch (e) { return null; }
  // Both tokens we mint always set exp; require it so a token without an expiry
  // can never be treated as valid forever.
  if (!payload.exp || payload.exp < nowSec()) return null;
  return payload;
}
// Full OIDC verification of a Google id_token: RS256 signature against Google's
// published JWKS, plus issuer / audience / expiry checks. The token is already
// fetched server-side over TLS, but verifying the signature makes a forged or
// swapped token impossible even if that transport assumption ever breaks.
async function verifyGoogleIdToken(idToken, env) {
  try {
    const parts = String(idToken || '').split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(dec(b64urlBytes(parts[0])));
    if (header.alg !== 'RS256' || !header.kid) return null;
    const jwk = await googleJwk(header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), enc(parts[0] + '.' + parts[1]));
    if (!ok) return null;
    const claims = JSON.parse(dec(b64urlBytes(parts[1])));
    const issOk = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
    if (!issOk || claims.aud !== env.GOOGLE_CLIENT_ID) return null;
    if (!claims.exp || claims.exp < nowSec()) return null;
    return claims;
  } catch (e) { console.error('verifyGoogleIdToken error', e && e.message); return null; }
}

// Fetch (and per-isolate cache) Google's OIDC signing keys, indexed by kid.
// Refetches on a cache miss so key rotation is handled automatically.
let _googleJwks = null;
async function googleJwk(kid) {
  if (!_googleJwks || !_googleJwks[kid]) {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    const data = await res.json().catch(() => null);
    if (!data || !Array.isArray(data.keys)) return null;
    _googleJwks = {};
    for (const k of data.keys) _googleJwks[k.kid] = k;
  }
  return _googleJwks[kid] || null;
}

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
// Length-independent constant-time string compare for short secrets (OAuth
// state). Avoids leaking a match prefix via early-exit timing.
function timingSafeEqualStr(a, b) {
  a = String(a == null ? '' : a); b = String(b == null ? '' : b);
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function randHex(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, '0')).join(''); }
function cookieStr(name, val, maxAge) { return `${name}=${val}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`; }
function clearCookie(name) { return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`; }
function getCookie(request, name) {
  const h = request.headers.get('Cookie') || '';
  const m = h.match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return m ? m[1] : null;
}
function json(obj, status = 200) {
  const response = new Response(JSON.stringify(obj), {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' }
  });
  return withSecurityHeaders(response);
}
function redirect(loc) { return new Response(null, { status: 302, headers: { Location: loc } }); }

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function errorMessage(error) { return error instanceof Error ? error.message : String(error); }
function cleanDiagnostic(value, max) {
  return String(value == null ? '' : value)
    .replace(/https?:\/\/[^\s"'<>()]+/gi, '[url]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[token]')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export const __test = { decodeCursor, encodeCursor, parseSyncPage, validateSyncBody };
