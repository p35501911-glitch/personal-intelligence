# Personal Intelligence — Production Deployment Guide

This guide details the complete process for deploying **Personal Intelligence** to production using Supabase, Google Cloud OAuth, Vercel, and Google Gemini AI.

---

## 1. Supabase Production Setup

### 1.1 Create Project
1. Create a new project in the [Supabase Dashboard](https://supabase.com).
2. Choose a region close to your primary audience.
3. Save your database password securely.

### 1.2 Run Database Migrations
Execute the migrations in sequential order using the Supabase SQL Editor or Supabase CLI:

```bash
# Order of migrations
supabase/migrations/20260913_category_system.sql
supabase/migrations/20260913_user_preferences.sql
supabase/migrations/20260913_article_database.sql
supabase/migrations/20260913_category_matching.sql
supabase/migrations/20260913_story_cluster_model.sql
supabase/migrations/20260913_story_intelligence.sql
supabase/migrations/20260913_user_saved_stories.sql
supabase/migrations/20260914_topic_digests.sql
supabase/migrations/20260914_rls_security_hardening.sql
```

### 1.3 Verify Row-Level Security (RLS)
Verify in the Supabase Dashboard under **Table Editor** that RLS is active on:
- `user_preferences`
- `user_category_preferences`
- `user_saved_stories`
- `topic_digests`
- `topic_digest_stories`
- `categories`, `stories`, `articles`, `sources`, `story_intelligence`

---

## 2. Google OAuth Configuration

### 2.1 Google Cloud Console
1. Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Create an **OAuth 2.0 Client ID** with Application type **Web application**.
3. Under **Authorized redirect URIs**, add your Supabase Auth callback URI:
   ```
   https://<your-project-id>.supabase.co/auth/v1/callback
   ```
4. Note the generated **Client ID** and **Client Secret**.

### 2.2 Supabase Auth Dashboard
1. In the Supabase Dashboard, navigate to **Authentication** → **Providers** → **Google**.
2. Toggle **Enable Google provider**.
3. Paste the **Client ID** and **Client Secret**.
4. Save changes.
5. In **Authentication** → **URL Configuration**:
   - Set **Site URL** to your production URL (e.g., `https://personal-intelligence.vercel.app`).
   - Add your callback URLs to **Redirect URLs**:
     - `https://personal-intelligence.vercel.app/auth/callback`
     - `http://localhost:3000/auth/callback` (for local development)

### 2.3 Authentication & Session Architecture
- **Primary OAuth Action**: Users initiate login via "Continue with Google" on `/login`.
- **OAuth Exchange**: Supabase handles the Google authorization code grant at `/auth/callback`. The server exchanges `code` via `supabase.auth.exchangeCodeForSession(code)` and issues HTTP-only session cookies.
- **First-Time vs Returning Routing**:
  - First-time users without `user_preferences` are automatically routed to `/onboarding/categories`.
  - Returning users with existing preferences are routed directly to `/` (Personalized Feed).
- **Session Persistence**: Managed via `@supabase/ssr` with cookie synchronization in `src/middleware.ts` and `src/lib/supabase/server.ts`.
- **Logout Behavior**:
  - Calling `supabase.auth.signOut()` invalidates the session and clears all session cookies.
  - The client transitions immediately to `/login` and unauthenticated access to `/` or `/onboarding/*` is blocked.

### 2.4 Authentication Troubleshooting
- **Error: `redirect_uri_mismatch`**: Ensure Google Cloud Console authorized redirect URIs match `https://<project-id>.supabase.co/auth/v1/callback` exactly.
- **Error: `auth_callback_failed`**: Occurs if the OAuth code is expired or replayed. The app safely redirects to `/login?error=auth_callback_failed` without crashing.
- **Session Drops on Refresh**: Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are defined in `.env.local` / Vercel Environment Variables.
- **Open Redirect Protection**: `validateRedirectTarget()` strictly rejects protocol-relative (`//evil.com`) or absolute foreign URLs, defaulting to safe relative paths.

---

## 3. Environment Variables Reference

Configure these in the Vercel Dashboard under **Project Settings** → **Environment Variables**:

| Variable | Target | Description | Safe for Browser? |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production & Preview | Supabase project URL | ✅ Yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production & Preview | Supabase anon/public key | ✅ Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Production & Preview | Server-only service role secret | ❌ **NEVER EXPOSE** |
| `CRON_SECRET` | Production & Preview | Auth secret for scheduled worker endpoints | ❌ **NEVER EXPOSE** |
| `GEMINI_API_KEY` | Production & Preview | Google Gemini API key | ❌ **NEVER EXPOSE** |
| `GEMINI_FLASH_LITE_MODEL` | Production & Preview | Default: `gemini-flash-lite-latest` | ❌ Server-only |
| `GEMINI_FLASH_MODEL` | Production & Preview | Default: `gemini-flash-latest` | ❌ Server-only |
| `AI_ENABLED` | Production & Preview | Set `true` | ❌ Server-only |
| `AI_DEEP_ANALYSIS_ENABLED` | Production & Preview | Set `true` | ❌ Server-only |
| `AI_IMPORTANT_THRESHOLD` | Production & Preview | Default: `0.7` | ❌ Server-only |
| `AI_BATCH_SIZE` | Production & Preview | Default: `10` | ❌ Server-only |
| `AI_CONCURRENCY` | Production & Preview | Default: `2` | ❌ Server-only |

---

## 4. Vercel Deployment

1. Connect your GitHub repository to Vercel.
2. Ensure framework preset is **Next.js**.
3. Add the environment variables listed above.
4. Deploy the `main` branch.

### Scheduled Jobs (Vercel Cron)
The included `vercel.json` automatically schedules tasks:
- **Hourly News Ingestion**: `/api/ingest` at minute 0 (`0 * * * *`)
- **Hourly AI Processing**: `/api/ai/process` at minute 15 (`15 * * * *`)
- **Daily Briefing Generation**: `/api/digests/generate?periodType=daily` at 06:00 UTC (`0 6 * * *`)
- **Weekly Briefing Generation**: `/api/digests/generate?periodType=weekly` on Mondays at 06:00 UTC (`0 6 * * 1`)

---

## 5. Production Smoke Test Checklist

Execute these checks immediately after deployment:

1. **System Health Check**:
   ```bash
   curl -i https://<your-app>.vercel.app/api/health
   # Must return 200 OK with status: "ok" and database.connected: true
   ```

2. **Authentication Flow**:
   - Navigate to `/login`.
   - Click "Continue with Google".
   - Confirm redirect through Supabase and return to dashboard with active session.
   - Confirm user avatar and email are displayed in the header.

3. **Personalized Feed & Category Management**:
   - Change category selections in **Manage Topics**.
   - Verify feed updates with personalized scores.
   - Verify keyboard navigation works (`j`, `k`, `o`, `s`, `Esc`).

4. **Saved Intelligence / Bookmarks**:
   - Press `s` or click bookmark on a card.
   - Switch to **Saved Intelligence** tab and verify card appears.
   - Delete bookmark and verify removal.

5. **Scheduled Ingestion Trigger**:
   ```bash
   curl -X POST https://<your-app>.vercel.app/api/ingest \
     -H "Authorization: Bearer <your-cron-secret>"
   # Must return 200 OK with cycle report
   ```

6. **Rate Limiting Verification**:
   - Issue rapid requests to `/api/feed` or `/api/digests/generate`.
   - Verify `429 Too Many Requests` status and `Retry-After` header.

---

## 6. Rollback & Disaster Recovery

### Vercel Instant Rollback
1. Open the **Deployments** tab in Vercel.
2. Select the previous stable deployment.
3. Click **Instant Rollback**.

### Emergency Worker Lock Reset
If an unexpected crash locks the ingestion worker:
```bash
curl -X POST "https://<your-app>.vercel.app/api/ingest?secret=<cron-secret>" \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

### Emergency AI Disabling
If Gemini quota is exhausted or undergoing service issues:
Set `AI_ENABLED=false` in Vercel environment variables and redeploy. The entire deterministic feed, taxonomy, and briefings continue operating seamlessly via deterministic fallbacks with zero crash.
