import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { __test, ftsExpression, ftsExpressions, localConceptVariants, normalizeLibraryUrl, parseMultilingualQueryVariants, parseSearchPlan, roundRobinSearchRows, searchRelevanceEvidence, selectDiverseSearchResults } from '../worker/library.js';

test('library URL normalization removes tracking noise and fragments', () => {
  assert.equal(
    normalizeLibraryUrl('https://www.Example.com/story/?utm_source=mail&b=2&a=1#comments'),
    'example.com/story?a=1&b=2'
  );
});

test('FTS expression keeps multilingual terms and quotes them safely', () => {
  assert.equal(ftsExpression('semantic поиск AI'), '"semantic"* AND "поиск"* AND "ai"*');
  assert.equal(ftsExpression('a !'), '');
});

test('natural-language Ask queries fall back to meaningful OR terms', () => {
  const expressions = ftsExpressions('What did I save about semantic search?');
  assert.equal(expressions.length, 2);
  assert.match(expressions[0], /"what"\* AND/);
  assert.equal(expressions[1], '"semantic"* OR "search"*');
  assert.equal(ftsExpressions('What did I save about Paris?')[1], '"paris"*');
});

test('natural-language searches expand bidirectionally while URLs do not', () => {
  assert.equal(__test.needsQueryExpansion('путешествие в Париж'), true);
  assert.equal(__test.needsQueryExpansion('Paris travel'), true);
  assert.equal(__test.needsQueryExpansion('https://example.com/story'), false);
  assert.equal(__test.needsQueryExpansion('example.com'), false);
  const variants = parseMultilingualQueryVariants(
    'путешествие в Париж',
    '<think>ignore</think>["travel to Paris","viaje a París","巴黎旅行","पेरिस की यात्रा","رحلة إلى باريس","viagem a Paris","voyage à Paris","Reise nach Paris","パリ旅行","파리 여행","путешествие в Париж","טיול לפריז"]'
  );
  assert.ok(variants.length >= 12);
  assert.equal(variants[0], 'путешествие в Париж');
  for (const expected of ['travel to Paris', '巴黎旅行', 'رحلة إلى باريس', 'パリ旅行', 'טיול לפריז']) {
    assert.ok(variants.includes(expected));
  }
  assert.deepEqual(parseMultilingualQueryVariants('поиск', 'not json'), ['поиск']);
});

test('deterministic concept graph connects movie queries to multilingual and domain vocabulary', () => {
  const variants = localConceptVariants('movie');
  for (const expected of ['movie', 'film', 'cinema', 'kino', 'кино', '电影', '映画', '영화', 'סרט', 'فيلم']) {
    assert.ok(variants.includes(expected), `missing concept alias: ${expected}`);
  }
  assert.equal(searchRelevanceEvidence(
    { title: 'Авторизоваться', domain: 'kino.watch', tags: '', project: 'Edge Browser', category: '' },
    'kino',
    { keywordMatch: true, strictKeywordMatch: true }
  ).accepted, true);
  assert.deepEqual(localConceptVariants('https://kino.watch'), ['https://kino.watch']);
});

test('movie reaches a Video-tagged kino.watch result without admitting unrelated Amazon pages', () => {
  const kinoWatch = {
    title: 'Авторизоваться', domain: 'kino.watch', tags: 'Video',
    project: 'Edge Browser', category: 'Media'
  };
  const amazon = {
    title: 'Amazon Sign-In', domain: 'amazon.co.uk', tags: 'Shopping',
    project: 'Edge Browser', category: 'Shopping',
    description: 'Online shopping and account management'
  };
  const movieVariants = localConceptVariants('movie');
  const kinoVariant = movieVariants.find(variant => variant.toLowerCase() === 'kino');

  assert.ok(kinoVariant, 'movie must expand to the kino domain concept');
  assert.equal(searchRelevanceEvidence(
    kinoWatch,
    kinoVariant,
    { keywordMatch: true, strictKeywordMatch: true, semanticScore: 0.78 }
  ).accepted, true);

  // A high vector score alone cannot make a generic shopping page relevant.
  for (const query of ['movie', 'online tv']) {
    assert.equal(searchRelevanceEvidence(
      amazon,
      query,
      { keywordMatch: false, strictKeywordMatch: false, semanticScore: 0.95 }
    ).accepted, false, `Amazon must not be admitted for ${query}`);
  }
});

