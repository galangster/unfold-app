# Unfold app — agent instructions

`AGENTS.md` points here. The account-wide runtime efficiency contract loads
from `~/.claude/CLAUDE.md` and governs. This file adds the repository tier.

## Ground changes in current source

Read the applicable repository instructions, product and design records, and verification rules. Trace affected call sites and tests in the exact working tree before changing code. [REVIEW-SOP.md](REVIEW-SOP.md) owns the independent native-review workflow and supersedes older external-review, knowledge-base and score requirements in inherited instructions and dated handoffs. External review services are not part of Unfold's workflow.

Greptile is retired on every repository (Nick, 2026-10-22). Do not run, trigger, score or read it. Read local source instead.

Preserve these codebase-wide invariants when relevant:

- A devotional is not ready until generation state reconciles or delivers.
- A premium gate reads resolved entitlement, never presentation state alone.
- User writing survives edit, export, delete, undo, and synchronization.
- Audio playback and voice capture share one device audio session.

## Documentation is evidence

Verify documentation claims against the source revision under review. `SYSTEM-MAP.md` describes TestFlight build 218 and is historical context; current code and tests are authoritative.

## Verification

`QUALITY.md` owns the Change Verification Loop. Follow it before merge.

Run the named gates before you commit. Contract section 11 governs a push.

```bash
bun run typecheck && bun run lint --quiet && bun run test
```

Before you submit a build for App Review, run the release smoke in
`docs/RELEASE-SMOKE.md`.

Apple platform build, run, test, simulator, device, and log tasks use
FlowDeck. Do not call `xcodebuild`, `xcrun`, `simctl`, or `devicectl`.

## Pull requests

Follow [REVIEW-SOP.md](REVIEW-SOP.md) for two independent final-diff reviews, findings disposition and publication gates. The general PR presentation and feedback loop is documented in `~/.codex/doctrine/pr-feedback-loop.md`; Unfold's repository review policy governs reviewer selection. Keep required CI, human approvals, source-pinned verification and release permission separate.
