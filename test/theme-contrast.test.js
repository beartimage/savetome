import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('smart view icons and mobile folder headings inherit active theme colors', () => {
  assert.match(css, /\.sf-badge-recent[\s\S]*background:\s*var\(--brand-primary\)\s*!important/);
  assert.match(css, /\.sf-badge-recent[\s\S]*color:\s*var\(--on-brand\)\s*!important/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.sf-name[\s\S]*white-space:\s*normal/);
  assert.match(css, /body\.app-active #appShell \.sf-name \{ color:\s*var\(--text-main\)/);
});

test('header menu uses the single production palette', () => {
  assert.match(css, /body\.app-active \.header-menu-dropdown \.hmenu-item \{ color: var\(--text-main\); \}/);
  assert.match(css, /body\.app-active \.header-menu-dropdown \.hmenu-ic \{ color: var\(--text-muted\); \}/);
  assert.doesNotMatch(css, /\.theme-swatch/);
});

function block(selector) {
  const start = css.indexOf(selector + ' {');
  assert.notEqual(start, -1, `missing ${selector} block`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unterminated ${selector} block`);
}

function colors(selector) {
  const out = {};
  for (const match of block(selector).matchAll(/--([\w-]+)\s*:\s*(#[0-9a-f]{6})\b/gi)) out[match[1]] = match[2];
  return out;
}

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(value => Number.parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

function mixHex(foreground, background, foregroundWeight) {
  const foregroundRgb = foreground.slice(1).match(/../g).map(value => Number.parseInt(value, 16));
  const backgroundRgb = background.slice(1).match(/../g).map(value => Number.parseInt(value, 16));
  const channels = foregroundRgb.map((value, index) => Math.round(
    value * foregroundWeight + backgroundRgb[index] * (1 - foregroundWeight)
  ));
  return `#${channels.map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

const base = colors(':root');
const twoModeLight = colors('html body.app-active');
const orangeMode = colors('html.theme-orange body.app-active');
const themes = {
  orange: { ...base, ...twoModeLight, ...orangeMode }
};

test('folder and globe icons inherit the single Graphite Orange folder accent', () => {
  const globe = app.match(/globe:\s*'([^']+)'/)?.[1] || '';
  assert.match(globe, /fill="none"/);
  assert.match(globe, /stroke="currentColor"/);
  assert.doesNotMatch(globe, /(?:fill|stroke)="(?:#(?:000|fff)|black|white)"/i);

  const paletteSource = app.match(/const FOLDER_COLORS = \[([^\]]+)\]/)?.[1] || '';
  const accents = [...paletteSource.matchAll(/#[0-9a-f]{6}/gi)].map(match => match[0]);
  assert.deepEqual(accents.map(accent => accent.toUpperCase()), ['#F4511E']);
  assert.match(app, /function projectColor\(name\)[\s\S]*?return FOLDER_COLORS\[0\]/);
  assert.match(app, /const previewColor = projectColor\(name\) \|\| 'var\(--brand-primary\)'/);

  for (const [name, palette] of Object.entries(themes)) {
    for (const accent of accents) {
      const contentInk = mixHex(accent, palette['text-main'], 0.40);
      const tintedContentSurface = mixHex(accent, palette['bg-card'], 0.18);
      assert.ok(
        contrast(contentInk, tintedContentSurface) >= 4.5,
        `${name}: ${accent} folder icon is unreadable on its content tint`
      );

      const navigationInk = mixHex(accent, palette['nav-text'], 0.40);
      assert.ok(
        contrast(navigationInk, palette['nav-bg']) >= 4.5,
        `${name}: ${accent} folder icon is unreadable in navigation`
      );
    }
  }
});

test('folder accents use theme variables in every rendered folder surface', () => {
  assert.ok(app.includes("class=\"finder-folder-icon${accent ? ' has-folder-accent' : ''}\""));
  assert.ok(app.includes("class=\"cmdk-ic${r.color ? ' has-folder-accent' : ''}\""));
  assert.doesNotMatch(app, /style="background:\$\{projectColor\(k\)\}22;color:\$\{projectColor\(k\)\}"/);
  assert.doesNotMatch(app, /style="background:\$\{r\.color\}22;color:\$\{r\.color\}"/);
  assert.match(css, /\.cmdk-row \.cmdk-ic\.has-folder-accent \{[\s\S]*?color: color-mix\(in srgb, var\(--folder-accent\) 40%, var\(--text-main\)\)/);
  assert.match(css, /\.finder-folder-icon\.has-folder-accent \{[\s\S]*?color: color-mix\(in srgb, var\(--folder-accent\) 40%, var\(--text-main\)\)/);
  assert.match(css, /\.finder-table\s*\{[\s\S]*?background:\s*var\(--bg-card\)[\s\S]*?color:\s*var\(--text-main\)/);
  assert.match(css, /\.finder-header\s*\{[\s\S]*?color:\s*var\(--text-muted\)/);
  assert.match(css, /\.finder-row\s*\{[\s\S]*?border-bottom:\s*1px solid var\(--border-subtle\)/);

  const genericBadge = css.indexOf('body.app-active #appShell :where(.sf-badge,');
  const accentedBadge = css.indexOf('body.app-active #appShell .sf-badge.has-folder-accent {');
  assert.ok(genericBadge >= 0 && accentedBadge > genericBadge, 'custom folder badge must win the late app cascade');
  assert.equal(css.lastIndexOf('body.app-active #appShell .sf-badge.has-folder-accent {'), accentedBadge);
  assert.match(css.slice(accentedBadge), /\.sf-badge\.has-folder-accent \{[\s\S]*?color: color-mix\(in srgb, var\(--folder-accent\) 40%, var\(--text-main\)\) !important/);
});

test('selected folder accents use outlines or borders, never glow shadows', () => {
  for (const selector of ['.fc-icon.on', '.fc-color.on']) {
    const declarations = block(selector);
    assert.doesNotMatch(declarations, /box-shadow/i, `${selector} must not use a shadow selection effect`);
    assert.match(declarations, /outline:/, `${selector} needs a visible non-shadow selection indicator`);
  }
  assert.doesNotMatch(css, /nav-item\.has-folder-accent\s*\{[^}]*box-shadow/i);
  assert.doesNotMatch(css, /link-item\.has-folder-accent\s*\{[^}]*box-shadow/i);
  assert.doesNotMatch(css, /finder-folder-icon\.has-folder-accent\s*\{[^}]*box-shadow/i);
  assert.doesNotMatch(css, /finder-folder-row\s*\{[^}]*box-shadow/i);
  assert.match(css, /--card-accent-visible: color-mix\(in srgb, var\(--card-accent\) 40%, var\(--text-main\)\)/);
});

test('interactive application states avoid hardcoded black and white foregrounds', () => {
  const selectors = [
    '.brand-chev:hover', '.add-project-btn:hover', '.nav-item:hover', '.nav-item.drag-over',
    '.profile-av', '.profile-name', '.search-clear:hover', '.side-search-clear:hover'
  ];
  for (const selector of selectors) {
    assert.doesNotMatch(
      block(selector),
      /#(?:fff(?:fff)?|000(?:000)?)\b|\b(?:white|black)\b/i,
      `${selector} must use semantic theme tokens`
    );
  }
});

test('orange action foreground remains readable', () => {
  assert.ok(themes.orange['brand-primary']);
  assert.ok(themes.orange['on-brand']);
  assert.ok(contrast(themes.orange['on-brand'], themes.orange['brand-primary']) >= 4.5);
});

test('active folder and tag UI stays inside the Graphite Paper Orange palette', () => {
  const palette = themes.orange;
  const paletteSource = app.match(/const FOLDER_COLORS = \[([^\]]+)\]/)?.[1] || '';
  for (const token of ['pastel-purple', 'pastel-pink', 'pastel-indigo', 'pastel-green', 'pastel-orange', 'pastel-red', 'pastel-sky', 'pastel-teal', 'pastel-amber']) {
    assert.equal(palette[token].toUpperCase(), '#A9320C', `--${token} must use orange ink`);
  }
  assert.equal(palette['pastel-slate'].toUpperCase(), '#626262');
  for (const token of ['nav-tag-purple', 'nav-tag-pink', 'nav-tag-indigo', 'nav-tag-green', 'nav-tag-orange', 'nav-tag-red', 'nav-tag-sky', 'nav-tag-teal', 'nav-tag-amber']) {
    assert.equal(palette[token].toUpperCase(), '#FF8A65', `--${token} must use light orange ink`);
  }
  assert.equal(palette['nav-tag-slate'].toUpperCase(), '#C5C5C5');
  assert.doesNotMatch(paletteSource, /#(?:6C5CE7|F472B6|818CF8|34D399|FB923C|F87171|38BDF8|2DD4BF|FBBF24|A78BFA)/i);
  assert.match(css, /App palette guard[\s\S]*?\.has-folder-accent \{[\s\S]*?--folder-accent: #F4511E !important;[\s\S]*?--card-accent: #F4511E !important;/);
  assert.match(css, /App palette guard[\s\S]*?\.tag-project,[\s\S]*?color: #A9320C;/);
  assert.match(css, /App palette guard[\s\S]*?aside :is\([\s\S]*?\.tag-chip-active[\s\S]*?color: #FF8A65;/);
});

test('settings primary actions use dark text on raw orange', () => {
  const selector = 'html body.app-active .settings-modal .modal-btn.primary,';
  const start = css.lastIndexOf(selector);
  assert.notEqual(start, -1);
  const declarations = css.slice(start, css.indexOf('}', start));
  assert.match(declarations, /background:\s*#F4511E/);
  assert.match(declarations, /color:\s*#212121/);
  assert.doesNotMatch(declarations, /color:\s*#FFFFFF/i);
  assert.ok(contrast('#212121', '#F4511E') >= 4.5);
});

const contentTags = ['pastel-purple', 'pastel-pink', 'pastel-indigo', 'pastel-green', 'pastel-orange', 'pastel-red', 'pastel-sky', 'pastel-teal', 'pastel-amber', 'pastel-slate'];
const navTags = ['nav-tag-purple', 'nav-tag-pink', 'nav-tag-indigo', 'nav-tag-green', 'nav-tag-orange', 'nav-tag-red', 'nav-tag-sky', 'nav-tag-teal', 'nav-tag-amber', 'nav-tag-slate'];

for (const [name, palette] of Object.entries(themes)) {
  test(`${name} theme keeps text, controls, icons, and tags readable`, () => {
    const pairs = [
      ['text-main', 'bg-card', 4.5],
      ['text-sub', 'bg-card', 4.5],
      ['text-sub', 'bg-subtle', 4.5],
      ['text-muted', 'bg-card', 4.5],
      ['text-muted', 'bg-subtle', 4.5],
      ['brand-primary', 'bg-card', 4.5],
      ['brand-primary', 'brand-soft', 4.5],
      ['brand-text', 'brand-soft', 4.5],
      ['on-brand', 'brand-primary', 4.5],
      ['nav-text', 'nav-bg', 4.5],
      ['nav-muted', 'nav-bg', 4.5],
      ['nav-icon', 'nav-bg', 4.5],
      ['nav-active-text', 'nav-active-bg', 4.5],
      ['status-danger-text', 'status-danger-bg', 4.5],
      ['status-warning-text', 'status-warning-bg', 4.5],
      ['status-info-text', 'status-info-bg', 4.5],
      ['status-success-text', 'status-success-bg', 4.5],
      ...contentTags.map(token => [token, 'bg-card', 4.5]),
      ...navTags.map(token => [token, 'nav-bg', 4.5])
    ];
    for (const [foreground, background, minimum] of pairs) {
      assert.ok(palette[foreground], `${name} missing --${foreground}`);
      assert.ok(palette[background], `${name} missing --${background}`);
      const ratio = contrast(palette[foreground], palette[background]);
      assert.ok(ratio >= minimum, `${name}: --${foreground} on --${background} is ${ratio.toFixed(2)}:1`);
    }
  });
}
