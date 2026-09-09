# Build 267 (1.1.6) - Voice check-ins

Everything in build 266, plus the internal TestFlight candidate below.

## New

- **Voice check-ins on Today** - Record up to two minutes, review the audio, and send it only when ready.
- **Saved transcripts** - Review, edit, or delete recent voice check-ins from the same sheet.
- **Reliable retry** - Failed sends keep the local recording and reuse the same request when retried.
- **Clear data controls** - The sheet explains transcription and retention before sending. Full data reset removes local voice drafts.

## What to test

- [ ] Start a voice check-in from Today and confirm recording begins after microphone permission.
- [ ] Stop and play the recording. Confirm narration remains paused until the sheet closes.
- [ ] Send once and confirm one saved transcript appears in Recent check-ins.
- [ ] Edit the transcript, close the sheet, and confirm the edit persists.
- [ ] Delete the saved check-in and confirm it disappears from Recent check-ins.
- [ ] Interrupt a send. Confirm the draft remains available and Retry saves the same check-in.
- [ ] Close the sheet during review and reopen it. Confirm the draft returns without opening the keyboard.
- [ ] Run Delete All My Data and confirm the local voice draft is removed.
