# Unfold Mobile App — Exhaustive GUI End-to-End Test Prompt

You are an autonomous QA tester. Your job is to exhaustively test every screen, button, gesture, sheet, modal, bottom sheet, swipe, scroll, and navigation path in the Unfold devotional/Bible app running in the iOS Simulator. You must try to break the app. Test until you are 100% confident nothing is broken.

## Setup

1. Use `mcp__computer-use__request_access` to request access to the Simulator application.
2. Open the iOS Simulator using `mcp__computer-use__open_application` with app name "Simulator".
3. The app should already be installed. If not, build and install it:
   ```
   cd ~/clawd/work/unfold/app/mobile
   bunx expo run:ios --device "iPhone 17 Pro"
   ```
4. Launch the app in the simulator. If needed: `xcrun simctl launch booted [bundle-id]`
5. Take a screenshot after every single action to verify what happened. Never assume — always verify visually.
6. Resize every screenshot: `sips -Z 1000 <path>` to avoid bloating context.

## Testing Philosophy

- **Tap everything.** Every button, every link, every card, every icon, every chip, every pressable surface.
- **Swipe everywhere.** Swipe left, right, up, down on every scrollable surface, every list, every bottom sheet, every card stack.
- **Try to break it.** Tap rapidly, double-tap, long-press, swipe during animations, scroll to extremes, type fast.
- **Test empty states.** No devotionals? No journal entries? No saved passages? No companion history?
- **Test error states.** Network off, API failures, generation errors.
- **Test edge cases.** Very long text input, special characters, rapid navigation, deep nesting.
- **Verify navigation.** Every tap should go somewhere logical. Back gestures should work. Sheets should dismiss. Tab bar should always be accessible.
- **Check visual consistency.** Dark mode styling, text truncation, alignment, spacing, font rendering.
- **Check animations.** Verify animations complete smoothly, no janky transitions, no stuck states.
- **Log every issue.** Document bugs with: screenshot, description, steps to reproduce, expected vs actual.

## Bug Report Format

For every issue found, log:
```
BUG #[N]:
- Screen: [which screen]
- Steps: [exact steps to reproduce]
- Expected: [what should happen]
- Actual: [what actually happened]
- Severity: [Critical/High/Medium/Low]
- Screenshot: [saved screenshot path]
```

---

## PHASE 1: INITIAL LAUNCH & ROUTING

### Index/Welcome Screen
- [ ] Launch the app — verify splash screen shows then hides
- [ ] Verify the initial routing logic:
  - If first launch: should show welcome/how-it-works
  - If returning user without auth: should show sign-in
  - If authenticated with devotional: should show tabs
  - If authenticated without devotional: should show generating
- [ ] Verify no white flash between splash and first screen

### How It Works Screen
- [ ] Verify the "How It Works" explainer renders
- [ ] Swipe through any carousel/pages
- [ ] Tap "Continue" or "Get Started" — verify navigation to onboarding or sign-in
- [ ] Try swiping back — verify gesture behavior

---

## PHASE 2: ONBOARDING FLOW

### Sign-In Screen (Clerk Auth)
- [ ] Verify sign-in screen renders (presentation: fullScreenModal, slide_from_bottom)
- [ ] Verify social auth buttons appear (Apple, Google via Clerk)
- [ ] Tap Apple Sign-In — verify the native Apple auth sheet appears
- [ ] Dismiss the auth sheet — verify clean return
- [ ] Tap Google Sign-In — verify OAuth flow
- [ ] Verify error handling for failed auth
- [ ] Verify the screen cannot be swiped away (gestureEnabled: false on generating)

### Onboarding Questions
- [ ] After auth, verify the onboarding question flow begins
- [ ] Test the AdaptiveQuestionFlow component:
  - [ ] Verify each question renders clearly
  - [ ] Tap each answer option — verify selection highlights
  - [ ] Verify you can change your answer before proceeding
  - [ ] Tap "Continue" or "Next" — verify smooth transition to next question
  - [ ] Try going back to previous questions
