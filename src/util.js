// Small, dependency-free helpers shared across the app.
// Pure functions only — no app state, no DOM. Safe to import anywhere.

// Escape a value for use inside a double-quoted HTML attribute.
export function htmlAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Escape a value for use inside a single-quoted JS string in an inline handler.
export function jsAttr(s) {
  return htmlAttr(String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
}

// Escape untrusted text/attribute values before putting them in innerHTML.
// Bookmark titles, descriptions, notes, tags, project names and URLs are all
// user-controlled (typed or imported) and must never be treated as markup.
export function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Only allow safe link schemes in href/src — blocks javascript:, data:, etc.
// Returns an escaped, attribute-safe string ('#' for anything suspicious).
export function safeUrl(u) {
  const raw = String(u == null ? '' : u).trim();
  if (/^(https?:|mailto:|tel:|ftp:)/i.test(raw)) return esc(raw);
  if (/^(\/|#|\?|\.)/.test(raw)) return esc(raw);           // relative/in-page links
  if (raw && !/^[a-z][a-z0-9+.-]*:/i.test(raw)) return esc(raw); // scheme-less (e.g. example.com/x)
  return '#';                                               // javascript:, data:, vbscript:, …
}

// Only allow simple CSS color tokens so imported/synced metadata can't break out
// of a style="" attribute (e.g. `red" onmouseover=...`).
export function safeColor(c) {
  const s = String(c == null ? '' : c).trim();
  return /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|rgb\(\s*[\d.,%\s]+\)|rgba\(\s*[\d.,%\s]+\)|hsl\(\s*[\d.,%\s]+\)|hsla\(\s*[\d.,%\s]+\))$/.test(s) ? s : null;
}

export function normalizeUrl(u) {
  try { const x = new URL(u); return (x.host + x.pathname).replace(/\/$/, '').toLowerCase() + x.search.toLowerCase(); }
  catch (_) { return String(u).toLowerCase(); }
}

// Human "saved X ago" — only for links that carry a real timestamp.
export function itemTimestamp(item) { return item.added || (item.id > 1e12 ? item.id : null); }
export function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 45) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24);
  if (d < 7) return d + 'd ago';
  const w = Math.floor(d / 7);
  if (w < 5) return w + 'w ago';
  const mo = Math.floor(d / 30);
  if (mo < 12) return mo + 'mo ago';
  return Math.floor(d / 365) + 'y ago';
}

export function titleCase(s) {
  return String(s || '').trim().replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}
