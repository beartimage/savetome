import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const chromium = JSON.parse(fs.readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
const firefox = JSON.parse(fs.readFileSync(new URL('../extension/manifest.firefox.json', import.meta.url), 'utf8'));
const popup = fs.readFileSync(new URL('../extension/popup.js', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../extension/service-worker.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const landingCss = fs.readFileSync(new URL('../src/landing-theme.css', import.meta.url), 'utf8');

const extensionPackages = [
  'saveto-me-chrome-edge-brave-opera.zip',
  'saveto-me-firefox.xpi',
  'saveto-me-safari-web-extension-source.zip'
];

test('Chromium-family manifest has only the permissions needed for capture', () => {
  assert.equal(chromium.manifest_version, 3);
  assert.deepEqual(chromium.permissions, ['activeTab', 'contextMenus']);
  assert.equal(chromium.host_permissions, undefined);
  assert.equal(chromium.background.service_worker, 'service-worker.js');
});

test('Firefox manifest uses a persistent extension id and script background', () => {
  assert.equal(firefox.manifest_version, 3);
  assert.equal(firefox.browser_specific_settings.gecko.id, 'extension@saveto.me');
  assert.equal(firefox.browser_specific_settings.gecko.strict_min_version, '142.0');
  assert.deepEqual(
    firefox.browser_specific_settings.gecko.data_collection_permissions.required,
    ['browsingActivity', 'websiteContent']
  );
  assert.deepEqual(firefox.permissions, ['activeTab', 'contextMenus']);
  assert.equal(firefox.host_permissions, undefined);
  assert.deepEqual(firefox.background.scripts, ['service-worker.js']);
});

test('extension capture accepts only web pages and uses the first-party save flow', () => {
  for (const source of [popup, worker]) {
    assert.match(source, /https:\/\/saveto\.me/);
    assert.match(source, /\^https\?:\\\/\\\//i);
    assert.match(source, /source.*extension/);
  }
  assert.match(app, /extensionCaptureShouldClose/);
  assert.match(app, /await cloudPushNow\(\)/);
});

test('extension saves selected text with its source page', () => {
  assert.match(worker, /save-selection-to-saveto-me/);
  assert.match(worker, /contexts:\s*\['selection'\]/);
  assert.match(worker, /info\.selectionText/);
  assert.match(worker, /target\.hash = capture\.toString\(\)/);
  assert.doesNotMatch(worker, /target\.searchParams\.set\('selection'/);
  assert.match(app, /Saved selection:/);
  assert.match(app, /Selection added to saved link/);
});

test('landing and capture settings expose valid direct extension downloads', () => {
  assert.match(html, /<section class="sec" id="extensions">/);
  assert.match(html, /class="extension-links"/);
  assert.match(html, /class="settings-card-actions extension-downloads"/);

  for (const filename of extensionPackages) {
    const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const linkPattern = new RegExp(`<a\\b[^>]*href="/extensions/${escaped}"[^>]*\\bdownload\\b`, 'g');
    assert.ok((html.match(linkPattern) || []).length >= 2, `${filename} should be downloadable from landing and Settings`);

    const archive = fs.readFileSync(new URL(`../public/extensions/${filename}`, import.meta.url));
    assert.ok(archive.length > 4_000, `${filename} should be a non-empty distributable package`);
    assert.deepEqual([...archive.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04], `${filename} should be a zip-compatible package`);
  }
});

test('landing extension download layout stays usable on narrow screens', () => {
  assert.match(landingCss, /\.extension-links\s*\{[\s\S]*?display:\s*grid[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(landingCss, /@media\s*\(max-width:\s*600px\)[\s\S]*?\.extension-links\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(landingCss, /\.extension-links a\s*\{[\s\S]*?min-width:\s*0/);
});

test('landing uses one shared logo mark for branding and favicon', () => {
  assert.match(html, /rel="icon" type="image\/png" sizes="32x32" href="\/favicon-32\.png/);
  assert.match(html, /rel="icon" type="image\/png" sizes="16x16" href="\/favicon-16\.png/);
  assert.match(html, /rel="apple-touch-icon" href="\/apple-touch-icon\.png/);
  const touchIcon = fs.readFileSync(new URL('../public/apple-touch-icon.png', import.meta.url));
  assert.ok(touchIcon.length > 1_000, 'apple touch icon should be a real PNG asset');
  assert.deepEqual([...touchIcon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok((html.match(/src="\/logo-mark\.(?:png|svg)(?:\?v=[^"]+)?"/g) || []).length >= 3);
  const logo = fs.readFileSync(new URL('../public/logo-mark.svg', import.meta.url), 'utf8');
  assert.match(logo, /<circle[^>]+fill="#F4511E"/);
  for (const name of ['logo-mark.png', 'favicon-16.png', 'favicon-32.png', 'app-icon-192.png', 'app-icon-512.png']) {
    const icon = fs.readFileSync(new URL(`../public/${name}`, import.meta.url));
    assert.deepEqual([...icon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${name} should be a PNG`);
  }
  for (const size of [16, 32, 48, 128]) {
    const extensionIcon = fs.readFileSync(new URL(`../extension/icons/icon-${size}.png`, import.meta.url));
    assert.deepEqual([...extensionIcon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
});
