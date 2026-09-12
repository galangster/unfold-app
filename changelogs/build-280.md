# Build 280 (1.1.9) - Signed device credential

Everything in 1.1.8 (build 279), plus the client half of the signed device credential. Every request to the Unfold backend now carries a per-device credential minted by the server. A standard request the server rejects for a stale credential re-registers once and retries. There is no visible change; this build proves nothing broke.

## Changed

- **Signed device credential** - The app registers its device with the backend at first launch and each time it returns to the foreground, keeps the credential in the Keychain, and sends it with every backend request. A rejected credential is replaced once and the request retried.
- **Standard backend calls heal** - Sync, generation, companion questions and titles, examen, scripture explain, stories, audio generation, bug reports, voice check-in listing and edits, recommendations, and journal Go Deeper share the same self-healing request path. Streaming companion chat, voice-recording uploads, and Bible and audio file downloads send the credential but do not retry on their own; they recover on the next standard request. A lint rule now blocks any new backend call that skips the shared path.

## What to test

- [ ] Fresh install: finish onboarding and generate a series. Confirm Day 1 appears with no error.
- [ ] Update from 279: open the app, pull to refresh Today, open the companion, play a reading. Confirm everything loads as before.
- [ ] Background the app for a minute and return. Confirm no prompt and no spinner that never ends.
- [ ] Voice check-in: record and send one. Confirm it lands in the list.
- [ ] Settings > Report a bug: send one. Confirm it reports success.
- [ ] Bible: open a chapter, tap a verse, ask for an explanation. Confirm an answer arrives.
- [ ] Two devices: change something on one, pull on the other. Confirm the change syncs.

## Behind a server switch (unchanged)

- Auto trial series stays off by default.
