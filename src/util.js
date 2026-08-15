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

function stripAsciiControls(value) {
  return String(value == null ? '' : value).replace(/[\x00-\x1f\x7f]/g, '');
}

// Return a canonical absolute HTTP(S) URL, or null for every other scheme.
// This is the stricter gate used before storing or programmatically opening a
// captured library URL. Controls are removed before parsing so an obfuscated
// `java\tscript:` value cannot become active after browser normalization.
export function safeHttpUrl(u) {
  const raw = stripAsciiControls(u).trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return null;
    return parsed.href;
  } catch (_) {
    return null;
  }
}

// Only allow safe link schemes in href/src — blocks javascript:, data:, etc.
// Returns an escaped, attribute-safe string ('#' for anything suspicious).
export function safeUrl(u) {
  const raw = stripAsciiControls(u).trim();
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

// A successful response may acknowledge only the exact local mutation sent.
// Revision handles multiple edits in one millisecond; updatedAt also protects
// restored state and makes the comparison explicit at the sync boundary.
export function isSyncSnapshotCurrent(snapshot, current) {
  if (!snapshot || !current) return false;
  return snapshot.kind === current.kind
    && Number(snapshot.revision) === Number(current.revision)
    && Number(snapshot.updatedAt) === Number(current.updatedAt);
}

export function normalizeUrl(u) {
  try {
    const x = new URL(u);
    const host = x.hostname.toLowerCase().replace(/^www\./, '') + (x.port ? ':' + x.port : '');
    const path = x.pathname === '/' ? '' : x.pathname.replace(/\/$/, '');
    const tracking = /^(utm_[a-z0-9_]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid)$/i;
    for (const key of [...x.searchParams.keys()]) if (tracking.test(key)) x.searchParams.delete(key);
    x.searchParams.sort();
    const query = x.searchParams.toString();
    return host + path + (query ? '?' + query : '');
  }
  catch (_) { return String(u).toLowerCase(); }
}

// Keep import previews in lock-step with the actual URL de-duplication used by
// ingestLinks(). Invalid/empty records are ignored and repeated URLs are
// counted once, including URLs that differ only by tracking parameters.
export function analyzeImportCandidates(source, existing = []) {
  const existingKeys = new Set((Array.isArray(existing) ? existing : [])
    .map(item => normalizeUrl(item && item.url))
    .filter(Boolean));
  const incomingKeys = new Set();
  let totalLinks = 0;
  for (const entry of (Array.isArray(source) ? source : [])) {
    const url = typeof entry === 'string' ? entry : entry && entry.url;
    if (!url) continue;
    totalLinks += 1;
    const key = normalizeUrl(url);
    if (key && !existingKeys.has(key)) incomingKeys.add(key);
  }
  return { totalLinks, newLinks: incomingKeys.size };
}

function duplicateLinkKey(item) {
  try {
    const parsed = new URL(String(item && item.url || ''));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return normalizeUrl(parsed.href);
  } catch (_) { return null; }
}

function uniqueStrings(...groups) {
  const seen = new Set();
  const merged = [];
  for (const value of groups.flat()) {
    const clean = String(value == null ? '' : value).trim();
    const key = clean.toLocaleLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    merged.push(clean);
  }
  return merged;
}

function meaningfulText(value, placeholders = []) {
  const text = String(value == null ? '' : value).trim();
  return placeholders.some(placeholder => text.toLocaleLowerCase() === placeholder) ? '' : text;
}

function richerText(a, b, placeholders = []) {
  const left = meaningfulText(a, placeholders);
  const right = meaningfulText(b, placeholders);
  return right.length > left.length ? right : left;
}

function folderValue(item) {
  return String(item.folderId || item.project || '').trim();
}

function folderQuality(item) {
  const source = String(item.folderSource || '').toLocaleLowerCase();
  const name = String(item.projectName || '').trim().toLocaleLowerCase();
  const sourceScore = source === 'manual' ? 50 : source === 'smart' ? 40 : source === 'browser-import' ? 30 : 20;
  const nameScore = !name || ['inbox', 'general', 'imported'].includes(name) ? 0 : 10;
  return folderValue(item) ? sourceScore + nameScore : 0;
}

function stableLinkOrder(a, b) {
  const aAdded = Number(a && a.added);
  const bAdded = Number(b && b.added);
  const at = Number.isFinite(aAdded) && aAdded > 0 ? aAdded : Number.MAX_SAFE_INTEGER;
  const bt = Number.isFinite(bAdded) && bAdded > 0 ? bAdded : Number.MAX_SAFE_INTEGER;
  return at - bt || String(a && a.id).localeCompare(String(b && b.id));
}

function mergeDuplicateGroup(group) {
  const ordered = [...group].sort(stableLinkOrder);
  const survivor = { ...ordered[0] };
  const folderCandidates = ordered.filter(folderValue).sort((a, b) => folderQuality(b) - folderQuality(a) || stableLinkOrder(a, b));
  const chosenFolder = folderCandidates[0];
  const mergedFolderIds = uniqueStrings(
    ordered.flatMap(item => [folderValue(item), ...(Array.isArray(item.mergedFolderIds) ? item.mergedFolderIds : [])])
  );

  for (const item of ordered.slice(1)) {
    survivor.title = richerText(survivor.title, item.title);
    survivor.description = richerText(survivor.description, item.description);
    survivor.note = richerText(survivor.note, item.note, ['click to add note...']);
    survivor.bodyText = richerText(survivor.bodyText, item.bodyText);
    survivor.extractedText = richerText(survivor.extractedText, item.extractedText);
    survivor.autoTags = uniqueStrings(survivor.autoTags || [], item.autoTags || []);
    survivor.userTags = uniqueStrings(survivor.userTags || [], item.userTags || []);
    survivor.suggestedTags = uniqueStrings(survivor.suggestedTags || [], item.suggestedTags || []);
    survivor.importedTags = uniqueStrings(survivor.importedTags || [], item.importedTags || []);
    survivor.pinned = Boolean(survivor.pinned || item.pinned);
    survivor.archived = Boolean(survivor.archived && item.archived);
    survivor.imported = Boolean(survivor.imported || item.imported);
    for (const key of ['domain', 'category', 'language', 'contentHash', 'content_hash', 'thumbnail']) {
      if (!survivor[key] && item[key]) survivor[key] = item[key];
    }
  }

  if (chosenFolder) {
    survivor.project = chosenFolder.project || chosenFolder.folderId;
    survivor.folderId = chosenFolder.folderId || chosenFolder.project;
    survivor.projectName = chosenFolder.projectName || survivor.projectName;
    survivor.folderSource = chosenFolder.folderSource || survivor.folderSource;
    for (const key of ['importRoot', 'importRootId', 'importBatchId', 'originalProject']) {
      if (chosenFolder[key] != null) survivor[key] = chosenFolder[key];
    }
  }
  if (mergedFolderIds.length > 1) survivor.mergedFolderIds = mergedFolderIds;
  else delete survivor.mergedFolderIds;
  survivor.added = Math.min(...ordered.map(item => Number(item.added)).filter(value => Number.isFinite(value) && value > 0));
  if (!Number.isFinite(survivor.added)) delete survivor.added;
  survivor.updatedAt = Math.max(...ordered.map(item => Number(item.updatedAt) || 0));
  return survivor;
}

// Consolidate URL-identical bookmarks created by old imports or multi-device
// sync. The oldest stable id survives so every device reaches the same result;
// useful metadata from later copies is merged before their ids are tombstoned.
export function consolidateDuplicateLinks(source) {
  const input = Array.isArray(source) ? source : [];
  const groups = new Map();
  const order = [];
  for (const item of input) {
    const key = duplicateLinkKey(item);
    const groupKey = key ? `url:${key}` : `id:${String(item && item.id)}`;
    if (!groups.has(groupKey)) { groups.set(groupKey, []); order.push(groupKey); }
    groups.get(groupKey).push(item);
  }

  const items = [];
  const merged = [];
  const removed = [];
  for (const key of order) {
    const group = groups.get(key);
    if (!key.startsWith('url:') || group.length === 1) {
      items.push(group[0]);
      continue;
    }
    const survivor = mergeDuplicateGroup(group);
    items.push(survivor);
    merged.push(survivor);
    for (const item of group) {
      if (String(item.id) !== String(survivor.id)) removed.push({ id: item.id, duplicateOf: survivor.id, url: item.url });
    }
  }
  return { items, merged, removed };
}

export function analyzeLocalLinkHealth(items) {
  const seen = new Map();
  const issues = [];
  for (const item of items || []) {
    const url = String(item && item.url || '');
    let valid = false;
    try {
      const parsed = new URL(url);
      valid = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (_) {}
    if (!valid) {
      issues.push({ id: item && item.id, issue: 'invalid' });
      continue;
    }
    const normalized = normalizeUrl(url);
    if (seen.has(normalized)) issues.push({ id: item.id, issue: 'duplicate', duplicateOf: seen.get(normalized) });
    else seen.set(normalized, item.id);
  }
  return issues;
}

// Decide a single pull-row merge without touching application state. Pending
// local edits/deletes always win until their retry reaches the server; otherwise
// only a strictly newer cloud row may replace local data.
export function decideRemoteSync(local, row, pendingDirty = false, pendingDelete = false) {
  if (!row || row.id == null) return 'ignore';
  if (pendingDirty || pendingDelete) return 'pending-local';
  const remoteTime = Number(row.updatedAt) || 0;
  const localTime = Number(local && local.updatedAt) || 0;
  if (row.deleted) return local && localTime <= remoteTime ? 'delete' : 'ignore';
  if (!row.data) return 'ignore';
  return !local || localTime < remoteTime ? 'upsert' : 'ignore';
}

// Build sync request bodies that stay comfortably below the Worker's byte and
// item limits. Counting UTF-8 bytes matters for multilingual titles and notes.
export function buildSyncBatches(changes, settings = null, maxBytes = 1_150_000, maxItems = 200) {
  const source = Array.isArray(changes) ? changes : [];
  const batches = [];
  let index = 0;
  let first = true;
  const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
  while (index < source.length || (first && settings)) {
    const body = { items: [] };
    if (first && settings) body.settings = settings;
    let size = bytes(body);
    while (index < source.length && body.items.length < maxItems) {
      const change = source[index];
      const addition = bytes(change) + (body.items.length ? 1 : 0);
      if (body.items.length && size + addition > maxBytes) break;
      body.items.push(change);
      size += addition;
      index++;
    }
    if (!body.items.length && index < source.length) {
      body.items.push(source[index++]);
    }
    batches.push(body);
    first = false;
  }
  return batches;
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
