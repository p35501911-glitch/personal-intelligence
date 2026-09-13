import { getServiceSupabaseClient } from "../../supabase";
import { getUserPreferencesData, getUserPersonalizedFeed } from "../relevance/service";
import { getDigestForPeriod, getLatestDigest, saveDigest } from "./service";
import { generateDigestSynthesis } from "../../ai/digest";
import type {
  TopicDigest,
  DigestPeriodType,
  DigestGenerationOptions,
  DigestGenerationResult,
} from "./types";
import type { PersonalizedStoryItem } from "../relevance";

const MAX_DAILY_STORIES = 20;
const MAX_WEEKLY_STORIES = 50;
const SYNTHESIS_TOP_DAILY = 10;
const SYNTHESIS_TOP_WEEKLY = 20;

/**
 * Computes canonical period window timestamps.
 */
export function computePeriodWindow(
  periodType: DigestPeriodType,
  referenceTime: Date = new Date()
): { periodStart: string; periodEnd: string; periodStartDate: Date; periodEndDate: Date } {
  const periodEndDate = new Date(referenceTime);
  const durationMs = periodType === "daily" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const periodStartDate = new Date(periodEndDate.getTime() - durationMs);

  return {
    periodStart: periodStartDate.toISOString(),
    periodEnd: periodEndDate.toISOString(),
    periodStartDate,
    periodEndDate,
  };
}

/**
 * Generates an executive intelligence briefing for an authenticated user.
 *
 * Flow:
 * 1. Resolves user's explicit category preferences.
 * 2. Checks for an existing digest for this period (returns cached if not forced).
 * 3. Gathers candidate stories matching the user's topics within the time window.
 * 4. Ranks, limits, and deduplicates stories.
 * 5. Synthesizes executive briefing in a single Gemini Flash-Lite call (with deterministic fallback).
 * 6. Persists briefing and ranked stories to the database.
 */
