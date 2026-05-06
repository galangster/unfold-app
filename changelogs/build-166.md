Production/App Review candidate build for onboarding generation recovery and profile-settings personalization.

Focus areas:
- Clean production profile build with QA tools disabled.
- Includes backend-backed onboarding generation recovery so the first devotional should not remain stuck on the preparation loader.
- Includes profile/settings sync so post-onboarding edits can inform future devotional generation.
- Writing Style settings sync into backend sync_users settings for tone, depth, faith background, and life stage.
- Current pastoral context fields sync for generation, including relationship with God, Bible frequency, growth goals, and obstacles.
- Includes backend structured Day-generation readiness already deployed to production.

What to test internally before any App Review mutation:
1. Install this TestFlight build and complete onboarding normally.
2. Confirm the first devotional generates and opens instead of staying on an indefinite preparation screen.
3. Change Writing Style / faith background / depth / life stage in Settings.
4. Generate or wait for a later devotional day and check that the writing reflects the updated Settings.
5. Recheck basic reading, journaling, notebook, highlighting, and notification re-entry flows.

Notes:
- This build is produced from the production profile; QA tools should be disabled.
- Build 154 remains the currently attached App Review build until Nick explicitly approves replacing it.
- Do not submit this build for App Review, external beta, or release without explicit approval.