- [ ] Questions should include (based on onboarding-questions.ts):
  - Faith background/tradition
  - Bible reading experience
  - What they want to grow in
  - Preferred devotional style
  - Daily schedule/time preferences
- [ ] Verify all questions complete without crash

### Generating Screen
- [ ] After onboarding, verify the generating screen appears
- [ ] Verify it cannot be swiped away (gestureEnabled: false)
- [ ] Verify a loading animation plays
- [ ] Verify progress updates show
- [ ] Wait for devotional generation to complete
- [ ] Verify transition to the main app or reveal screen

### Reveal Screen
- [ ] Verify the reveal screen shows the first devotional
- [ ] Verify it's a fullScreenModal with fade animation
- [ ] Verify it cannot be dismissed by gesture (gestureEnabled: false)
- [ ] Tap "Begin" or "Start Reading" — verify navigation to tabs

### Welcome Celebration
- [ ] Verify welcome celebration plays for first-time users
- [ ] Verify confetti/sparkle animations render
- [ ] Tap to dismiss — verify clean transition

---

## PHASE 3: TAB BAR NAVIGATION

The app has 4 visible tabs + 1 hidden: **Today**, **Bible**, **Companion**, **Journal** (+ hidden **You** tab accessed via profile avatar)

### Tab Switching
- [ ] Tap each visible tab — verify the correct view loads:
  - Today (HouseIcon)
  - Bible (BookBookmarkIcon)
  - Companion (CircleNotchIcon)
  - Journal (BookOpenIcon)
- [ ] Verify the "You" tab is hidden (href: null) and not visible in tab bar
- [ ] Tap the already-selected tab — verify it pops to root (e.g., reading → today index)
- [ ] Rapidly switch between all tabs (20+ times) — verify no crashes
- [ ] Verify tab bar styling:
  - Frosted glass blur background (iOS)
  - Animated dot indicator under selected tab
  - Spring scale animation on selection
  - Correct icon weights (fill when selected, light when not)
- [ ] Verify tab bar auto-hides during certain interactions (scroll-based hiding)
- [ ] Verify tab bar reappears when scrolling up or navigating back
- [ ] Verify tab bar instant-hide mode (verse selection context)

### Audio Player Interaction
- [ ] If audio player is showing as sheet, switch tabs — verify it collapses to pill
- [ ] Verify the audio player pill appears above the tab bar
- [ ] Tap the pill — verify it expands to full sheet

---

## PHASE 4: TODAY TAB (Home Screen)

### Greeting Row
- [ ] Verify time-appropriate greeting (Good morning/afternoon/evening)
- [ ] Verify user's name appears
- [ ] Tap profile avatar — verify navigation to (you) tab/index

### Streak Display
- [ ] Verify streak counter shows (CompactStreakRow or StreakDisplay)
- [ ] Verify streak fire/flame animation
- [ ] Verify streak box styling and count

### Devotional Card / Card Stack
- [ ] Verify the main devotional card renders (DevotionalCard or DevotionalCardStack)
- [ ] Tap the devotional card — verify navigation to reading screen
- [ ] If card stack: swipe between cards — verify gesture works
- [ ] Verify devotional title, scripture reference, and preview text show
- [ ] Verify the card has proper styling (gradients, shadows, accent glow)

### Series Carousel
- [ ] Verify the series carousel renders (SeriesCarousel / YourSeriesSection)
- [ ] Scroll the carousel horizontally
- [ ] Tap a series — verify navigation to series detail
- [ ] Verify series cards have images, titles, and progress indicators

### Quick Actions Row
- [ ] Verify quick action buttons render (QuickActionsRow)
- [ ] Tap each quick action — verify it navigates correctly

### Daily Bridge Card
- [ ] Verify the daily bridge card renders (DailyBridgeCard)
- [ ] Tap it — verify interaction

### Context Slot
- [ ] Verify the context-aware slot renders (ContextSlot)
- [ ] Verify it shows appropriate content based on time/state

### Remember This Card
- [ ] Verify "Remember This" card shows (RememberThisCard)
- [ ] Tap it — verify interaction

