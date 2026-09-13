/**
 * Deterministic Story Importance & Impact Scorer
 *
 * Evaluates the global significance and news gravity of a story cluster across 4 objective axes:
 * 1. Coverage Breadth (35%): Unique publisher count & clustered article volume
 * 2. Publisher Authority Tiers (30%): Credibility weighting of reporting news outlets
 * 3. Reporting Velocity (20%): Publication arrival rate across time
 * 4. Event & Entity Prominence (15%): Institutional, regulatory, or market-moving signals
 */

import { computeAggregatePublisherAuthority } from "./tiers";
import { evaluateEventProminence } from "./prominence";

export type StoryImportanceLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface StoryImportanceInput {
  canonicalTitle: string;
  summary?: string | null;
  articleCount: number;
  sourceCount: number;
  firstPublishedAt: Date;
  latestPublishedAt: Date;
  sources?: Array<{
    name?: string | null;
    url?: string | null;
    domain?: string | null;
  }>;
  referenceTime?: Date;
}

export interface StoryImportanceResult {
  score: number; // 0.00 to 1.00
  level: StoryImportanceLevel;
  breakdown: {
    coverageBreadth: number;
    publisherAuthority: number;
    velocity: number;
    eventProminence: number;
  };
  signals: string[];
}

/**
 * Calculates coverage breadth score based on unique source count and total articles.
 */
export function computeCoverageBreadth(sourceCount: number, articleCount: number): number {
  const n = Math.max(1, sourceCount);
  let baseScore: number;

  if (n === 1) {
    baseScore = 0.2;
  } else if (n === 2) {
    baseScore = 0.45;
  } else if (n === 3) {
    baseScore = 0.65;
  } else if (n === 4) {
    baseScore = 0.78;
  } else if (n === 5) {
    baseScore = 0.88;
  } else {
    baseScore = Math.min(1.0, 0.88 + (n - 5) * 0.03);
  }

  // Bonus for clustered articles beyond unique source count (depth of coverage)
  const extraArticles = Math.max(0, articleCount - n);
  const depthBonus = Math.min(0.12, extraArticles * 0.03);

  return Number(Math.min(1.0, baseScore + depthBonus).toFixed(3));
}

/**
 * Calculates reporting velocity score based on article arrival rate over time.
 */
export function computeReportingVelocity(
  firstPublishedAt: Date,
  latestPublishedAt: Date,
  articleCount: number
): number {
  if (articleCount <= 1) {
    return 0.3; // Baseline single-article arrival
  }

  const firstMs = firstPublishedAt.getTime();
  const latestMs = latestPublishedAt.getTime();
  const diffHours = Math.max(0.1, Math.abs(latestMs - firstMs) / (1000 * 60 * 60));

  // Arrival rate: articles per hour (with smoothing constant)
  const rate = articleCount / (diffHours + 0.5);

  // Sublinear logarithmic scaling
  const velocityScore = Math.min(1.0, Math.max(0.2, 0.25 + 0.35 * Math.log(1 + rate)));

  return Number(velocityScore.toFixed(3));
}

/**
 * Computes the composite global importance score for a story cluster.
 * Execution speed: sub-millisecond (0.01 - 0.03ms).
 */
export function computeStoryImportance(input: StoryImportanceInput): StoryImportanceResult {
  const sourceCount = Math.max(1, input.sourceCount || 1);
  const articleCount = Math.max(sourceCount, input.articleCount || 1);

  // 1. Coverage Breadth (35%)
  const coverageScore = computeCoverageBreadth(sourceCount, articleCount);

  // 2. Publisher Authority Tiers (30%)
  const authorityResult = computeAggregatePublisherAuthority(input.sources || []);
  const authorityScore = authorityResult.score;

  // 3. Reporting Velocity (20%)
  const velocityScore = computeReportingVelocity(
    input.firstPublishedAt,
    input.latestPublishedAt,
    articleCount
  );

  // 4. Event & Entity Prominence (15%)
  const prominenceResult = evaluateEventProminence(input.canonicalTitle, input.summary);
  const prominenceScore = prominenceResult.score;

  // Weighted composite formula: 0.35 + 0.30 + 0.20 + 0.15 = 1.00
  const rawComposite =
    0.35 * coverageScore +
    0.3 * authorityScore +
    0.2 * velocityScore +
    0.15 * prominenceScore;

  const score = Number(Math.min(1.0, Math.max(0.05, rawComposite)).toFixed(2));

  // Determine categorical impact level
  let level: StoryImportanceLevel;
  if (score >= 0.8) {
    level = "CRITICAL";
  } else if (score >= 0.6) {
    level = "HIGH";
  } else if (score >= 0.4) {
    level = "MEDIUM";
  } else {
    level = "LOW";
  }

  // Compile explanatory signals
  const signals: string[] = [];

  if (sourceCount >= 4) {
    signals.push(`Consensus coverage across ${sourceCount} independent publishers`);
  } else if (sourceCount >= 2) {
    signals.push(`Covered by ${sourceCount} publishers`);
  }

  if (authorityResult.highestTier === 1) {
    signals.push(
      authorityResult.tier1Count > 1
        ? `Validated by ${authorityResult.tier1Count} Tier 1 global news agencies`
        : "Reported by Tier 1 global news wire"
    );
  } else if (authorityResult.highestTier === 2) {
    signals.push("Reported by major industry press");
  }

  if (velocityScore >= 0.75) {
    signals.push("Rapidly developing story / high reporting velocity");
  }

  signals.push(...prominenceResult.signals);

  return {
    score,
    level,
    breakdown: {
      coverageBreadth: coverageScore,
      publisherAuthority: authorityScore,
      velocity: velocityScore,
      eventProminence: prominenceScore,
    },
    signals,
  };
}
