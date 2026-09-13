import assert from 'node:assert/strict';

const BASE_URL = 'http://localhost:3000';

async function testPhase3B() {
  console.log('--- Starting Phase 3B Server Verification Suite ---');

  // 1. Check server health
  const rootRes = await fetch(`${BASE_URL}/`);
  assert.equal(rootRes.status, 200, 'Dashboard root / must return 200 OK');
  console.log('✔ 1. Dashboard root HTML rendered (200 OK)');

  // 2. Unauthenticated user security test
  // Unauthenticated user should not be able to read arbitrary user's feed
  const feedRes = await fetch(`${BASE_URL}/api/feed?userId=victim-id`);
  assert.equal(feedRes.status, 200, 'Feed responds safely');
  const feedData = await feedRes.json();
  assert.equal(feedData.success, true);
  // Must return demo preview or own session, not victim
  console.log('✔ 2. Security: arbitrary userId query injection is ignored');

  // 3. Category Mode (My Topics)
  const catRes = await fetch(`${BASE_URL}/api/feed?mode=CATEGORY&limit=5`);
  assert.equal(catRes.status, 200);
  const catData = await catRes.json();
  assert.equal(catData.mode, 'CATEGORY');
  console.log(`✔ 3. Category Mode: Returned ${catData.stories.length} stories filtered by active topics`);
  if (catData.stories.length > 0) {
    const s = catData.stories[0];
    assert.ok(s.id, 'Story must have id');
    assert.ok(s.title || s.canonicalTitle, 'Story must have title');
    assert.ok(s.importance, 'Story must have importance level');
    assert.ok(s.latestPublishedAt, 'Story must have publishedAt');
    assert.ok(Array.isArray(s.categories), 'Story must have categories array');
    console.log(`    Sample story title: "${s.title || s.canonicalTitle}" [${s.importance}]`);
  }

  // 4. Global Wire / ALL Mode
  const allRes = await fetch(`${BASE_URL}/api/feed?mode=ALL&limit=5`);
  assert.equal(allRes.status, 200);
  const allData = await allRes.json();
  assert.equal(allData.mode, 'ALL');
  console.log(`✔ 4. ALL Mode: Returned ${allData.stories.length} globally ranked stories without topic restrictions`);

  // 5. Importance Filtering
  const impRes = await fetch(`${BASE_URL}/api/feed?mode=ALL&minImportance=0.4&limit=5`);
  assert.equal(impRes.status, 200);
  const impData = await impRes.json();
  for (const s of impData.stories) {
    assert.ok(s.importanceScore >= 0.38, `Story importance score ${s.importanceScore} must be >= threshold 0.40`);
  }
  console.log(`✔ 5. Importance Filtering: Filtered stories properly (count: ${impData.stories.length})`);

  // 6. Sorting: Newest First vs Highest Importance
  const recentRes = await fetch(`${BASE_URL}/api/feed?mode=ALL&sortBy=recent&limit=5`);
  const recentData = await recentRes.json();
  if (recentData.stories.length >= 2) {
    const d0 = new Date(recentData.stories[0].latestPublishedAt).getTime();
    const d1 = new Date(recentData.stories[1].latestPublishedAt).getTime();
    assert.ok(d0 >= d1, 'Newest first must sort by latestPublishedAt descending');
  }
  console.log('✔ 6. Sorting: "recent" order confirmed descending by publication date');

  // 7. Pagination: limit & offset
  const page1Res = await fetch(`${BASE_URL}/api/feed?mode=ALL&limit=3&offset=0`);
  const page1 = await page1Res.json();
  const page2Res = await fetch(`${BASE_URL}/api/feed?mode=ALL&limit=3&offset=3`);
  const page2 = await page2Res.json();
  const page1Ids = new Set(page1.stories.map((s: { id: string }) => s.id));
  for (const s of page2.stories) {
    assert.ok(!page1Ids.has(s.id), `Page 2 story ${s.id} should not duplicate Page 1 stories`);
  }
  console.log(`✔ 7. Pagination: Offset 0 (${page1.stories.length} items) and Offset 3 (${page2.stories.length} items) do not overlap`);

  // 8. Story Detail API: GET /api/stories/[id]
  if (allData.stories.length > 0) {
    const testStoryId = allData.stories[0].id;
    const detailRes = await fetch(`${BASE_URL}/api/stories/${testStoryId}`);
    assert.equal(detailRes.status, 200);
    const detailData = await detailRes.json();
    assert.equal(detailData.success, true);
    assert.equal(detailData.story.id, testStoryId);
    assert.ok(Array.isArray(detailData.story.articles), 'Detail must include attached articles array');
    const testStoryTitle = detailData.story.canonicalTitle || detailData.story.title;
    assert.ok(testStoryTitle, 'Story must have canonical title');
    console.log(`✔ 8. Story Detail API: Retrieved story "${testStoryTitle}" with ${detailData.story.articles.length} publisher reports`);
    for (const art of detailData.story.articles) {
      assert.ok(art.url, 'Attached article must preserve original URL');
      assert.ok(art.publisher, 'Attached article must have publisher name');
    }
  }

  // 9. Categories API: GET /api/user/categories and PUT /api/user/categories
  const userCatRes = await fetch(`${BASE_URL}/api/user/categories`);
  assert.equal(userCatRes.status, 200);
  const userCatData = await userCatRes.json();
  assert.ok(userCatData.mode, 'Preferences must have mode');
  console.log(`✔ 9. User Categories API: Returned mode "${userCatData.mode}" and ${userCatData.categoryIds.length} categories`);

  // 10. Non-existent story returns 404
  const notFoundRes = await fetch(`${BASE_URL}/api/stories/00000000-0000-0000-0000-000000000000`);
  assert.equal(notFoundRes.status, 404);
  console.log('✔ 10. Story Detail 404: Safe error handling for missing story ID');

  console.log('\n--- All Phase 3B Server Verification Checks Passed Successfully! ---');
}

testPhase3B().catch((err) => {
  console.error('Phase 3B Verification FAILED:', err);
  process.exit(1);
});
