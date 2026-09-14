/**
 * Server-Side Environment Variable Validation
 *
 * Validates critical infrastructure secrets and operational flags.
 * NEVER import this file in client-side components.
 *
 * Security Invariant:
 * Never prints or leaks secret values in log messages or exception stack traces.
 */

import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_URL is required")
    .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY is required for server worker operations"),
  CRON_SECRET: z.string().min(8, "CRON_SECRET should be at least 8 characters for security").optional(),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY cannot be empty").optional(),
  DATABASE_URL: z.string().optional(),
  AI_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === undefined || val === "true"),
  AI_DEEP_ANALYSIS_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === undefined || val === "true"),
  AI_IMPORTANT_THRESHOLD: z
    .string()
    .optional()
    .transform((val) => (val ? parseFloat(val) : 0.7)),
  AI_BATCH_SIZE: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10)),
  AI_CONCURRENCY: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 2)),
  AI_MAX_RETRIES: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1)),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | null = null;

/**
 * Validates server environment variables and returns sanitized configuration.
 *
 * @param forceReload - Re-validates from process.env if true
 * @throws Error if required variables are missing or malformed in production
 */
export function validateServerEnv(forceReload = false): ServerEnv {
  if (cachedEnv && !forceReload) {
    return cachedEnv;
  }

  const rawEnv = {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    AI_ENABLED: process.env.AI_ENABLED,
    AI_DEEP_ANALYSIS_ENABLED: process.env.AI_DEEP_ANALYSIS_ENABLED,
    AI_IMPORTANT_THRESHOLD: process.env.AI_IMPORTANT_THRESHOLD,
    AI_BATCH_SIZE: process.env.AI_BATCH_SIZE,
    AI_CONCURRENCY: process.env.AI_CONCURRENCY,
    AI_MAX_RETRIES: process.env.AI_MAX_RETRIES,
  };

  const isProduction = process.env.NODE_ENV === "production";
  const result = serverEnvSchema.safeParse(rawEnv);

  if (!result.success) {
    // Collect field names that failed without echoing raw values
    const missingOrInvalid = result.error.issues.map((issue) => {
      const field = issue.path.join(".");
      return `${field}: ${issue.message}`;
    });

    const errorMessage = `[ServerEnv] Critical Environment Validation Failed:\n - ${missingOrInvalid.join("\n - ")}`;

    if (isProduction) {
      // In production, hard-fail to prevent insecure startup
      console.error(errorMessage);
      throw new Error(
        `Server configuration error: ${result.error.issues.map((i) => i.path.join(".")).join(", ")} missing or invalid.`
      );
    } else {
      // In development or test, warn clearly but allow graceful degradation
      console.warn(errorMessage);
      // Construct fallback for non-production environments
      cachedEnv = {
        NODE_ENV: (process.env.NODE_ENV as "development" | "test" | "production") || "development",
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321",
        NEXT_PUBLIC_SUPABASE_ANON_KEY:
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
          "mock-anon-key",
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "mock-service-role-key",
        CRON_SECRET: process.env.CRON_SECRET,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        DATABASE_URL: process.env.DATABASE_URL,
        AI_ENABLED: process.env.AI_ENABLED !== "false",
        AI_DEEP_ANALYSIS_ENABLED: process.env.AI_DEEP_ANALYSIS_ENABLED !== "false",
        AI_IMPORTANT_THRESHOLD: 0.7,
        AI_BATCH_SIZE: 10,
        AI_CONCURRENCY: 2,
        AI_MAX_RETRIES: 1,
      };
      return cachedEnv;
    }
  }

  // Additional Production Strictness Checks
  if (isProduction) {
    const missingProdSecrets: string[] = [];
    if (!result.data.CRON_SECRET) missingProdSecrets.push("CRON_SECRET");
    if (!result.data.GEMINI_API_KEY) missingProdSecrets.push("GEMINI_API_KEY");

    if (missingProdSecrets.length > 0) {
      throw new Error(
        `[ServerEnv] Production requires secrets: ${missingProdSecrets.join(", ")}. Never run production without them.`
      );
    }
  }

  cachedEnv = result.data;
  return cachedEnv;
}

/**
 * Returns whether the server is running in production mode.
 */
export function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === "production";
}
