# Build 62 — Single Devotional Redesign + Adaptive Onboarding

## New
- **Single devotional model** — one active series at a time, no more carousel. Clean, focused home card.
- **Quotable line recall** — after reading, the home card shows the day's memorable takeaway with accent pill + check mark
- **"Return to Reading"** button on completed card with "Your next reading will be ready tomorrow" note
- **Returning user empty state** — warm card with embers and "Start a New Study" CTA (vs first-time brand intro)
- **New series confirmation** — alert warns before replacing an active series ("Starting a new series will end your current one")
- **Swipe-to-delete on My Studies** — swipe left to reveal trash icon, tap to confirm (matches journal pattern)
- **Enhanced preparing state** — shimmer text, pulsing glow, ember particles, and progress bar synced to generation status
- **Adaptive Q1 pills** — onboarding emotion pills now match your selected theme (Trust gets trust pills, Grief gets grief pills)
- **Adaptive Q2 generation** — AI generates personalized Q2 question + pills based on your Q1 answer
- **Character study redesign** — "Who would you like to study?" with OT/NT sections, 2-column grid, 21 characters (8 OT + 13 NT)
- **Q1 question reframe** — "When you think about [theme], where do you find yourself?" aligns better with pill options

## Fixed
- Overnight devotional generation blocked by same-day guard (backend cron fix)
- TypeScript errors in disabled TTS endpoint blocking Railway GitHub deploys
- Swipeable crash on Fabric in My Devotionals
- Stale quote-directive test referencing moved server-side code
- Q1-to-Q2 adaptive generation state timing bug (chips selected but not sent to AI)

## Improved
- State machine simplified from 7 states to 6 (merged in-progress into unread)
- My Library search bar added
- Bento grid consolidated from 3 boxes to 2
- Dot spacing tightened below card

## Infrastructure
- Railway: GitHub auto-deploy connected (galangster/unfold-backend on main)
- Railway: Health check endpoint configured (/)
- Railway: Region migrated EU West → US West (California)
- Railway: Postgres upgraded to 18.3
- Railway: MCP server installed for Claude Code

## What to Test
- [ ] Open app → see single devotional card (no carousel, no dots)
- [ ] Read a day → return to home → see quotable line + accent pill with check + "Return to Reading"
- [ ] Tap "Return to Reading" → goes back into the reading
- [ ] Tap "New Series" while series active → see confirmation alert → Cancel does nothing → Continue archives and opens onboarding
- [ ] Go to My Studies → swipe left on a study → red trash icon → tap → confirm delete
- [ ] Delete all studies → home shows returning empty state (embers + "Start a New Study")
- [ ] Start new onboarding with theme → Q1 shows theme-specific pills
- [ ] Answer Q1 → Q2 should show AI-generated question + pills (not static defaults)
- [ ] Pick "Character Study" → see "Who would you like to study?" with OT/NT sections in 2-column grid
- [ ] Overnight generation: tomorrow morning, check if next day was auto-generated
