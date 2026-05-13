Build 176 - What to Test

What changed
- Refreshed the first-run Today tooltip tour for the current Today layout.
- The tour now explains Today's thread, Companion check-in, Daily Rhythm, and the Bible/Companion/Journal tabs.
- Spotlight targets now follow the actual Today card surfaces instead of stale per-tab/streak anchors.

What to test
- On an internal/dev QA path, go to Profile > Dev Tools > Replay Home Tooltips (Dev), then confirm each tooltip copy and target.
- Confirm step 1 points to the Today reading/thread card.
- Confirm step 2 points to the in-feed Companion Check-in card, not the bottom Companion tab.
- Confirm step 3 points to Daily Rhythm and reads as a gentle rhythm, not a scoreboard.
- Confirm the final Read, Ask & Write step points to Bible, Companion, and Journal in the bottom nav.
- Sanity-check Today still loads and the bottom tabs still respond normally.
