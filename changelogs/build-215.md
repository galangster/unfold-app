Build 215 fixes the companion-name keyboard overlap in onboarding for internal TestFlight QA.

What changed since build 214:
- The companion-name onboarding screen now lifts the name field above the iOS software keyboard.
- The fix was verified on both a current large iPhone simulator class and an iPhone 13 simulator class before this build lane.
- The keyboard submit action now uses Done and dismisses the keyboard from the name field.

What to test:
- Start onboarding from a fresh install or reset state and advance to the companion-name screen.
- Tap the Companion name field on a large current iPhone and confirm the label, input, and helper text remain visible above the keyboard and predictive bar.
- Repeat the same check on an iPhone 13-class device or simulator.
- Type a companion name, tap Done, continue onboarding, and confirm the typed name persists through the next step.
- Smoke the build 214 reader preferences areas: devotional reader settings, Bible reader settings, saved highlights row, note detail/editor, PDF/share preview, Companion drawer, Today, paywall/products, notifications, and widgets.

Source commits on branch mina/reader-preferences-apple-books:
- 16ae75c fix(onboarding): keep companion name above keyboard

App Review build attachment is intentionally unchanged.