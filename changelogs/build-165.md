Internal QA TestFlight build for profile settings sync into Day 2+ devotional generation.

Focus areas:
- Includes build 164 onboarding generation recovery and backend structured Day-generation readiness.
- Adds app-wide profile/settings sync so post-onboarding edits are pushed to backend sync_users before future devotional generation.
- Writing Style settings now sync into sync_users.settings.writingStyle: tone, depth, faith background, and life stage.
- Current pastoral context fields now sync for generation: relationship with God, Bible frequency, growth goals, and obstacles.
- Backend Day 2+ manual generation and scheduled cron generation already prefer current sync_users settings over stale devotional snapshots; this build adds the missing mobile push path.

What to test:
1. Install this internal QA TestFlight build only. Do not attach it to App Review, external beta distribution, purchase proof, or production entitlement proof.
2. Complete onboarding or use an existing internal tester account/device.
3. Open Settings and change Writing Style values such as tone, depth, faith background, and life stage.
4. Also change pastoral context fields if available, such as relationship with God, growth goals, and obstacles.
5. Relaunch the app after a short pause and confirm the app remains stable; the profile sync hook should retry on app start/profile changes if a prior push failed.
6. Generate or wait for the next devotional day and check that the writing/personality reflects the updated Settings rather than the original onboarding snapshot.
7. Recheck onboarding first devotional generation from build 164: it should not remain stuck on the preparation loader.

Notes:
- This is a QA-gated TestFlight build with EXPO_PUBLIC_ENABLE_QA_TOOLS=1.
- Production/App Review build 154 remains separate and should not be replaced by this QA build.
- App Review resubmission should wait until Nick explicitly approves attaching a production/App Review build.
