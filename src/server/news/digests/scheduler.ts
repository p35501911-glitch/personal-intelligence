/**
 * Scheduled Digest Generation for Active Users
 *
 * Runs scheduled batch briefings for active users with configured category preferences.
 *
 * Guarantees:
 * - Idempotency: Idempotent period windows ensure already-generated briefings are skipped (0 Gemini calls).
 * - Quota protection: Sensible batch limits prevent runaway Gemini consumption.
 * - Fault isolation: Failure for one user does not interrupt briefing generation for others.
 * - Exactly-one Gemini call per new digest (or deterministic fallback).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getServiceSupabaseClient } from "../../supabase";
import { generateTopicDigest } from "./pipeline";
import type { DigestPeriodType } from "./types";

export interface ScheduledDigestOptions {
  periodType: DigestPeriodType;
  userLimit?: number;
  force?: boolean;
  client?: SupabaseClient<Database>;
}

export interface ScheduledDigestReport {
  periodType: DigestPeriodType;
  totalUsersChecked: number;
  digestsGenerated: number;
  digestsSkipped: number;
  failures: number;
  durationMs: number;
  errors: string[];
}

/**
 * Executes a batch digest generation run for active users.
 */
export async function runScheduledDigestGeneration(
  options: ScheduledDigestOptions
): Promise<ScheduledDigestReport> {
  const startTime = Date.now();
  const {
    periodType,
    userLimit = 25,
    force = false,
    client = getServiceSupabaseClient(),
  } = options;

  console.log(
    `[Digest Scheduler] Starting ${periodType.toUpperCase()} digest generation (limit: ${userLimit} users)...`
  );

  const errors: string[] = [];
  let generated = 0;
  let skipped = 0;
  let failures = 0;

  // 1. Identify distinct active users who have configured categories or preferences
  const userIds = new Set<string>();

  try {
    const { data: catRows, error: catError } = await client
      .from("user_category_preferences")
      .select("user_id")
      .limit(userLimit * 3);

    if (!catError && catRows) {
      catRows.forEach((r) => {
        if (r.user_id) userIds.add(r.user_id);
      });
    }

    const { data: prefRows, error: prefError } = await client
      .from("user_preferences")
      .select("user_id")
      .limit(userLimit * 3);

    if (!prefError && prefRows) {
      prefRows.forEach((r) => {
        if (r.user_id) userIds.add(r.user_id);
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Failed to query active users: ${msg}`);
  }

  const activeUserList = Array.from(userIds).slice(0, userLimit);

  if (activeUserList.length === 0) {
    console.log("[Digest Scheduler] No active users with topic preferences found. Skipping run.");
    return {
      periodType,
      totalUsersChecked: 0,
      digestsGenerated: 0,
      digestsSkipped: 0,
      failures: 0,
      durationMs: Date.now() - startTime,
      errors,
    };
  }

  console.log(`[Digest Scheduler] Processing ${activeUserList.length} candidate user(s)...`);

  // 2. Process each user with fault isolation
  for (const userId of activeUserList) {
    try {
      const result = await generateTopicDigest({
        userId,
        periodType,
        force,
        client,
      });

      if (result.generated) {
        generated++;
        console.log(
          `[Digest Scheduler] Generated new ${periodType} briefing for user ${userId} (${result.digest.storyCount} stories).`
        );
      } else {
        skipped++;
      }
    } catch (userErr: unknown) {
      failures++;
      const errorMsg = userErr instanceof Error ? userErr.message : String(userErr);
      errors.push(`User ${userId} briefing error: ${errorMsg}`);
      console.error(`[Digest Scheduler] Failed to generate digest for user ${userId}:`, errorMsg);
    }
  }

  const durationMs = Date.now() - startTime;

  console.log(
    `[Digest Scheduler] Completed ${periodType} run in ${durationMs}ms: generated=${generated}, skipped=${skipped}, failures=${failures}`
  );

  return {
    periodType,
    totalUsersChecked: activeUserList.length,
    digestsGenerated: generated,
    digestsSkipped: skipped,
    failures,
    durationMs,
    errors,
  };
}
