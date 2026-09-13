export interface StoryCategoryTag {
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  rootId?: string | null;
  rootSlug?: string | null;
  parentId?: string | null;
  parentSlug?: string | null;
  level: 1 | 2 | 3;
  confidence: number;
  isPrimary: boolean;
}

export interface RelevanceCandidateStory {
  id: string;
  canonicalTitle: string;
  summary?: string | null;
  firstPublishedAt: Date;
  latestPublishedAt: Date;
  articleCount: number;
  sourceCount: number;
  importanceScore?: number | null;
  categories: StoryCategoryTag[];
}

export interface UserRelevanceInput {
  userCategoryIds: string[]; // User's selected category IDs or slugs
  selectionMode?: "CATEGORY" | "ALL";
  story: RelevanceCandidateStory;
  referenceTime?: Date;
}

export interface RelevanceScoreResult {
  score: number; // 0.00 to 1.00
  isRelevant: boolean; // score >= minThreshold (default 0.15)
  matchedCategoryIds: string[];
  matchedCategoryNames: string[];
  synergyBoost: number;
  recencyFactor: number;
  explanation: string;
}

export interface RelevanceOptions {
  minThreshold?: number;
  halfLifeHours?: number; // Default 48 hours
}

/**
 * Computes deterministic recency decay factor based on exponential half-life.
 * Freshness = 0.5 ^ (hoursElapsed / halfLifeHours), bounded with a floor of 0.20.
 */
export function computeRecencyFactor(
  publishedAt: Date,
  referenceTime: Date = new Date(),
  halfLifeHours: number = 48
): number {
  const elapsedMs = Math.max(0, referenceTime.getTime() - publishedAt.getTime());
  const elapsedHours = elapsedMs / (1000 * 60 * 60);

  // If published recently (< 4 hours), full freshness
  if (elapsedHours <= 4) {
    return 1.0;
  }

  const rawDecay = Math.pow(0.5, elapsedHours / halfLifeHours);
  // Floor decay at 0.20 so highly relevant older stories aren't completely erased
  return Math.max(0.20, Math.min(1.0, Math.round(rawDecay * 100) / 100));
}

/**
 * Computes deterministic relevance of a story to a user's category preferences.
 *
 * Algorithm Rules:
 * 1. Mode 'ALL':
 *    - Balanced score based on coverage breadth (sourceCount, articleCount),
 *      max category confidence, and recency.
 *
 * 2. Mode 'CATEGORY':
 *    - Evaluates story categories against the user's selected category set.
 *    - Specificity weighting:
 *        Level 3 (Topic): 1.00 * confidence
 *        Level 2 (Subcategory): 0.90 * confidence
 *        Level 1 (Main Category): 0.75 * confidence
 *    - Primary category boost: 1.0 multiplier if is_primary, 0.70 multiplier if secondary.
 *    - Multi-Category Synergy:
 *        2 matching categories: +20% boost
 *        3+ matching categories: +35% boost
 *    - Recency Factor: multiplied by smooth half-life decay.
 *    - Bounded in range [0.00, 1.00].
 */
