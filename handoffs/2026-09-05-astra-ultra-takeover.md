# Unfold → Astra Ultra takeover
**Date:** 2026-09-05 ~1:05 PM PT  
**From:** Design Manager (facts verified via gh + local git; Claude Sentry session context folded in)  
**To:** Codex **gpt-6-astra** / reasoning **ultra** (Nick’s default `~/.codex/config.toml`)

## 1. Goal
Own Unfold end-to-end from here: **(A)** adversarial audit of recent merged fixes/PRs, **(B)** full mobile+backend(+web) infrastructure sweep that the app works as intended, **(C)** best-available **e2e** on critical paths. Produce a ranked PASS/FAIL report + next fixes. Do **not** merge anything unless Nick names the PR.

## 2. Repos / local trees
| Surface | GitHub | Local canonical |
|---|---|---|
| Mobile | `galangster/unfold-app` | `~/clawd/work/unfold/app/mobile` (`main`) |
| Backend | `galangster/unfold-backend` | `~/clawd/work/unfold/backend` (`main`) |
| Web | (unfold-web under clawd) | `~/clawd/work/unfold-web-launch-wt` (dirty KEEP) |

`gh` for these repos: `TOKEN=$(gh auth token -u galangster) && GH_TOKEN="$TOKEN" gh ...`  
Cursor CloudAgent **cannot** access `galangster/unfold-*` — stay on Mac Codex.

## 3. Recent PRs to audit (correctness)
### Mobile (`unfold-app`) — MERGED (priority)
| PR | What |
|---|---|
| **#63** | fix(ios): JS bundle again — builds 255–260 shipped no JS / crash on launch |
| **#62** | Jordan’s feedback: eight fixes integrated, gated, mutation-pinned (build 261) |
| **#61** | fix(loop): watch next day, honest reminder, timezone on push |
| **#57** | fix(onboarding): shock-stat numeral clipping |
| **#56** | Audit Phase 3: security, crash recovery, streak/theme/evening, notebook |
| **#55** | Audit Phase 2: interface sweep, WebView no-remount, anim perf, incremental sync |
| **#53** | Production audit: bugs, dead code, −8.1MB, web test env |
| **#52** | iOS launch readiness Expo SDK 57 |

### Backend (`unfold-backend`) — MERGED
| PR | What |
|---|---|
| **#18** | Jordan: arc token budget + truncation guard, failure push, key-people tests |
| **#17** | fix(loop): clamp pushed currentDay, one morning notification |
| **#15** | Audit Phase 3: RevenueCat, spend cap, rate limits, CI, correctness |
| **#14** | Audit Phase 2: core-loop, live companion streaming, hardening |
| **#13** | Launch readiness: series lifecycle + schema gates |

### OPEN / careful
| PR | Status |
|---|---|
| Backend **#19** `feat/sentry-hardening` | OPEN — Claude: **do not merge yet**. Mobile sibling `feat/sentry-hardening` @ `b2d20ca5` ahead of main, **no PR**; missing AppDelegate native `beforeSend`; pin test substring-only. |
| Mobile **#60** release/1.1.0 native version | OPEN draft |

### CLOSED — do **not** revive as “missing Jordan fixes”
| PR | Why closed |
|---|---|
| **#64** day-ends-empty | Stale pre-`integrate/jordan-eleven` tip; product intent landed via #62 squash |
| **#65** paywall mockup cutoff | Same — superseded by #62 / main |

