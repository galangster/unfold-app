# Build 64 — Clerk Removed, Anonymous-First Auth

## Changed
- **Auth system fully switched to X-Device-ID.** Clerk is gone entirely. Every user is now anonymous from first launch — no sign-in, no sign-up, no email gate. Device identity is a UUID stored in MMKV and sent as `X-Device-ID` on every backend request.
- **-5,306 lines removed** from the mobile repo: `@clerk/clerk-expo`, sign-in screen, `useAuth`, `sync-service`, `DeleteAccountSheet`, `src/lib/clerk.ts`, Clerk-era middleware, stale 401 retry paths, and the orphaned `(onboarding)/sign-in.tsx` route.
- RevenueCat continues to work via App Store receipts (anonymous flow unchanged). Entitlements and premium detection are unaffected.

## Fixed (dead-coupling sweep post-Clerk)
- `generation-migration.ts` no longer silently returns when the Authorization header is missing (previously would have lost progressive-generation data on first launch after upgrade)
- `tts-service.ts`: removed `TTS_AUTH_REQUIRED` throw and the prefetch Authorization gate
- `devotional-service.ts`: removed dead 401 retry-with-forceRefresh path
- `revenuecatClient.ts`: deleted unused `setUserId()` export
- `api-config.ts`: dropped the `_forceRefresh` parameter from `getAuthHeaders()`
- Jest transform patterns + test mocks updated to use `X-Device-ID: test-device` instead of bearer tokens
- CVL Verify CI workflow: `fetch-depth: 0` so `baseRef...HEAD` resolves in PR checks

## Backend
- Backend PR #3 merged in parallel: `@clerk/express` removed, `authMiddleware` is X-Device-ID-only, admin gate renamed to `ADMIN_DEVICE_IDS`, Sentry no longer leaks the device identifier (no `setUser`, no `setExtra("uid")`, `event.user` and `x-device-id` header scrubbed in `beforeSend`), `package-lock.json` deleted, Dockerfile now installs deps with bun and runs on node:20-slim.
- Railway deployed cleanly. `/api/stories` with a valid `X-Device-ID` → 200. Without header → 401. Dead Clerk env vars deleted from Railway.

## What to Test
- [ ] **Fresh install on a new device** — launch, onboarding, devotional generation, reading, journal. Expect zero auth prompts anywhere.
- [ ] **Upgrade from build 63** — existing users should land directly on home without losing their library, highlights, journal entries, or premium entitlement.
- [ ] **Progressive generation on upgraded install** — confirm `generation-migration.ts` actually runs and upgrades local in-flight generation state (this was the critical pre-fix landmine).
- [ ] **TTS playback** on a devotional — no "auth required" error, audio plays through, prefetch works on the next day.
- [ ] **Offline → online transitions** — open app offline, reach home, come back online, verify sync pushes/pulls still work against the new X-Device-ID backend.
- [ ] **RevenueCat entitlement** — active subscriber sees premium content, expired trial sees blocking paywall (unchanged from build 63 but verify nothing regressed in the RC → anonymous auth interplay).
- [ ] **Force-quit + relaunch** — device ID persists, no re-onboarding.
- [ ] **Delete app + reinstall** — new device ID generated, fresh onboarding, no orphan data.
- [ ] **Sentry dashboard** — confirm new events don't include `user.id` or `x-device-id` header (PII scrub check).
- [ ] **Push notifications** — generation-complete notification still fires on a fresh generation.
- [ ] **Companion chat** — send a message, confirm 20-msgs-per-minute rate limit still works by identity, not by Clerk session.
