# Build 19 — v1.0.0 (19)
**Date:** 2026-03-23

## New
- **God-focused completion messages** — Day Complete and Series Complete overlays now show 50+ messages glorifying God/Jesus instead of self-focused affirmations
- **Scripture verse numbers** — All scripture passages (devotional + cross references) now include superscript verse markers from local BSB database
- **Design system utilities** — Shared alpha(), renderIcon(), shadow/radius/animation tokens used across all 5 UI components
- **AI writing anti-patterns** — Added "most people" preamble ban and staccato command ban to persona/writing-craft

## Fixed
- **Day Complete overlay** — Fully opaque background, single-line title, white embers visible on all themes
- **Sentry crashes** — Fixed SHADOW_SM/Easing/Platform crashes from stale design system constants
- **App Groups build error** — Config plugin strips App Groups entitlement that provisioning profiles don't support
- **Reading screen** — Removed redundant Home button, left-aligned day indicator, rate limit (429) error detection
- **Highlight toolbar** — Repositioned below iOS native callout, click fallback for reliable color taps
- **Journal reflections** — Count now includes Go Deeper AI follow-up responses, checkmark when all done
- **Onboarding** — X close button for returning users, disabled swipe-back gesture
- **Day menu** — Left-aligned title and subtitle
- **Bible reader** — Note input bottom offset adjustment

## Improved
- **Design system refactor** — Card, Chip, Button, Input, Sheet all use shared tokens (Shadow, Radius, Duration, Ease)
- **Sheet backdrop** — Animated dim overlay on open/dismiss

## What to Test
- [ ] Open a devotional reading — verify scripture has verse numbers (superscript ¹ ² ³)
- [ ] Complete a day reading — verify Day Complete shows God-focused message, fully opaque background, white embers
- [ ] Complete a series — verify Series Complete shows God-focused message
- [ ] Tap scripture reference in devotional — verify verse sheet opens correctly
- [ ] Long-press devotional text to highlight — verify color picker toolbar appears below selection
- [ ] Journal tab — complete all reflections, verify checkmark appears
- [ ] Onboarding (if re-onboarding) — verify X close button appears, swipe-back disabled
- [ ] Day menu — verify title is left-aligned
- [ ] Check Sentry — verify no new SHADOW_SM/Easing/Platform crashes