### Notification Card
- [ ] Verify notification card renders if notifications pending
- [ ] Tap it — verify interaction

### Premium Nudge Card
- [ ] Verify premium nudge shows for free users (PremiumNudgeCard)
- [ ] Tap it — verify paywall opens
- [ ] Dismiss paywall — verify return

### Bento Grid
- [ ] Verify BentoGrid layout renders
- [ ] Tap each grid item — verify navigation

### Home Onboarding Tooltips
- [ ] On first use, verify HomeOnboardingTooltips appear
- [ ] Tap through each tooltip — verify progression
- [ ] Verify tooltips dismiss properly

### Ambient Art Canvas
- [ ] Verify background art renders (AmbientArtCanvas with shaders)
- [ ] Verify performance — should not lag or drop frames
- [ ] Verify ember particle effects (EmberAtlas, GoldEmberField)

### Home Screen Scrolling
- [ ] Scroll the entire home screen top to bottom
- [ ] Verify no content is cut off at bottom
- [ ] Scroll back to top
- [ ] Pull to refresh (if implemented)
- [ ] Overscroll in both directions — verify rubber-band behavior

---

## PHASE 5: TODAY TAB — READING FLOW (Critical Path)

### Reading Screen
- [ ] Tap today's devotional — verify reading screen opens
- [ ] Verify the reading screen renders:
  - [ ] Devotional title
  - [ ] Scripture reference
  - [ ] Full devotional content (DevotionalContent / DevotionalWebView)
  - [ ] Section breaks and formatting
- [ ] Scroll through the entire devotional
- [ ] Verify text is readable and properly formatted

### Scripture Taps
- [ ] Tap on a scripture reference in the text
- [ ] Verify ScriptureTapSheet opens (bottom sheet)
- [ ] Verify the full scripture passage displays
- [ ] Verify tab bar hides when scripture sheet is open (instant mode)
- [ ] Dismiss the sheet — verify tab bar reappears

### Inline Reflection Journal
- [ ] Verify reflection prompts appear at appropriate points (InlineReflectionJournal)
- [ ] Tap a reflection prompt
- [ ] Type a response — verify text input works
- [ ] Verify the response saves
- [ ] Try submitting an empty response

### Study Method Sheet
- [ ] Look for study method button
- [ ] Tap it — verify StudyMethodSheet opens
- [ ] Verify study methods display (from bible-study-methods.ts)
- [ ] Select a method — verify it applies
- [ ] Dismiss the sheet

### Audio Player
- [ ] Look for the audio/listen button on the reading screen
- [ ] Tap it — verify audio begins playing (TTS)
- [ ] Verify AudioPlayerOverlay appears:
  - AudioPlayerPill (collapsed)
  - AudioPlayerSheet (expanded)
  - AudioPlayerBar
- [ ] Test audio controls:
  - [ ] Play/Pause
  - [ ] Skip forward/backward
  - [ ] Seek slider
  - [ ] Playback speed
- [ ] Verify AudioWaveform animation syncs with playback
- [ ] Minimize the player — verify pill shows above tab bar
- [ ] Expand the pill — verify full sheet opens
- [ ] Navigate to another tab — verify audio continues
- [ ] Return to reading — verify player state persists
- [ ] Stop audio — verify player dismisses cleanly

### Companion Orb
- [ ] Verify the CompanionOrb appears on the reading screen
- [ ] Tap the orb — verify it opens the Companion/Ask tab or chat
- [ ] Verify the orb animates (pulse, glow)

### Day Menu
- [ ] Navigate to day-menu screen
- [ ] Verify day-specific options appear
- [ ] Tap each option — verify navigation

### Highlights
- [ ] Navigate to highlights screen
- [ ] Verify highlighted passages display
- [ ] Tap a highlight — verify interaction

### Journal (from Today)
- [ ] Navigate to journal screen from Today tab
- [ ] Verify journal entry form appears
- [ ] Type a journal entry
- [ ] Verify it saves

