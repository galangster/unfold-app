# Series Lifecycle Convergence

**Date:** 2026-07-31
**Status:** Proposed — needs a decision before more lifecycle code is written
**Blocks:** `work/series-lifecycle` (mobile + backend), currently BLOCKED by adversarial review

## Problem

`archivedAt` is the field that decides which series a user is on. Three parties write to a
devotional row — this device, another device, and the server cron — and they must converge on it.
The sync layer cannot currently express that.

The generic sync path is **last-write-wins on the row's `updatedAt`**, and a losing push is
**dropped, not retried**:

> `sync-outbox.ts:14` — "Server is authoritative on rejected/conflict — those are dropped, not
> retried forever."

That is correct for *content*. A conflict means the server holds newer content and retrying would
fight it. It is wrong for *intent*. "I ended this series" is a user decision, not a value to be
merged, and the cron bumps `updatedAt` on its own schedule for reasons that have nothing to do
with lifecycle.

### What went wrong when we ignored that

1. Archive pushed while the cron had just written → server wins LWW → **archive silently lost**.
   The app shows the series ended; the server keeps generating for it.
2. Compensated with an **archive-latch** in `sync.ts` (apply `archivedAt` when the server's is
   NULL, ignoring LWW) and a matching one-way latch in `devotional-sync-metadata.ts`.
3. Those latches make `archivedAt` **one-way in three places**. Resume (`archivedAt → null`) is now
   re-archived by the next stale pull. The cure is worse than the disease.

The bug list from three review rounds is a symptom. The defect is that lifecycle intent is riding
on a transport built for content.

## Options

### A — Retry conflicted lifecycle changes in the outbox
Mark changes `mustDeliver`, re-enqueue on conflict with a bumped `clientUpdatedAt` so they win the
next comparison.

- Reuses the existing queue; no schema change.
- But bumping the timestamp to "now" means *this device always wins*, which loses a genuinely newer
  intent from another device. Needs a retry cap, and the cap reintroduces silent loss.
- Still couples lifecycle to the row's content clock.

### B — Give lifecycle its own clock ✅ RECOMMENDED
Add `archived_state_at TIMESTAMPTZ` alongside `archived_at`. Every archive/resume stamps it. The
push handler compares **incoming `archivedStateAt` against stored `archivedStateAt`** — not against
the row's `updatedAt`.

- Plain LWW, correct in both directions. Newest *intent* wins, whoever made it.
- Cron content writes cannot interfere: they never touch `archived_state_at`.
- **Deletes both latches** and the special case in the push handler.
- Two devices converge deterministically without a retry loop.
- Cost: one nullable column, one comparison branch, one client field.

### C — Dedicated intent endpoints
`POST /api/series/:id/archive` and `/resume`, idempotent, outside sync entirely.

- Cleanest semantics: lifecycle is an operation, not a synced field.
- But it needs its own offline queue, and we already have one. More moving parts for the same
  convergence guarantee B gives.
- Worth revisiting if lifecycle grows beyond archive/resume.

## Recommendation: B

It is the smallest change that removes the whole class rather than the current instance, and it is
the only option that lets us **delete** code (both latches) instead of adding more.

### Sketch

```ts
// schema
archivedAt:      timestamp("archived_at",       { withTimezone: true }),
archivedStateAt: timestamp("archived_state_at", { withTimezone: true }),
```

```ts
// backend/src/routes/sync.ts — replace the archive-latch entirely
if (table === "devotionals" && "archivedAt" in safeData) {
  const incoming = safeData.archivedStateAt as Date | undefined;
  const stored   = serverRecord.archivedStateAt as Date | null;
  // Newest INTENT wins, independent of content LWW. A cron write to updatedAt
  // cannot suppress it, and a stale device cannot resurrect an old decision.
  if (incoming && (!stored || incoming > stored)) {
    await db.update(drizzleTable)
      .set({ archivedAt: safeData.archivedAt, archivedStateAt: incoming, updatedAt: now })
      .where(...);
  }
}
```

```ts
// client — archiveCurrentDevotional / resumeDevotional / addDevotional
enqueuePersonalDataSyncChange('devotionals', id,
  { schemaVersion: 1, archivedAt: value, archivedStateAt: now }, now);
```

Then delete: the `sync.ts` archive-latch, and the one-way `archivedAt` branch in
`devotional-sync-metadata.ts` (it becomes a normal field carried by the patch).

### Also required, independent of the option chosen

- **Resume must be usable immediately.** `resumeDevotional` only enqueues; the banner should drain
  the outbox (or optimistically allow local generation) so opening a day right after resuming does
  not hit a still-archived server row.
- **Onboarding previews must not be active series.** `worker.ts:370` persists them as unarchived
  `progressive` rows, and `addDevotional` makes the preview `currentDevotionalId`. Either persist
  previews as archived, or exclude the stable `onboarding-sample-*` id from `pickActiveSeries`.
- **`findActiveProgressiveSeries` must filter before limiting** (`jobs.ts`), the way the cron does.
  Ten newer ended rows currently push the real active series out of the window.

## Open question for the decision-maker

Does a series need to be resumable at all, or is "start a new series" genuinely one-way? If
one-way is acceptable product behaviour, the resume path disappears, the latches become correct,
and this whole design is unnecessary — option B only earns its keep if resume is a real feature.
