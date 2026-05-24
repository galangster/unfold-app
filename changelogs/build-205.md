Build 205 ships the scripture drawer swipe-to-dismiss fix on top of build 204.

What to test:
- In a devotional reader, tap a scripture reference to open the scripture drawer.
- Swipe down from the drawer grabber/header and confirm the drawer dismisses naturally.
- Scroll longer scripture content inside the drawer and confirm scrolling does not dismiss the sheet.
- Tap outside the drawer and tap the X; both should still dismiss.
- Explain this passage and Read in Bible should still work from the drawer.
- Watch for no fresh Reanimated transform/layout-animation warning around scripture sheet open or dismiss.

Source: d4c13da Fix scripture sheet swipe dismissal

App Review build attachment is intentionally unchanged.