export function computeUserRelevance(
  input: UserRelevanceInput,
  options: RelevanceOptions = {}
): RelevanceScoreResult {
  const { minThreshold = 0.15, halfLifeHours = 48 } = options;
  const {
    userCategoryIds,
    selectionMode = "CATEGORY",
    story,
    referenceTime = new Date(),
  } = input;

  const recencyFactor = computeRecencyFactor(story.latestPublishedAt, referenceTime, halfLifeHours);

  // -------------------------------------------------------------
  // Mode ALL: General interest feed (broad reader)
  // -------------------------------------------------------------
  if (selectionMode === "ALL" || userCategoryIds.length === 0) {
    // Breadth score: normalized from source count (1 source = 0.60, 4+ sources = 0.95)
    const sourceStrength = Math.min(1.0, 0.50 + Math.min(story.sourceCount, 5) * 0.10);
    const maxConfidence = story.categories.length > 0
      ? Math.max(...story.categories.map((c) => c.confidence))
      : 0.70;

    const baseScore = sourceStrength * 0.5 + maxConfidence * 0.5;
    const finalScore = Math.round(Math.min(1.0, baseScore * recencyFactor) * 100) / 100;

    const primaryCat = story.categories.find((c) => c.isPrimary) || story.categories[0];
    const catName = primaryCat?.categoryName || "Top Stories";

    return {
      score: finalScore,
      isRelevant: finalScore >= minThreshold,
      matchedCategoryIds: primaryCat ? [primaryCat.categoryId] : [],
      matchedCategoryNames: primaryCat ? [primaryCat.categoryName] : [catName],
      synergyBoost: 0,
      recencyFactor,
      explanation: `Top story across ${story.sourceCount} publisher${story.sourceCount > 1 ? "s" : ""} in ${catName}`,
    };
  }

  // -------------------------------------------------------------
  // Mode CATEGORY: Personalized scoring against user preferences
  // -------------------------------------------------------------
  const userCatSet = new Set(userCategoryIds.map((id) => id.toLowerCase().trim()));

  interface MatchItem {
    tag: StoryCategoryTag;
    rawMatchScore: number;
  }

  const matchedItems: MatchItem[] = [];

  for (const tag of story.categories) {
    // Check direct ID or slug match
    const isDirectMatch =
      userCatSet.has(tag.categoryId.toLowerCase()) ||
      userCatSet.has(tag.categorySlug.toLowerCase());

    // Check parent category match (e.g. user selected subcategory, tag is child topic)
    const isParentMatch =
      Boolean(tag.parentId && userCatSet.has(tag.parentId.toLowerCase())) ||
      Boolean(tag.parentSlug && userCatSet.has(tag.parentSlug.toLowerCase()));

    // Check root category match (e.g. user selected main category, tag is child/grandchild)
    const isRootMatch =
      Boolean(tag.rootId && userCatSet.has(tag.rootId.toLowerCase())) ||
      Boolean(tag.rootSlug && userCatSet.has(tag.rootSlug.toLowerCase()));

    if (isDirectMatch || isParentMatch || isRootMatch) {
      // Specificity weight based on depth
      let specificityWeight = 0.75; // Level 1 default
      if (isDirectMatch) {
        if (tag.level === 3) specificityWeight = 1.00;
        else if (tag.level === 2) specificityWeight = 0.90;
        else specificityWeight = 0.80;
      } else if (isParentMatch) {
        specificityWeight = 0.85; // Direct parent subcategory match
      } else if (isRootMatch) {
        specificityWeight = 0.70;
      }

      // Primary tag multiplier: primary category carries full weight, secondary carries 75%
      const primaryMultiplier = tag.isPrimary ? 1.0 : 0.75;
      const rawMatchScore = tag.confidence * specificityWeight * primaryMultiplier;

      matchedItems.push({ tag, rawMatchScore });
    }
  }

  // If no categories matched, relevance is 0
  if (matchedItems.length === 0) {
    return {
      score: 0,
      isRelevant: false,
      matchedCategoryIds: [],
      matchedCategoryNames: [],
      synergyBoost: 0,
      recencyFactor,
      explanation: "No overlap with your selected categories",
    };
  }

  // Distinct matched categories
  const uniqueCategoryNames: string[] = [];
  const uniqueCategoryIds: string[] = [];
  for (const m of matchedItems) {
    if (!uniqueCategoryNames.includes(m.tag.categoryName)) {
      uniqueCategoryNames.push(m.tag.categoryName);
      uniqueCategoryIds.push(m.tag.categoryId);
    }
  }

  // Multi-Category Synergy Boost
  let synergyBoost = 0;
  if (uniqueCategoryNames.length >= 3) {
    synergyBoost = 0.35; // +35% for triple interest crossover
  } else if (uniqueCategoryNames.length === 2) {
    synergyBoost = 0.20; // +20% for dual interest crossover
  }

  // Base score is highest single category match score
  const bestMatchScore = Math.max(...matchedItems.map((m) => m.rawMatchScore));

  // Compute final score with synergy and recency
  const boostedScore = bestMatchScore * (1 + synergyBoost);
  const finalScore = Math.round(Math.min(1.0, boostedScore * recencyFactor) * 100) / 100;

  // Generate clear human explanation
  let explanation = `Matches your interest: ${uniqueCategoryNames[0]}`;
  if (uniqueCategoryNames.length > 1) {
    explanation = `Matches your interests: ${uniqueCategoryNames.join(", ")} (+${Math.round(synergyBoost * 100)}% crossover)`;
  }

  return {
    score: finalScore,
    isRelevant: finalScore >= minThreshold,
    matchedCategoryIds: uniqueCategoryIds,
    matchedCategoryNames: uniqueCategoryNames,
    synergyBoost,
    recencyFactor,
    explanation,
  };
}