### Journal Detail (from Today)
- [ ] Navigate to journal-detail screen
- [ ] Verify journal entry detail displays

### Evening Wind Down
- [ ] Navigate to evening-wind-down screen
- [ ] Verify evening reflection/examen flow renders
- [ ] Complete the wind-down flow
- [ ] Verify EveningCelebration plays on completion

### Wallpaper
- [ ] Navigate to wallpaper screen
- [ ] Verify wallpaper/share card renders
- [ ] Test download/share options

### Completion Celebration
- [ ] After completing a devotional reading, verify CompletionCelebration fires
- [ ] Verify animation renders (sparkles, confetti)
- [ ] Tap to dismiss — verify clean return

---

## PHASE 6: BIBLE TAB

### Bible Index
- [ ] Tap the Bible tab — verify Bible index renders
- [ ] Verify book list or book navigation appears (BookChapterNavigator)

### Book & Chapter Navigator
- [ ] Tap a book of the Bible — verify chapters list appears
- [ ] Tap a chapter — verify navigation to the reader
- [ ] Verify Old/New Testament division
- [ ] Scroll through all 66 books — verify all are present

### Bible Reader
- [ ] Verify the reader screen renders the selected chapter
- [ ] Scroll through the chapter — verify all verses display
- [ ] Verify verse numbers display correctly
- [ ] Verify red letter text for Jesus' words (red-letter-verses.ts)
- [ ] Verify section headings display (bible-section-headings.ts)
- [ ] Tap a verse — verify selection/highlight behavior
- [ ] Long-press a verse — verify context menu or action sheet
- [ ] Test multi-verse selection if supported

### Reading Settings Sheet
- [ ] Look for settings/gear icon on reader
- [ ] Tap it — verify ReadingSettingsSheet opens
- [ ] Test font size adjustment — verify text resizes in real-time
- [ ] Test font family selection (useReadingFont hook):
  - Source Serif Pro
  - EB Garamond
  - Lora
  - Crimson Text
  - Merriweather
- [ ] Verify each font renders correctly
- [ ] Test reading theme/background if available
- [ ] Dismiss settings — verify changes persist

### Download Bible Sheet
- [ ] Look for download button
- [ ] Tap it — verify DownloadBibleSheet opens
- [ ] Verify download options display
- [ ] Test download progress (if implemented)
- [ ] Dismiss the sheet

### Bible Search
- [ ] Navigate to the search screen within Bible tab
- [ ] Tap the search input — verify keyboard appears
- [ ] Type a search query (e.g., "love", "faith", "John 3:16")
- [ ] Verify search results render
- [ ] Tap a search result — verify navigation to the verse/chapter
- [ ] Test empty search — verify empty state
- [ ] Test no results — verify "no results" message
- [ ] Clear search — verify results clear

### Saved Passages
- [ ] Navigate to saved passages screen
- [ ] Verify saved/bookmarked passages display
- [ ] Tap a saved passage — verify navigation
- [ ] Test empty state (no saved passages)
- [ ] Swipe to delete a saved passage (if supported)

---

## PHASE 7: COMPANION TAB (AI Chat)

### Companion Index (Ask Tab)
- [ ] Tap the Companion tab — verify chat interface renders
- [ ] Verify CompanionEmptyState shows if no messages

### Companion Drawer
- [ ] Look for the drawer/menu icon
- [ ] Tap it — verify CompanionDrawer opens (left drawer, ChatGPT/Claude-style)
- [ ] Verify conversation list displays
- [ ] Tap a conversation — verify it loads
- [ ] Start a new conversation — verify new chat begins
- [ ] Swipe to dismiss drawer — verify clean dismissal

### Companion Input
- [ ] Tap the input area (CompanionInput)
- [ ] Type a message — verify text appears in input
- [ ] Tap send — verify message sends
- [ ] Verify UserMessageBubble renders your message
- [ ] Verify TypingIndicator appears while AI responds
- [ ] Verify StreamingCursor shows during streaming
- [ ] Verify CompanionMessageContent renders the AI response
- [ ] Verify RichMessageText formats scripture references, bold, italic

