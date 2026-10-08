# Release smoke

Run a release smoke before you submit any build for App Review. It replaces
the manual TestFlight check. Nick approved this process on 2026-10-08.

A release smoke has two halves. The script builds the release commit for the
iOS Simulator and records the release-proof evidence. An agent then drives the
app with FlowDeck and audits every screen it visits. The IPA check covers the
signed build, which a simulator cannot run.

| The smoke proves | The IPA check proves |
|---|---|
| The release commit builds in Release with the production environment, launches and passes `verify:release` | The signed IPA has the JS bundle, the version, the build number and the profile stamp |
| Onboarding through a real first devotional, reading, tabs and profile | App Store signing, the production push entitlement and the widget's App Group |
| The QA routes stay closed, and the paywall shows the right prices | Sentry holds the source map and the dSYM for this build |

Lock Screen widget editing, push delivery and purchases need a physical device.
Report them as not covered.

Step 3 runs the `verify:release` gate that `QUALITY.md` requires for a release.
That gate reads the evidence record from the capture in
[`scripts/RELEASE-PROOF.md`](../scripts/RELEASE-PROOF.md). By design it always
ends on "FAIL incomplete", because it reports the IPA, signing, upload and
device gates as open. Its `simulator-artifact MATCH` line is the pass. Step 7
covers the IPA and signing gates.

## Rules

- **Smoke simulator.** Use only the simulator named `Unfold Release Smoke`.
  Clear its app data only at the start of a new release, in step 2. Ask Nick
  before you use another simulator or a physical device.
- **QA Smoke reader.** Create one production reader per release, named
  "QA Smoke". Record its Support ID in the release receipt. On a rerun for the
  same release, keep that reader. Ask Nick before you create a second one.
- **Production writes.** Each launch registers the device with production.
  Onboarding creates the reader and its first devotional. Make no other
  production writes.
- **Paywall and prompts.** Leave the paywall with "I'll decide later". Answer
  notification prompts with "Don't Allow". Close any Apple ID prompt.
- **Code.** Keep the smoke worktree detached. Keep its app code as committed.
  The script refuses a linked `node_modules`, because a linked tree moves pod
  versions. Sentry stays on. Native and JS Sentry report simulator runs in the
  environment `simulator`, apart from production.
- **Candidate.** The script keeps a candidate worktree named
  `<smoke worktree>-candidate`. `verify:release` reads it again, so keep both
  worktrees until the release ships.
- **Design.** Propose changes. Nick decides. [DEVICE-VERIFICATION.md
  §8](DEVICE-VERIFICATION.md#design-audit-on-every-simulator-run) holds the
  audit rule.

## Steps

1. **Worktree.** Create a detached worktree at the release commit in the
   workspace's `.worktrees/` folder. Name it `release-smoke-<version>-<yyyymmdd>`.
   Use `git worktree add --detach <path> <release commit>`.
   Done when `git rev-parse HEAD` there prints the release commit.
2. **Fresh app data.** For a new release, clear the app data on the smoke
   simulator with `flowdeck ui simulator clear-state com.unfoldapp.ios -S "Unfold Release Smoke"`.
   Skip this step on a rerun for the same release, so its QA Smoke reader stays.
   Done when the command succeeds or reports that the app is not installed.
3. **Build and capture.** In the worktree, run `node scripts/release-smoke.mjs`
   in the background. Keep its log. A run takes about 10 minutes.
   Done when it prints `[release-smoke] PASS`. The PASS line holds the
   simulator UDID, the record path and the bundle hash.
   A `FAIL` line names the check that stopped it. Fix that cause. Restore the
   worktree with `git checkout -- .`. Then run the script again.
4. **Phase A, before onboarding.** The capture leaves the app open on the
   smoke simulator. Run checks A1 to A5.
   Done when each check has a result and a screenshot.
5. **Phase B, the QA Smoke reader.** Run checks B1 to B6.
   Done when each check has a result and evidence.
6. **Design audit.** Audit every screen and transition from steps 4 and 5.
   Done when every visited screen is in the findings list. Write
   "no findings" where that is true.
7. **IPA check.** Get the IPA you will upload. A local build writes it to the
   `eas build --local --output` path. For a cloud build, download it from the
   EAS build page. Read the Sentry build token from its file in the same
   command, so the token never appears in a transcript:
   `SENTRY_AUTH_TOKEN="$(cat <token file>)" scripts/verify-release-ipa.sh <ipa> <build number>`.
   On Nick's Mac, the token file is `~/.config/unfold/sentry-build-token-*.txt`.
   Local release builds use the same file.
   Done when the check ends on `PASS`.
8. **Report.** Write the report into the release receipt. Compare
   `bundleSha256` from step 3 with the `main.jsbundle sha256` from step 7.
   Equal hashes mean the smoke ran the JavaScript that ships. Unequal hashes
   mean the smoke built something else. Identify the cause before you submit.
   Done when the receipt holds the check table and the hash comparison. It
   also holds the `verify:release` output, the Support ID, the findings and
   the IPA check output.

Driving the UI costs the most time. Read the FlowDeck traps in
[DEVICE-VERIFICATION.md §4](DEVICE-VERIFICATION.md#things-that-will-otherwise-cost-you-an-hour)
before step 4. Add each new trap you hit.

## Checks

| ID | Check | Pass when |
|---|---|---|
| A1 | Cold launch | The capture in step 3 passes its healthy-boot check: a non-splash screen shows 30 s after launch. |
| A2 | Relaunch | After `flowdeck stop` and `flowdeck simulator launch com.unfoldapp.ios -S <udid>`, the first screen shows again. The logs hold no crash. |
| A3 | No dev client | The app shows no Expo dev launcher, no "Loading from Metro" and no Tools button. |
| A4 | QA route closed | `unfold://qa-rive-ambience?scene=moon-stars-rive` lands on the home route. Send it two times, because the first link after a launch is dropped. |
| A5 | Paywall | `unfold://paywall` shows both plans, their prices and the trial terms. |
| B1 | Onboarding | Onboarding completes, and the first devotional generates. `src/app/onboarding.tsx` holds the step order. Type "QA Smoke" at the `name` step. Continue on the `aspiration` step starts the generation. The onboarding paywall comes after it. |
| B2 | Reading | The first reading shows its title, scripture, body, reflection questions and completion area. |
| B3 | Tabs | Today, Bible, Companion and Journal open. Send no Companion message. |
| B4 | Profile | Settings has no "QA Tools" section. "Copy Support ID" copies the reader's ID, which the screen does not show. |
| B5 | Reader relaunch | After a cold relaunch, Today shows the QA Smoke reader's devotional. |
| B6 | This release | One check for each user-visible change the simulator can reach. List the changes with `git log --oneline <previous release commit>..<release commit>`. The previous release commit is in its release receipt. |

## Report

- The check table: ID, PASS, FAIL or SKIPPED, one line of evidence and the
  screenshot path.
- The design findings, ranked by severity, in the §8 format.
- The QA Smoke Support ID.
- Each deviation from these steps, and the reason for it.
