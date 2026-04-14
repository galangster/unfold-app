# Build 76 — Three critical fixes: re-edit data loss, scripture insert, restore hang

## Fixed

- **Re-edit no longer wipes your note (data loss)** — Typing a note, tapping Done, and then tapping Edit again was blanking out everything you'd just written. The editor's WebView was remounting with stale baked-in content. It now hydrates with your latest persisted text on every re-entry, so round-tripping through Done → Edit is lossless.
- **Scripture insertion is reliable again** — The "Scripture insert failed — could not add the scripture to your note" alert was firing because the insert was being gated on a stale editor-ready flag that lied across WebView remounts. The gate now uses the live 300ms boot tick, and the injected JS has defensive guards plus a unified ACK path for both success and error.
- **Restore Purchases can't hang forever** — The Restore button used to just spin indefinitely if RevenueCat's native call deadlocked. There's now a 30s timeout on restore and a 60s timeout on purchase, with a clear "took too long — check your connection and try again" error. Purchases also show the timeout branch if the server-side entitlement grant stalls.

## Known issue

- **Yearly subscription still fails** — This is a dashboard-side RevenueCat config issue (the `$rc_annual` product isn't linked to the "Unfold Premium" entitlement), not a code bug. Monthly subscriptions work normally. Fix coming outside of a build.

## What to Test

- [ ] Open an existing note → type new content → tap **Done** → verify content shows in read mode
- [ ] Tap **Edit** again → verify all your content is still there (this is the data-loss regression — must pass)
- [ ] Repeat the Done → Edit cycle 2-3 times on the same note → no content should vanish
- [ ] Open a note → from edit mode, tap the scripture search button → pick a verse → verify the scripture callout appears in the note (no "Scripture insert failed" alert)
- [ ] Insert 2-3 scriptures in a row → all should land
- [ ] Tap the scripture button, cancel the sheet without picking → editor stays responsive
- [ ] On the paywall, tap **Restore Purchases** → either succeeds (if you have a sub) or fails with "No active subscription found" within ~30s — does NOT hang indefinitely
- [ ] Try purchasing the **monthly** plan → should complete normally and unlock premium
- [ ] (Optional) Try purchasing the **yearly** plan → known broken, expected to fail; should surface a clear error rather than hanging

## Carried from Build 75

Notebook native read mode, ACK scripture, unified save, virtualized notebook list, and spring-driven sheet animations still apply. If you were testing any of those, keep testing them.
