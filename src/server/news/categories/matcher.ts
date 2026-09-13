import { getTaxonomyIndex, type CategoryRule } from "./keywords";

export interface CategoryMatch {
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  rootId: string;
  rootSlug: string;
  level: 1 | 2 | 3;
  confidence: number;
  isPrimary: boolean;
  matchedRule: string;
}

export interface MatchCategoriesInput {
  title: string;
  description?: string | null;
  content?: string | null;
}

export interface MatcherOptions {
  minConfidence?: number;
  maxCategories?: number;
}

/**
 * Extracts a normalized word set and padded text for fast token lookups.
 */
function tokenize(text: string): { words: Set<string>; text: string } {
  const clean = (text || "").toLowerCase();
  const words = new Set<string>();
  const tokens = clean.match(/[a-z0-9+#.-]+/g);
  if (tokens) {
    for (const t of tokens) {
      words.add(t);
    }
  }
  return { words, text: ` ${clean} ` };
}

/**
 * Checks whether a keyword is matched in the tokenized text.
 * - Single-word keywords are looked up in $O(1)$ from the words Set.
 * - Multi-word keywords (phrases) are checked using substring search with word boundaries.
 */
function hasKeyword(kw: string, tokens: { words: Set<string>; text: string }): boolean {
  if (!kw) return false;
  if (!kw.includes(" ")) {
    return tokens.words.has(kw);
  }
  // Multi-word phrase check with boundary spaces
  return tokens.text.includes(` ${kw} `) || tokens.text.includes(kw);
}

/**
 * Evaluates an article's title, description, and content against the taxonomy rules.
 *
 * Deterministic, non-LLM, sub-millisecond execution:
 * 1. Title matches are weighted highest (headlines carry the primary subject).
 * 2. Exact phrase and category name matches boost confidence.
 * 3. Topic matches automatically inherit parent subcategory and root category.
 * 4. Ranks matches by confidence and designates the single top match as isPrimary.
 */
export function matchCategories(
  input: MatchCategoriesInput,
  options: MatcherOptions = {}
): CategoryMatch[] {
  const { minConfidence = 0.40, maxCategories = 5 } = options;
  const { categoryMap, rules } = getTaxonomyIndex();

  if (!input.title || !input.title.trim()) {
    return [];
  }

  const titleTokens = tokenize(input.title);
  const descTokens = tokenize(input.description || "");
  const contentTokens = input.content ? tokenize(input.content.slice(0, 1000)) : null;

  // Map of categoryId -> { score, matchedRule, rule }
  const matchScores = new Map<string, { score: number; reason: string; rule: CategoryRule }>();

  for (const rule of rules) {
    let score = 0;
    let reason = "";

    // 1. Exact phrase matches
    if (rule.exactPhrases) {
      for (const phrase of rule.exactPhrases) {
        if (titleTokens.text.includes(phrase)) {
          score += 4.5;
          reason = `Phrase "${phrase}" in title`;
          break;
        } else if (descTokens.text.includes(phrase)) {
          score += 2.0;
          reason = `Phrase "${phrase}" in description`;
          break;
        }
      }
    }

    // 2. Keyword token matches
    let keywordHitsInTitle = 0;
    let keywordHitsInDesc = 0;

    for (const kw of rule.keywords) {
      if (hasKeyword(kw, titleTokens)) {
        keywordHitsInTitle++;
        if (!reason) reason = `Keyword "${kw}" in title`;
      } else if (hasKeyword(kw, descTokens)) {
        keywordHitsInDesc++;
        if (!reason) reason = `Keyword "${kw}" in description`;
      } else if (contentTokens && hasKeyword(kw, contentTokens)) {
        score += 0.4;
      }
    }

    // Weight keyword hits
    score += keywordHitsInTitle * 3.0;
    score += keywordHitsInDesc * 1.2;

    if (score > 0) {
      matchScores.set(rule.id, { score, reason, rule });
    }
  }

  // 3. Hierarchical Roll-Up (inherit parent subcategory and root category)
  // If Level-3 Topic matches with score S, parent Level-2 receives at least S * 0.9,
  // and Level-1 Root receives at least S * 0.8.
  const inheritedScores = new Map<string, { score: number; reason: string; rule: CategoryRule }>(matchScores);

  for (const [, match] of matchScores.entries()) {
    const { rule, score } = match;

    if (rule.parentId && categoryMap.has(rule.parentId)) {
      const parentRule = categoryMap.get(rule.parentId)!;
      const inheritedParentScore = score * 0.90;
      const currentParent = inheritedScores.get(parentRule.id);

      if (!currentParent || inheritedParentScore > currentParent.score) {
        inheritedScores.set(parentRule.id, {
          score: inheritedParentScore,
          reason: `Inherited from topic "${rule.name}"`,
          rule: parentRule,
        });
      }
    }

    if (rule.rootId && rule.rootId !== rule.id && categoryMap.has(rule.rootId)) {
      const rootRule = categoryMap.get(rule.rootId)!;
      const inheritedRootScore = score * 0.80;
      const currentRoot = inheritedScores.get(rootRule.id);

      if (!currentRoot || inheritedRootScore > currentRoot.score) {
        inheritedScores.set(rootRule.id, {
          score: inheritedRootScore,
          reason: `Inherited from topic "${rule.name}"`,
          rule: rootRule,
        });
      }
    }
  }

  // 4. Convert to normalized confidence scores
  const results: CategoryMatch[] = [];

  for (const [catId, item] of inheritedScores.entries()) {
    // Normalization curve: score of 6.0 gives ~0.85, 10.0+ gives ~0.98
    const confidence = Math.min(0.99, Math.round((item.score / (item.score + 1.8)) * 100) / 100);

    if (confidence >= minConfidence) {
      const rootRule = categoryMap.get(item.rule.rootId);
      results.push({
        categoryId: catId,
        categorySlug: item.rule.slug,
        categoryName: item.rule.name,
        rootId: item.rule.rootId,
        rootSlug: rootRule ? rootRule.slug : item.rule.slug,
        level: item.rule.level,
        confidence,
        isPrimary: false,
        matchedRule: item.reason,
      });
    }
  }

  // 5. Rank: highest confidence first, prefer deeper levels on ties
  results.sort((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    // Deeper levels (Topic > Subcategory > Main) have higher semantic specificity
    return b.level - a.level;
  });

  // Limit to max categories
  const truncated = results.slice(0, maxCategories);

  // Mark top candidate as primary
  if (truncated.length > 0) {
    truncated[0].isPrimary = true;
  }

  return truncated;
}
