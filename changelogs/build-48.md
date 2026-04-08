# Build 48 — 2026-04-07

## New
- **Server-side generation active** — backend worker now processes generation jobs (was disabled). Day-ahead generation via cron now works.
- **Memory-aware companion starter chips** — returning users see contextual conversation starters based on their journey
- **Dynamic prompt examples** — generation quality self-improves by sending bad/good contrast examples
- **Companion deep links** — tappable DevotionalCards inline in companion responses for quick navigation
- **Companion server-side memory** — journey summary, tool-use (search_journey, get_devotional_day), pre-fetch for faster responses

## Fixed
- **P0: Render loop crash** — "Maximum update depth exceeded" caused by competing premium sync. Removed redundant useEffect, added equality guard to updateUser.
- **P1: Journal reflections navigation** — tapping a reflection card now goes to the journal entry, not the devotional reading screen
- **P1: Day generation stuck** — backend cron no longer treats failed jobs as blocking. Permanently failed jobs are retried.
- **P2: Reflection text box alignment** — text input now matches question text width (was indented)
- **P2: Commentary text truncation** — bumped max_tokens 256→400, added complete sentence instruction
- **Companion drawer scrim** — was blocking all touches when closed
- **Companion message rendering** — paragraph breaks preserved, bold headers render correctly, blockquote detection fixed
- **Scripture reference count** — aligned to 60 (was 80)
- **Deep link security** — params use dayNumber not day
- **DevotionalCard accent color** — uses theme accent instead of hardcoded primary

## Improved
- **Onboarding redesign** — shock stat screen (93%/11% gap), growth graph, confront-the-problem block, multi-select pills, mirror-back redesign (Haiku, 750 tokens), particle animations
- **Guest mode** — sign-in removed from onboarding gate, device ID auth
- **Bible reader chapter swipe** — drag-following page navigation with edge indicators
- **Companion scroll** — replaced FAB with inline banner, no gesture conflicts

## What to Test
- [ ] Open app → verify no render error crash
- [ ] Home screen → Day 2 should generate (push notification when ready)
- [ ] Journal tab → Reflections → tap a reflection card → should go to journal entry, NOT devotional
- [ ] Reading screen → reflection questions → text box should be full width (not indented)
- [ ] Companion → send messages → verify deep link cards render and are tappable
- [ ] Companion → verify starter chips appear for returning users
- [ ] Settings → Account → verify premium status shows correctly
- [ ] Bible reader → swipe between chapters → check drag-following and edge arrows
