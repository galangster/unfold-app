# Simulator release capture

`bun run verify:release` never prints complete release PASS. It evaluates a
local simulator-release evidence record written by
`scripts/capture-release-proof.mjs`. That record is not a cryptographic
attestation and is not App Store IPA, signing, upload, or physical-device
proof.

Optional developer smoke is unchanged and may still skip:

```bash
bun run verify:smoke
```

`verify:smoke` and `health:adaptive` stay out of the release command. This
gate does not prove generation behavior.

## Who prepares the tree

Root's existing reversible overlay procedure prepares and restores the native
checkout. This runner does not overlay files, switch branches, install Pods,
or edit protected `project.pbxproj` / `Podfile.lock`.

If local production-profile proof is needed, Root applies the existing
`scripts/stamp-build-profile.mjs` transformation with
`EAS_BUILD_PROFILE=production` before capture. Pass `--stamp-production` so
the runner checks that exact substitution. It does not stamp the file.

Capture verifies native ≡ candidate, plus the exact stamp transform when
selected, before and after the observed commands. It stores a per-file input
manifest (`path`, `candidateSha256`, `expectedSha256`) and protected-file
hashes. Root may restore the native overlay immediately after capture.

Later evaluation compares that stored expected stamped hashes to the current
immutable candidate only. It does not require the native checkout to remain
overlaid. It does not accept `--runtime-status` or `--app`.

## Capture

Use a fresh derived-data directory. Write the record under ignored
`.artifacts/` or outside both worktrees.

Local native `flowdeck build` and `flowdeck run` always receive
`SENTRY_DISABLE_AUTO_UPLOAD=true`. The runner does not print environment
secrets.

Verified FlowDeck 1.26.5 shapes (no `-w`; that flag previously doubled the
workspace path). Run from the prepared native checkout:

```bash
flowdeck build -C Release -d /path/to/fresh-derived-data -S <SIMULATOR-UDID> --json
flowdeck run --no-build -C Release -d /path/to/fresh-derived-data -S <SIMULATOR-UDID> --json
# wait HEALTHY_BOOT_MS (30000) from src/lib/crash-marker.ts
flowdeck ui simulator screen -S <SIMULATOR-UDID> --json
```

The capture script observes those commands. It does not accept
`--runtime-status` or `--app`.

```bash
node scripts/capture-release-proof.mjs \
  --candidate /path/to/immutable-candidate \
  --native /path/to/prepared-native-checkout \
  --derived-data /tmp/unfold-release-derived-data \
  --simulator <SIMULATOR-UDID> \
  --stamp-production \
  --out /path/to/native/.artifacts/simulator-release

CVL_RELEASE_PROOF=/path/to/native/.artifacts/simulator-release/record.json bun run verify:release
```

Required checks: candidate commit/tree before build, prepared files matching
that candidate, exact production stamp when selected, protected hashes,
Release configuration, successful BUILD, `configuration.workspace` bound by
realpath to `<nativeDir>/ios/Unfold.xcworkspace`, app only from that
derived-data, bundle `com.unfoldapp.ios`, profile `production`, nonempty
executable and `main.jsbundle`, captured Info.plist hash plus version/build
identity, launch cleanup/install/registration on the same target, no
rebuild, `app_registered.data.projectPath` bound to the prepared native
checkout, `logPath` inside the observed derived-data directory, and a later
`flowdeck.ui` / `ui_snapshot` taken at least 30 seconds after registration.
The snapshot must show a visible Unfold `Application` and a visible
non-Application node with a non-splash accessibility `id`. Immediate
registration, `RUNNING`, or splash-only UI is not enough. A later Info.plist
version or build change against the old record fails.

`--no-build` can still rebuild if FlowDeck finds no app. A BUILD event in the
launch log fails the capture.

## Limits

FlowDeck `ui simulator screen` snapshots do not prove the OS process stayed
alive for the healthy-boot window. This record does not invent a native
process lease. `notProven` includes `native-process-lease`.

The input manifest covers git-tracked candidate files plus the exact
production stamp on `ios/Unfold/Info.plist`. It does not cover ignored or
untracked dependency trees (`Pods/`, `node_modules/`), derived data, signing,
or process environment besides `SENTRY_DISABLE_AUTO_UPLOAD=true`.
`notProven` includes `dependency-tree` and `ignored-environment`.
