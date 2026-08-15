import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import worker, { __test } from '../worker.js';

function bookmark(id = '01HVTEST') {
  return {
    id,
    data: {
      id,
      url: 'https://example.com/article',
      title: 'Article',
      description: 'Description',
      note: '',
      project: 'Reading',
      autoTags: ['Article'],
      suggestedTags: []
    },
    updatedAt: Date.now() + 10_000_000
  };
}

test('sync validation accepts a normal bookmark and ignores client clock semantics', () => {
  assert.deepEqual(__test.validateSyncBody({ items: [bookmark()] }), { ok: true, errors: [] });
});

test('sync validation rejects unsafe URLs and mismatched ids', () => {
  const item = bookmark('one');
  item.data.id = 'two';
  item.data.url = 'javascript:alert(1)';
  const result = __test.validateSyncBody({ items: [item] });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /must match id/);
  assert.match(result.errors.join('\n'), /must be http\(s\)/);
});

test('sync validation caps batch and individual item size', () => {
  const tooMany = Array.from({ length: 501 }, (_, i) => ({ id: String(i), deleted: 1 }));
  assert.equal(__test.validateSyncBody({ items: tooMany }).ok, false);
  const large = bookmark();
  large.data.note = 'x'.repeat(65_000);
  assert.equal(__test.validateSyncBody({ items: [large] }).ok, false);
});

test('sync cursor round-trips and rejects malformed input', () => {
  const value = { ts: 123, id: 'bookmark', since: 100, until: 200 };
  assert.deepEqual(__test.decodeCursor(__test.encodeCursor(value)), value);
  assert.equal(__test.decodeCursor('not-a-cursor'), null);
});

test('static and API responses receive security headers', async () => {
  const env = { ASSETS: { fetch: async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }) } };
  const page = await worker.fetch(new Request('https://saveto.me/'), env);
  assert.match(page.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  assert.equal(page.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(page.headers.get('Strict-Transport-Security'), /max-age=31536000/);
  assert.equal(page.headers.get('Cross-Origin-Opener-Policy'), 'same-origin');

  const api = await worker.fetch(new Request('https://saveto.me/api/sync'), env);
  assert.equal(api.status, 401);
  assert.equal(api.headers.get('Cache-Control'), 'no-store');
  assert.equal(api.headers.get('X-Frame-Options'), 'DENY');
});

test('production health probe checks D1 and exposes only operational metadata', async () => {
  const env = {
    DB: { prepare: () => ({ first: async () => ({ ok: 1 }) }) },
    ASSETS: { fetch: async () => new Response('asset') }
  };
  const response = await worker.fetch(new Request('https://saveto.me/api/healthz'), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.database, 'ok');
  assert.match(body.version, /^2026\./);
  assert.equal(JSON.stringify(body).includes('email'), false);
});

test('SPA routes always resolve through the current index asset', async () => {
  let requestedPath = '';
  const env = { ASSETS: { fetch: async request => {
    requestedPath = new URL(request.url).pathname;
    return new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } });
  } } };
  await worker.fetch(new Request('https://saveto.me/app', { headers: { Accept: 'text/html' } }), env);
  assert.equal(requestedPath, '/');
});

test('crawler endpoints are explicit and cacheable', async () => {
  const env = { ASSETS: { fetch: async () => new Response('asset') } };
  const robots = await worker.fetch(new Request('https://saveto.me/robots.txt'), env);
  assert.match(await robots.text(), /Sitemap: https:\/\/saveto\.me\/sitemap\.xml/);
  assert.match(robots.headers.get('Cache-Control'), /max-age=86400/);
  const sitemap = await worker.fetch(new Request('https://saveto.me/sitemap.xml'), env);
  assert.match(sitemap.headers.get('Content-Type'), /application\/xml/);
  const sitemapText = await sitemap.text();
  for (const path of ['', 'about/', 'faq/', 'contact/', 'privacy/', 'terms/', 'cookies/']) {
    assert.match(sitemapText, new RegExp(`<loc>https://saveto\\.me/${path}</loc>`));
  }
  const llms = await worker.fetch(new Request('https://saveto.me/llms.txt'), env);
  assert.match(llms.headers.get('Content-Type'), /text\/plain/);
  assert.match(await llms.text(), /AI-powered smart bookmark manager/);
});

