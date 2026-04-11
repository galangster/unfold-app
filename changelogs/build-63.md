# Build 63 — Paywall Overhaul, Onboarding Polish, Library Consolidation

## New
- **ThreeStepPaywall onboarding flow** — video placeholder, Lottie bell, real pricing, social proof carousel, stack card carousel with rubber-band drag
- **Trial-expired blocking paywall** — no free tier past trial, ambient embers + gradient across all 3 screens
- **Trial-ending local notification** — fires 2 days before trial expiry
- **Celebration + commitment onboarding steps** — celebration screen with embers, commitment flow, merged review prompt into celebration
- **Ripple reveal transition** — loader during reveal → reading handoff
- **Bible note-only entries** — save a note without highlighting, read-first note viewer sheet
- **Library consolidation** — Bible saved verses now live in the unified "My Library" hub with Journal / Highlights / Bookmarks tabs and All / Devotional / Bible source filter chips
- **Inline profile name editing** — tap display name on profile tab to edit in place
- **Journal folder pre-assign** — new notes automatically inherit the currently-filtered folder
- **Dev tools suite** — in-app debug menu for previewing visual states (reveal, paywall, celebration, etc.)

## Fixed
- Highlight persistence across rehydrates, dedupe on insert, unhighlight removes all matching entries
- Bible reader: rangy CDN override, drop cap, body fade, constrained swipe with bare arrows
- Bible reader: note sheet fully opaque background, search input caret alignment
- Bible reader: saved-verses entry moved into Reading Settings (was a dead bookmark icon)
- Reading screen: `?devotionalId=` deep links now open the correct devotional (was ignored)
- Reading screen: viewingDay init race when deep-linking a devotional without dayNumber (Codex-flagged)
- Bookmark toast "View" now lands on Bookmarks tab instead of legacy Saved screen (Codex-flagged)
- Journal: SOAP save, reflection counter, Go Deeper state, word-break splitting normal words mid-letter
- Journal: navigation from reading screen routes to Journal tab correctly
- Light mode: theme-aware colors across 8 components, paywall, reading
- Onboarding: shock stat particles timing, growth graph dot synced with curve, pencil tip alignment
- Onboarding: vulnerability validation stars flow, companion card staggered entrance, mirror-back → feature transition
- Onboarding: config screens removed (themeType through reminderTime collapsed)
- Onboarding: generation trigger moved to aspiration step, review prompt merged into celebration
- Evening celebration: always renders dark night-sky variant
- Delete account: white warning icon on solid red circle
- `(you)` profile tab added to `FREE_TABS` so users can manage subscription
- Cross-tab back navigation from journal and bible reader
- Reanimated bell animation: Pre-comp 1 and Mask keypaths for color override
- Companion spacing + `dynamicPromptExamples` wiring
- Evening celebration, streak-settings routing through root stack

## Improved
- Paywall: glowing gold CTA, big headline, ambient embers, wider laurel, authentic testimonial tone
- Paywall: real SVG laurel wreath, bidirectional card swipe, tilt rotation, dot spacing
- Mirror-back copy: "Written for you." → "We heard you."
- Shock stat: slower animations, background fade-in, extra pause before 11%
- Growth graph: traveling pulsing dot along curve, correct bezier x-position
- "first adaptive Bible app in the world" framing
- Skip cutscene + feature carousel on welcome, go direct to onboarding
- Dev: debug-light-mode gallery tweaks, reveal preview button (dev only)
- Feature cards: "Written for you" → "Made for no one else" to avoid mirror-back duplicate
- Chore: delete dead `(you)/settings.tsx`, gitignore `.flowdeck` session artifacts

## What to Test
- [ ] New user onboarding end-to-end → ThreeStepPaywall → trial start → devotional generation
- [ ] Trial-expired blocking paywall: force trial expiry, confirm no free path
- [ ] Trial-ending notification fires 2 days before expiry
- [ ] Bible reader → Reading Settings → "Saved verses (N)" row → lands on My Library Bible filter
- [ ] Tap a Bible highlight in the library → navigates back to Bible reader at correct verse
- [ ] Tap a devotional highlight → navigates back to reading at correct day
- [ ] Save a bookmark from reading → tap "View" in toast → lands on Bookmarks tab (not Highlights)
- [ ] My Library filter chips: All / Devotional / Bible with correct counts, correct empty-state copy
- [ ] Legacy `unfold://(tabs)/(you)/saved` redirect still lands on Highlights
- [ ] Journal: create a note while filtered by a folder → confirm folder is pre-assigned
- [ ] Journal: SOAP save persists, reflection counter correct, Go Deeper state preserved
- [ ] Profile: tap display name → inline edit → save → confirm persists
- [ ] Highlights: rehydrate app → highlights still there, no duplicates
- [ ] Bible: save a note without highlighting → read-first viewer sheet opens it
- [ ] Reveal transition: ripple loader during handoff to reading
- [ ] Light mode: toggle and verify colors across paywall, reading, journal, profile
- [ ] Cross-tab back: enter library from Bible, back goes to Bible (not previous tab stack)