test('candidate selection interleaves languages instead of starving later concept variants', () => {
  const groups = [
    [{ itemId: 'english-1' }, { itemId: 'english-2' }, { itemId: 'english-3' }],
    [{ itemId: 'kino-watch' }],
    [{ itemId: 'russian-film' }]
  ];
  assert.deepEqual(roundRobinSearchRows(groups, 3).map(row => row.itemId), [
    'english-1', 'kino-watch', 'russian-film'
  ]);
});

test('Ask source selection removes URL duplicates and limits one domain from dominating', () => {
  const input = [
    { itemId: '1', url: 'https://example.com/a?utm_source=x', domain: 'example.com' },
    { itemId: '2', url: 'https://example.com/a', domain: 'example.com' },
    { itemId: '3', url: 'https://example.com/b', domain: 'example.com' },
    { itemId: '4', url: 'https://example.com/c', domain: 'example.com' },
    { itemId: '5', url: 'https://other.test/a', domain: 'other.test' }
  ];
  assert.deepEqual(selectDiverseSearchResults(input, 6).map(result => result.itemId), ['1', '3', '5']);
});

test('smart query plan preserves intent, transliterations, and explicit exclusions', () => {
  const plan = parseSearchPlan(
    'айпи тв но не Amazon',
    '{"variants":["IPTV not Amazon","internet television without Amazon","טלוויזיה באינטרנט ללא אמזון"],"excludedTerms":["Amazon","Амазон","אמזון"],"intent":"explore"}'
  );
  assert.equal(plan.variants[0], 'айпи тв но не Amazon');
  assert.ok(plan.variants.includes('IPTV not Amazon'));
  assert.deepEqual(plan.excludedTerms, ['Amazon', 'Амазон', 'אמזון']);
  assert.equal(plan.intent, 'explore');
  assert.equal(__test.rowMatchesExcludedTerms({ title: 'Amazon Sign-In' }, plan.excludedTerms), true);
  assert.equal(__test.rowMatchesExcludedTerms({ title: 'Best IPTV providers' }, plan.excludedTerms), false);
});

test('search intent recognizes recent, comparison, and how-to requests', () => {
  assert.equal(__test.detectSearchIntent('последние статьи об AI'), 'recent');
  assert.equal(__test.detectSearchIntent('React vs Vue comparison'), 'compare');
  assert.equal(__test.detectSearchIntent('как настроить домашний сервер'), 'howto');
  assert.equal(__test.detectSearchIntent('design inspiration'), 'explore');
  assert.ok(__test.searchIntentBoost({ updated_at: Date.now() }, 'recent') >
    __test.searchIntentBoost({ updated_at: Date.now() - 90 * 86_400_000 }, 'recent'));
});

test('translated evidence accepts the matching English page without weakening relevance', () => {
  const paris = {
    title: 'Seven days in Paris with kids', domain: 'example.com', tags: 'Travel Paris',
    category: 'Travel', description: 'A family itinerary for France', body_text: 'Museums and neighborhoods'
  };
  const original = searchRelevanceEvidence(paris, 'семейная поездка в Париж', { semanticScore: 0.72 });
  const translated = searchRelevanceEvidence(paris, 'family trip Paris', { keywordMatch: true, strictKeywordMatch: true, semanticScore: 0.72 });
  assert.equal(original.accepted, false);
  assert.equal(translated.accepted, true);
});

