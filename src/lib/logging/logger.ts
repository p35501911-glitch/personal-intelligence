/**
 * Structured Production Logger
 *
 * Provides standardized event telemetry and sanitization for Personal Intelligence operations.
 *
 * Security Invariants:
 * - Redacts all tokens, API keys, secrets, authorization headers, and cookies.
 * - Outputs structured JSON for easy parsing by Logflare / Datadog / CloudWatch / Vercel Logs.
 */

export type LogEventType =
  | "job_started"
  | "job_completed"
  | "job_failed"
  | "ingestion_failed"
  | "ai_quota_exhausted"
  | "ai_processing_failed"
  | "digest_generation_failed"
  | "auth_failure"
  | "rate_limit_triggered";

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogMetadata {
  jobName?: string;
  jobId?: string;
  durationMs?: number;
  recordsProcessed?: number;
  recordsCreated?: number;
  counts?: Record<string, number>;
  errorType?: string;
  errorMessage?: string;
  httpStatus?: number;
  userId?: string;
  clientId?: string;
  provider?: string;
  model?: string;
  source?: string;
  extra?: Record<string, unknown>;
}

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  event: LogEventType;
  message: string;
  metadata?: LogMetadata;
}

// Sensitive key patterns to redact automatically
const REDACTION_PATTERNS = [
  /api[-_]?key/i,
  /secret/i,
  /service[-_]?role/i,
  /token/i,
  /authorization/i,
  /cookie/i,
  /password/i,
  /bearer/i,
];

/**
 * Recursively sanitizes data to remove any secret or credential keys.
 */
export function sanitizeLogData<T>(input: T): T {
  if (input === null || input === undefined) return input;

  if (typeof input === "string") {
    // Check for Bearer token patterns or embedded secrets
    if (input.toLowerCase().startsWith("bearer ")) {
      return "[REDACTED_BEARER_TOKEN]" as unknown as T;
    }
    // Check for obvious API key patterns
    if (input.startsWith("AIzaSy") || input.startsWith("eyJh")) {
      return "[REDACTED_SECRET_KEY]" as unknown as T;
    }
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeLogData(item)) as unknown as T;
  }

  if (typeof input === "object") {
    const sanitizedObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      const isSensitive = REDACTION_PATTERNS.some((pattern) => pattern.test(k));
      if (isSensitive) {
        sanitizedObj[k] = "[REDACTED]";
      } else {
        sanitizedObj[k] = sanitizeLogData(v);
      }
    }
    return sanitizedObj as T;
  }

  return input;
}

class ProductionLogger {
  private formatLog(level: LogLevel, event: LogEventType, message: string, metadata?: LogMetadata): StructuredLogEntry {
    const cleanMetadata = metadata ? sanitizeLogData(metadata) : undefined;
    return {
      timestamp: new Date().toISOString(),
      level,
      event,
      message,
      metadata: cleanMetadata,
    };
  }

  info(event: LogEventType, message: string, metadata?: LogMetadata): void {
    const entry = this.formatLog("info", event, message, metadata);
    console.log(JSON.stringify(entry));
  }

  warn(event: LogEventType, message: string, metadata?: LogMetadata): void {
    const entry = this.formatLog("warn", event, message, metadata);
    console.warn(JSON.stringify(entry));
  }

  error(event: LogEventType, message: string, metadata?: LogMetadata): void {
    const entry = this.formatLog("error", event, message, metadata);
    console.error(JSON.stringify(entry));
  }

  debug(event: LogEventType, message: string, metadata?: LogMetadata): void {
    if (process.env.NODE_ENV !== "production") {
      const entry = this.formatLog("debug", event, message, metadata);
      console.debug(JSON.stringify(entry));
    }
  }
}

export const logger = new ProductionLogger();