test('robots separates public search discovery from private app and training crawl', async () => {
  const env = { ASSETS: { fetch: async () => new Response('asset') } };
  const response = await worker.fetch(new Request('https://saveto.me/robots.txt'), env);
  const text = await response.text();
  assert.match(text, /User-agent: OAI-SearchBot\nAllow: \//);
  assert.match(text, /Disallow: \/app/);
  assert.match(text, /User-agent: GPTBot\nDisallow: \//);
});

test('public content routes serve unique static documents and normalize trailing slashes', async () => {
  let requestedPath = '';
  const env = { ASSETS: { fetch: async request => {
    requestedPath = new URL(request.url).pathname;
    return new Response('<html>about</html>', { headers: { 'Content-Type': 'text/html' } });
  } } };
  const page = await worker.fetch(new Request('https://saveto.me/about/', { headers: { Accept: 'text/html' } }), env);
  assert.equal(page.status, 200);
  assert.equal(requestedPath, '/about/');
  const redirect = await worker.fetch(new Request('https://saveto.me/about', { headers: { Accept: 'text/html' } }), env);
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('Location'), 'https://saveto.me/about/');
});

test('private app is noindex and unknown document routes are real 404 responses', async () => {
  const env = { ASSETS: { fetch: async () => new Response('<html>app</html>', { headers: { 'Content-Type': 'text/html' } }) } };
  const app = await worker.fetch(new Request('https://saveto.me/app', { headers: { Accept: 'text/html' } }), env);
  assert.equal(app.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  const missing = await worker.fetch(new Request('https://saveto.me/not-a-real-page', { headers: { Accept: 'text/html' } }), env);
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /Page not found/);
});

test('www host redirects to the canonical origin before OAuth begins', async () => {
  const env = { ASSETS: { fetch: async () => new Response('asset') } };
  const response = await worker.fetch(new Request('https://www.saveto.me/api/auth/google/login?onboarding=1'), env);
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('Location'), 'https://saveto.me/api/auth/google/login?onboarding=1');
  assert.match(response.headers.get('Strict-Transport-Security'), /max-age=31536000/);
});

test('fully-qualified hostnames with a trailing dot redirect to the canonical origin', async () => {
  const env = { ASSETS: { fetch: async () => new Response('asset') } };
  for (const hostname of ['saveto.me.', 'www.saveto.me.']) {
    const response = await worker.fetch(new Request(`https://${hostname}/sitemap.xml`), env);
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), 'https://saveto.me/sitemap.xml');
  }
});

test('authenticated link health endpoint is routed through the library API', () => {
  const source = fs.readFileSync(new URL('../worker/library.js', import.meta.url), 'utf8');
  assert.match(source, /\/api\/library\/check/);
  assert.match(source, /classifyLinkHttpStatus\(response\.status\)/);
  assert.match(source, /method: 'GET'.*redirect: 'manual'/);
  assert.match(source, /\[401, 403, 405, 429\]/);
});

test('durable link health scans use an authenticated D1-backed queue job', () => {
  const library = fs.readFileSync(new URL('../worker/library.js', import.meta.url), 'utf8');
  const workerSource = fs.readFileSync(new URL('../worker.js', import.meta.url), 'utf8');
  const config = fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  const migration = fs.readFileSync(new URL('../migrations/0006_background_link_health.sql', import.meta.url), 'utf8');

  assert.match(library, /\/api\/library\/health-job/);
  assert.match(library, /request\.headers\.get\('Origin'\) !== url\.origin/);
  assert.match(library, /LINK_HEALTH_QUEUE\.send\(\{ type: 'link-health', jobId/);
  assert.match(library, /export async function processLinkHealthQueueMessage/);
  assert.match(library, /ON CONFLICT\(job_id,item_id\) DO NOTHING/);
  assert.match(workerSource, /async queue\(batch, env\)/);
  assert.match(workerSource, /message\.retry\(\{ delaySeconds:/);
  assert.match(workerSource, /markLinkHealthJobFailed/);
  assert.match(config, /\[\[queues\.producers\]\][\s\S]*binding = "LINK_HEALTH_QUEUE"/);
  assert.match(config, /\[\[queues\.consumers\]\][\s\S]*max_batch_size = 1/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS link_health_jobs/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_link_health_jobs_one_active/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS link_health_results/);
  assert.doesNotMatch(migration, /\burl\b/i);
});

test('permanent account deletion is server-confirmed and removes every owned data class', () => {
  const source = fs.readFileSync(new URL('../worker.js', import.meta.url), 'utf8');
  assert.match(source, /path === '\/api\/account' && method === 'DELETE'/);
  assert.match(source, /request\.headers\.get\('Origin'\) !== url\.origin/);
  assert.match(source, /body\.confirmation !== 'DELETE MY ACCOUNT'/);
  for (const table of ['library_fts', 'ask_history', 'ai_usage_daily', 'search_feedback', 'search_positive_feedback', 'client_errors', 'link_health_results', 'link_health_jobs', 'library_content', 'items', 'settings', 'state', 'users']) {
    assert.match(source, new RegExp(`DELETE FROM ${table}`));
  }
  assert.match(source, /LIBRARY_INDEX\.deleteByIds/);
  assert.match(source, /Set-Cookie.*clearCookie\(SESSION_COOKIE\)/s);
});
