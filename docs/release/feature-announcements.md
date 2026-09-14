# Feature announcements

Owner decision: September 14, 2026.

Include every major new feature in the existing announcement popup. Group related improvements into one page. Minor corrections need no page.

Add each feature to `FEATURE_ANNOUNCEMENT_CATALOG` in `src/lib/feature-announcements.ts`. Give it a permanent ID. Never reuse an ID for a different feature. Select its availability in `AmbientSoundOverlay`.

The popup uses one modal. It shows one feature per page, a page count, Next, and final Done. Users can close it at any point. Closing dismisses the remaining eligible pages. Displayed pages retain their own history across updates.

Keep entries available for users who skip app versions. Preserve existing IDs, including `background-music-v1`. Announce only features available to the current user. Reflection writing requires the existing premium policy.

Keep copy short and explain where to find the feature. Use a small visual when it helps. Do not start audio automatically. Stop preview audio when users change pages, close the popup, or leave the app.

Before release, test eligible pages, skipped updates, dismissal, and large text. Verify the actual native popup and its controls.
