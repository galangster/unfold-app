QA Premium Override internal TestFlight build.

What changed:
- Added a QA-only premium override deep link for internal TestFlight testing.
- The override is session-local, requires QA tools, and is not a RevenueCat or App Store entitlement.
- RevenueCat sync remains the source of the persisted premium mirror; the QA override unlocks UI through the premium policy only.
- Kept Today tab QA states from build 155, including overdue, completed today, tomorrow locked, light mode, alternate accents, and premium nudge previews.

What to test:
1. Install this internal QA TestFlight build only. Do not use it for App Review or external beta distribution.
2. Grant local QA Premium for this app session:
   - unfold://debug-premium?mode=grant
3. Confirm premium-only UI is unlocked for testing:
   - Today premium context cards can appear when using premium states.
   - Premium nudge sheet still opens correctly.
   - Premium settings such as accent themes, reading fonts, and check-in schedule controls behave as premium.
4. Use Today QA preview routes as needed:
   - unfold://debug-seed-today?state=unread
   - unfold://debug-seed-today?state=overdue
   - unfold://debug-seed-today?state=complete-today
   - unfold://debug-seed-today?state=tomorrow-locked
   - unfold://debug-seed-today?state=reveal-ready
   - unfold://debug-seed-today?state=resume-reading
   - unfold://debug-seed-today?state=resume-journal
   - unfold://debug-seed-today?state=midday
   - unfold://debug-seed-today?state=evening
   - unfold://debug-seed-today?state=bridge
   - unfold://debug-seed-today?state=bridge-loading
   - unfold://debug-seed-today?state=remember-this
   - unfold://debug-seed-today?state=premium-nudge
5. Test a light/accent variant:
   - unfold://debug-seed-today?state=unread&theme=light&accent=ocean
6. Clear local QA Premium if needed:
   - unfold://debug-premium?mode=clear
7. After using QA routes, reset local app data before testing real onboarding, purchases, restore purchases, or App Review behavior.

Notes:
- This is a QA-gated TestFlight build with EXPO_PUBLIC_ENABLE_QA_TOOLS=1.
- The QA Premium override is only for UI QA. It does not create a real purchase, receipt, or RevenueCat entitlement.
- Production/App Review build 154 remains separate and should not be replaced by this QA build.
