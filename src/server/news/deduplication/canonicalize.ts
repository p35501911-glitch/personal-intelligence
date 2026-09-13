/**
 * Set of known tracking query parameter names and prefixes to strip from URLs.
 * Parameters are checked in lowercase.
 */
const TRACKING_PARAM_PREFIXES = [
  "utm_", // Google Analytics / general campaign parameters
  "sc_", // Sitecore / Salesforce tracking
  "at_", // BBC / editorial tracking (e.g. at_medium, at_campaign)
];

const TRACKING_PARAM_EXACT = new Set([
  "fbclid", // Facebook click ID
  "gclid", // Google click ID
  "gclsrc", // Google click source
  "dclid", // DoubleClick click ID
  "wbraid", // Google iOS Web-to-App click ID
  "gbraid", // Google App-to-Web click ID
  "msclkid", // Microsoft / Bing click ID
  "yclid", // Yandex click ID
  "mc_cid", // Mailchimp campaign ID
  "mc_eid", // Mailchimp email ID
  "_ga", // Google Analytics client ID
  "_gl", // Google Analytics cross-domain link
  "mkt_tok", // Marketo tracking token
  "igshid", // Instagram tracking
  "twclid", // Twitter / X click ID
  "trk", // LinkedIn tracking
  "trkcampaign", // LinkedIn campaign tracking
  "ref", // Generic referrer tracking
  "ref_src", // Twitter referrer source
]);

/**
 * Determines whether a given query parameter key is a tracking parameter.
 */
function isTrackingParameter(key: string): boolean {
  const lowerKey = key.toLowerCase();

  if (TRACKING_PARAM_EXACT.has(lowerKey)) {
    return true;
  }

  for (const prefix of TRACKING_PARAM_PREFIXES) {
    if (lowerKey.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

/**
 * Canonicalizes a URL deterministically:
 *
 * 1. Safely parses URL and strips whitespace.
 * 2. Normalizes protocol (lowercase) and hostname (lowercase, default ports removed).
 * 3. Normalizes path (collapses consecutive slashes, removes trailing slashes on non-root paths).
 * 4. Strips known tracking query parameters (utm_*, fbclid, gclid, mc_cid, etc.)
 *    while preserving meaningful query parameters (id, v, p, article, etc.).
 * 5. Sorts remaining query parameters alphabetically by key for deterministic equality.
 * 6. Strips URL fragments/hashes (#...).
 *
 * If the URL cannot be parsed (malformed), safely returns the trimmed string.
 */
export function canonicalizeUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string") {
    return "";
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) {
    return "";
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    // If not a valid absolute URL, return trimmed original
    return trimmed;
  }

  // 1. Normalize protocol to lowercase
  parsed.protocol = parsed.protocol.toLowerCase();

  // 2. Normalize hostname (lowercase, strip trailing dot and default ports)
  parsed.hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (
    (parsed.protocol === "http:" && parsed.port === "80") ||
    (parsed.protocol === "https:" && parsed.port === "443")
  ) {
    parsed.port = "";
  }

  // 3. Normalize pathname (collapse multiple consecutive slashes, strip trailing slash unless root)
  let pathname = parsed.pathname.replace(/\/+/g, "/");
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  parsed.pathname = pathname;

  // 4. Strip tracking query parameters while preserving meaningful ones
  const searchParams = new URLSearchParams(parsed.search);
  const preservedParams: Array<[string, string]> = [];

  for (const [key, value] of searchParams.entries()) {
    if (!isTrackingParameter(key)) {
      preservedParams.push([key, value]);
    }
  }

  // 5. Sort remaining query parameters deterministically by key, then by value
  preservedParams.sort(([keyA, valA], [keyB, valB]) => {
    const keyCompare = keyA.localeCompare(keyB);
    if (keyCompare !== 0) return keyCompare;
    return valA.localeCompare(valB);
  });

  const cleanSearchParams = new URLSearchParams();
  for (const [key, value] of preservedParams) {
    cleanSearchParams.append(key, value);
  }

  const newSearch = cleanSearchParams.toString();
  parsed.search = newSearch ? `?${newSearch}` : "";

  // 6. Strip fragment/hash
  parsed.hash = "";

  return parsed.toString();
}
