## Why
You asked to guarantee question 4 is truly AI-shaped from Haiku whenever possible and make debugging obvious when fallback is used.

## What this changes
- `generateAdaptiveQuestion()` now returns source metadata:
  - `source: 'backend' | 'fallback'`
  - `backendUrl` when backend succeeds
- All fallback return paths in adaptive generation now explicitly mark `source: 'fallback'`
- On onboarding adaptive steps, dev UI now shows:
  - `AI source: backend` or `AI source: fallback`
- Added richer adaptive logging in onboarding (`source`, `backendUrl`)

## UI tweak
- Kept the centered prep loader from prior fix; this PR focuses on source visibility for deterministic debugging.

## Result
You can now immediately verify whether Q4 came from backend AI or fallback on each run.
