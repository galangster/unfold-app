QA BUILD (internal only) - QA tools ENABLED. Supersedes build 236.

POST-ONBOARDING CRASH FIX
- Fixes the "Cannot read property 'replace' of undefined" error that could appear when opening the generated sample devotional.
- Word Study content now works whether generation returns prose or structured term details.
- The same compatibility is applied to sync restore and PDF export.

Please test:
1. Complete onboarding normally through sample devotional generation.
2. Open the sample and confirm the reader appears without the global error screen.
3. If a Word Study card appears, confirm its prose is readable and correctly formatted.
4. Force-quit and reopen, then resume the same devotional.
5. Export the devotional to PDF if Word Study content is present.
6. If generation is slow, retry once and confirm the recovered sample also opens.

Report the device/iOS version, approximate time, and a screenshot if any error appears.

Carries forward all build 236 writing, free-tier, notebook, sync, dictation, privacy, and Companion fixes.