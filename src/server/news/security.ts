/**
 * SSRF & URL safety validator for news feed URLs.
 * Ensures the ingestion service only connects to safe, external public HTTP/HTTPS endpoints.
 */

const PRIVATE_IP_PATTERNS = [
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // 127.0.0.0/8 Loopback
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // 10.0.0.0/8 Private
  /^192\.168\.\d{1,3}\.\d{1,3}$/, // 192.168.0.0/16 Private
  /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/, // 172.16.0.0/12 Private
  /^169\.254\.\d{1,3}\.\d{1,3}$/, // 169.254.0.0/16 Link-Local / Cloud Metadata
  /^0\.0\.0\.0$/,
  /^::1$/, // IPv6 Loopback
  /^fe80:/i, // IPv6 Link-Local
  /^fc00:/i, // IPv6 Unique Local
];

const DISALLOWED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.internal",
]);

/**
 * Validates whether a feed URL is safe for server-side fetching.
 * Returns true if safe, false if unsafe or malformed.
 */
export function isSafeFeedUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);

    // 1. Strict protocol check: only http and https
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    // 2. Reject credentials in URL (e.g. http://user:pass@example.com)
    if (parsed.username || parsed.password) {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase().trim();

    // 3. Reject disallowed hostnames
    if (
      DISALLOWED_HOSTNAMES.has(hostname) ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local")
    ) {
      return false;
    }

    // 4. Strip square brackets from IPv6 hostnames
    const cleanHost = hostname.replace(/^\[|\]$/g, "");

    // 5. Reject private / loopback IP patterns
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(cleanHost)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Asserts that a URL is safe for fetching, throwing an Error if unsafe.
 */
export function assertSafeFeedUrl(urlString: string): URL {
  if (!isSafeFeedUrl(urlString)) {
    throw new Error(
      `SSRF Protection: Refusing to fetch unsafe or disallowed feed URL "${urlString}"`
    );
  }
  return new URL(urlString);
}
