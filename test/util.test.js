import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeImportCandidates, analyzeLocalLinkHealth, buildSyncBatches, consolidateDuplicateLinks, decideRemoteSync, isSyncSnapshotCurrent, normalizeUrl, safeColor, safeHttpUrl, safeUrl } from '../src/util.js';

test('safeUrl blocks active schemes', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '#');
  assert.equal(safeUrl('java\tscript:alert(1)'), '#');
  assert.equal(safeUrl('\u0000java\r\nscript:alert(1)'), '#');
  assert.equal(safeUrl('data:text/html,boom'), '#');
  assert.equal(safeUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
});

test('safeHttpUrl only accepts absolute HTTP(S) URLs after control normalization', () => {
  assert.equal(safeHttpUrl('https://example.com/path'), 'https://example.com/path');
  assert.equal(safeHttpUrl('http://example.com'), 'http://example.com/');
  assert.equal(safeHttpUrl('javascript:alert(1)'), null);
  assert.equal(safeHttpUrl('java\tscript:alert(1)'), null);
  assert.equal(safeHttpUrl('\u0000data:text/html,boom'), null);
  assert.equal(safeHttpUrl('/relative/path'), null);
  assert.equal(safeHttpUrl('example.com/path'), null);
});

test('safeColor accepts simple colors and rejects attribute escapes', () => {
  assert.equal(safeColor('#6c5ce7'), '#6c5ce7');
  assert.equal(safeColor('red\" onmouseover=alert(1)'), null);
});

test('normalizeUrl treats protocol and trailing slash as duplicate noise', () => {
  assert.equal(normalizeUrl('https://Example.com/path/'), normalizeUrl('http://example.com/path'));
});

test('normalizeUrl removes common tracking and sorts query parameters', () => {
  assert.equal(
    normalizeUrl('https://www.example.com/story?utm_source=newsletter&b=2&a=1#comments'),
    normalizeUrl('http://example.com/story?a=1&b=2')
  );
});

test('normalizeUrl preserves case-sensitive path semantics', () => {
  assert.notEqual(normalizeUrl('https://example.com/File'), normalizeUrl('https://example.com/file'));
});

test('import analysis counts only unique URL candidates absent from the library', () => {
  const existing = [{ url: 'https://www.example.com/story/?utm_source=mail' }];
  const source = [
    { url: 'http://example.com/story#chapter' },
    'https://new.example/path?b=2&a=1',
    { url: 'https://www.new.example/path?a=1&b=2#section' },
    { url: '' },
    { title: 'Missing URL' },
    null
  ];

  assert.deepEqual(analyzeImportCandidates(source, existing), {
    totalLinks: 3,
    newLinks: 1
  });
  assert.deepEqual(analyzeImportCandidates(null, existing), {
    totalLinks: 0,
    newLinks: 0
  });
});

test('link scan flags invalid URLs and only later normalized duplicates', () => {
  const issues = analyzeLocalLinkHealth([
    { id: 'first', url: 'https://Example.com/article/?utm_source=test&a=1' },
    { id: 'duplicate', url: 'https://example.com/article?a=1#section' },
    { id: 'invalid', url: 'javascript:alert(1)' },
    { id: 'unique', url: 'https://example.com/other' }
  ]);
  assert.deepEqual(issues, [
    { id: 'duplicate', issue: 'duplicate', duplicateOf: 'first' },
    { id: 'invalid', issue: 'invalid' }
  ]);
});

test('duplicate consolidation keeps a stable id and merges useful metadata', () => {
  const result = consolidateDuplicateLinks([
    {
      id: 10, added: 100, updatedAt: 110, url: 'https://www.example.com/story/?utm_source=mail',
      title: 'Story', note: 'Click to add note...', autoTags: ['Web'], project: 'imported',
      folderId: 'imported', projectName: 'Imported', folderSource: 'browser-import'
    },
    {
      id: 20, added: 200, updatedAt: 220, url: 'http://example.com/story#chapter',
      title: 'A much better story title', note: 'Read this later', autoTags: ['Reading'], userTags: ['Favorite'],
      pinned: true, project: 'research', folderId: 'research', projectName: 'Research', folderSource: 'manual'
    }
  ]);
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.removed, [{ id: 20, duplicateOf: 10, url: 'http://example.com/story#chapter' }]);
  assert.equal(result.items[0].id, 10);
  assert.equal(result.items[0].title, 'A much better story title');
  assert.equal(result.items[0].note, 'Read this later');
  assert.deepEqual(result.items[0].autoTags, ['Web', 'Reading']);
  assert.deepEqual(result.items[0].userTags, ['Favorite']);
  assert.equal(result.items[0].pinned, true);
  assert.equal(result.items[0].folderId, 'research');
  assert.deepEqual(result.items[0].mergedFolderIds, ['imported', 'research']);
});

test('duplicate consolidation is deterministic and does not merge invalid URLs', () => {
  const a = { id: 'b', added: 10, url: 'https://example.com/' };
  const b = { id: 'a', added: 10, url: 'http://www.example.com' };
  const invalidOne = { id: 'x', url: 'not a URL' };
  const invalidTwo = { id: 'y', url: 'not a URL' };
  const result = consolidateDuplicateLinks([a, invalidOne, b, invalidTwo]);
  assert.equal(result.items.length, 3);
  assert.equal(result.merged[0].id, 'a');
  assert.deepEqual(result.removed.map(entry => entry.id), ['b']);
  assert.ok(result.items.includes(invalidOne));
  assert.ok(result.items.includes(invalidTwo));
});

