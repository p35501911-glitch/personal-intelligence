import { extractTitleTokens, normalizeTitle } from "./normalize-title";

export type DuplicateClassificationType =
  | "EXACT_EXTERNAL_ID"
  | "EXACT_CANONICAL_URL"
  | "EXACT_TITLE_SAME_SOURCE"
  | "CANDIDATE_SIMILAR"
  | "DISTINCT";

export interface DuplicateClassification {
  type: DuplicateClassificationType;
  isExactDuplicate: boolean;
  score: number;
  reason: string;
}

export interface CandidateArticleComparison {
  externalId: string;
  provider: string;
  canonicalUrl: string;
  title: string;
  sourceName?: string | null;
  publishedAt: Date;
}

/**
 * Computes character bigram Dice similarity between two strings.
 * Returns a value between 0.0 and 1.0.
 */
export function computeBigramSimilarity(strA: string, strB: string): number {
  if (strA === strB) return 1.0;
  if (strA.length < 2 || strB.length < 2) return 0.0;

  const getBigrams = (str: string): Map<string, number> => {
    const map = new Map<string, number>();
    for (let i = 0; i < str.length - 1; i++) {
      const bigram = str.substring(i, i + 2);
      map.set(bigram, (map.get(bigram) || 0) + 1);
    }
    return map;
  };

  const bigramsA = getBigrams(strA);
  const bigramsB = getBigrams(strB);

  let intersection = 0;
  for (const [bigram, countA] of bigramsA.entries()) {
    const countB = bigramsB.get(bigram);
    if (countB) {
      intersection += Math.min(countA, countB);
    }
  }

  const total = (strA.length - 1) + (strB.length - 1);
  return (2.0 * intersection) / total;
}

const ACRONYM_EXPANSIONS: Record<string, string[]> = {
  ai: ["artificial", "intelligence"],
  eu: ["european", "union"],
  uk: ["united", "kingdom"],
  us: ["united", "states"],
  usa: ["united", "states"],
  ceo: ["chief", "executive"],
  ev: ["electric", "vehicle", "vehicles"],
};

/**
 * Computes Jaccard and Overlap token similarity between two token sets,
 * accounting for standard acronym expansions (e.g. AI <-> artificial intelligence).
 */
export function computeTokenSimilarity(tokensA: Set<string>, tokensB: Set<string>): {
  jaccard: number;
  overlap: number;
} {
  if (tokensA.size === 0 || tokensB.size === 0) {
    return { jaccard: 0, overlap: 0 };
  }

  // Work with copies to check acronym matches
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  // Check acronym expansions from A into B
  for (const [acronym, expandedWords] of Object.entries(ACRONYM_EXPANSIONS)) {
    if (setA.has(acronym) && !setB.has(acronym)) {
      const allExpandedPresent = expandedWords.every((w) => setB.has(w));
      if (allExpandedPresent) {
        setB.add(acronym);
      }
    } else if (setB.has(acronym) && !setA.has(acronym)) {
      const allExpandedPresent = expandedWords.every((w) => setA.has(w));
      if (allExpandedPresent) {
        setA.add(acronym);
      }
    }
  }

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection++;
    }
  }

  const union = setA.size + setB.size - intersection;
  const jaccard = union > 0 ? intersection / union : 0;
  const minSize = Math.min(setA.size, setB.size);
  const overlap = minSize > 0 ? intersection / minSize : 0;

  return { jaccard, overlap };
}

/**
 * Computes deterministic title similarity between two article titles.
 * Combines token overlap, Jaccard similarity, and bigram Dice similarity.
 * Returns a score between 0.0 and 1.0.
 */
export function computeTitleSimilarity(rawTitleA: string, rawTitleB: string): number {
  const normA = normalizeTitle(rawTitleA);
  const normB = normalizeTitle(rawTitleB);

  if (!normA || !normB) return 0.0;
  if (normA === normB) return 1.0;

  const tokensA = extractTitleTokens(normA);
  const tokensB = extractTitleTokens(normB);

  const { jaccard, overlap } = computeTokenSimilarity(tokensA, tokensB);
  const bigramScore = computeBigramSimilarity(normA, normB);

  // Weighted composite score:
  // - 45% token Overlap (identifies contained / rephrased headlines)
  // - 35% token Jaccard (shared vocabulary penalty on divergent lengths)
  // - 20% bigram Dice (handles morphology and spelling variations)
  const composite = (0.45 * overlap) + (0.35 * jaccard) + (0.20 * bigramScore);
  return Math.min(1.0, Math.max(0.0, composite));
}

