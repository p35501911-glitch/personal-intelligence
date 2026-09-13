import { mockNewsProvider } from '../src/server/news/providers/mock';
import { registerNewsProvider, getNewsProviders } from '../src/server/news/providers';
import { fetchFromProvider } from '../src/server/news/ingestion';

async function main() {
  console.log('--- Step 2A: Testing News Provider Abstraction ---');

  // 1. Direct fetch from mock provider
  const articles = await mockNewsProvider.fetchLatest();
  console.log('Articles fetched directly from mock provider:');
  console.dir(articles, { depth: null });

  // 2. Test registration & retrieval
  registerNewsProvider(mockNewsProvider);
  const registered = getNewsProviders();
  console.log(`\nRegistered providers count: ${registered.length}`);
  console.log(`First provider name: ${registered[0]?.name}`);

  // 3. Test fetchFromProvider ingestion service
  const ingested = await fetchFromProvider(mockNewsProvider);
  console.log(`\nArticles fetched via fetchFromProvider: ${ingested.length}`);
  console.log('Sample title:', ingested[0]?.title);
  console.log('Sample source name:', ingested[0]?.source.name);
  console.log('Sample externalId:', ingested[0]?.externalId);

  console.log('\n--- Step 2A Tests Completed Successfully ---');
}

main().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
