# Build 40 — v1.0.0 (40)
**Date:** 2026-04-02

## New
- All API traffic now routes through Cloudflare WAF (api.unfoldapp.co)
- Custom User-Agent header for WAF allowlisting
- Recommended series cards on empty state + journey-complete screens
- Personalized push notifications based on reading state
- Reveal teaser card on home screen when devotional is ready
- Glassmorphism on home screen cards (devotional, streak, bento)
- Profile screen merged with Settings
- Onboarding redesign foundation (Screens 1-2, Currents animation system, Trinity Icon companion)

## Fixed
- Google auth freeze — dismiss modal before navigating after OAuth
- Infinite render loop from .find() inside Zustand selector
- Devotional card shows wrong day label when catching up on missed readings
- Sync crash when records have no id
- Reading screen resume context cleanup
- Home screen flash on reveal → reading transition
- Companion chat uses correct endpoint with system prompt
- Reading header layout + home screen spacing consistency

## Improved
- Cross-reference and quote font sizes larger for readability
- Bible translation defaults to BSB (removed picker)
- Companion hamburger menu moved to left of title
- Removed active tab dot indicator, accent bar, FadeInDown animation

## What to Test
- [ ] **Devotional generation**: Create a new devotional — verify it generates and renders correctly (this was broken before, testing the fix)
- [ ] **TTS audio**: Play audio on a devotional — verify it works through Cloudflare (api.unfoldapp.co)
- [ ] **Google sign-in**: Sign in with Google — should not freeze
- [ ] **Reading flow**: Open a devotional, read through, check reflection questions render properly
- [ ] **Home screen**: Verify glassmorphism cards, streak display, reveal teaser card if applicable
- [ ] **Companion chat**: Send a message — verify response comes back
- [ ] **Push notifications**: Check if notification arrives for devotional ready state
