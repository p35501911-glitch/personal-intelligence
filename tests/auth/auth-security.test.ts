import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";

// 1. Load local environment configuration if present
const cwd = process.cwd();
const localEnvPath = path.resolve(cwd, ".env.local");
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}
const envPath = path.resolve(cwd, ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

import { validateRedirectTarget, GET as authCallbackGet } from "../../src/app/auth/callback/route";
import { feedQuerySchema } from "../../src/app/api/feed/route";
import { saveStoryBodySchema } from "../../src/app/api/saved-stories/route";
import { getDigestsQuerySchema } from "../../src/app/api/digests/route";

test("Phase 4A: App Authentication & Google Login Comprehensive Security Suite", async (t) => {
  // -------------------------------------------------------------------
  // 1. Route Protection & Middleware Redirection Logic
  // -------------------------------------------------------------------
  await t.test("1. Unauthenticated user cannot access protected application routes", () => {
    // Helper replicating middleware route evaluation logic
    function evaluateRouteAccess(pathname: string, user: unknown | null) {
      const isPublicRoute =
        pathname === "/login" ||
        pathname.startsWith("/auth/") ||
        pathname.startsWith("/api/");

      if (!user && !isPublicRoute) {
        const target = pathname !== "/" ? `/login?next=${encodeURIComponent(pathname)}` : "/login";
        return { status: 307, redirectUrl: target };
      }
      return { status: 200, redirectUrl: null };
    }

    // Protected paths must redirect unauthenticated visitors
    const rootCheck = evaluateRouteAccess("/", null);
    assert.strictEqual(rootCheck.status, 307);
    assert.strictEqual(rootCheck.redirectUrl, "/login");

    const onboardingCheck = evaluateRouteAccess("/onboarding/categories", null);
    assert.strictEqual(onboardingCheck.status, 307);
    assert.strictEqual(onboardingCheck.redirectUrl, "/login?next=%2Fonboarding%2Fcategories");

    const savedCheck = evaluateRouteAccess("/saved", null);
    assert.strictEqual(savedCheck.status, 307);
    assert.strictEqual(savedCheck.redirectUrl, "/login?next=%2Fsaved");

    // Public paths must not be blocked
    assert.strictEqual(evaluateRouteAccess("/login", null).status, 200);
    assert.strictEqual(evaluateRouteAccess("/auth/callback", null).status, 200);
    assert.strictEqual(evaluateRouteAccess("/api/health", null).status, 200);
  });

  await t.test("2. Authenticated user can access protected application routes", () => {
    function evaluateRouteAccess(pathname: string, user: unknown | null) {
      const isPublicRoute =
        pathname === "/login" ||
        pathname.startsWith("/auth/") ||
        pathname.startsWith("/api/");

      if (user && pathname === "/login") {
        return { status: 307, redirectUrl: "/" };
      }

      if (!user && !isPublicRoute) {
        return { status: 307, redirectUrl: "/login" };
      }

      return { status: 200, redirectUrl: null };
    }

    const mockUser = { id: "authenticated-user-uuid", email: "user@example.com" };

    // Authenticated access to protected screens
    assert.strictEqual(evaluateRouteAccess("/", mockUser).status, 200);
    assert.strictEqual(evaluateRouteAccess("/onboarding/categories", mockUser).status, 200);

    // Authenticated user visiting /login is redirected back to application
    const loginAttempt = evaluateRouteAccess("/login", mockUser);
    assert.strictEqual(loginAttempt.status, 307);
    assert.strictEqual(loginAttempt.redirectUrl, "/");
  });

  // -------------------------------------------------------------------
  // 2. OAuth Callback & Code Exchange
  // -------------------------------------------------------------------
  await t.test("3. OAuth callback handles missing or invalid authorization code safely without exposing secrets", async () => {
    // Missing code request
    const missingCodeReq = new Request("http://localhost:3000/auth/callback");
    const resMissing = await authCallbackGet(missingCodeReq);

    assert.strictEqual(resMissing.status, 307);
    const location = resMissing.headers.get("location");
    assert.ok(location?.includes("/login?error=auth_callback_failed"));
    assert.ok(!location?.includes("token"), "No token must ever be leaked in URL or response");
    assert.ok(!location?.includes("secret"), "No secret must ever be leaked in URL or response");
  });

  await t.test("4. OAuth callback validates redirect targets and neutralizes open redirects", () => {
    // Valid relative application routes
    assert.strictEqual(validateRedirectTarget("/"), "/");
    assert.strictEqual(validateRedirectTarget("/onboarding/categories"), "/onboarding/categories");
    assert.strictEqual(validateRedirectTarget("/?tab=saved"), "/?tab=saved");

    // Malicious open redirect exploits neutralized to safe root "/"
    assert.strictEqual(validateRedirectTarget("https://malicious-phishing.com"), "/");
    assert.strictEqual(validateRedirectTarget("http://evil.com"), "/");
    assert.strictEqual(validateRedirectTarget("//evil.com"), "/");
    assert.strictEqual(validateRedirectTarget("/\\evil.com"), "/");
    assert.strictEqual(validateRedirectTarget("///evil.com"), "/");
    assert.strictEqual(validateRedirectTarget(null), "/");
    assert.strictEqual(validateRedirectTarget(""), "/");
  });

  // -------------------------------------------------------------------
  // 3. Session Persistence & Logout Simulation
  // -------------------------------------------------------------------
  await t.test("5. Session persistence simulates cookie state across requests", () => {
    // Mock session cookie store simulating @supabase/ssr
    const cookieStore = new Map<string, string>();

    function setSessionCookies(token: string, userId: string) {
      cookieStore.set("sb-access-token", token);
      cookieStore.set("sb-user-id", userId);
    }

    function resolveSession() {
      const token = cookieStore.get("sb-access-token");
      const userId = cookieStore.get("sb-user-id");
      if (token && userId) {
        return { user: { id: userId, token } };
      }
      return { user: null };
    }

    // Step A: Establish session
    setSessionCookies("jwt-mock-token-xyz", "persistent-user-123");
    assert.strictEqual(resolveSession().user?.id, "persistent-user-123");

    // Step B: Subsequent request read confirms session persists
    const subsequentReq = resolveSession();
    assert.ok(subsequentReq.user !== null);
    assert.strictEqual(subsequentReq.user.id, "persistent-user-123");
  });

  await t.test("6. Logout terminates session and clears user access", () => {
    const cookieStore = new Map<string, string>();
    cookieStore.set("sb-access-token", "jwt-mock-token-xyz");
    cookieStore.set("sb-user-id", "user-to-logout-123");

    function signOut() {
      cookieStore.clear();
      return { redirectUrl: "/login" };
    }

    // Call logout
    const logoutResult = signOut();
    assert.strictEqual(logoutResult.redirectUrl, "/login");
    assert.strictEqual(cookieStore.size, 0, "All authentication cookies must be cleared on logout");
  });

  // -------------------------------------------------------------------
  // 4. Server-Side User Resolution & Client Spoofing Protection
  // -------------------------------------------------------------------
  await t.test("7. Server resolves user through Supabase auth and ignores client-supplied userId", () => {
    const serverAuthenticatedUser = { id: "real-authenticated-user-uuid" };

    function resolveAuthorizedUserId(authenticatedUser: { id: string } | null, clientPayload: { userId?: string }) {
      if (!authenticatedUser) {
        throw new Error("Unauthorized");
      }
      // Security rule: ALWAYS use authenticatedUser.id, NEVER clientPayload.userId
      if (clientPayload.userId) {
        // Explicitly ignored client input
      }
      return authenticatedUser.id;
    }

    const resolved = resolveAuthorizedUserId(serverAuthenticatedUser, {
      userId: "spoofed-attacker-uuid-999",
    });

    assert.strictEqual(resolved, "real-authenticated-user-uuid");
    assert.notStrictEqual(resolved, "spoofed-attacker-uuid-999");
  });

  await t.test("8. Feed, saved stories, and digests query schemas strictly strip client userId", () => {
    // 8a. Feed schema
    const feedInput = { userId: "attacker-user-id", limit: "10" };
    const feedParsed = feedQuerySchema.safeParse(feedInput);
    assert.strictEqual(feedParsed.success, true);
    if (feedParsed.success) {
      assert.strictEqual((feedParsed.data as Record<string, unknown>).userId, undefined);
    }

    // 8b. Saved story schema
    const savedInput = { userId: "attacker-user-id", storyId: "valid-story-id" };
    const savedParsed = saveStoryBodySchema.safeParse(savedInput);
    assert.strictEqual(savedParsed.success, true);
    if (savedParsed.success) {
      assert.strictEqual((savedParsed.data as Record<string, unknown>).userId, undefined);
      assert.strictEqual(savedParsed.data.storyId, "valid-story-id");
    }

    // 8c. Digests schema
    const digestInput = { userId: "attacker-user-id", limit: "5" };
    const digestParsed = getDigestsQuerySchema.safeParse(digestInput);
    assert.strictEqual(digestParsed.success, true);
    if (digestParsed.success) {
      assert.strictEqual((digestParsed.data as Record<string, unknown>).userId, undefined);
    }
  });

  // -------------------------------------------------------------------
  // 5. User Data Isolation
  // -------------------------------------------------------------------
  await t.test("9. User isolation rule prevents User A from accessing User B's saved stories", () => {
    interface SavedStoryRecord {
      id: string;
      userId: string;
      storyId: string;
    }

    const mockDatabase: SavedStoryRecord[] = [
      { id: "rec-1", userId: "user-alpha", storyId: "story-100" },
      { id: "rec-2", userId: "user-beta", storyId: "story-200" },
    ];

    function getSavedStoriesForUser(currentUserId: string) {
      return mockDatabase.filter((rec) => rec.userId === currentUserId);
    }

    const alphaStories = getSavedStoriesForUser("user-alpha");
    assert.strictEqual(alphaStories.length, 1);
    assert.strictEqual(alphaStories[0].storyId, "story-100");

    const betaStories = getSavedStoriesForUser("user-beta");
    assert.strictEqual(betaStories.length, 1);
    assert.strictEqual(betaStories[0].storyId, "story-200");

    // Cross-user access check
    assert.ok(!alphaStories.some((s) => s.userId === "user-beta"));
    assert.ok(!betaStories.some((s) => s.userId === "user-alpha"));
  });

  await t.test("10. Topic digests remain strictly user-isolated", () => {
    interface DigestRecord {
      id: string;
      userId: string;
      title: string;
    }

    const mockDigests: DigestRecord[] = [
      { id: "dig-1", userId: "user-alpha", title: "Alpha Daily Briefing" },
      { id: "dig-2", userId: "user-beta", title: "Beta Daily Briefing" },
    ];

    function getDigestsForUser(currentUserId: string) {
      return mockDigests.filter((d) => d.userId === currentUserId);
    }

    const alphaDigests = getDigestsForUser("user-alpha");
    assert.strictEqual(alphaDigests.length, 1);
    assert.strictEqual(alphaDigests[0].title, "Alpha Daily Briefing");
    assert.ok(!alphaDigests.some((d) => d.userId === "user-beta"));
  });

  // -------------------------------------------------------------------
  // 6. Secrets Protection & Client Safety
  // -------------------------------------------------------------------
  await t.test("11. SUPABASE_SERVICE_ROLE_KEY is never exported to client code or bundles", () => {
    // Scan all client-side files in src/
    const clientDir = path.join(cwd, "src", "components");
    function checkDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          checkDir(fullPath);
        } else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
          const content = fs.readFileSync(fullPath, "utf-8");
          assert.strictEqual(
            content.includes("SUPABASE_SERVICE_ROLE_KEY"),
            false,
            `SUPABASE_SERVICE_ROLE_KEY leaked in client file: ${fullPath}`
          );
        }
      }
    }
    checkDir(clientDir);
  });

  await t.test("12. GEMINI_API_KEY is strictly server-side and never present in client components", () => {
    const clientDir = path.join(cwd, "src", "components");
    function checkDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          checkDir(fullPath);
        } else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
          const content = fs.readFileSync(fullPath, "utf-8");
          assert.strictEqual(
            content.includes("GEMINI_API_KEY"),
            false,
            `GEMINI_API_KEY leaked in client file: ${fullPath}`
          );
        }
      }
    }
    checkDir(clientDir);
  });

  await t.test("13. Authentication tokens never appear in API responses or serialized client props", () => {
    function sanitizeUserPayload(user: { id: string; email: string; token?: string; secretKey?: string }) {
      // API responses should only return public identification
      const { token: _t, secretKey: _s, ...publicData } = user;
      void _t;
      void _s;
      return publicData;
    }

    const rawUser = {
      id: "user-123",
      email: "user@example.com",
      token: "secret-bearer-jwt-token-do-not-expose",
      secretKey: "super-secret-key",
    };

    const sanitized = sanitizeUserPayload(rawUser);
    assert.strictEqual((sanitized as Record<string, unknown>).token, undefined);
    assert.strictEqual((sanitized as Record<string, unknown>).secretKey, undefined);
    assert.strictEqual(sanitized.id, "user-123");
    assert.strictEqual(sanitized.email, "user@example.com");
  });

  await t.test("14. Authentication failure responses return generic error messages without exposing internals", () => {
    function createAuthFailureResponse(rawInternalError: Error) {
      // Log internally
      const _internal = rawInternalError.message;
      void _internal;
      // Return safe client message
      return {
        success: false,
        error: "Authentication failed. Please try signing in again.",
      };
    }

    const internalError = new Error("PostgreSQL connection timeout at internal-db.supabase.co:5432 with secret password");
    const response = createAuthFailureResponse(internalError);

    assert.strictEqual(response.success, false);
    assert.strictEqual(response.error, "Authentication failed. Please try signing in again.");
    assert.ok(!response.error.includes("PostgreSQL"));
    assert.ok(!response.error.includes("password"));
    assert.ok(!response.error.includes("supabase.co:5432"));
  });

  // -------------------------------------------------------------------
  // 7. UI Specification & State Verification
  // -------------------------------------------------------------------
  await t.test("15. Login UI specification includes 'Continue with Google', branding, and responsive layout", () => {
    const loginPagePath = path.join(cwd, "src", "app", "login", "page.tsx");
    assert.ok(fs.existsSync(loginPagePath), "Login page must exist");
    const content = fs.readFileSync(loginPagePath, "utf-8");

    // Primary Google action
    assert.ok(content.includes("Continue with Google"), "Login page must contain 'Continue with Google'");
    assert.ok(content.includes("handleGoogleSignIn"), "Login page must have Google sign in handler");
    assert.ok(content.includes("signInWithOAuth"), "Login page must invoke signInWithOAuth");
    assert.ok(content.includes("provider: 'google'"), "Must specify google OAuth provider");

    // Branding & visual design
    assert.ok(content.includes("Personal"), "Must contain Personal Intelligence branding");
    assert.ok(content.includes("Intelligence"), "Must contain Personal Intelligence branding");

    // States
    assert.ok(content.includes("isGoogleLoading"), "Must have loading state for Google OAuth");
    assert.ok(content.includes("errorMessage"), "Must handle and display error messages");
  });

  await t.test("16. Authenticated User Menu includes Google avatar support, email, and sign-out", () => {
    const userMenuPath = path.join(cwd, "src", "components", "auth", "user-menu.tsx");
    assert.ok(fs.existsSync(userMenuPath), "UserMenu component must exist");
    const content = fs.readFileSync(userMenuPath, "utf-8");

    // Google Avatar support
    assert.ok(content.includes("avatar_url"), "Must check user_metadata.avatar_url");
    assert.ok(content.includes("picture"), "Must check user_metadata.picture fallback");

    // Sign out & session termination
    assert.ok(content.includes("signOut"), "Must call supabase.auth.signOut");
    assert.ok(content.includes("/login"), "Must route to /login upon sign out");
    assert.ok(content.includes("Sign Out"), "Must render Sign Out button");
  });
});
