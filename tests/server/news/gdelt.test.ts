import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeGdeltArticle,
  parseGdeltDate,
  validateGdeltArticle,
  validateGdeltResponse,
  buildGdeltUrl,
  throttleRequest,
  type GdeltRawArticle,
} from '../../../src/server/news/providers/gdelt';

test('GDELT Provider: parseGdeltDate parses valid GDELT date strings', () => {
  // ISO-like format: YYYYMMDDTHHMMSSZ
  const d1 = parseGdeltDate('20260913T081500Z');
  assert.equal(d1.getUTCFullYear(), 2026);
  assert.equal(d1.getUTCMonth(), 8); // 0-indexed: 8 is September
  assert.equal(d1.getUTCDate(), 13);
  assert.equal(d1.getUTCHours(), 8);
  assert.equal(d1.getUTCMinutes(), 15);
  assert.equal(d1.getUTCSeconds(), 0);

  // Without Z
  const d2 = parseGdeltDate('20260913T123045');
  assert.equal(d2.getUTCFullYear(), 2026);
  assert.equal(d2.getUTCHours(), 12);
  assert.equal(d2.getUTCMinutes(), 30);
  assert.equal(d2.getUTCSeconds(), 45);

  // Basic 14-digit format: YYYYMMDDHHMMSS
  const d3 = parseGdeltDate('20260913142030');
  assert.equal(d3.getUTCFullYear(), 2026);
  assert.equal(d3.getUTCHours(), 14);

  // Fallback on empty or invalid inputs
  const dEmpty = parseGdeltDate('');
  assert.ok(dEmpty instanceof Date && !isNaN(dEmpty.getTime()));

  const dNull = parseGdeltDate(null);
  assert.ok(dNull instanceof Date && !isNaN(dNull.getTime()));

  const dGarbage = parseGdeltDate('not-a-valid-date');
  assert.ok(dGarbage instanceof Date && !isNaN(dGarbage.getTime()));
});

test('GDELT Provider: validateGdeltArticle validates minimum article structure', () => {
  // Valid article
  assert.equal(
    validateGdeltArticle({
      url: 'https://example.com/ai-news',
      title: 'New AI Breakthrough',
    }),
    true
  );

  // Missing or empty url
  assert.equal(validateGdeltArticle({ title: 'Breakthrough' }), false);
  assert.equal(validateGdeltArticle({ url: '   ', title: 'Breakthrough' }), false);
  assert.equal(validateGdeltArticle({ url: 123, title: 'Breakthrough' }), false);

  // Missing or empty title
  assert.equal(validateGdeltArticle({ url: 'https://example.com' }), false);
  assert.equal(validateGdeltArticle({ url: 'https://example.com', title: '  ' }), false);

  // Non-objects
  assert.equal(validateGdeltArticle(null), false);
  assert.equal(validateGdeltArticle(undefined), false);
  assert.equal(validateGdeltArticle('string'), false);
  assert.equal(validateGdeltArticle(42), false);
});

test('GDELT Provider: validateGdeltResponse handles malformed responses', () => {
  // Valid response with articles array
  const valid = validateGdeltResponse({
    articles: [
      { url: 'https://example.com/1', title: 'Test 1' },
    ],
  });
  assert.equal(valid.articles?.length, 1);

  // Valid response with empty articles
  const empty = validateGdeltResponse({ articles: [] });
  assert.equal(empty.articles?.length, 0);

  // Malformed: not an object
  assert.throws(() => validateGdeltResponse(null), /Malformed GDELT response: Expected a JSON object/);
  assert.throws(() => validateGdeltResponse('plain text error'), /Malformed GDELT response: Expected a JSON object/);
  assert.throws(() => validateGdeltResponse(123), /Malformed GDELT response: Expected a JSON object/);

  // Malformed: articles is not an array
  assert.throws(
    () => validateGdeltResponse({ articles: 'invalid' }),
    /Malformed GDELT response: 'articles' field is not an array/
  );
  assert.throws(
    () => validateGdeltResponse({ articles: 1234 }),
    /Malformed GDELT response: 'articles' field is not an array/
  );
});

test('GDELT Provider: normalizeGdeltArticle converts raw data to NormalizedArticle', () => {
  const raw: GdeltRawArticle = {
    url: 'https://techcrunch.com/2026/09/13/autonomous-agents',
    title: 'Autonomous Agents Scale Fast',
    seendate: '20260913T081500Z',
    socialimage: 'https://techcrunch.com/images/hero.png',
    domain: 'techcrunch.com',
    language: 'English',
    sourcecountry: 'United States',
  };

  const normalized = normalizeGdeltArticle(raw);

  assert.equal(normalized.externalId, 'https://techcrunch.com/2026/09/13/autonomous-agents');
  assert.equal(normalized.title, 'Autonomous Agents Scale Fast');
  assert.equal(normalized.description, null);
  assert.equal(normalized.content, null);
  assert.equal(normalized.url, 'https://techcrunch.com/2026/09/13/autonomous-agents');
  assert.equal(normalized.imageUrl, 'https://techcrunch.com/images/hero.png');
  assert.equal(normalized.author, null);
  assert.equal(normalized.language, 'English');
  assert.equal(normalized.publishedAt.toISOString(), '2026-09-13T08:15:00.000Z');
  assert.equal(normalized.source.name, 'techcrunch.com');
  assert.equal(normalized.source.url, 'https://techcrunch.com');
  assert.equal(normalized.source.externalId, 'techcrunch.com');
  assert.deepEqual(normalized.rawData, raw);
});

test('GDELT Provider: normalizeGdeltArticle handles missing optional fields gracefully', () => {
  const minimalRaw: GdeltRawArticle = {
    url: 'https://example.com/minimal',
    title: 'Minimal Article',
    socialimage: '',
    domain: null,
    language: undefined,
  };

  const normalized = normalizeGdeltArticle(minimalRaw);

  assert.equal(normalized.imageUrl, null);
  assert.equal(normalized.source.name, 'Unknown Source');
  assert.equal(normalized.source.url, null);
  assert.equal(normalized.source.externalId, 'unknown');
  assert.equal(normalized.language, null);
  assert.ok(normalized.publishedAt instanceof Date);
});

test('GDELT Provider: buildGdeltUrl constructs properly encoded query URL', () => {
  const urlString = buildGdeltUrl({
    query: 'artificial intelligence',
    pageSize: 15,
  });

  const parsed = new URL(urlString);
  assert.equal(parsed.searchParams.get('query'), 'artificial intelligence');
  assert.equal(parsed.searchParams.get('mode'), 'ArtList');
  assert.equal(parsed.searchParams.get('maxrecords'), '15');
  assert.equal(parsed.searchParams.get('format'), 'json');
  assert.equal(parsed.searchParams.get('sort'), 'DateDesc');

  // Clamps pageSize
  const clamped = new URL(buildGdeltUrl({ pageSize: 500 }));
  assert.equal(clamped.searchParams.get('maxrecords'), '250');
});

test('GDELT Provider: throttleRequest serializes calls', async () => {
  const results: number[] = [];
  const p1 = throttleRequest(async () => {
    results.push(1);
    return 1;
  });
  const p2 = throttleRequest(async () => {
    results.push(2);
    return 2;
  });

  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1, 1);
  assert.equal(r2, 2);
  assert.deepEqual(results, [1, 2]);
});
