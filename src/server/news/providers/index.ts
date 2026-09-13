import type { NewsProvider } from "../types";
import { gdeltNewsProvider } from "./gdelt";

const providers: NewsProvider[] = [gdeltNewsProvider];

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
export { mockNewsProvider } from "./mock";
