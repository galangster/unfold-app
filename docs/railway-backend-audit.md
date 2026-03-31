# Railway Backend Audit: Unfold Backend

**Date:** 2026-03-25
**Project:** unfold-backend (Railway)
**Project ID:** 62fdf682-99dd-429f-b42b-df85d40460c9
**Environment:** production
**Backend URL:** https://unfold-backend-production.up.railway.app
**Health status:** OK (db: connected)

---

## 1. Current State: Services Running

The Railway project has **6 services** in the production environment:

| # | Service Name     | Type     | Status | Volume             | Storage Used |
|---|------------------|----------|--------|--------------------|--------------|
| 1 | unfold-backend   | App      | Online | (none)             | N/A          |
| 2 | **Postgres-9X5K**| Database | Online | postgres-volume-81Qj | 216 MB / 5 GB |
| 3 | Postgres         | Database | Online | postgres-volume    | 216 MB / 5 GB |
| 4 | Postgres-7DGi    | Database | Online | postgres-volume-4oDG | 199 MB / 5 GB |
| 5 | Postgres-LjWs    | Database | Online | postgres-volume-fxVf | 199 MB / 5 GB |
| 6 | Postgres-ON3j    | Database | Online | postgres-volume-fwB8 | 199 MB / 5 GB |

That is **5 Postgres instances** for a backend that uses exactly **1 database connection**.

---

## 2. Which Database Is Active?

**Postgres-9X5K is the active, production database.** This is confirmed by three independent checks:

1. **Backend DATABASE_URL env var** points to `postgres-9x5k.railway.internal:5432/railway`
2. **Health endpoint** at `GET /` returns `{"status":"ok","db":"connected"}`
3. **Code analysis** -- the backend reads a single `DATABASE_URL` and connects via `postgres.js` with a pool of 10 connections (see `src/db/index.ts`)

The active database host:
```
postgres-9x5k.railway.internal:5432
```

---

## 3. Which Databases Are Unused?

The following **4 databases are unused** -- nothing in the codebase references them:

| Service        | Internal Host                        | Verdict        |
|----------------|--------------------------------------|----------------|
| Postgres       | postgres.railway.internal            | **UNUSED**     |
| Postgres-7DGi  | postgres-7dgi.railway.internal       | **UNUSED**     |
| Postgres-LjWs  | postgres-ljws.railway.internal       | **UNUSED**     |
| Postgres-ON3j  | postgres-on3j.railway.internal       | **UNUSED**     |

**How they got there:** These were almost certainly created by accidentally clicking "Add Postgres" or "Deploy Template" multiple times in the Railway dashboard. Railway names auto-created duplicates with random suffixes (7DGi, LjWs, ON3j, 9X5K). The plain "Postgres" was likely the first one created, then the backend was later pointed at Postgres-9X5K instead.

**Storage analysis:** The two that show 216 MB (Postgres-9X5K and plain Postgres) likely have the seeded stories data (1,016 stories). The three at 199 MB are probably empty except for the default PostgreSQL system catalogs. This suggests "Postgres" (the original) may have been the first active database before the backend was re-pointed to Postgres-9X5K.

---

## 4. What the Active Database Contains

The backend schema (defined in `src/db/schema.ts`, single migration `0000_closed_excalibur.sql`) has **2 tables**:

### Table: `stories`
- **Purpose:** Story repository for devotional content generation. 1,016 stories seeded from 9 TypeScript source files via `seed-stories.ts`.
- **Primary key:** `id` (varchar, human-readable slug like `bowlby-attachment-styles`)
- **Columns:** title, era, category, themes (JSONB), one_line_summary, spiritual_angle, scripture_connection, specific_reference, source, spinnable, created_at, updated_at
- **Indexes:** category, themes (GIN), source, spinnable, category+spinnable composite
- **Access pattern:** Read-only from the app. Queried via `GET /api/stories` with filtering by theme, category, source, spinnable. Also `GET /api/stories/themes` (cached 1hr) and `GET /api/stories/:id`.

### Table: `ai_usage`
- **Purpose:** AI cost tracking. Logs every AI API call (Anthropic, xAI/Grok, Gemini) with token counts and estimated cost.
- **Primary key:** `id` (serial)
- **Columns:** created_at, uid, model, endpoint, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_estimate
- **Indexes:** uid, model, created_at
- **Access pattern:** Write-only from the app (insert on every AI call, non-blocking). No read endpoint exists yet.

---

## 5. Cost Impact

### Railway Postgres Pricing (as of March 2026)

Railway charges for Postgres based on:
- **Compute (vCPU + RAM):** Each Postgres service runs as a container. Even idle, it consumes baseline resources.
- **Volume storage:** Charged per GB of provisioned volume.
- **Network:** Internal traffic is free; external (public) is metered.

**Estimated waste per unused Postgres instance:**
- Idle Postgres container: ~$2-5/month compute (depends on Railway plan tier)
- Volume storage (199-216 MB on a 5 GB volume): ~$0.50-1/month

**Total estimated waste: $10-24/month for 4 unused databases.**

On Railway's Hobby plan ($5/month + usage), this could be a significant portion of the bill. On the Pro plan, it is less impactful but still entirely wasteful.

### How to Verify Actual Cost

1. Go to https://railway.com/project/62fdf682-99dd-429f-b42b-df85d40460c9/settings
2. Check the **Usage** tab to see per-service cost breakdown
3. Look for compute charges on the 4 unused Postgres services

---

## 6. Recommended Cleanup Steps