## 4. In-flight Claude (do not collide if live)
- Session `b9bbfe89` under vault `projects/unfold`: Sentry mobile review + Railway **Grok model A/B**. Hit **Fable limit** ~1:00 PM PT. **Sentry is NOT done.**
- Scratchpads under `/private/tmp/claude-501/.../42858c05.../scratchpad/wt/sentry/{backend,mobile}` — leave alone unless Nick says Claude is stopped.
- Older Jordan handoff: `handoffs/2026-09-04-jordan-feedback-eleven-items.md` (partially obsolete post-#62/#63).

## 5. Dirty KEEP worktrees (do not discard)
| Tree | Branch | Note |
|---|---|---|
| `~/clawd/work/unfold-web-launch-wt` | `main` | Real privacy / Inner Weather + delete-all rewrite; **discard/regenerate `dist/` churn only** |
| `~/clawd/work/unfold-launch-readiness-wt` | `work/launch-readiness` | Uncommitted backend launch WIP (inner-weather, deletion, drizzle 0012/0013) |
| `~/clawd/work/unfold-mobile-launch-wt` | `work/mobile-launch-readiness` | Paired client WIP (InnerWeatherSheet, data-deletion, ASC, Pods) |

## 6. Mission checklist (Astra Ultra)
### A. Adversarial PR audit
For each priority merged PR above (esp **#62, #63, #18, #61**):
- Diff vs claimed intent; wrong root cause? missing tests? regression risk?
- Mutation pins / gates actually protect the bug?
- iOS bundle story (#63) still solid on current main?

### B. Infra / whole-app sweep
Config, CI, EAS, Railway, Sentry, RevenueCat, push/notifications, generation pipeline (Opus→Sonnet degrade, no silent Grok), series lifecycle, sync, onboarding, paywall, companion streaming, journal/reflect, Today loop.

### C. E2E (pick best available and run it)
iOS Simulator already has **Unfold.app** processes running (~since 8:16 AM). Prefer:
1. Existing project e2e (Detox/Maestro/Expo) if present — discover and run
2. Else scripted Simulator + API against the real backend Nick uses
3. Document method + results

**Critical paths:** cold launch → onboarding → Today complete day → reflect/journal → companion → paywall/restore → notify-when-ready → series boundary / next day.

## 7. Hard rules
- No merge unless Nick names the PR number
- No taste/copy inventing — bounce to Nick
- Don’t fight live Claude on Sentry trees while that session is hot
- Prefer **read-only audit first**, then fix PRs only for clear FAIL items
- Write the final report to `~/clawd/work/unfold/app/mobile/handoffs/2026-09-05-astra-ultra-audit-report.md`

## 8. Success criteria
1. PASS/FAIL table per audited PR with evidence  
2. Infra gap list ranked by severity  
3. E2E results for critical paths (or explicit blocker why not runnable)  
4. Top recommended fixes (with branch/PR plan) — **unmerged**

## 9. Suggested first commands
```bash
cd ~/clawd/work/unfold/app/mobile && git fetch && git status -sb && git log -5 --oneline
TOKEN=$(gh auth token -u galangster) && GH_TOKEN="$TOKEN" gh pr view 62 --repo galangster/unfold-app
TOKEN=$(gh auth token -u galangster) && GH_TOKEN="$TOKEN" gh pr view 63 --repo galangster/unfold-app
TOKEN=$(gh auth token -u galangster) && GH_TOKEN="$TOKEN" gh pr view 18 --repo galangster/unfold-backend
TOKEN=$(gh auth token -u galangster) && GH_TOKEN="$TOKEN" gh pr view 19 --repo galangster/unfold-backend
```

## 10. After audit — sync with Claude (required)
When the audit report is written, ALSO write:
`~/clawd/work/unfold/app/mobile/handoffs/2026-09-05-astra-claude-work-split.md`

Contents:
1. Summary of audit FAIL/WARN items Claude already owns or started (esp Sentry #19 / mobile feat/sentry-hardening, Railway Grok model A/B, backend branch `fix/grok-model-id-and-onboarding-truncation` dirty on the canonical backend checkout)
2. Proposed **Claude owns** list (continuity / in-flight)
3. Proposed **Astra owns** list (new fixes, infra holes, e2e follow-ups)
4. Shared / needs Nick list
5. Concrete first messages: paste-ready brief for Claude session `b9bbfe89` (or fresh Unfold Claude)

Do not message Claude yourself via desktop unless tools allow; Design Manager will deliver the split to Claude. Prefer not to fight Claude’s dirty trees — propose handoffs instead of overwriting.
