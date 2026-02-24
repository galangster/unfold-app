# QUALITY.md — Change Verification Loop (CVL)

This repo uses CVL for autonomous verification before merge.

## Rules

For every code patch:
1. Run `bun run verify:changed`
2. If releasing or merging critical flows, run `bun run verify:release`
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
  Runs changed + smoke checks.

## Notes

- `verify:device` runs by default in local smoke checks.
- In CI, device audit auto-skips (no simulator/device attached).
- Override app bundle id with `CVL_IOS_APP_BUNDLE=<bundleId>` when needed.

## Why this exists

Onboarding Q4 quality is critical. We need deterministic signal that adaptive question generation is alive and parseable, without manual back-and-forth.
