Build 249 — launch readiness and iOS platform refresh

• Series archive and resume now use conflict-safe lifecycle updates, so rapid or repeated actions converge on one active series.
• Active-series selection and calendar pacing are more reliable, including across daylight-saving time changes.
• The iOS project now targets Expo SDK 57 and React Native 0.86 while preserving widgets, custom fonts, the note editor, App Groups, and the full-screen launch artwork.
• Backend readiness checks now fail closed when launch schema or runtime configuration is incomplete.

Please retest: (1) Archive the active series, then resume it; repeat quickly and confirm only one series remains active. (2) Reopen the app and confirm Today, Companion, and notifications use the resumed series. (3) Confirm the launch artwork still fills the screen. (4) Add and edit a note, then confirm widgets and shared data still update.
