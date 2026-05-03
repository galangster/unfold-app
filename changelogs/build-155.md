Today tab redesign QA build.

What changed:
- Redesigned Today hero and devotional states for a calmer editorial hierarchy.
- Added Daily Rhythm, context cards, quick links, Saved Echo/Remember This, and Premium nudge polish.
- Added QA-only Today preview routes so states can be checked immediately without waiting for days.
- Added light-mode and accent preview support for Today QA.
- Added extra QA preview states for overdue, completed today, and tomorrow preview/locked behavior.

What to test:
1. Install this internal QA TestFlight build only. Do not use it for App Review or external beta distribution.
2. Open Today normally and confirm the bottom navigation is preserved and no card overlaps the tab bar.
3. Use the QA preview route to fast-forward Today states:
   - unfold://debug-seed-today?state=unread
   - unfold://debug-seed-today?state=overdue
   - unfold://debug-seed-today?state=complete-today
   - unfold://debug-seed-today?state=tomorrow-locked
   - unfold://debug-seed-today?state=reveal-ready
   - unfold://debug-seed-today?state=preparing
   - unfold://debug-seed-today?state=journey-complete
   - unfold://debug-seed-today?state=empty
   - unfold://debug-seed-today?state=day1-review
   - unfold://debug-seed-today?state=resume-reading
   - unfold://debug-seed-today?state=resume-journal
   - unfold://debug-seed-today?state=midday
   - unfold://debug-seed-today?state=evening
   - unfold://debug-seed-today?state=bridge
   - unfold://debug-seed-today?state=bridge-loading
   - unfold://debug-seed-today?state=remember-this
   - unfold://debug-seed-today?state=premium-nudge
4. Also test theme/accent variants, for example:
   - unfold://debug-seed-today?state=unread&theme=light&accent=ocean
   - unfold://debug-seed-today?state=tomorrow-locked&theme=dark&accent=gold
5. On premium-nudge, tap the CTA and confirm the Premium sheet opens before navigating to the paywall.
6. On remember-this, confirm the saved highlight card opens the related reading.
7. On resume-reading and resume-journal, confirm the cards navigate to the correct reading or journal destination.
8. After using QA routes, reset local app data before testing real onboarding or purchase flows.

Notes:
- This is a QA-gated TestFlight build with EXPO_PUBLIC_ENABLE_QA_TOOLS=1.
- Production/App Review build 154 remains separate and should not be replaced by this QA build.
