# Unfold App Development Log

## 2026-02-17

### Audio Player Improvements
- Migrated from `expo-av` to `expo-audio` for SDK 55 compatibility
- Simplified layout to horizontal (progress bar left, play button right) with blurred background
- **Premium UX fix:** Non-premium users tapping play now see toast ("Audio playback is a premium feature. Upgrade to listen.") instead of opening player
- Audio player component blocked from rendering for non-premium users

### Streak Box UI
- New 7-day mini calendar with gold-filled circles for completed days
- Removed old "You spent X min with God" box
- Removed distracting glow effects and animated flame icon
- Day-filling logic now based on actual streak count

### Settings & Paywall Fixes
- "Reading Voice" setting moved into Premium section
- Subscribe button fixed: gold pill background with white text (was invisible white-on-white in light mode)

### Additional Polish
- Added lock icon to "Open Journal" button for non-premium users
- "Start your first entry" CTA in Journal empty state
- Share button now visible on both unread and completed days
- Complete Day button toggle state (gold → white/gold inverse when completed)

---
*This log tracks significant Unfold app development work. For full history, see git commits.*
