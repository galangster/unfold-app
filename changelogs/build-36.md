# Build 36 — TestFlight Changelog

## New
- **Premium gating enforcement**: Free-tier limits now enforced — companion chat (5 messages/day), highlight colors (yellow-only free), accent themes (gold-only free), devotional length (7-day cap), reading duration (15-min cap)
- **Premium upsell sheets**: Context-aware premium sheets for each gated feature with draggable dismiss gesture
- **Onboarding paywall**: Premium showcase now shown to ALL users during onboarding (no longer skipped on first run)
- **Onboarding reorder**: Companion naming moved earlier (right after name), AI consent moved before exploration questions

## Fixed
- **Companion history empty**: Defensive guards prevent crash when conversation messages/topicTags are undefined
- **Companion memory crash**: Safe array access for topics, verses, prayer requests throughout memory system
- **Sync service pull crash**: Array guards during conversation/message merge from server
- **Journal text overflow**: ScrollView re-scrolls to keep cursor visible as multiline journal text grows
- **Sheet drag handles**: All 10 bottom sheets now have consistent 36×4px handles that are actually draggable

## Improved
- **PremiumFeatureSheet**: Full gesture support — drag down to dismiss, rubber-band on drag up, tap-outside-to-dismiss
- **Prompt engineering**: XML-structured persona, few-shot examples, validation chain, Grok mood check-in improvements
- **Server-side generation**: Migration to backend generation pipeline
- **Cloud sync foundation**: SyncService with push/pull, UUID generation, store migrations for sync fields
- **Guest mode removed**: Sign-in now required (cleaner auth flow)
- **Welcome screen polish**: Bigger subtitle, stronger embers + glow, bidirectional particles

## What to Test
- [ ] Open companion chat as free user — send 5 messages, verify limit banner appears and 6th message blocked with premium sheet
- [ ] In Bible reader, try selecting non-yellow highlight colors — should show lock icon + premium sheet
- [ ] In Settings > Accent Theme, verify non-gold themes show lock icon and trigger premium sheet
- [ ] Go through full onboarding — verify paywall screen appears (after founder note, before generation)
- [ ] Verify companion naming screen appears early in onboarding (right after name)
- [ ] Check conversation history in companion — archived conversations should load correctly
- [ ] Write a long journal response — text input should auto-scroll to keep cursor visible
- [ ] Drag down on any premium upsell sheet — should dismiss smoothly
- [ ] Tap "Maybe later" on premium sheets — should dismiss and not block
- [ ] Start a devotional in onboarding — verify 14-day and 30-min options show "Premium" lock badge
