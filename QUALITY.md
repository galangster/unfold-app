# QUALITY.md — Change Verification Loop (CVL)

This repo uses CVL for autonomous verification before merge.

## Rules

For every code patch:
1. Run `bun run verify:changed`
2. If releasing or merging critical flows, run `bun run verify:release` and complete `docs/RELEASE-SMOKE.md`
3. Attach output to PR notes
4. Do not merge if required checks fail (unless explicitly waived)

## Commands

- `bun run health:adaptive`  
  Checks adaptive-question backend is healthy and returns parseable question output.

- `bun run verify:changed`  
  Diff-aware check. If adaptive flow files are touched, runs adaptive healthcheck.

- `bun run verify:smoke`  
  Critical-path smoke validation (adaptive backend + live device flow audit).

- `bun run verify:device`  
  Local live device flow audit via agent-device (launch + snapshot + appstate).

- `bun run verify:release`  
  Checks profile safety and the simulator release-proof record. It does not run
  `verify:changed`, `verify:smoke`, or generation. It exits with incomplete
  release status even when the simulator artifact matches. Complete the
  separate native smoke, signed-artifact, source-provenance, and release gates.

## Notes

- `verify:device` runs by default in local smoke checks.
- In CI, device audit auto-skips (no simulator/device attached).
- Override app bundle id with `CVL_IOS_APP_BUNDLE=<bundleId>` when needed.
- Use the previous shipped source as `BASE_REF` for a release comparison.
  Comparing a candidate only to current main omits fixes merged since shipping.
- `health:adaptive`, an adaptive `verify:changed` run, and `verify:smoke` make
  generation POSTs. Obtain explicit approval for production writes and spend
  before running them against production. Native app launch also registers a
  device. Local unit tests do not establish that these live checks passed.

## Why this exists

Onboarding Q4 quality is critical. We need deterministic signal that adaptive question generation is alive and parseable, without manual back-and-forth.