### Voice Input
- [ ] Look for the microphone button (VoiceInputBar)
- [ ] Tap it — verify voice input activates
- [ ] Speak a message — verify transcription
- [ ] Tap send — verify it sends the transcribed text

### Suggestion Chips
- [ ] Verify SuggestionChips appear (starter questions or follow-up suggestions)
- [ ] Tap each chip — verify it populates input or sends directly
- [ ] Verify chips disappear after use

### Companion Actions
- [ ] Look for action buttons (CompanionActions)
- [ ] Tap each action — verify it triggers the correct behavior

### Chat Scrolling & Messages
- [ ] Send multiple messages — verify chat scrolls
- [ ] Scroll up through history — verify old messages load
- [ ] Scroll back to bottom — verify snap behavior
- [ ] Verify message timestamps display
- [ ] Verify long messages render without truncation
- [ ] Test very long messages (500+ characters) — verify no layout break

### Companion Context
- [ ] Ask about today's devotional — verify the companion has context
- [ ] Ask about a specific scripture — verify it responds with relevant content
- [ ] Verify the companion can reference devotional history, reflections, and prayers

---

## PHASE 8: JOURNAL TAB

### Journal Index
- [ ] Tap the Journal tab — verify journal list renders
- [ ] Verify journal entries display as cards (NoteCard or SwipeableNoteCard)
- [ ] Scroll through entries

### Journal Entry Creation
- [ ] Tap "New Entry" or "+" button
- [ ] Verify entry screen opens (entry.tsx)
- [ ] Verify NoteEditor renders:
  - [ ] Title field
  - [ ] Body text area
  - [ ] Formatting options (if any)
- [ ] Type a title — verify text appears
- [ ] Type body content — verify text appears
- [ ] Add scripture reference:
  - [ ] Look for scripture attachment button (ScriptureRefPill)
  - [ ] Tap it — verify ScriptureSearchSheet opens
  - [ ] Search for a scripture — verify results
  - [ ] Select a scripture — verify it attaches to the entry
- [ ] Save the entry — verify it appears in the list
- [ ] Navigate back — verify entry persists

### Journal Entry Detail
- [ ] Tap an existing entry — verify note-detail.tsx or note.tsx opens
- [ ] Verify the full entry content displays
- [ ] Verify attached scriptures render as pills (ScriptureRefPill)
- [ ] Tap a scripture pill — verify it opens the scripture

### Swipeable Note Cards
- [ ] Swipe left on a note card — verify action buttons appear (delete, move, etc.)
- [ ] Swipe right on a note card — verify action (if different)
- [ ] Tap delete — verify confirmation
- [ ] Verify UndoToast appears after deletion

### Folders
- [ ] Look for folder organization
- [ ] Tap "Create Folder" — verify CreateFolderSheet opens
  - [ ] Enter folder name — verify creation
  - [ ] Dismiss without saving
- [ ] Verify FolderChips display at top
- [ ] Tap a folder chip — verify filtering
- [ ] Long-press a note — verify MoveFolderSheet opens
  - [ ] Select a folder — verify move
  - [ ] Dismiss the sheet

### My Responses
- [ ] Navigate to my-responses.tsx
- [ ] Verify devotional reflection responses display
- [ ] Scroll through responses
- [ ] Tap a response — verify detail view

---

## PHASE 9: YOU TAB (Profile/Settings)

The You tab is hidden from the tab bar but accessible via profile avatar.

### You Index
- [ ] Navigate to the You tab via profile avatar on home screen
- [ ] Verify profile screen renders:
  - [ ] ProfileAvatar component
  - [ ] User name
  - [ ] Streak display (StreakBox)
  - [ ] Premium status badge

### Your Journey
- [ ] Navigate to your-journey.tsx
- [ ] Verify journey timeline/progress displays
- [ ] Scroll through journey milestones

### Stats
- [ ] Navigate to stats.tsx
- [ ] Verify reading stats display:
  - [ ] Days active
  - [ ] Total readings
  - [ ] Current streak
  - [ ] Longest streak
  - [ ] Average reading time
