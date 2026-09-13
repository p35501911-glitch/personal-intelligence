/**
 * Publisher Authority Tiers Dictionary & Classifier
 *
 * Categorizes news publishers into 3 credibility/authority tiers:
 * - Tier 1: Global Wires, National Broadcasters, and Premier Financial Outlets (Base: 1.00)
 * - Tier 2: Domain Leaders, Major Tech Press, Respected Analysis (Base: 0.75)
 * - Tier 3: Specialist Blogs, Regional Outlets, General RSS, Aggregators (Base: 0.45)
 */

export type PublisherTier = 1 | 2 | 3;

export interface PublisherTierMatch {
  tier: PublisherTier;
  matchedPattern: string;
  weight: number;
}

// Tier 1: Global news agencies, premier financial papers, top-tier international broadcasters
const TIER_1_PATTERNS = [
  // Wire services
  /\breuters\b/i,
  /\bbloomberg\b/i,
  /\bassociated\s+press\b/i,
  /\bap\s+news\b/i,
  /\bapnews\b/i,
  /\bagence\s+france-presse\b/i,
  /\bafp\b/i,
  /\bpress\s+association\b/i,

  // Premier Broadcasters & Newspapers
  /\bbbc\b/i,
  /\bwall\s+street\s+journal\b/i,
  /\bwsj\b/i,
  /\bfinancial\s+times\b/i,
  /\bft\.com\b/i,
  /\bnew\s+york\s+times\b/i,
  /\bnytimes\b/i,
  /\bwashington\s+post\b/i,
  /\bwashpost\b/i,
  /\bthe\s+guardian\b/i,
  /\bguardian\b/i,
  /\bthe\s+economist\b/i,
  /\beconomist\b/i,
  /\bcnn\b/i,
];

// Tier 2: Established tech authorities, major business media, premier science/policy journals
const TIER_2_PATTERNS = [
  // Tech Leaders
  /\btechcrunch\b/i,
  /\bthe\s+verge\b/i,
  /\bverge\b/i,
  /\bwired\b/i,
  /\bars\s+technica\b/i,
  /\barstechnica\b/i,
  /\bengadget\b/i,
  /\bventurebeat\b/i,
  /\bzdnet\b/i,
  /\bcnet\b/i,

  // Business & Finance Leaders
  /\bcnbc\b/i,
  /\bforbes\b/i,
  /\bfortune\b/i,
  /\bmarketwatch\b/i,
  /\bbarron'?s\b/i,
  /\bnikkei\b/i,
  /\bsouth\s+china\s+morning\s+post\b/i,
  /\bscmp\b/i,

  // Policy & Science Leaders
  /\bpolitico\b/i,
  /\baxios\b/i,
  /\bthe\s+hill\b/i,
  /\bnature\b/i,
  /\bscience\s+magazine\b/i,
  /\bmit\s+technology\s+review\b/i,
  /\btechnology\s+review\b/i,
  /\bscientific\s+american\b/i,
  /\bpropublica\b/i,
];

export const TIER_WEIGHTS: Record<PublisherTier, number> = {
  1: 1.0,
  2: 0.75,
  3: 0.45,
};

/**
 * Classifies a publisher by name, URL, or domain.
 */
export function classifyPublisher(source: {
  name?: string | null;
  url?: string | null;
  domain?: string | null;
}): PublisherTierMatch {
  const combined = `${source.name || ""} ${source.domain || ""} ${source.url || ""}`.toLowerCase();

  for (const pattern of TIER_1_PATTERNS) {
    if (pattern.test(combined)) {
      return {
        tier: 1,
        matchedPattern: pattern.source,
        weight: TIER_WEIGHTS[1],
      };
    }
  }

  for (const pattern of TIER_2_PATTERNS) {
    if (pattern.test(combined)) {
      return {
        tier: 2,
        matchedPattern: pattern.source,
        weight: TIER_WEIGHTS[2],
      };
    }
  }

  return {
    tier: 3,
    matchedPattern: "default-tier-3",
    weight: TIER_WEIGHTS[3],
  };
}

/**
 * Computes the aggregate publisher authority score across all sources attached to a story.
 * Incorporates highest tier found plus multi-Tier-1 bonus.
 */
export function computeAggregatePublisherAuthority(
  sources: Array<{ name?: string | null; url?: string | null; domain?: string | null }>
): { score: number; highestTier: PublisherTier; tier1Count: number; tier2Count: number } {
  if (!sources || sources.length === 0) {
    return {
      score: 0.5,
      highestTier: 3,
      tier1Count: 0,
      tier2Count: 0,
    };
  }

  let highestTier: PublisherTier = 3;
  let maxWeight = 0;
  let tier1Count = 0;
  let tier2Count = 0;

  for (const s of sources) {
    const match = classifyPublisher(s);
    if (match.tier < highestTier) {
      highestTier = match.tier;
    }
    if (match.weight > maxWeight) {
      maxWeight = match.weight;
    }
    if (match.tier === 1) tier1Count++;
    if (match.tier === 2) tier2Count++;
  }

  // Bonus for multiple independent Tier 1 outlets covering the same story
  const tier1Bonus = Math.max(0, tier1Count - 1) * 0.05;
  const finalScore = Math.min(1.0, maxWeight + tier1Bonus);

  return {
    score: Number(finalScore.toFixed(3)),
    highestTier,
    tier1Count,
    tier2Count,
  };
}
