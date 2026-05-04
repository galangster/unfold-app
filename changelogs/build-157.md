Today animation polish internal TestFlight QA build.

What changed:
- Calmed Today-to-My-Library navigation by suppressing the extra first-entry content slide from the Today/home entry path.
- Kept My Library's later in-screen tab transitions, including Bookmarks, so tab changes still communicate state.
- Updated My Library to respect reduced motion for its empty-state icon animation.
- Moved My Devotionals segmented-control animation writes out of render-time effects to avoid the Reanimated shared-value warning pattern.
- Lightly adjusted Today section entrance timing so the screen feels calmer and less dashboard-like.

What to test:
1. Install this internal QA TestFlight build only. Do not use it for App Review or external beta distribution.
2. On Today, tap My Library. Confirm it no longer feels like a double sideways slide.
3. Return to Today, tap My Devotionals. Confirm it feels consistent with My Library.
4. Open My Library from Today with the Bookmarks path if available. Confirm it lands directly on the requested tab without a second tab-change animation.
5. Sniff the Today tab overall. It should feel calm, devotional, and less twitchy/dashboard-like.
6. Use existing Today QA preview routes only if needed, for example:
   - unfold://debug-seed-today?state=unread
   - unfold://debug-seed-today?state=complete-today
   - unfold://debug-seed-today?state=tomorrow-locked
7. After using QA routes, reset local app data before testing real onboarding, purchases, restore purchases, or App Review behavior.

Notes:
- This is a QA-gated TestFlight build with EXPO_PUBLIC_ENABLE_QA_TOOLS=1.
- QA tools are for internal validation only and should not be used as production entitlement proof.
- Production/App Review build 154 remains separate and should not be replaced by this QA build.
