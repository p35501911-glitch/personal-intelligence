import { GoogleGenAI } from "@google/genai";
import type { GeminiEngineConfig } from "./types";

let cachedClient: GoogleGenAI | null = null;
let clientApiKey: string | null = null;

/**
 * Returns the configured Flash-Lite model (default: 'gemini-flash-lite-latest').
 */
export function getFlashLiteModel(): string {
  return process.env.GEMINI_FLASH_LITE_MODEL?.trim() || "gemini-flash-lite-latest";
}

/**
 * Returns the configured Flash model (default: 'gemini-flash-latest').
 */
export function getFlashModel(): string {
  return process.env.GEMINI_FLASH_MODEL?.trim() || "gemini-flash-latest";
}

/**
 * Returns whether AI processing is globally enabled (default: true).
 */
export function isAiEnabled(): boolean {
  return process.env.AI_ENABLED !== "false";
}

/**
 * Returns whether Flash deep analysis is enabled for important stories (default: true).
 */
export function isDeepAnalysisEnabled(): boolean {
  return process.env.AI_DEEP_ANALYSIS_ENABLED !== "false";
}

/**
 * Returns the score threshold separating Normal vs Important stories (default: 0.7).
 */
export function getAiImportantThreshold(): number {
  const parsed = Number(process.env.AI_IMPORTANT_THRESHOLD);
  return !isNaN(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.7;
}

/**
 * Validates and retrieves the full Gemini engine configuration from the server environment.
 */
export function getGeminiConfig(): GeminiEngineConfig {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || undefined;
  const flashLiteModel = getFlashLiteModel();
  const flashModel = getFlashModel();
  const importantThreshold = getAiImportantThreshold();
  const promptVersion = Number(process.env.AI_PROMPT_VERSION) || 2;
  const batchSize = Math.max(1, Math.min(20, Number(process.env.AI_BATCH_SIZE) || Number(process.env.GEMINI_BATCH_SIZE) || 10));
  const concurrency = Math.max(1, Math.min(5, Number(process.env.AI_CONCURRENCY) || 2));
  const timeoutMs = Math.max(3000, Number(process.env.GEMINI_TIMEOUT_MS) || 20000);
  const maxRetries = Math.max(0, Math.min(3, Number(process.env.AI_MAX_RETRIES) || 1));
  const enabled = isAiEnabled();
  const deepAnalysisEnabled = isDeepAnalysisEnabled();

  return {
    apiKey,
    flashLiteModel,
    flashModel,
    importantThreshold,
    promptVersion,
    batchSize,
    concurrency,
    timeoutMs,
    maxRetries,
    enabled,
    deepAnalysisEnabled,
    model: flashModel, // compatibility fallback
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
 * Returns the Google Gen AI client or throws an explicit error if missing when AI is enabled.
 */
export function requireGeminiClient(): GoogleGenAI {
  const client = getGeminiClient();
  if (!client) {
    throw new Error("GEMINI_API_KEY is missing or invalid in server environment.");
  }
  return client;
}

/**
 * Resets cached client (useful in test suites or key rotation).
 */
export function resetGeminiClient(): void {
  cachedClient = null;
  clientApiKey = null;
}
