import type { NewsProvider } from "../types";
import { gdeltNewsProvider } from "./gdelt";
import { rssNewsProvider } from "./rss";

const providers: NewsProvider[] = [gdeltNewsProvider, rssNewsProvider];

export function registerNewsProvider(provider: NewsProvider) {
  const existing = providers.findIndex((p) => p.name === provider.name);
  if (existing >= 0) {
    providers[existing] = provider;
  } else {
    providers.push(provider);
  }
}

export function getNewsProviders(): NewsProvider[] {
  return providers;
}

export { gdeltNewsProvider } from "./gdelt";
export { rssNewsProvider, createRssNewsProvider, RssNewsProvider } from "./rss";
export { mockNewsProvider } from "./mock";
