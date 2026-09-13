import { GoogleGenAI } from "@google/genai";
import type { GeminiEngineConfig } from "./types";

let cachedClient: GoogleGenAI | null = null;
let clientApiKey: string | null = null;

/**
 * Validates and retrieves current Gemini engine configuration from environment.
 * Default model: 'gemini-2.5-flash' (High quality, free-tier supported: 15 RPM, 1M TPM, 1,500 RPD).
 */
export function getGeminiConfig(): GeminiEngineConfig {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || undefined;
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const promptVersion = Number(process.env.AI_PROMPT_VERSION) || 1;
  const batchSize = Math.max(1, Math.min(20, Number(process.env.GEMINI_BATCH_SIZE) || 5));
  const timeoutMs = Math.max(3000, Number(process.env.GEMINI_TIMEOUT_MS) || 20000);
  const maxRetries = Math.max(0, Math.min(3, Number(process.env.GEMINI_MAX_RETRIES) || 2));

  return {
    apiKey,
    model,
    promptVersion,
    batchSize,
    timeoutMs,
    maxRetries,
  };
}

/**
 * Checks whether a valid Gemini API key is configured in the environment.
 */
export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key.length > 5);
}

/**
 * Returns a server-only singleton instance of the Google Gen AI client.
 *
 * Security:
 * - Reads GEMINI_API_KEY strictly server-side.
 * - Never logs or exposes the key.
 */
export function getGeminiClient(customApiKey?: string): GoogleGenAI | null {
  const activeKey = (customApiKey || process.env.GEMINI_API_KEY)?.trim();
  if (!activeKey) {
    return null;
  }

  // Reuse cached client if key hasn't changed
  if (cachedClient && clientApiKey === activeKey) {
    return cachedClient;
  }

  cachedClient = new GoogleGenAI({ apiKey: activeKey });
  clientApiKey = activeKey;
  return cachedClient;
}

/**
 * Resets cached client (useful in test suites or key rotation).
 */
export function resetGeminiClient(): void {
  cachedClient = null;
  clientApiKey = null;
}
