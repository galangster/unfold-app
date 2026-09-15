# Reading and reflection across positions

Design direction accepted on 14 September 2026. This browser experiment tests one connected flow: Today → devotional → reflection → an optional passage or prayer session.

## Two signature experiences

### The facing page

Opening the app gives related content room to coexist. The devotional keeps scripture and prose in one reading flow. Reflection questions and the selected response sit beside it. Both regions belong to the same session.

The Bible can extend this idea into two facing pages. A page turn advances the spread when both pages fit. One page and continuous scrolling remain useful alternatives. Store a verse and character anchor. Recalculate page boundaries after the layout settles.

### The reflection desk

In a seated arrangement, sustained reading occupies the upper region. Reflection occupies the lower region when both remain usable. A faint echo of the upper artwork can connect them. Text and controls remain crisp. This effect stays static in the prototype.

A person can choose **Stay with this passage** or **Stay with this prayer**. This starts a short, intentional reading session. Standing alone keeps the current task. Returning restores the same reading anchor.

## Wider app direction

These are design proposals. Bible, Companion, and Journal are not implemented in this prototype.

| Area | Narrow or closed | Expanded or book | Seated | Standing |
| --- | --- | --- | --- | --- |
| Today | Current devotional, then unfinished reflection and verse | Devotional receives most of the space; supporting content stays secondary | Reading context above; continue and resume actions below if useful | Retain Today until a passage is chosen |
| Bible | One page, or the chosen scrolling preference | Two readable facing pages | Reading above; related controls below | An explicitly chosen passage |
| Devotional | Active reading or response, with a direct switch | Scripture and prose beside questions and one response | Reading above; reflection below | Chosen passage or closing prayer |
| Companion | Conversation and composer; source opens in context | Pinned source beside conversation; history can collapse | Source above; conversation and composer below when space permits | Retain conversation; a cited passage may open an intentional session |
| Journal, browse | Entry list, then selected entry | Narrow list beside entry | Entry above; selection controls below | Retain the selected entry |
| Journal, write | Draft and caret take priority | Source beside draft when writing from reading; freeform needs no source pane | Source above; draft below, subject to keyboard overlap | Retain the draft; a pose change never creates an entry |

Flat portrait and landscape use their actual available bounds. Upright book keeps the book relationship. A system-assigned narrow window remains an independent constraint. A conceptual equal split does not imply a fixed physical hinge location or a required content ratio.

## Continuity contract

- Capture a stable paragraph or verse identity, character offset, and viewport inset.
- Restore that anchor after layout and font measurement finish. Do not reuse stale geometry.
- Keep drafts, question identity, bookmark, route, and text selections outside layout containers.
- Keep the active editor mounted. A layout change does not request keyboard focus or submit text.
- Preserve marked input text during composition. Native input-method behavior still needs acceptance testing.
- Collapse supporting content before the active task. Keep all actions reachable in one pane.
- Keep large text large. Never shrink typography just to retain a split.
- Persist draft revisions. Show a persistent, accurate error if a write fails. In-memory retention cannot guarantee reload recovery.
- Preserve logical reading order and semantic focus. Hidden panes must leave accessibility traversal.
- Use actual window and keyboard overlap, safe areas, and reserved regions in native implementation.
- A pose change does not complete a day, create an entry, send a message, or enter another activity.

## Capability ledger

The platform and toolchain facts below are a dated research snapshot, not a promise of current SDK availability.

| Evidence class | Finding | Boundary |
| --- | --- | --- |
| Local source audit, 14 September 2026 | Installed Expo 57.0.16 and React Native 0.86.2. An Expo native editor module exists. | A native extension route exists. The audit did not find target Duo API integration. |
| Local toolchain snapshot | Xcode and iPhoneOS SDK 27.0 were installed. The inspected runtime inventory had no exact Duo simulator or downloadable 27.1 entry. | Native Duo compilation and acceptance were not demonstrated. This is not a claim that nobody can obtain the SDK. |
| Apple documentation | The preparation guide names Xcode 27.1 and DeviceHub. Other guides describe arrangements, reserved regions, hinge interaction, and adaptive bars. | Documentation establishes an intended platform surface. It does not prove these APIs work through Unfold's current custom chrome. |
| Current repository baseline | origin/main 055492850b61fef6c9be1288c68cd017c42017cc already includes reader anchor integration. | Future native work must extend that implementation. An older checkout's cached-width behavior is not the current baseline. |
| Browser implementation | Geometry controls simulate seven arrangements. A single store owns the session. | Browser reflow proof does not establish hinge sensing, UIKit behavior, VoiceOver, native keyboard handling, or process recovery. |
| Accepted experiment | Facing pages, paired reflection, intentional standing sessions, and faint reflected art. | Exact proportions, native transitions, and physical interaction remain design experiments. |

Apple sources: [Duo overview](https://www.apple.com/iphone-duo/), [preparation](https://developer.apple.com/videos/play/tech-talks/111461/), [adaptive bars](https://developer.apple.com/videos/play/tech-talks/111462/), [arrangements and reserved regions](https://developer.apple.com/videos/play/tech-talks/111463/), [hinge and scene behavior](https://developer.apple.com/videos/play/tech-talks/111464/).

## Useful precedents

- [Apple Mail on iPad](https://support.apple.com/en-gb/guide/ipad/ipad99a3ef9e/ipados) and [Messages on iPad](https://support.apple.com/en-ie/guide/ipad/ipad99acb44a/ipados) support list/detail and conversation relationships. They do not prescribe a 25/75 split for Unfold.
- [Bear's sidebar controls](https://bear.app/faq/hide-the-sidebar-and-note-list-on-mac-and-ipad/) support progressive collapse around the active content.
- [Day One prompts](https://dayoneapp.com/guides/tips-and-tutorials/daily-writing-prompts/) support keeping a writing prompt near its response.
- [Samsung Flex mode](https://developer.samsung.com/sdp/blog/en/2021/01/11/adapt-your-app-for-galaxy-flex-mode) separates sustained viewing from touch controls. [Android canonical layouts](https://developer.android.com/develop/adaptive-apps/guides/canonical-layouts) offer adaptable list/detail and supporting-pane patterns. These are precedents, not Apple hardware evidence.

No ChatGPT-specific Duo layout was verified. The reflective video example remains unidentified. Companion's source-and-conversation layout and reflected artwork are our proposals.

## Native acceptance after SDK access

First verify the actual SDK symbols, native module bridge, scene geometry, and runtime support. Then test closed/open transitions, book and seated arrangements described by the platform, rotations, narrow windows, keyboard overlap, large text, VoiceOver, Reduce Motion, composition input, background recovery, and failed saves. Do not hardcode unverified hinge angles or reverse-fold capability.
