# Build 266 (1.1.6) - Generation reliability

This build includes build 265 and the mobile generation assurance fixes.

## Changes

- Persist one request identity before initial generation starts. Reuse it after a lost response or app restart.
- Give each intentional new series a new request identity, including recommended studies.
- Preserve the server series identity and start date when recovering a completed initial request.
- Distinguish connection loss, service errors, locked days, and read-only series.
- Count local calendar days across daylight saving changes.
- Reconcile legacy series arcs per devotional, even when an older migration marker exists.

## Verification

- Start a new series, interrupt its response, and resume. Confirm the app recovers the same server request.
- Leave a failed generation through Go Home. Confirm Try Again resumes it.
- Start a recommended study after abandoning a failed series. Confirm it gets a new request identity.
- Check unavailable Day 3 states on Today and in Reading. Confirm the message matches the actual cause.
- Restore connectivity or server availability. Confirm Check Again discovers the existing day.
- Observe a pending day complete. Confirm the reader opens that day without creating another request.
- Confirm archived readings offer access to existing days and do not start generation.
- Confirm a legacy progressive series can recover its canonical arc after an earlier migration failed.

## Release dependency

Deploy the reviewed backend generation assurance changes before building this client for distribution.
Source, Fable reviews, local checks, and isolated FlowDeck proof are recorded under
operations/2026-09-08-generation-assurance in the Unfold operations workspace.
