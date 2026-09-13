import { gdeltNewsProvider } from '../src/server/news/providers/gdelt';
import { fetchFromProvider } from '../src/server/news/ingestion';

async function main() {
  console.log('====================================================');
  console.log('   Step 2B: Testing GDELT News Provider Ingestion   ');
  console.log('====================================================');

  const query = 'artificial intelligence';
  console.log(`Fetching articles for query: "${query}" (limit 3)...`);

  const startTime = Date.now();
  const articles = await fetchFromProvider(gdeltNewsProvider, {
    query,
    pageSize: 3,
  });
  const elapsed = Date.now() - startTime;

  console.log(`\nFetched ${articles.length} normalized articles in ${elapsed}ms:\n`);

  if (articles.length === 0) {
    console.warn('⚠️ No articles returned. (Could be due to rate limiting or upstream connectivity)');
  }

  articles.forEach((article, idx) => {
    console.log(`----------------------------------------------------`);
    console.log(`Article #${idx + 1}:`);
    console.log(`  • Title:          ${article.title}`);
    console.log(`  • Description:    ${article.description ?? '(none)'}`);
    console.log(`  • URL:            ${article.url}`);
    console.log(`  • Image URL:      ${article.imageUrl ?? '(none)'}`);
    console.log(`  • Source:         ${article.source.name} [${article.source.url ?? 'no url'}]`);
    console.log(`  • Published Date: ${article.publishedAt.toISOString()}`);
    console.log(`  • External ID:    ${article.externalId}`);
    console.log(`  • Language:       ${article.language ?? 'unknown'}`);
  });

  console.log(`----------------------------------------------------`);
  console.log(`Provider Name: ${gdeltNewsProvider.name}`);
  console.log('Contract Verification:');
  const allValid = articles.every((a) => (
    typeof a.title === 'string' &&
    typeof a.url === 'string' &&
    typeof a.externalId === 'string' &&
    a.publishedAt instanceof Date &&
    !isNaN(a.publishedAt.getTime()) &&
    typeof a.source.name === 'string'
  ));
  console.log(`All articles adhere strictly to NormalizedArticle: ${allValid ? 'PASS ✓' : 'FAIL ✗'}`);
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