**IMPORTANT: Do NOT execute these until you have verified the active database and taken a backup.**

### Step 1: Verify the Active Database (Before Deleting Anything)

```bash
# Connect to the active database and verify it has data
cd ~/clawd/work/unfold/backend
railway connect Postgres-9X5K

# Inside psql:
SELECT count(*) FROM stories;      -- should be ~1,016
SELECT count(*) FROM ai_usage;     -- check how many usage records exist
\dt                                -- list all tables
```

### Step 2: Check If Any Unused DB Has Real Data

Before deleting, verify each unused database is truly empty or contains only stale data:

```bash
# Check each one
railway connect Postgres
# \dt to see tables, SELECT count(*) if tables exist

railway connect Postgres-7DGi
railway connect Postgres-LjWs
railway connect Postgres-ON3j
```

If any of them have a `stories` table with data, that was likely the original DB before migration. You do not need it if Postgres-9X5K has the same data.

### Step 3: Backup the Active Database

```bash
# Create a backup of the active DB first
railway connect Postgres-9X5K
# Then use pg_dump or Railway's backup features
```

### Step 4: Delete Unused Services

In the Railway dashboard (https://railway.com):

1. Go to **unfold-backend** project
2. Click on each unused Postgres service (Postgres, Postgres-7DGi, Postgres-LjWs, Postgres-ON3j)
3. Go to **Settings** tab
4. Scroll to **Delete Service**
5. Confirm deletion

Or via CLI:
```bash
# Railway CLI does not have a direct "delete service" command.
# Use the dashboard for service deletion.
```

### Step 5: Verify Backend Still Works

After deletion, verify the backend is still healthy:

```bash
curl https://unfold-backend-production.up.railway.app/
# Should return: {"status":"ok","db":"connected"}
```

---

## 7. Other Backend Health Observations

### Good Practices Found

- **Single DATABASE_URL pattern:** The backend only reads one `DATABASE_URL` env var. No code references multiple database connections. Clean architecture.
- **Connection pooling:** Configured with `max: 10` connections, idle timeout of 20s, connect timeout of 10s, and a 30s statement timeout. Reasonable for a mobile backend.
- **Graceful shutdown:** The backend properly closes the DB connection pool on SIGTERM/SIGINT.
- **DB-optional mode:** If `DATABASE_URL` is not set, the backend starts in degraded mode (DB features disabled). Good for local dev.
- **Rate limiting:** Comprehensive tiered rate limiting with per-endpoint cost groups, per-user + per-day limits, and a global AI circuit breaker.
- **Input validation:** Thorough validation on all endpoints including model allowlists, content length limits, message count limits, and role validation.
- **Security headers:** Manual security headers (X-Content-Type-Options, X-Frame-Options, HSTS, Referrer-Policy) without Helmet dependency.
- **Sentry integration:** Error tracking with sensitive header stripping and user attribution.
- **Prompt injection defense:** Server-side content sanitization with Unicode normalization, zero-width character stripping, and injection pattern detection.

### Potential Concerns

1. **Stale env vars on Railway:**
   - `FIREBASE_SERVICE_ACCOUNT_JSON` is still set as a Railway env var, but the backend migrated from Firebase Auth to Clerk (commit `a78c689`). This credential should be removed to reduce attack surface.
   - `CARTESIA_API_KEY` is set but Cartesia TTS was replaced by Fish Audio (commit `6c0cc2e`). This key should be revoked and removed.
   - `SMALLEST_AI_API_KEY` is set but Smallest.ai was replaced by Fish Audio. Same as above.

2. **No database backups configured:** Railway Postgres does not have automatic point-in-time recovery on the Hobby plan. If the active DB is lost, the stories data would need to be re-seeded from the TypeScript source files. The `ai_usage` data would be permanently lost. Consider enabling backups or exporting periodically.

3. **No `updated_at` auto-update trigger:** The `stories` table has an `updated_at` column that defaults to `now()` on insert, but there is no database trigger to auto-update it on modifications. The seed script manually sets `updatedAt: new Date()` in upserts, but any other writes would leave it stale. Since the table is currently read-only from the app, this is not an active issue.

4. **Missing `created_by` audit column:** The `ai_usage` table has `uid` which serves this purpose. The `stories` table lacks a `created_by` since all records come from the seed script.

5. **No migration for `ai_usage` table separately:** Both tables were created in the same initial migration (`0000_closed_excalibur.sql`). This is fine for now but indicates the schema was pushed in one shot using `drizzle-kit push` rather than incremental migrations. Future schema changes should use `drizzle-kit generate` to create proper migration files.

---

## 8. Summary of Action Items

| Priority | Action | Est. Savings |
|----------|--------|--------------|
| HIGH     | Delete 4 unused Postgres services | $10-24/month |
| MEDIUM   | Remove stale env vars (FIREBASE_SERVICE_ACCOUNT_JSON, CARTESIA_API_KEY, SMALLEST_AI_API_KEY) | Security hygiene |
| MEDIUM   | Revoke the API keys for Cartesia and Smallest.ai (if not used elsewhere) | Security hygiene |
| LOW      | Set up periodic DB backup (pg_dump cron or Railway backup add-on) | Disaster recovery |
| LOW      | Rename Postgres-9X5K to "Postgres" for clarity (after deleting duplicates) | Readability |

---

*This audit was generated by analyzing the codebase at `/Users/galangster/clawd/work/unfold/backend/` and querying the Railway CLI. No code changes were made.*