test('hybrid relevance rejects generic online pages for an online TV query', () => {
  const amazon = {
    title: 'Amazon Sign-In', domain: 'amazon.co.uk', description: 'Access your online account',
    body_text: 'Sign in for online shopping and customer service', tags: 'Shopping', project: 'Imported', category: 'Shopping'
  };
  const iptv = {
    title: 'Best IPTV providers', domain: 'ottfox.net', description: 'Internet television channels',
    body_text: 'Watch channels online', tags: 'TV IPTV Streaming', project: 'Online TV', category: 'Media'
  };
  const amazonEvidence = searchRelevanceEvidence(amazon, 'online tv', { keywordMatch: false, semanticScore: 0.71 });
  const tvEvidence = searchRelevanceEvidence(iptv, 'online tv', { keywordMatch: true, strictKeywordMatch: true, semanticScore: 0.71 });
  assert.equal(amazonEvidence.accepted, false);
  assert.equal(amazonEvidence.reason, 'missing_subject');
  assert.equal(tvEvidence.accepted, true);
  assert.ok(tvEvidence.score > 0);
});

test('semantic-only results need high similarity and visible topical evidence', () => {
  const relevant = { title: 'IlookTV', domain: 'ilook.tv', tags: 'IPTV', category: 'Media' };
  assert.equal(searchRelevanceEvidence(relevant, 'online tv', { semanticScore: 0.61 }).accepted, false);
  assert.equal(searchRelevanceEvidence(relevant, 'online tv', { semanticScore: 0.72 }).accepted, true);
});

test('page extraction removes active markup and keeps useful metadata', () => {
  const page = __test.extractPage(`
    <html><head><title>Example &amp; Guide</title>
    <meta property="og:description" content="A useful guide"></head>
    <body><script>steal()</script><h1>Semantic search</h1><p>Find saved knowledge.</p></body></html>
  `, true);
  assert.equal(page.title, 'Example & Guide');
  assert.equal(page.description, 'A useful guide');
  assert.match(page.bodyText, /Semantic search Find saved knowledge/);
  assert.doesNotMatch(page.bodyText, /steal/);
});

test('enrichment blocks private and local fetch targets', () => {
  for (const url of ['http://localhost/x', 'http://intranet/x', 'http://127.0.0.1/x', 'http://169.254.169.254/', 'http://[::1]/']) {
    assert.throws(() => __test.assertPublicUrl(new URL(url)), /blocked/);
  }
  assert.doesNotThrow(() => __test.assertPublicUrl(new URL('https://example.com/article')));
});

test('link scan only calls confirmed 404 and 410 responses broken', () => {
  for (const status of [404, 410]) assert.equal(__test.classifyLinkHttpStatus(status), 'broken');
  for (const status of [200, 204, 301, 401, 403, 405, 429]) assert.equal(__test.classifyLinkHttpStatus(status), 'reachable');
  for (const status of [400, 408, 500, 503]) assert.equal(__test.classifyLinkHttpStatus(status), 'unknown');
});

test('content classifier augments existing tags without duplicates', () => {
  const result = __test.classifyContent({
    title: 'Vector embeddings for semantic search',
    description: 'A machine learning guide',
    bodyText: 'Build a retrieval augmented generation system.',
    domain: 'example.com',
    existingTags: ['AI', 'ai']
  });
  assert.equal(result.tags.filter(tag => tag.toLowerCase() === 'ai').length, 1);
  assert.equal(result.category, 'AI');
});

test('search feedback uses a stable private query key', () => {
  assert.equal(__test.searchQueryKey('  Online   TV  '), 'online tv');
  assert.equal(__test.searchQueryKey('ПАРИЖ'), 'париж');
});

test('search learning keeps positive feedback as a modest decaying evidence-only boost', () => {
  const source = fs.readFileSync(new URL('../worker/library.js', import.meta.url), 'utf8');
  assert.match(source, /learnedAt = learned\.positive\.get\(String\(id\)\) \|\| 0/);
  assert.match(source, /1\.25 \* Math\.max\(0\.2, 1 - learnedAgeDays \/ 180\)/);
  assert.match(source, /if \(!evidence\.accepted\) return null;[\s\S]*learnedBoost/);
  assert.match(source, /signal === 'relevant'/);
  assert.match(source, /DELETE FROM search_feedback/);
  assert.match(source, /DELETE FROM search_positive_feedback/);
});