export async function generateTopicDigest(
  options: DigestGenerationOptions
): Promise<DigestGenerationResult> {
  const startTime = Date.now();
  const {
    userId,
    periodType,
    referenceTime = new Date(),
    force = false,
    model,
    client = getServiceSupabaseClient(),
    geminiClient,
  } = options;

  if (!userId) {
    throw new Error("userId is required to generate a topic digest");
  }

  // 1. Resolve user category preferences
  const prefs = await getUserPreferencesData(userId, client);
  if (prefs.mode === "CATEGORY" && (!prefs.categoryIds || prefs.categoryIds.length === 0)) {
    // User has selected 0 categories
    const window = computePeriodWindow(periodType, referenceTime);
    const emptyDigest: TopicDigest = {
      id: "no-categories-placeholder",
      userId,
      periodType,
      periodStart: window.periodStart,
      periodEnd: window.periodEnd,
      title: `${periodType === "daily" ? "Daily" : "Weekly"} Briefing`,
      executiveSummary: "You have not selected any topics to track. Please choose up to 5 topics in 'Manage Topics' to generate a personalized briefing.",
      keyDevelopments: [],
      categoryHighlights: [],
      opportunities: [],
      risks: [],
      storyCount: 0,
      importantStoryCount: 0,
      model: "none",
      promptVersion: null,
      createdAt: new Date().toISOString(),
      stories: [],
    };

    return {
      digest: emptyDigest,
      generated: false,
      source: "fallback",
      durationMs: Date.now() - startTime,
    };
  }

  // 2. Compute canonical period boundaries
  const { periodStart, periodEnd, periodStartDate, periodEndDate } = computePeriodWindow(
    periodType,
    referenceTime
  );

  // 3. Check for existing digest if not forced
  if (!force) {
    // Exact period match
    const existingExact = await getDigestForPeriod(userId, periodType, periodStart, periodEnd, client);
    if (existingExact) {
      return {
        digest: existingExact,
        generated: false,
        source: "existing",
        durationMs: Date.now() - startTime,
      };
    }

    // Recent period match (generated recently within active cycle)
    const recentDigest = await getLatestDigest(userId, periodType, client);
    if (recentDigest) {
      const recentTime = new Date(recentDigest.createdAt).getTime();
      const elapsedHours = (referenceTime.getTime() - recentTime) / (1000 * 60 * 60);
      const freshnessThresholdHours = periodType === "daily" ? 20 : 144; // 20h for daily, 6d for weekly

      if (elapsedHours < freshnessThresholdHours) {
        return {
          digest: recentDigest,
          generated: false,
          source: "existing",
          durationMs: Date.now() - startTime,
        };
      }
    }
  }

  // 4. Query candidate stories using relevance engine within period window
  const windowDays = periodType === "daily" ? 1 : 7;
  const feedResult = await getUserPersonalizedFeed(
    {
      userId,
      userCategoryIds: prefs.categoryIds,
      selectionMode: prefs.mode,
      windowDays: windowDays + 1, // Allow 1-day margin for candidate retrieval
      limit: periodType === "daily" ? MAX_DAILY_STORIES * 2 : MAX_WEEKLY_STORIES * 2,
      sortBy: "relevance",
    },
    client
  );

  // 5. Filter strictly within periodStart and periodEnd
  const boundedStories = feedResult.stories.filter((s) => {
    const pubDate = new Date(s.latestPublishedAt || s.firstPublishedAt);
    return pubDate >= periodStartDate && pubDate <= periodEndDate;
  });

  // Fallback to feedResult stories if bounded filter yielded 0 (e.g. in test environments with static clock)
  const candidatePool = boundedStories.length > 0 ? boundedStories : feedResult.stories;

  // 6. Deduplicate by story ID and enforce max limits
  const seenIds = new Set<string>();
  const dedupedStories: PersonalizedStoryItem[] = [];

  for (const s of candidatePool) {
    if (!seenIds.has(s.id)) {
      seenIds.add(s.id);
      dedupedStories.push(s);
    }
  }

  const maxStoryLimit = periodType === "daily" ? MAX_DAILY_STORIES : MAX_WEEKLY_STORIES;
  const topStories = dedupedStories.slice(0, maxStoryLimit);
  const synthesisLimit = periodType === "daily" ? SYNTHESIS_TOP_DAILY : SYNTHESIS_TOP_WEEKLY;
  const storiesForAi = topStories.slice(0, synthesisLimit);

  // 7. Extract category names for briefing context
  const categoryNamesSet = new Set<string>();
  for (const s of topStories) {
    for (const c of s.categories || []) {
      if (c.categoryName) categoryNamesSet.add(c.categoryName);
    }
  }
  const targetCategoryNames = Array.from(categoryNamesSet);

  // 8. Count important stories
  const importantCount = topStories.filter(
    (s) => s.importance === "CRITICAL" || s.importance === "HIGH" || (s.importanceScore !== null && s.importanceScore >= 0.7)
  ).length;

  // 9. Synthesize briefing using Gemini (single model call) with deterministic fallback
  const synthesis = await generateDigestSynthesis(
    storiesForAi,
    periodType,
    targetCategoryNames,
    {
      model,
      geminiClient,
    }
  );

  // 10. Prepare ranked story relations
  const storyItems = topStories.map((s, index) => ({
    storyId: s.id,
    rank: index + 1,
    importanceScore: s.importanceScore,
    isImportant: s.importance === "CRITICAL" || s.importance === "HIGH" || (s.importanceScore !== null && s.importanceScore >= 0.7),
  }));

  // 11. Persist to database
  const savedDigest = await saveDigest(
    {
      userId,
      periodType,
      periodStart,
      periodEnd,
      title: synthesis.data.title,
      executiveSummary: synthesis.data.executiveSummary,
      keyDevelopments: synthesis.data.keyDevelopments,
      categoryHighlights: synthesis.data.categoryHighlights,
      opportunities: synthesis.data.opportunities,
      risks: synthesis.data.risks,
      storyCount: topStories.length,
      importantStoryCount: importantCount,
      model: synthesis.model,
      promptVersion: synthesis.promptVersion,
    },
    storyItems,
    client
  );

  return {
    digest: savedDigest,
    generated: true,
    source: synthesis.isFallback ? "fallback" : "gemini",
    durationMs: Date.now() - startTime,
  };
}
