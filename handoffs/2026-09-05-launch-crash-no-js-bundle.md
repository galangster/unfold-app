# Handoff: App Review rejection of 1.1.3 — root cause and blast radius

**Date:** 2026-09-05. **Author:** Claude (Fable 5.1) with Nick. **Companion:** `handoffs/2026-09-05-jordan-eleven-integrated.md`.

## What Apple saw

Submission `e7fdda05` (1.1.3, build 259) rejected 2026-09-05 under Guideline 2.1(a): crash on launch on an iPad Air 11-inch (M3), iPadOS 26.6.1. Crash log `crashlog-C8C7D1F8-FF87-454F-B3EB-29796295D88E.ips`: `RCTInstance handleBundleLoadingError:` → `RCTFatal` → SIGABRT, 0.5 s after launch, main thread. JavaScript never ran, so Sentry has no event.

## Root cause (confirmed three ways)

1. Build 259's archive (`eas build:view 2d30bcce`) contains **no `main.jsbundle` and no `assets/`**: only the binary, Info.plist, Expo.plist, PrivacyInfo and the provisioning profile.
2. `ios/Unfold.xcodeproj/project.pbxproj`, phase "Bundle React Native code and images", since `b4ec3b1f` (2026-09-03): `/bin/sh <sentry-xcode.sh> /bin/sh <react-native-xcode.sh>`. Sentry's wrapper reads the React Native script path from `$1` (`REACT_NATIVE_XCODE="${1:-…}"`), so it received `/bin/sh`, ran an empty shell, bundled nothing and exited 0.
3. A local Release simulator build from the same tree reproduced it: BUILD succeeded, no `main.jsbundle`, "Source map file does not exist".

Not iPad-specific. Every build from **255 to 260** shipped without JavaScript and crashes on launch on every device. 1.1.0 (253) and 1.1.1 (254) predate the phase and are fine; 1.1.0 is what is live on the App Store.

## Blast radius

- **TestFlight:** builds 257, 258 and 260 each had one install (259 had none). None could have been used. Every "What to Test" item in `changelogs/build-257.md` … `build-260.md` is untested on device; `changelogs/build-261.md` carries them forward.
- **Handoffs written for those builds** describe device behaviour that was never observed. Treat their device claims as unproven.
- **Sentry:** no source maps were uploaded for 255–260 (nothing to upload). With the fix, the wrapper genuinely runs `sentry-cli react-native xcode`, which needs `SENTRY_AUTH_TOKEN`; it is present in the EAS production environment (`eas env:list production`). If the token is ever missing, the build now fails loudly instead of shipping without JavaScript.
- **Live users:** none affected. OTA updates are disabled (`EXUpdatesEnabled=false`) and there is no Android build.

## The fix (branch `fix/ios-release-bundle`)

- Phase corrected to `/bin/sh <sentry-xcode.sh> <react-native-xcode.sh>`.
- Guard appended to the same phase: a non-Debug build without `main.jsbundle` in the app fails with `error: main.jsbundle is missing…`.
- `src/lib/__tests__/ios-bundle-phase.test.ts` pins both.
- Verified locally: Release simulator build embeds `main.jsbundle` and launches (see the companion handoff's receipts once captured).

## Release plan

1. Merge `fix/ios-release-bundle` (PR link in the session summary). Mobile `main` then carries Jordan's fixes and this fix.
2. `eas build --profile production` from `app/mobile` → build 261 (1.1.4). Before submitting anything, install 261 from TestFlight on an iPhone and, if available, an iPad, and cold-launch it.
3. In App Store Connect: cancel submission `e7fdda05` (1.1.3), create version 1.1.4, attach build 261, reuse the 1.1.3 metadata with "What's New" updated, submit. Reply to App Review on the 1.1.3 thread is optional; the new submission is the answer.
4. `node scripts/set-testflight-changelog.mjs 261`.
