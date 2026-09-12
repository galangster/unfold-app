# Navigation and Profile validation — 12 September 2026

This change gives Devotional its own reader stack and exposes settings directly in Profile.
Today returns to its root with one tap. History browsing preserves the active series.
The day selector reuses its reader. Completion and edge-back return to Devotional.

Support repairs cover notification retry persistence, full Companion copy, today's unread evening target, modal exits, bug-report cancellation, and the App Store link.

## Reference patterns

- [Liven Journey](https://mobbin.com/screens/94a0eae2-de4e-4e05-8516-cedc97cdd4d9): a separate progression destination.
- [Speechify Library](https://mobbin.com/screens/1e0a8afe-8e6d-4655-abfb-a9528eafc47f): Home and saved content serve different needs.
- [Remote Profile](https://mobbin.com/screens/a0423bae-3afc-4e26-b0fc-6256e0d9bd03): grouped settings at the account level.
- Appllama: Dwell plan `1343917374/oth_mfzob`, Glorify reader `1490587079/oth_uh34j`, and Imprint settings `1482780647/oth_h35ou`.
- [Apple tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars): stable peer destinations.

## Automated checks

- TypeScript: passed.
- ESLint: zero errors. Repository style warnings remain.
- Jest: 385 suites and 3,342 tests passed. One suite/test was skipped.
- Release-profile safety and Maestro selector validation: passed.
- Standard test command: `CI=1 bun run test --maxWorkers=2`. In-band execution exposed existing trial-test cleanup warnings.
- The orchestrator reviewed and simplified the integrated change.

## Native checks

Candidate JavaScript ran in the existing Expo development client on two iOS simulators.
The client reports 1.1.4 / build 183. No new release archive was built.

| Surface | Check | Result |
|---|---|---|
| iPhone 17 Pro, dark | Devotional reader remains in Devotional | Passed |
| iPhone 17 Pro, dark | Edge-back returns to the series | Passed |
| iPhone 17 Pro, dark | Completion updates progress and returns to the series | Passed |
| iPhone 17 Pro, dark | Day selector reuses the reader; one Back returns to the series | Passed |
| iPhone 17 Pro, dark | Companion Profile opens account controls and Support | Passed |
| Compact iPhone, light, largest text | Profile and settings rows wrap and scroll | Passed |
| Compact iPhone, light, largest text | Settings links scroll to reminders and appearance | Passed |
| Compact iPhone, light, largest text | Unread evening prompt opens today's reading | Passed |
| Compact iPhone, light, largest text | Today resets its inactive reader in one tap | Passed |
| Baseline iPhone 17 Pro | Evening Back and closing-thought dismissal return to Today | Passed |

The fixture backend used loopback only. No customer reports or production writes were sent.
Component tests cover successful Support ID copying and cancelled bug reports.
The isolated native fixture lacked a RevenueCat identity, so it exercised the unavailable-ID state.
The compact Bible fixture stopped at its initial download screen because the local fixture backend did not serve Bible data.
Physical-device installation, production push delivery, and App Store release are separate checks.
