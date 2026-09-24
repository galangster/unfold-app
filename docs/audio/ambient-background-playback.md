# Ambient background playback

Music uses the existing audio-session registry and music sheet. On iOS it uses
Expo's `AVQueuePlayer` playlist. All nine local tracks enter the queue before
playback. The queue repeats natively. A shuffled queue contains each track once.
Changing shuffle preserves the current `AVPlayerItem` and playback position.

`ambient-player.ts` is the boundary between the controller and Expo. Other
platforms retain the existing single-player path. Its end-of-song transition
no longer waits for a fade on a player that has already stopped.

## Native patch

`patches/expo-audio@57.0.4.patch` preserves the existing interruption safeguards.
Its iOS playlist lock-screen support is adapted from Expo commit
`cd970eaf9b6fd7a56dbc3622c70b8d089dbdcc89` (PR expo/expo#46020).
The existing playlist index fix remains intact.

Unfold additions disable automatic resume after interruptions, keep track
metadata native, and reorder future items without replacing the current item.
Native status reports pauses, errors, position, and duration. A native deadline
stops playback when the music timer expires even if JavaScript is suspended.

The native queue updates Now Playing metadata and handles play, pause, seek,
previous, and next. JavaScript is not required at a song boundary. User pauses
retain the ambient session lease. A higher-priority owner invalidates it and
removes remote controls. This prevents an old music control from starting audio
during recording or narration.

This change requires a new native build. Do not send it as an OTA-only update.

## Acceptance

Check an iOS native build, including physical-device lock-screen acceptance:

- Start music, seek near the end, lock the screen, and confirm automatic advance.
- Enable shuffle and confirm multiple consecutive tracks play.
- Check title, elapsed time, scrubbing, pause/resume, and previous/next in Now Playing.
- Change shuffle during a song. Position must stay stable.
- Interrupt with narration, recording, another app, and headphone removal.
  Music must not resume without an explicit user action.
- Start a timer and leave the screen locked until it expires.
- Stop music. Now Playing controls must disappear.

Unit tests cover queue construction, shuffle order, remote-control ownership,
seek limits, load cancellation, and the timer-free fallback transition. These
do not replace native or physical-device acceptance.
