/**
 * Normalizes an article title deterministically:
 *
 * 1. Safely handles Unicode using NFKC compatibility composition.
 * 2. Converts to lowercase.
 * 3. Normalizes typographic quotes, smart quotes, and dashes to standard ASCII equivalents.
 * 4. Strips leading/trailing punctuation and decorative brackets (e.g. trailing ! or ?).
 * 5. Collapses multiple whitespace sequences to a single space.
 * 6. Preserves meaningful words across all languages.
 */
export function normalizeTitle(rawTitle: string): string {
  if (!rawTitle || typeof rawTitle !== "string") {
    return "";
  }

  // 1. Unicode normalization (NFKC ensures compatibility while keeping international letters intact)
  let text = rawTitle.normalize("NFKC").toLowerCase();

  // 2. Normalize and remove all quotation marks (smart quotes, straight quotes)
  text = text.replace(/[\u2018\u2019\u201A\u201B'""\u201C\u201D\u201E\u201F]/g, "");

  // 3. Normalize typographic dashes (en-dash, em-dash, minus) to standard hyphen
  text = text.replace(/[\u2013\u2014\u2212]/g, " - ");

  // 4. Normalize ellipsis to dots
  text = text.replace(/\u2026/g, " ");

  // 5. Strip decorative outer brackets
  text = text.replace(/^[([{<\s]+|[)\]}>\s]+$/g, "");

  // 6. Strip trailing decorative punctuation (!, ?, ., :, ;)
  text = text.replace(/[!?:;.,]+$/g, "");

  // 7. Collapse all repeated whitespace characters (spaces, tabs, newlines, non-breaking spaces)
  text = text.replace(/\s+/g, " ").trim();

  // 8. Clean up any spaced hyphens like " - " to standard " - "
  text = text.replace(/\s*-\s*/g, " - ").trim();

  return text;
}

/**
 * Extracts a token bag from a normalized title for set-based similarity comparisons.
 * Filters out common stop words to focus on meaningful content tokens.
 */
const COMMON_STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "up", "about", "into", "over", "after",
  "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
  "do", "does", "did", "will", "would", "shall", "should", "can", "could",
  "may", "might", "must", "it", "its", "this", "that", "these", "those",
  "as", "if", "when", "than", "so", "no", "not", "new", "latest", "newest", "says"
]);

export function extractTitleTokens(normalizedTitle: string): Set<string> {
  // Split on non-alphanumeric characters (keeping unicode letters/digits)
  const words = normalizedTitle.match(/[\p{L}\p{N}]+/gu) || [];
  const tokens = new Set<string>();

  for (const word of words) {
    if (word.length >= 2 && !COMMON_STOP_WORDS.has(word)) {
      tokens.add(word);
    }
  }

  // If all words were stop words, fall back to keeping all non-empty words
  if (tokens.size === 0) {
    for (const word of words) {
      if (word.length >= 2) {
        tokens.add(word);
      }
    }
  }

  return tokens;
}
