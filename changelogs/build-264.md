# Build 264 (1.1.6) - Reliable daily reflections

Everything in build 263, plus the improvements below.

## What's New (App Store)

Daily reflections now show when an answer is saving and confirm only after it is safely stored. If saving fails, the answer stays available to retry without blocking completion.

## New

- **Truthful reflection status** - Optional daily responses show when they are saving and when they are saved to Journal.
- **Reliable completion return** - Finishing a normal daily reading returns to Today after the celebration. Series completion remains in the reader.

## Fixed

- **Ordered reflection storage** - Delayed writes cannot restore deleted answers or overwrite a newer response.
- **Retry without retyping** - A failed reflection remains available for another save attempt.

## What to Test

- [ ] Enter an optional reflection and finish the daily reading.
- [ ] Confirm `Saving...` appears before `Saved to Journal`.
- [ ] Confirm the normal celebration returns to Today.
- [ ] Relaunch and confirm the reflection remains saved.
- [ ] If a save fails, confirm the answer remains intact and can retry.
- [ ] Confirm series completion still remains in the reader.