test('sync batching respects both UTF-8 byte and item limits', () => {
  const changes = Array.from({ length: 450 }, (_, index) => ({
    id: String(index),
    data: { id: String(index), title: '巴黎'.repeat(1_000), url: `https://example.com/${index}` }
  }));
  const batches = buildSyncBatches(changes, { blob: { customProjects: ['Travel'] }, updatedAt: 1 }, 100_000, 200);
  assert.ok(batches.length > 3);
  assert.ok(batches[0].settings);
  assert.ok(batches.slice(1).every(batch => !batch.settings));
  assert.deepEqual(batches.flatMap(batch => batch.items.map(item => item.id)), changes.map(item => item.id));
  for (const batch of batches) {
    assert.ok(batch.items.length <= 200);
    assert.ok(new TextEncoder().encode(JSON.stringify(batch)).length <= 100_000);
  }
});

test('sync merge preserves pending local work and only accepts newer cloud state', () => {
  const local = { id: 'link-1', updatedAt: 200 };
  assert.equal(decideRemoteSync(local, { id: 'link-1', updatedAt: 300, data: { id: 'link-1' } }, true, false), 'pending-local');
  assert.equal(decideRemoteSync(local, { id: 'link-1', updatedAt: 300, deleted: true }, false, true), 'pending-local');
  assert.equal(decideRemoteSync(local, { id: 'link-1', updatedAt: 199, data: { id: 'link-1' } }), 'ignore');
  assert.equal(decideRemoteSync(local, { id: 'link-1', updatedAt: 201, data: { id: 'link-1' } }), 'upsert');
  assert.equal(decideRemoteSync(local, { id: 'link-1', updatedAt: 200, deleted: true }), 'delete');
  assert.equal(decideRemoteSync(null, { id: 'link-1', updatedAt: 200, deleted: true }), 'ignore');
});

test('sync acknowledgement clears only the exact sent mutation snapshot', () => {
  const sent = { kind: 'upsert', revision: 7, updatedAt: 100 };
  assert.equal(isSyncSnapshotCurrent(sent, { kind: 'upsert', revision: 7, updatedAt: 100 }), true);
  assert.equal(isSyncSnapshotCurrent(sent, { kind: 'upsert', revision: 8, updatedAt: 100 }), false);
  assert.equal(isSyncSnapshotCurrent(sent, { kind: 'upsert', revision: 7, updatedAt: 101 }), false);
  assert.equal(isSyncSnapshotCurrent(sent, { kind: 'delete', revision: 7, updatedAt: 100 }), false);
  const tombstone = { kind: 'delete', revision: 9, updatedAt: 200 };
  assert.equal(isSyncSnapshotCurrent(tombstone, { kind: 'delete', revision: 9, updatedAt: 200 }), true);
  assert.equal(isSyncSnapshotCurrent(tombstone, { kind: 'delete', revision: 10, updatedAt: 200 }), false);
  assert.equal(isSyncSnapshotCurrent(tombstone, { kind: 'upsert', revision: 10, updatedAt: 200 }), false);
  assert.equal(isSyncSnapshotCurrent(tombstone, null), false);
});

test('sync merge decision remains deterministic under 10,000 mixed conflicts', () => {
  const outcomes = { ignore: 0, upsert: 0, delete: 0, 'pending-local': 0 };
  for (let index = 0; index < 10_000; index++) {
    const local = { id: String(index), updatedAt: 1_000 };
    const row = {
      id: String(index),
      updatedAt: index % 4 === 0 ? 1_001 : 999,
      deleted: index % 4 === 2,
      data: { id: String(index) }
    };
    const decision = decideRemoteSync(local, row, index % 4 === 3, false);
    outcomes[decision]++;
  }
  assert.deepEqual(outcomes, { ignore: 5_000, upsert: 2_500, delete: 0, 'pending-local': 2_500 });
});

test('sync batching stress-test keeps 50,000 multilingual changes lossless and bounded', () => {
  const changes = Array.from({ length: 50_000 }, (_, index) => ({
    id: `stress-${index}`,
    data: {
      id: `stress-${index}`,
      title: `Фильм 東京 فيلم película ${index}`,
      note: 'Русский English עברית العربية 日本語 Français Deutsch Español'.repeat(3),
      url: `https://stress.example/${index}?lang=multi`
    }
  }));
  const settings = { blob: { theme: 'mint-paper', language: 'ru' }, updatedAt: 42 };
  const batches = buildSyncBatches(changes, settings);
  assert.equal(batches.length, 250);
  assert.equal(batches.filter(batch => batch.settings).length, 1);
  assert.equal(batches.reduce((sum, batch) => sum + batch.items.length, 0), changes.length);
  assert.deepEqual(batches.flatMap(batch => batch.items.map(item => item.id)), changes.map(item => item.id));
  for (const batch of batches) {
    assert.ok(batch.items.length <= 200);
    assert.ok(new TextEncoder().encode(JSON.stringify(batch)).length <= 1_150_000);
  }
});

test('duplicate consolidation stress-test keeps one deterministic row per normalized URL', () => {
  const links = Array.from({ length: 10_000 }, (_, index) => ({
    id: `id-${String(index).padStart(5, '0')}`,
    added: index,
    updatedAt: index,
    title: `Link ${index}`,
    url: `https://www.example.com/article/${index % 1_000}/?utm_source=batch#part-${index}`
  }));
  const result = consolidateDuplicateLinks(links);
  assert.equal(result.items.length, 1_000);
  assert.equal(result.removed.length, 9_000);
  assert.equal(new Set(result.items.map(item => normalizeUrl(item.url))).size, 1_000);
});
