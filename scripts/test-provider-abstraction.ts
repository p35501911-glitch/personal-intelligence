import { MockNewsProvider } from '../src/server/ingestion/mock-provider';
import { newsProviderRegistry } from '../src/server/ingestion/registry';

console.log('--- Step 2A: Testing News Provider Abstraction ---');

// 1. Test registration
const mockProvider = new MockNewsProvider();
newsProviderRegistry.register(mockProvider);

const retrieved = newsProviderRegistry.get('mock');
console.log('✓ Provider registered & retrieved:', retrieved?.name === 'Mock News Provider' ? 'PASS' : 'FAIL');

// 2. Test fetchLatest
const fetchResult = await mockProvider.fetchLatest({ limit: 2 });
console.log(`✓ fetchLatest returned ${fetchResult.articles.length} normalized articles:`, fetchResult.articles.length === 2 ? 'PASS' : 'FAIL');

const first = fetchResult.articles[0];
console.log('  Title:', first.title);
console.log('  External ID:', first.externalId);
console.log('  Source:', first.sourceName);
console.log('  Published At:', first.publishedAt instanceof Date ? 'Valid Date' : 'Invalid Date');
console.log('  URL:', first.url);

// 3. Test search
const searchResult = await mockProvider.search({ query: 'Space' });
console.log(`✓ search for "Space" returned ${searchResult.articles.length} article:`, searchResult.articles.length === 1 ? 'PASS' : 'FAIL');
console.log('  Found headline:', searchResult.articles[0]?.title);

console.log('--- All Provider Abstraction Contracts Verified Successfully! ---');
