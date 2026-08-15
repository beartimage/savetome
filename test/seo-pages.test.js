import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url);
const pages = ['about', 'faq', 'contact', 'privacy', 'terms', 'cookies'];

test('each public information page has unique crawl and social metadata', () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const page of pages) {
    const html = fs.readFileSync(new URL(`../public/${page}/index.html`, import.meta.url), 'utf8');
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
    assert.ok(title && title.length >= 20 && title.length <= 70, `${page} title`);
    assert.ok(description && description.length >= 70 && description.length <= 180, `${page} description`);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://saveto\\.me/${page}/">`));
    assert.match(html, new RegExp(`<meta property="og:url" content="https://saveto\\.me/${page}/">`));
    assert.match(html, /<meta name="robots" content="index,follow/);
    assert.match(html, /<h1>[^<]+<\/h1>/);
    assert.match(html, /<script type="application\/ld\+json">/);
    titles.add(title);
    descriptions.add(description);
  }
  assert.equal(titles.size, pages.length);
  assert.equal(descriptions.size, pages.length);
});

test('structured data is valid JSON and the landing links every public page', () => {
  for (const page of pages) {
    const html = fs.readFileSync(new URL(`../public/${page}/index.html`, import.meta.url), 'utf8');
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.ok(blocks.length, `${page} schema`);
    blocks.forEach(block => assert.doesNotThrow(() => JSON.parse(block[1])));
  }
  const landing = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  pages.forEach(page => assert.match(landing, new RegExp(`href="/${page}/"`)));
});

test('manifest and llms discovery assets are shipped from public', () => {
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(new URL('../public/site.webmanifest', import.meta.url), 'utf8')));
  assert.ok(fs.existsSync(path.join(new URL(root).pathname, 'public', 'site-pages.css')));
});

test('public contact information uses one canonical email address', () => {
  const publicHtml = pages
    .map(page => fs.readFileSync(new URL(`../public/${page}/index.html`, import.meta.url), 'utf8'))
    .join('\n');
  const addresses = [...publicHtml.matchAll(/mailto:([^?"']+)/g)].map(match => match[1]);
  assert.ok(addresses.length >= 1);
  assert.deepEqual(new Set(addresses), new Set(['contact@beartimage.com']));
  assert.doesNotMatch(publicHtml, /(?:support|privacy|security|legal)@saveto\.me/i);
});