- [ ] Verify charts/visualizations render

### Past Devotionals
- [ ] Navigate to past-devotionals.tsx
- [ ] Verify past devotional list renders
- [ ] Tap a past devotional — verify it opens for reading
- [ ] Scroll through all past devotionals
- [ ] Test empty state (new user)

### Saved Passages (You tab)
- [ ] Navigate to saved-passages.tsx
- [ ] Verify saved passages display
- [ ] Tap a passage — verify navigation
- [ ] Test empty state

### Saved (You tab)
- [ ] Navigate to saved.tsx
- [ ] Verify saved items display
- [ ] Tap a saved item — verify navigation

### My Content
- [ ] Navigate to my-content.tsx
- [ ] Verify user-generated content displays

### Series Detail
- [ ] Navigate to series-detail.tsx
- [ ] Verify series information displays
- [ ] Verify episodes/devotionals in series list
- [ ] Tap a devotional in series — verify navigation

### Settings
- [ ] Navigate to settings.tsx
- [ ] Test every setting:

#### Account Settings
- [ ] Verify account info displays
- [ ] Test sign-out flow
- [ ] Test DeleteAccountSheet:
  - [ ] Tap "Delete Account"
  - [ ] Verify DeleteAccountSheet opens
  - [ ] Verify confirmation required
  - [ ] Tap Cancel — verify dismissal
  - [ ] (Do NOT actually delete)

#### Notification Settings
- [ ] Verify notification toggles
- [ ] Toggle each notification type
- [ ] Navigate to checkin-schedule.tsx:
  - [ ] Verify check-in time picker
  - [ ] Change check-in time — verify it saves

#### Streak Settings
- [ ] Navigate to streak-settings.tsx
- [ ] Verify streak configuration options
- [ ] Change streak settings — verify they save

#### Appearance Settings
- [ ] Toggle dark/light mode (if manual toggle exists)
- [ ] Verify all screens update correctly in both modes
- [ ] Test reading font selection

#### Premium/Subscription
- [ ] Tap "Upgrade" or premium section
- [ ] Verify paywall opens (paywall.tsx)
- [ ] Verify subscription options display
- [ ] Test "Restore Purchases" flow
- [ ] Dismiss paywall

#### About / Legal
- [ ] Verify app version displays
- [ ] Verify links to terms, privacy policy

### Component Catalog (Debug)
- [ ] Navigate to component-catalog.tsx (if accessible)
- [ ] Verify all design system components render
- [ ] Scroll through the catalog

---

## PHASE 10: MODALS & FULL-SCREEN OVERLAYS

### Share Card
- [ ] Navigate to share-card.tsx (modal)
- [ ] Verify share card renders with devotional content
- [ ] Verify shareable quote selection (useShareableQuotes hook)
- [ ] Test share action — verify iOS share sheet appears
- [ ] Dismiss share card

### Paywall
- [ ] Navigate to paywall.tsx (modal, slide_from_bottom)
- [ ] Verify paywall renders:
  - [ ] Feature comparison
  - [ ] Pricing tiers
  - [ ] Subscribe button
  - [ ] Restore purchases link
