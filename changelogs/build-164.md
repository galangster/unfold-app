Internal QA TestFlight build for onboarding generation recovery, backend generation hardening, and notebook safety checks.

Focus areas:
- Onboarding first devotional should no longer leave reviewers on an infinite preparation loader; completed jobs carry canonical devotional identity through polling and recovery.
- Production backend now has the structured Day-generation fix deployed, so regular generated days use provider-enforced structured output instead of prompt-only JSON parsing.
- Onboarding sample requests include the selected writing style matrix so the first devotional has the same tone/depth calibration as later devotionals.
- Notebook/editor runtime fuzz guardrails are included after simulator proof passed 20 of 20 cases.
- Journal folder delete/restore and folder reorder safety hardening is included.

What to test:
1. Install this internal QA TestFlight build only. Do not attach it to App Review, external beta distribution, purchase proof, or production entitlement proof.
2. To replay first-run onboarding, open unfold://debug-reset-beginning first, then complete onboarding normally.
3. After onboarding, the first devotional should generate, transition out of the preparation screen, and open the reading without an indefinite spinner.
4. If the same device shows the same first devotional after a QA reset, that can be expected because the backend recovers the deterministic onboarding sample for that device. Use a fresh install/device identity when checking truly fresh sample generation.
5. Optional internal-only editor proof: open unfold://__dev__/unfold-editor-test?autoFuzz=1&limit=20 and confirm the runtime fuzz summary reports 20 passed, 0 failed.
6. Recheck recent notebook, journal folder delete/undo, folder restore, and folder reorder flows for regressions.

Notes:
- This is a QA-gated TestFlight build with EXPO_PUBLIC_ENABLE_QA_TOOLS=1.
- Production/App Review build 154 remains separate and should not be replaced by this QA build.
- App Review resubmission should wait until Nick explicitly approves attaching a production/App Review build.
