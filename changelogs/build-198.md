# Build 198

## What changed

- Cleaned up typography semantics so journal, Today, library, onboarding, and devotional metadata labels no longer use the legacy mono alias as a generic style.
- Kept the technical/status mono alias only for timer, progress, and error-detail text.
- Removed unused JetBrains Mono font loading from the app bootstrap.

## Test plan

- `npm run typecheck`
- `npm test -- --runInBand`
- `npm run lint` — passed with existing warnings and no errors
- `git diff --check`