- [ ] Tap subscribe (don't complete purchase)
- [ ] Dismiss paywall — verify clean return

### Premium Feature Sheet
- [ ] When tapping a premium feature as free user:
  - [ ] Verify PremiumFeatureSheet opens
  - [ ] Verify feature description
  - [ ] Tap "Upgrade" — verify paywall opens
  - [ ] Dismiss the sheet

### Check-In Sheet
- [ ] When check-in triggers, verify CheckInSheet opens
- [ ] Verify check-in questions render
- [ ] Answer check-in questions
- [ ] Submit — verify completion

### Unfolded Screen
- [ ] Navigate to unfolded.tsx (fullScreenModal, slide_from_bottom)
- [ ] Verify content renders on dark background (#0a0a0a)
- [ ] Test dismissal gesture

### Showcase Screen
- [ ] Navigate to showcase.tsx
- [ ] Verify showcase content renders

### Sample Devotional
- [ ] Navigate to sample-devotional.tsx
- [ ] Verify sample devotional renders for non-logged-in users

---

## PHASE 11: AUDIO SYSTEM (Deep Test)

### Audio Player Lifecycle
- [ ] Start audio from reading screen
- [ ] Verify player pill appears (AudioPlayerPill)
- [ ] Tap pill — verify expansion to sheet (AudioPlayerSheet)
- [ ] Verify AudioWaveform visualization
- [ ] Test controls in sheet:
  - [ ] Play/Pause
  - [ ] Seek bar
  - [ ] Speed control (1x, 1.25x, 1.5x, 2x)
  - [ ] Skip forward/backward
- [ ] Minimize sheet — verify pill persists
- [ ] Navigate to different tabs — verify audio continues
- [ ] Verify audio stops when navigating to new devotional

### Audio Edge Cases
- [ ] Start audio, kill the app, reopen — verify clean state
- [ ] Start audio, lose network — verify graceful error handling
- [ ] Double-tap play rapidly — verify no double playback
- [ ] Seek to very end — verify completion handling
- [ ] Switch between devotionals — verify old audio stops

---

## PHASE 12: GESTURES & ANIMATIONS

### Swipe Gestures
- [ ] On every screen, try swiping left — verify navigation back or no-op
- [ ] On every screen, try swiping right — verify behavior
- [ ] On card stacks, swipe up/down — verify card navigation
- [ ] On bottom sheets, swipe down — verify dismissal
- [ ] On bottom sheets, swipe to snap points — verify spring behavior

### Bottom Sheet Behavior
- [ ] For every bottom sheet (ScriptureTapSheet, ReadingSettingsSheet, etc.):
  - [ ] Verify it slides up smoothly
  - [ ] Verify drag handle is present and draggable
  - [ ] Drag to half position — verify snap point
  - [ ] Drag to top — verify full expansion
  - [ ] Drag down — verify dismissal
  - [ ] Tap backdrop — verify dismissal
  - [ ] Verify content scrolls within the sheet

### Animations
- [ ] Tab switching: verify spring scale animation on icons
- [ ] Tab indicator dot: verify fade in/out
- [ ] Streak celebration: verify StreakCelebration fires and animates
- [ ] SparkleBurst: verify particle effect renders
- [ ] ScatterTitle: verify title animation
- [ ] ShimmerText: verify shimmer effect
- [ ] TypewriterText: verify typewriter animation
- [ ] BridgeShimmer: verify shimmer on bridge card
- [ ] EmberParticles: verify ember particles render and move

---

## PHASE 13: EDGE CASES & STRESS TESTS

### Text Input Edge Cases
- [ ] In companion chat, type 1000+ characters — verify no crash
- [ ] In journal, paste a very large block of text
- [ ] Type special characters: emojis, RTL text, HTML tags, script tags
- [ ] Test keyboard show/hide rapidly
- [ ] Test KeyboardProvider behavior — verify input doesn't get hidden behind keyboard

### Network Issues
- [ ] Toggle airplane mode in simulator settings
- [ ] Try generating a devotional — verify error handling
- [ ] Try sending a companion message — verify error handling
- [ ] Try syncing — verify sync service handles offline gracefully
- [ ] Re-enable network — verify app recovers

### Memory & Performance
- [ ] Navigate through all screens in sequence without going back
- [ ] Open and close 20+ sheets
- [ ] Send 50+ companion messages — verify no lag
- [ ] Scroll very long devotionals — verify smooth scrolling
- [ ] Verify animations don't drop frames (ember particles, shimmers)

### Rapid Interactions
- [ ] Rapidly tap between all 4 visible tabs (30+ times)
- [ ] Double-tap devotional card — verify no double navigation
- [ ] Rapidly open/close companion drawer
- [ ] Rapidly open/close bottom sheets
- [ ] Tap send button multiple times rapidly — verify only one message sends

### App Lifecycle
- [ ] Press Home to background app — reopen — verify state preserved
- [ ] Receive a notification while in app — verify handling
- [ ] Background app during devotional generation — reopen — verify completion
- [ ] Background app during audio playback — verify audio continues

### Rotation
- [ ] Rotate to landscape — verify layout adapts
- [ ] Rotate back to portrait — verify restoration
- [ ] Read devotional in landscape — verify text reflows

---

## PHASE 14: DARK MODE TESTING

### Dark Mode Sweep
- [ ] Switch simulator to dark mode
- [ ] Visit EVERY screen and verify:
  - [ ] Background colors are appropriate (not white)
  - [ ] Text is readable (light on dark)
  - [ ] Cards and surfaces have proper contrast
  - [ ] Icons and illustrations are visible
  - [ ] No "light mode leaks" (white flashes, wrong backgrounds)
  - [ ] Audio player styling adapts
  - [ ] Tab bar styling adapts (dark blur tint)
  - [ ] Bottom sheets have dark backgrounds
  - [ ] Input fields are styled correctly
  - [ ] Scripture text is readable

### Screens to check in dark mode:
- [ ] Today home screen
- [ ] Reading screen
- [ ] Bible reader
- [ ] Companion chat
- [ ] Journal list and editor
- [ ] You/Profile screen
- [ ] Settings
- [ ] Paywall
- [ ] All bottom sheets
- [ ] All modals

---

## PHASE 15: PREMIUM GATING

### Free User Experience
- [ ] Verify which features are gated:
  - [ ] Premium reading fonts (EB Garamond, Lora, Crimson Text, Merriweather)
  - [ ] Advanced audio features
  - [ ] Additional companion features
  - [ ] Export/PDF features (pdf-export.ts)
- [ ] For each gated feature:
  - [ ] Tap it — verify PremiumFeatureSheet or PremiumNudgeCard appears
  - [ ] Verify the upgrade CTA works
  - [ ] Dismiss — verify clean return

### Premium User Experience (if testable)
- [ ] Verify premium features unlock correctly
- [ ] Verify premium badge displays
- [ ] Verify no premium nudges appear for premium users

---

## PHASE 16: SYNC & DATA INTEGRITY

### Cloud Sync
- [ ] Make changes (journal entry, reflection response, bookmark)
- [ ] Verify sync service triggers (syncService.start/stop based on auth)
- [ ] Verify data persists after app restart
- [ ] Verify MMKV storage works (mmkv-storage.ts)

### Data State
- [ ] Verify store migrations work (store-migration-v27, v28)
- [ ] Verify Zustand store (useUnfoldStore) loads correctly
- [ ] Verify companion chat store persists conversations

---

## PHASE 17: ERROR BOUNDARY

### Error Recovery
- [ ] Verify ErrorBoundary component exists and catches errors
- [ ] If possible, trigger an error — verify fallback UI renders
- [ ] Verify the app doesn't show a white screen on error
- [ ] Verify error is reported to Sentry (check Sentry integration)

---

## FINAL CHECKLIST

After completing all phases:
- [ ] Count total bugs found
- [ ] Categorize by severity (Critical, High, Medium, Low)
- [ ] Identify the 3 most critical issues
- [ ] Verify all tabs still function after extensive testing
- [ ] Take a final screenshot of each tab to confirm stable state
- [ ] Verify audio player is not stuck in any state
- [ ] Verify no zombie sheets/modals are stuck open
- [ ] Compile a full bug report

Report format for final summary:
```
TOTAL BUGS: [N]
CRITICAL: [N] — [list]
HIGH: [N] — [list]
MEDIUM: [N] — [list]
LOW: [N] — [list]

TOP 3 ISSUES:
1. [description]
2. [description]
3. [description]

SCREENS WITH NO ISSUES: [list]
SCREENS WITH ISSUES: [list with bug counts]

OVERALL APP HEALTH: [Excellent/Good/Fair/Poor]
RECOMMENDATION: [Ship/Fix Critical Issues First/Major Rework Needed]
```
