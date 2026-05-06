Internal QA TestFlight build for Today navigation and notification notebook QA.

Focus areas:
- Today bento cards for My Library and My Devotionals now stay inside the Today navigation stack, so iOS swipe-back should preview and return to Today instead of stale You-tab history.
- Reading bookmark navigation now opens the Today-stack My Library path.
- My Devotionals opened from Today now keeps series detail in the Today stack, then back returns to My Devotionals naturally.
- Generated devotional reveal/reading handoff includes the previous local recovery fix for server-created devotionals.
- Notification tap QA now grants session-local QA Premium for notebook testing without persisting user.isPremium or changing RevenueCat entitlement truth.

What to test:
1. Install this internal QA TestFlight build only. Do not use it for App Review, external beta distribution, purchase proof, or production entitlement proof.
2. From Today, tap My Library, then use iOS swipe-back. It should preview and return to Today, not My Devotionals.
3. From Today, tap My Devotionals, then use iOS swipe-back. It should preview and return to Today.
4. From Today, tap My Devotionals, open a devotional/series detail, then back/swipe. It should return to My Devotionals first, then Today.
5. From Reading, use the bookmark/library toast path and confirm My Library opens in the expected Today/Reading context.
6. Open unfold://debug-seed-notification-tap, wait for the devotional-ready notification, tap it, then verify reading tap-through and notebook access are not blocked by the premium gate for that QA session.
7. If replaying onboarding too, use unfold://debug-reset-beginning first; reset local app data before testing real purchases, restore purchases, or App Review behavior.

Notes:
- This is a QA-gated TestFlight build with EXPO_PUBLIC_ENABLE_QA_TOOLS=1.
- QA Premium in the notification test is session-local only and does not persist user.isPremium.
- Production/App Review build 154 remains separate and should not be replaced by this QA build.
- Backend structured Day-generation fix is committed locally but not included in production backend until Nick separately approves Railway deploy.