/**
 * Evaluates duplicate status between an incoming article and an existing candidate.
 *
 * Implements the 4-stage hierarchy:
 * 1. Exact provider + external_id -> EXACT_EXTERNAL_ID
 * 2. Exact canonical URL -> EXACT_CANONICAL_URL
 * 3. Exact normalized title + same source within time window -> EXACT_TITLE_SAME_SOURCE
 * 4. High title similarity within time window -> CANDIDATE_SIMILAR (for story clustering)
 * Otherwise -> DISTINCT
 *
 * Conservative Rule: Cross-source candidate matches are NOT merged destructively.
 */
export function classifyDuplicateCandidate(
  incoming: CandidateArticleComparison,
  existing: CandidateArticleComparison,
  options: {
    maxTimeWindowHours?: number;
    candidateThreshold?: number;
  } = {}
): DuplicateClassification {
  const { maxTimeWindowHours = 72, candidateThreshold = 0.72 } = options;

  // Stage 1: Exact provider + external_id
  if (
    incoming.provider === existing.provider &&
    incoming.externalId.trim() === existing.externalId.trim()
  ) {
    return {
      type: "EXACT_EXTERNAL_ID",
      isExactDuplicate: true,
      score: 1.0,
      reason: `Exact match on provider "${incoming.provider}" and externalId "${incoming.externalId}"`,
    };
  }

  // Stage 2: Exact canonical URL match
  if (
    incoming.canonicalUrl &&
    existing.canonicalUrl &&
    incoming.canonicalUrl === existing.canonicalUrl
  ) {
    return {
      type: "EXACT_CANONICAL_URL",
      isExactDuplicate: true,
      score: 1.0,
      reason: `Exact match on canonical URL: ${incoming.canonicalUrl}`,
    };
  }

  // Check publication time proximity
  const timeDiffMs = Math.abs(incoming.publishedAt.getTime() - existing.publishedAt.getTime());
  const hoursDiff = timeDiffMs / (1000 * 60 * 60);

  // If outside publication proximity window, articles are treated as distinct
  if (hoursDiff > maxTimeWindowHours) {
    return {
      type: "DISTINCT",
      isExactDuplicate: false,
      score: 0.0,
      reason: `Articles published ${Math.round(hoursDiff)}h apart (exceeds ${maxTimeWindowHours}h window)`,
    };
  }

  const normTitleIncoming = normalizeTitle(incoming.title);
  const normTitleExisting = normalizeTitle(existing.title);

  // Stage 3: Exact normalized title + same source
  const isSameSource = Boolean(
    incoming.sourceName &&
    existing.sourceName &&
    incoming.sourceName.toLowerCase().trim() === existing.sourceName.toLowerCase().trim()
  );

  if (normTitleIncoming === normTitleExisting && isSameSource) {
    return {
      type: "EXACT_TITLE_SAME_SOURCE",
      isExactDuplicate: true,
      score: 0.98,
      reason: `Identical normalized title from source "${incoming.sourceName}" within ${Math.round(hoursDiff)}h`,
    };
  }

  // Stage 4: Near-duplicate candidate similarity
  const similarityScore = computeTitleSimilarity(incoming.title, existing.title);

  if (similarityScore >= candidateThreshold) {
    return {
      type: "CANDIDATE_SIMILAR",
      isExactDuplicate: false, // NOT marked as exact duplicate: preserved as separate article
      score: similarityScore,
      reason: `Near-duplicate candidate (score: ${similarityScore.toFixed(3)}) within ${Math.round(hoursDiff)}h`,
    };
  }

  return {
    type: "DISTINCT",
    isExactDuplicate: false,
    score: similarityScore,
    reason: `Distinct articles (similarity: ${similarityScore.toFixed(3)})`,
  };
}
