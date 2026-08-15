import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('capture flow validates and stores only canonical HTTP(S) URLs', () => {
  const start = app.indexOf('function handleAddParam()');
  const end = app.indexOf('// ---- Keyboard shortcuts cheat sheet', start);
  const handler = app.slice(start, end);

  assert.match(handler, /const captureUrl = safeHttpUrl\(add\);\s*if \(!captureUrl\) return;/);
  assert.match(handler, /const parsedUrl = new URL\(captureUrl\)/);
  assert.match(handler, /url: captureUrl/);
  assert.doesNotMatch(handler, /new URL\(add\)/);
  assert.doesNotMatch(handler, /url: add/);
});

test('Cmd-K link actions use the strict HTTP(S) opener', () => {
  const start = app.indexOf('function renderCmdk(query)');
  const end = app.indexOf('function cmdkMove', start);
  const cmdk = app.slice(start, end);

  assert.equal((cmdk.match(/openSafeHttpUrl\(i\.url\)/g) || []).length, 2);
  assert.doesNotMatch(cmdk, /window\.open\(i\.url/);
  assert.match(app, /function openSafeHttpUrl\(value\) \{\s*const target = safeHttpUrl\(value\);\s*if \(!target\) return false;\s*window\.open\(target, '_blank', 'noopener,noreferrer'\);/);
});
