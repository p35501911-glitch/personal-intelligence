import type { NewsProvider } from "../types";

const providers: NewsProvider[] = [];

export function registerNewsProvider(provider: NewsProvider) {
  providers.push(provider);
}

export function getNewsProviders(): NewsProvider[] {
  return providers;
}
