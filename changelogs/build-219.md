Build 219

What to test:
- Widgets: add all 3 home-screen widgets and confirm they show real data (streak, today state, dashboard), tapping opens the Today tab, and light mode uses the light palette. Check again after midnight without opening the app.
- Onboarding: the AI consent step appears before any devotional generates. Fast-typing your name (for example Quinn) carries the full name into personalized copy.
- Returning users: opening the generating screen without prior AI consent shows an inline consent prompt instead of a dead end.
- Paywall: the close (X) button is present and reachable with VoiceOver; prices show $9.99/mo and $69.99/yr from the store (no $4.99 or $59.99 anywhere); the purchase button disables gracefully if prices fail to load.
- SOAP journal: type in one field and immediately switch to the next without pausing; both entries persist.
- Notebook: the software keyboard shows the formatting toolbar.
- Fresh install: no push notification permission prompt fires at app launch.
- Offline: complete a day in airplane mode, reconnect, and confirm progress syncs to the server.

Notes:
- Restores the App Groups entitlement, fixing the blank widgets in build 218.
- Streak logic hardened: lapse resets, freeze ordering, banked freezes for churned premium users, one celebration per day.
- Internal build for device QA only.
