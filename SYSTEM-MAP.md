# Unfold E2E Audit — SYSTEM MAP (coverage ledger)

Build under audit: TestFlight **218** (ASC `53320626`) · Worktree: `/Users/galangster/clawd/work/unfold-audit` (branch `audit/e2e-build218-2026-06`) · Backend reference (read-only): `/Users/galangster/clawd/work/unfold/backend`
Synthesized 2026-06-09 from 13 mapper fragments in `/tmp/unfold-e2e-audit-2026-06/map/` (routes, today-tab, bible-tab, notebook-tab, you-tab, onboarding, devotional-engine, companion, paywall, notifications, widgets, storage, api-clients).

Conventions: routes live under `src/app/` (not `app/`). Deep-link scheme `unfold://` maps every file route (no allowlist). QA gate everywhere = `isQaToolsEnabled()` = `__DEV__ || EXPO_PUBLIC_ENABLE_QA_TOOLS === '1'` (set by eas profile `qa-testflight`, NOT by `production`). Risk-note references below use `fragment#N` = numbered risk note in that fragment file.

---

## 1. Route & surface inventory

Checkbox = covered by a completed walkthrough pass (all unchecked at synthesis time). **52 routes + 31 non-route surfaces = 83 rows.**

| # | Route / surface | Subsystem | States to verify | Done |
|---|---|---|---|---|
| 1 | `/` (index — Welcome/launch gate) | routes/onboarding | New-user animated welcome (phase machine); completed-user blank-bg redirect disposition `skip`/`wait`(≤4s, 150ms retry)/`redirect`; pending-notification suppression | [ ] |
| 2 | `/how-it-works` | onboarding | Feature carousel; both CTAs `replace('/onboarding')`; also module-imported by index | [ ] |
| 3 | `/onboarding` (`?startAt=&flow=`) | onboarding | 32-step machine: cinematic (tap-gated `screenReady`), text/multiline (+chips, voice input), multiSelect (caps), choice auto-advance, adaptive-question loading/fallback, mirrorBack loading/AI/local-fallback, featureSummary+companion naming, devotionalSegue (pending/ready/issue submit-poll-failed-timeout-invalid/409-recovery), readDevotional (spinner/12s-recovery/content), celebration, commitment1/2, threeStepPaywall (see #82), purchaseConfirmation, themeType/studySubject/currentSituation/spiritualSeeking/readingDuration/devotionalLength/reminderTime; returning-user step filtering; `startAt` resume; dev step picker | [ ] |
| 4 | `/generating` | devotional-engine | Submitting; polling (pending/processing, 10-min cap); reconnecting (MMKV `inflight-generation-job` resume); transient-network retry; failed+retry (`retryJob`, gesture re-enabled); 409 recovery; complete → Today or reading; cancel; notification pre-prompt (unknown/granted/6s prompt/enable/dismiss) | [ ] |
| 5 | `/paywall` (`?source=`) | paywall | Loading offerings; loaded (yearly default/monthly toggle, savings badge, per-month derivation); trial-eligible vs not CTA; purchasing/restoring overlay (close disabled ≤60s); 7 distinct error copies; cancel → ExclusiveOfferSheet (one-shot); success nav matrix (back vs replace Today vs replace /generating); offline; restore; footer links; `source` param latent (no caller passes it) | [ ] |
| 6 | `/reveal` (params devotionalId/dayNumber/dayTitle/seriesTitle/totalDays) | devotional-engine/notifications | Reveal animation; `markDayAsRevealed`; sets resumeContext (15s window); replace → reading; arbitrary/invalid params via deep link | [ ] |
| 7 | `/unfolded` (fullScreenModal) | you-tab | 8 auto-advancing recap pages; share; dismiss + back fallback; NOTE: only entry point is dead code (`{false && …}` in You index) | [ ] |
| 8 | `/share-card` (modal; params text/reference/translation/type) | you-tab/bible | Quote vs verse image export; premium-locked styles → `/paywall`; share sheet | [ ] |
| 9 | `/streak-settings` | devotional-engine | Streak display, freezes (premium-gated, raw `isPremium` read), weekend amnesty settings | [ ] |
| 10 | `/welcome-celebration` | onboarding | Celebration → `replace('/generating')`; only inbound edge today = debug-light-mode | [ ] |
| 11 | `/sample-devotional` | routes | **Orphan route** (no inbound edges); template picked by aboutMe keywords | [ ] |
| 12 | `/showcase` (web) | routes | Component showcase at `http://localhost:8081/showcase`; `e2e/showcase.spec.ts` | [ ] |
| 13 | `/+html` (web only) | routes | Web root HTML shell | [ ] |
| 14 | `/__dev__/unfold-editor-test` (`?autoFuzz&caseId&limit`) | notebook | QA-gated native-editor parity + fuzz harness | [ ] |
| 15 | `/debug-light-mode` | QA | Theme preview gallery + link to welcome-celebration; QA-gated | [ ] |
| 16 | `/debug-premium` (`?mode=grant\|clear`) | QA/paywall | Sets session `qaPremiumOverride`, clears `debugForceTrialExpired`, forces `revenueCatResolved`; redirect when QA off | [ ] |
| 17 | `/debug-reset-beginning` | QA/storage | Full wipe (store reset + 6 MMKV keys + reminders + UI-state) → `/`; redirect when QA off | [ ] |
| 18 | `/debug-seed-bible` (`?theme&accent`) | QA/bible | Seeds reader settings + John 1:1-2 yellow highlight → reader | [ ] |
| 19 | `/debug-seed-library-targets` (`?target=`) | QA/you-tab | Seeds My Library target content | [ ] |
| 20 | `/debug-seed-notification-tap` | QA/notifications | Seeds devotional + QA premium + schedules real-payload devotional_ready at +2s; scheduling/scheduled/not-scheduled/setup-failed states | [ ] |
| 21 | `/debug-seed-reveal` | QA | Seeds devotional → replaces to `/reveal` | [ ] |
| 22 | `/debug-seed-today` (`?state&theme&themeMode&accent&accentTheme`) | QA/today | 19 seedable Today states (see §4); wipes store wholesale | [ ] |
| 23 | `/(tabs)/(today)` (Home) | today-tab | Hero states ×8: `empty` (first-time vs returning variants), `premium-paused`, `journey-complete`, `preparing` (5% floor progressbar), `tomorrow-locked` (teaser), `complete-today` (reflectionStatus empty/started/complete), `reveal-ready` (+overdue variant), `unread` (Overdue/Today/Tomorrow label; streak-laddered CTA). Whole-screen: revealTransitioning RippleLoader; resumeContext auto-push (<15s); inflight-job replace→/generating. Card stack ×8 kinds (resume 500/evening 400/midday 300/bridge 200/bridge-loading 100/remember-this 80/day1-review 70/premium-nudge 50; ≤2 back silhouettes; swipe + X dismiss). Ambient GoldEmberField (streak tiers 8/12/16/22/28; suppressed by reduce-motion/low-power/background/blur). Sheets: CheckInSheet, PremiumFeatureSheet×2, ExclusiveOfferSheet, StreakCelebration, tooltips, "Start a new series?" Alert. 60s clock tick windows (midday 12:00–16:59, evening 17:00–23:29) | [ ] |
| 24 | `/(tabs)/(today)/reading` (params devotionalId?/dayNumber?/highlightId?/bookmarkId?) | devotional-engine | Loading; ready; `awaiting-canonical-recovery` (auto recoverSyncedDay ladder: pull→find-completed→submit→409); `isCheckingForSyncedDay`; `isHydratingMissingDevotional`; retryError+manual retry; offline (`isWaitingForConnection`, auto-retry countdown); isGeneratingMore (legacy batch); isPreparingNextDay; completion (`handleComplete`: markDayAsRead→sync push→advanceDay→celebration day/series→refreshDailyReminder→recordStreakRead→syncWidgets→review prompt); audio TTS (not-started/generating/downloading/playing/failed); scroll-to highlight/bookmark + flash; premium sheets; day-selector capped by `getSelectableDayLimit` | [ ] |
| 25 | `/(tabs)/(today)/journal` (reflection editor; shared body of `(journal)/entry`) | today/notebook | Modes freewrite/SOAP/prayer/question-responses; Go Deeper (idle/loading/error/3 prompts persisted); creation gate; keyboard-aware scroll; **no fragment fully maps this 1702-LOC screen — coverage gap** | [ ] |
| 26 | `/(tabs)/(today)/journal-detail` (`?entryId`) | today-tab | Entry viewer; reached from my-responses + my-content | [ ] |
| 27 | `/(tabs)/(today)/highlights` | today-tab | Highlights list → reading | [ ] |
| 28 | `/(tabs)/(today)/my-content` (alias of (you)/my-content) | you-tab | Same component, Today back-stack; `from:'home'` param behavior | [ ] |
| 29 | `/(tabs)/(today)/past-devotionals` (alias) | you-tab | Same component, Today back-stack | [ ] |
| 30 | `/(tabs)/(today)/series-detail` (alias) | you-tab | Same component, Today back-stack | [ ] |
| 31 | `/(tabs)/(today)/evening-wind-down` (params devotionalId?/dayNumber?) | notifications/api-clients | Examen query loading/error(+refetch)/5-movement success; evening-scripture query loading/loaded; entry via card or notification tap; premium gate | [ ] |
| 32 | `/(tabs)/(today)/wallpaper` (modal; quote/dayNumber/dayTitle) | today-tab | Wallpaper styles; premium-locked styles + bottom upsell | [ ] |
| 33 | `/(tabs)/(today)/day-menu` (formSheet, detents 0.5/0.85) | today-tab | Day picker grid; selectable-day limit (tomorrow-lock pin); grabber/detent behavior | [ ] |
| 34 | `/(tabs)/(bible)` (Bible home) | bible-tab | DB not-ready (idle/downloading %/error); ready first-mount auto-`replace` → reader (blank frame); revisit: search bar, Continue-reading card, OT/NT category grid; chapter-grid modal (multi-chapter books) | [ ] |
| 35 | `/(tabs)/(bible)/reader` (`?bookId&chapter&verse?`) | bible-tab | DB not-ready inline; loading; loaded (section headings, red-letter, highlight overlays — dark mode = colored text, note dots, end ornament); empty verses (silent); end-of-chapter/cross-book/end-of-Bible prompts; verse selection (tab bar→context bar instant; actions Explain/Highlight/Note/Share; color picker w/ premium locks + remove chip; note composer 500-char + keyboard lift); flash-verse; toast; chapter swipe (drag/edge arrows/rubber-band at Gen 1/Rev 22/commit thresholds); sheets: settings/navigator/note/explain/premium/download | [ ] |
| 36 | `/(tabs)/(bible)/search` | bible-tab | Empty hint; searching spinner (≥2 chars only); no-results; results (FlashList → reader w/ verse); DB-not-ready shows "No results" (no download prompt); hook error never rendered | [ ] |
| 37 | `/(tabs)/(ask)` (Companion chat) | companion | Empty state (greeting + 4 cold-start cards; devotional-aware variants unreachable); streaming (pre-token typing indicator/token flow 32ms/stop→complete-or-error); thinking state (dead UI); fallback progressive reveal; complete (rich text, verse pills, DevotionalCards, actions row, suggestion chips); per-message error ("Tap to retry" — no handler); screen error banner; free-tier counter ("N of 5") + limit-reached strip; churned gate; voice input; stale-conv auto-archive >24h | [ ] |
| 38 | `/(tabs)/(journal)` (Journal hub) | notebook | Segments Reflections/Notebook (local state, swipe-between); search (filters both); Reflections: Today's card REFLECT/CONTINUE/COMPLETED, Go Deeper row, YOUR DEVOTIONALS ×4 + View All, empty state; Notebook: folder chips (All/+/drill-in/breadcrumbs/long-press menu), notes list, 4 empty variants, FAB scroll behavior, UndoToast (single slot, 3s/4s); sheets create/move folder, ExclusiveOffer; gating create/rename (delete NOT gated) | [ ] |
| 39 | `/(tabs)/(journal)/entry` (re-export of (today)/journal) | notebook | Same as #25 in Journal back-stack; internal nav replace special-case on this pathname | [ ] |
| 40 | `/(tabs)/(journal)/note` | notebook | Redirect shim → note-detail + `startEditing:'true'`, forwards params | [ ] |
| 41 | `/(tabs)/(journal)/note-detail` (11 params) | notebook | Read vs edit (premium-only edit); save states idle/saving/saved (800ms debounce + explicit); platform fork iOS native UnfoldEditor vs Android tentap (CSS-injection fallback, white-flash overlay); not-found; empty-new-note silent discard; more-menu (favorite/folder/move/delete 2-tap); minimize-to-Bible → NoteDraftDock; scripture sheet/pills; legacy markdown migration | [ ] |
| 42 | `/(tabs)/(journal)/my-responses` | notebook | Empty / list (clamped preview + Read more) → (today)/journal-detail | [ ] |
| 43 | `/(tabs)/(you)` (You/Settings; hidden tab) | you-tab | Entry only via Today avatar; profile header (avatar edit, inline name edit); premium granted/denied/unknown displays (unknown rendered as denied here); menu counts; Preferences (theme/accent w/ premium locks/font/text size); Reminders (daily toggle ON/OFF asymmetry, time presets, midday/evening rows → schedule or paywall); Writing Style accordions; Support (manage sub/bug report 6-state ladder/rate/legal); QA Tools block; Reset-all-data double-confirm; hardcoded "Version 1.0.0" footer | [ ] |
| 44 | `/(tabs)/(you)/past-devotionals` (`?from`) | you-tab | Global empty; tab-empty/search-empty; In Progress/Completed segments; overscroll search reveal (y<-50); per-card PDF export idle/exporting/success (premium → paywall); swipe-to-delete + confirm (cascades cleanup) | [ ] |
| 45 | `/(tabs)/(you)/my-content` (`?tab&type&source&from`) | you-tab | Journal/Highlights/Bookmarks tabs; per-tab empty; filter chips w/ counts; search; param re-sync on focus; nav out to reading (highlightId) / bible reader (openNote params — dead on arrival, bible#1) | [ ] |
| 46 | `/(tabs)/(you)/series-detail` (`?id&from`) | you-tab | Not-found header; progress + day rows; day tap **sets current devotional** (side effect) → reading | [ ] |
| 47 | `/(tabs)/(you)/stats` (`?theme`) | you-tab | **Orphan route**; streak hero, counters; theme filter via self-replace | [ ] |
| 48 | `/(tabs)/(you)/checkin-schedule` (`?type=midday\|evening`) | notifications | `unknown`→neutral shell; `denied`→upsell→paywall; `granted`→editor (uniform time / customize-by-day w/ skip(null) / all-skipped); Save commits store only; unsaved discard on back | [ ] |
| 49 | `/(tabs)/(you)/saved-passages` | you-tab | **Orphan route**; bookmarks list + inline delete | [ ] |
| 50 | `/(tabs)/(you)/saved` | you-tab | Redirect → `my-content?tab=highlights` (string-with-query href) | [ ] |
| 51 | `/(tabs)/(you)/your-journey` | you-tab | Redirect → past-devotionals | [ ] |
| 52 | `/(tabs)/(you)/component-catalog` | you-tab | **Orphan route**, NOT QA-gated itself; design-system gallery | [ ] |
| 53 | UnfoldStreak widget (systemSmall + accessoryCircular) | widgets | Normal/not-read-today/no-devotional defaults/nil-props placeholder/**RedBox "No layout found"** (App Group missing)/stale post-midnight; lock-screen tint | [ ] |
| 54 | UnfoldToday widget (systemMedium) | widgets | Normal; empty-field hiding; nil-props/RedBox; stale | [ ] |
| 55 | UnfoldDashboard widget (systemLarge) | widgets | Verse→quote→nothing fallback ladder; weekly M-Su row (current devotional only); footer Next:; nil-props/RedBox | [ ] |
| 56 | UnfoldReadingSession Live Activity (lock screen + Dynamic Island) | widgets | Active listening (only path that starts it); frozen 0m/0% (update never called); never ended (end never called); simulator/iOS<16.2/disabled/error-latch states | [ ] |
| 57 | Daily reminder notification (`unfold-daily-reminder`, DAILY) | notifications | Content branches (no-devotional×2/overdue/quotable/scripture/fallback/preparing); payload staleness; tap → `/reveal` path | [ ] |
| 58 | Midday check-in notifications (`unfold-midday-checkin[-mon..sun]`) | notifications | Uniform DAILY vs per-day WEEKLY; skip days; same-message-every-fire; tap → Today | [ ] |
| 59 | Evening wind-down notifications (`unfold-evening-winddown[-mon..sun]`) | notifications | Same as midday; tap → evening-wind-down | [ ] |
| 60 | Trial-ending notification (`unfold-trial-ending`) | paywall/notifications | Scheduled at trial-expiry−2d; cancel on non-trial/expired/parse-fail/no-permission; tap has NO route (ignored_invalid) | [ ] |
| 61 | devotional_ready remote push (backend) | notifications | Cold-start hydrate (future-date guard)/warm tap/AppState-resume rehydrate; dedupe; → `/reveal`; stagger offset 0–300min server-side | [ ] |
| 62 | CheckInSheet (Today midday) | today-tab | Open/complete (`addCheckIn` midday)/dismiss | [ ] |
| 63 | PremiumFeatureSheet (features voice/series/theme/font/wallpaper/highlight/streak/audio/checkin/length/companion/general) | paywall | Per-feature copy; CTA → `/paywall`; wrong copy reuse for Bible fonts (bible#15) | [ ] |
| 64 | ExclusiveOfferSheet (contexts onboarding 50% / churned 25%) | paywall | Loading price; offeringFailed → fallback link → /paywall; purchasing; error; restore; one-shot MMKV flags; churned context disabled in 218 (env flag unset) | [ ] |
| 65 | ScriptureExplainSheet | api-clients | idle/loading/success (4 fields)/per-code errors (INVALID_INPUT hides retry); MMKV cache instant repeats | [ ] |
| 66 | ScriptureTapSheet | api-clients/bible | Local SQLite → bible-api.com fallback; cache-hit/fetching/timeout/not-found; Explain; Open in Bible | [ ] |
| 67 | BookChapterNavigator (full-screen overlay in reader) | bible-tab | books→chapters→verses modes; step tabs; search (reference parse/autocomplete/FTS5 fallback — drops verse); single-chapter skip; close resets | [ ] |
| 68 | ReadingSettingsSheet (`bible-reader-preferences-sheet`) | bible-tab | Theme/brightness/font size/reading font (premium)/line height/translation BSB-KJV/saved-highlights row | [ ] |
| 69 | BibleNoteSheet | bible-tab | View/edit/delete (delete keeps highlight if colored); drag-dismiss 80px | [ ] |
| 70 | DownloadBibleSheet (home + reader) | bible-tab | idle/downloading %/error+retry; "~14 MB" copy mismatch; NaN progress if no Content-Length | [ ] |
| 71 | ScriptureSearchSheet (notebook) | notebook | idle/searching(500ms debounce)/found/not-found/error; quick-tap pills | [ ] |
| 72 | CreateFolderSheet | notebook | Name input, 6 colors, parent-folder context | [ ] |
| 73 | MoveFolderSheet | notebook | Picker w/ Unfiled; drag-reorder; per-row delete (twin path); subfolder nav | [ ] |
| 74 | CompanionDrawer | companion | Closed/open; empty; Starred/Today/This Week/Earlier sections; long-press ActionSheetIOS (iOS-only); rename Alert.prompt; delete; selection archives current | [ ] |
| 75 | NoteDraftDock (global pill, (tabs)/_layout) | notebook | Hidden/visible; restore → note-detail startEditing; in-memory only (lost on kill); shifts with tab bar | [ ] |
| 76 | AudioPlayerOverlay (global, root layout) | today/reading | Pill/sheet tiers; suppressed on (ask) + while keyboard up; tab-switch collapse; **no dedicated fragment — coverage gap** | [ ] |
| 77 | UndoToast (journal hub) | notebook | Note-delete 3s / folder-delete 4s; single slot overwrite | [ ] |
| 78 | StreakCelebration (Today overlay) | today-tab | Fires once on hasReadToday false→true | [ ] |
| 79 | CompletionCelebration (reading overlay) | devotional-engine | Day vs series variants; GoldEmberField streakLevel 7 | [ ] |
| 80 | HomeOnboardingTooltips | today-tab | 3 measured rects; replay via QA flag flip + remount | [ ] |
| 81 | VoiceInputBar (onboarding text steps + companion input) | companion | STT waveform/autoStart; result fills input (not auto-sent) | [ ] |
| 82 | ThreeStepPaywall (embedded onboarding step) | paywall | Page0 video (1700ms latch, poster, reduced-motion instant); page1 trial timeline (only if latched hasFreeTrial); pricing page; purchase error inline; cancel → offer sheet; no-package silent no-op; QA-only skip; restore/links | [ ] |
| 83 | Custom tab bar ((tabs)/_layout) | routes | Blur; hide/slide vs instant modes; tab re-press pop-to-root; (you) skipped; NoteDraftDock host; audio sheet→pill auto-collapse; only 4 testIDs `bottom-tab-*` | [ ] |

---

## 2. Navigation graph (edge list)

### Launch / onboarding
- `/` → `replace /(tabs)/(today)` (completed user, after notification disposition) | `replace /onboarding` (new user)
- `/how-it-works` → `replace /onboarding` (×2)
- `/onboarding` → `replace /generating` (completion) | back (header X, step 0 + completed only) | ExclusiveOfferSheet → `push /paywall`
- `/welcome-celebration` → `replace /generating`
- `/generating` → `replace /(tabs)/(today)` | `replace /(tabs)/(today)/reading` | `replace /onboarding` (error restart)

### Today tab
- `(today)/index` → push `reading` (×5: hero/resume/remember-this w/ highlightId), `journal` (×2), `/reveal` (×2 incl. QA preview), `evening-wind-down` (×2), `past-devotionals` + `my-content` (BentoGrid, `from:'home'`), `/streak-settings` (StreakBox), `/(tabs)/(you)` (avatar), `/(tabs)/(bible)` (premium-paused), `/onboarding?startAt=themeType&flow=newSeries` (create), `/paywall` (creation gate); `replace /generating` (inflight resume + RecommendedSeriesCard)
- `reading` → `journal`, `(journal)/entry`, `day-menu` (formSheet), `my-content` (×2), `/share-card`, home; `day-menu`/`highlights`/`journal` → `reading`
- `journal` → reading, `replace (journal)` hub (pathname special case)
- `/reveal` → `replace reading` (buildReadingRouteFromRevealParams)

### Bible tab
- `(bible)/index` → reader (`replace` auto-nav on first mount; `push` from picks/continue card), `push search`
- `search` result → `push reader?verse=`
- `reader` → `reader` (chapter swipe/navigator/next-chapter via `setParams`, no stack growth), `push /share-card`, ReadingSettingsSheet → `push (you)/my-content?tab=highlights&source=bible&from=bible`
- Inbound to reader: my-content rows (`bookId/chapter/verse` + dead `openNote/noteId`), ScriptureTapSheet, notebook ScriptureRefPill, `/debug-seed-bible`

### Journal tab
- `(journal)/index` → `note-detail` (note tap/FAB/empty CTA, `folderId`), `entry` (Today card/Go Deeper), `(you)/past-devotionals`, `(you)/series-detail?from=journal`; native Share (swipe)
- `note` → Redirect `note-detail&startEditing=true`
- `note-detail` → `(bible)/reader` (pill), `replace /(tabs)/(bible)` (minimize → NoteDraftDock), `/paywall` (gate), back → hub
- `my-responses` → `(today)/journal-detail?entryId=`
- NoteDraftDock (any tab) → `note-detail?noteId&startEditing=true`

### Companion tab
- Inbound: tab bar only (no pushes/notifications/deep links into `(ask)`)
- `DevotionalCard` chip → `(today)/reading` | `(today)/journal`; ScriptureTapSheet → `(bible)/reader`; creation gate → `/paywall`

### You tab
- Inbound: Today avatar (only production entry); journal hub → past-devotionals/series-detail; bible reader → my-content; QA redirects land here
- `(you)/index` → past-devotionals, my-content, checkin-schedule (×2), `/paywall` (×5), `/streak-settings`, `/unfolded` (dead code), `/reveal` (×2 QA), `/debug-*`, external Linking (subscriptions/review/privacy/terms), reset-data → `replace /`
- `past-devotionals` → series-detail (stack variant by `from`), `/paywall`; `series-detail` → reading (sets current devotional); `my-content` → reading, bible reader, journal-detail, journal
- `useCrossTabBack`: `from=home|journal|bible` intercepts beforeRemove → `router.navigate` back to source tab

### Modals / sheets → paywall
- `share-card` → `/paywall`; PremiumFeatureSheet → `/paywall`; ExclusiveOfferSheet fallback → `/paywall`; useCreationGate (denied) → `/paywall` (Today/Journal/note-detail/Ask/journal Go-Deeper/evening-wind-down)

### Notification taps (coordinator `router.replace`)
- `devotional_ready` (remote push or daily-reminder local payload) → `/reveal` → reading
- `midday-checkin|midday_checkin` → `/(tabs)/(today)`
- `evening-winddown|evening_winddown` → `/(tabs)/(today)/evening-wind-down`
- `trial-ending` → no mapping (`ignored_invalid`; app opens at last state)
- Paths: cold start (`getLastNotificationResponseAsync`, future-date guard, always clears), warm (response listener), resume (AppState re-hydrate, deduped); flush gated on `pathname && rootNavigationState.key`; `/` redirect disposition defers to pending notification nav

### Widget taps
- **None mapped** — no `widgetURL`/Link/AppIntent in any widget or Live Activity; all taps = plain `unfold://` app open → launch gate (`/`)

### URL scheme (deep links)
- `unfold://<any-file-route>` resolves via expo-router default mapping — every route above (incl. all `debug-*` seeds, `/paywall`, `/reveal` with arbitrary params, `/generating`) is externally reachable; no allowlist or param validation layer
- Companion in-chat `[[deep_link:{json}]]` (types reading/journal/prayer) → in-app cards, not OS links

---

## 3. Data-dependency matrix

| Subsystem | Zustand stores | Storage (layer: keys) | react-query keys | API endpoints |
|---|---|---|---|---|
| routes / root layout | `useUnfoldStore`, `useUIState`, `useAudioPlayerState`, `useNoteDraftDock` | MMKV `unfold-storage` | global client (staleTime 5m, retry 2) | push-token + notification-preferences on mount |
| today-tab | `useUnfoldStore` (devotionals, resumeContext, checkIns, dismissed-date quartet, nudges, streak, hasSeenDay1Review/Tooltips), `useUIState` (revealTransitioning, qaPremiumOverride, debugForceTrialExpired, revenueCatResolved, tab bar) | MMKV: `inflight-generation-job`, `@unfold_exclusive_offer_seen`; bridge cache `bridge_{dev}_{day}_{date}` (own encrypted instance) | `['bridge', devotionalId, dayNumber, input]` (1h, retry 1, premium-enabled) | `POST /api/jobs/generate-day`, `GET /api/jobs/:jobId`, `POST /api/jobs/:id/retry`, `GET /api/jobs/find-completed`, `POST /api/generate-bridge`, `POST /api/sync/pull` (focus), `GET /api/recommendations/next-series` |
| bible-tab | `useUnfoldStore` (bibleReaderSettings, bibleHighlights, bibleReadingHistory, readerBrightness, themeMode, readingFont), `useUIState` (tab bar) | MMKV `unfold-bible-meta` (unencrypted: status/version/size/error); MMKV `unfold-verse-cache` (encrypted, infinite TTL); SQLite `documentDirectory/SQLite/unfold-bible-v1.db` | `['bible-chapter', bookId, chapter, translation]` (Infinity/10m), `['bible-search', q, translation, limit]` (5m) | `GET /public/unfold-bible-v1.db`, `GET bible-api.com/{ref}` (3rd party), `POST /api/generate-commentary`, `POST /api/scripture/explain` |
| notebook-tab | `useUnfoldStore` (notes, folders, journalEntries, devotionals), `useUIState`, `useNoteDraftDock` (in-memory) | MMKV `@unfold_exclusive_offer_seen`; store v37 blob (notes/folders NOT in rehydrate validity check) | none | scripture fetch fallback (bible-api.com), `POST /api/generate/go-deeper` (shared reflection screen) |
| you-tab | `useUnfoldStore` (user/all settings, userUpdatedAt, devotionals, bookmarks, highlights+bibleHighlights, checkIns, streak, middayCheckIn*/eveningWindDown*), `useUIState`, `useCompanionChatStore` (clear on reset) | MMKV: `unfold-storage`, `@unfold_*offer_seen` ×2, `inflight-generation-job` (reset gaps); FileSystem: profile picture (filename persisted) | none | `POST /api/sync/push` (profile, debounced 1s on userUpdatedAt), `POST /api/bug-report/email`; RevenueCat SDK |
| onboarding | `useUnfoldStore` (`setUser` at completion; `addDevotional`+`markDayAsRead` mid-flow) | MMKV `@unfold_onboarding_offer_seen` | `['revenuecat','offerings']`, `['revenuecat','trial-eligibility', yearlyProductId]` (Infinity) | `POST /api/jobs/generate-day` (jobType onboarding), `GET /api/jobs/:id`, `POST /api/jobs/:id/retry`, `GET /api/jobs/find-completed`, `POST /api/generate/adaptive-question` (optionalAuth) |
| devotional-engine | `useUnfoldStore` v37 (devotionals/days/seriesArc/progressiveMemory/currentDay/totalDays/streak*/resumeContext/generationSession) | MMKV: `inflight-generation-job` (key duplicated 2 files), `active-dynamic-example`, `generation-migration` flag | `['bridge', …]` (polling/sync NOT react-query) | `/api/jobs/*` (4), `/api/sync/pull` (always `lastPulledAt:null`), `/api/sync/push` (read completion), legacy `/api/generate/devotional` (+extract-quotes), `/api/jobs/migrate-{arc,memory,scriptures,personas}` |
| companion | `useCompanionChatStore` (persist v5), `useUnfoldStore` (name, companionName, currentDevotional, streak) | MMKV: `unfold-companion-chat`, `@unfold_companion_daily`, `@unfold_exclusive_offer_seen`, `@unfold_rate_limits_companion` (dead path) | none | `POST /api/companion/chat` (SSE + stream:false fallback), `POST /api/companion/title`, `POST /api/companion-feedback` |
| paywall / premium | `useUnfoldStore` (`user.isPremium` cache), `useUIState` (revenueCatResolved, debugForceTrialExpired, qaPremiumOverride) | MMKV: offer-seen flags ×2, `unfold-trial-notification` instance, `@unfold_companion_daily`; file `unfold-paywall-diagnostics.jsonl` (QA) | `['revenuecat','offerings']` (10m prefetch), `['revenuecat','trialEligibility']`, `['revenuecat','trial-eligibility', id]` (two spellings!), invalidate root `['revenuecat']` | RevenueCat SDK (entitlement `Unfold Premium`, packages `$rc_monthly`/`$rc_annual`, offering `winback`); backend `sync_users.is_premium` server-managed but **no writer** |
| notifications | `useUnfoldStore` (reminderTime 12h, check-in times 24h + byDay, hasCompletedOnboarding, devotional fields for copy) | MMKV `unfold-trial-notification`; OS queue ids: daily ×1, check-ins ×14, trial ×1 | `['examen', …]` (Infinity), `['evening-scripture', ref]` (Infinity) — tap destinations | `POST /api/users/push-token` (random stagger 0–300min assigned server-side), `POST /api/users/notification-preferences`; backend expo-server-sdk push |
| widgets | `useUnfoldStore` (streak*, readingDuration, current devotional days) — read-only snapshot | App-Group `UserDefaults(group.com.unfoldapp.ios)` `__expo_widgets_*` keys — **entitlement stripped from both targets** | none | none (fully decoupled; freshness = last `syncWidgets()`) |
| storage (cross-cut) | all four stores; main store **no partialize**, v37 migrations; chat v5; audio-player **unversioned** | SecureStore `unfold-mmkv-encryption-key`; MMKV `unfold-store-v2` (+ legacy v1/AsyncStorage migration); 6 dedicated MMKV instances; AsyncStorage `unfold-bug-log-v1` (plaintext); TTS LRU in `Paths.cache` (500MB/100 files) | n/a | `/api/sync/push|pull`, `/api/bug-report/email` |
| api-clients | `useUnfoldStore` (payload source), `useCompanionChatStore` | MMKV: `unfold-device-id` (the auth credential), `@unfold_rate_limits_<9 endpoints>` (fail-open), AI caches (verse/explain/examen/bridge — infinite or date TTL) | `['bridge']`, `['examen']`, `['evening-scripture']`, `['revenuecat',…]` | Full map in api-clients.md §3: jobs ×4 + migrate ×4, companion ×3, sync ×2, tts ×3 (2 unauthenticated), stories, prompt-generations, users ×2, recommendations, scripture/explain, generate/* ×6, bug-report, bible DB static, bible-api.com |

Shared invariants: single origin `PRIMARY_BACKEND_URL` (`EXPO_PUBLIC_BACKEND_URL` || `https://api.unfoldapp.co`); anonymous auth = `X-Device-ID` header from MMKV (not Keychain — dies on reinstall); no shared HTTP client (≥4 fetchWithTimeout variants); RevenueCat app user id `anon_<deviceId>`.

---

## 4. QA hooks

Master gate: `isQaToolsEnabled()` (`src/lib/qa-tools.ts`) = `__DEV__ || EXPO_PUBLIC_ENABLE_QA_TOOLS === '1'`. The env flag is **build-time** — eas.json profile `qa-testflight` sets it `"1"` with `distribution: store`; `production` does not. **Determine which profile cut build 218 before anything else** (governs whether every hook below is live in the TF binary, reachable externally via `unfold://`). Disabled state: debug routes render `<Redirect href="/(tabs)/(you)" />`.

### Seed routes (exact invocations — usable as `unfold://<path>` deep links or in-app router pushes)
| Invocation | Effect |
|---|---|
| `unfold://debug-seed-today?state=<S>&theme=dark\|light\|system&accent=gold\|ocean\|rose\|forest\|lavender\|ember\|slate` | Wipes store wholesale, seeds state, `replace /(tabs)/(today)`. 19 states `S`: `unread`(=ready, default), `overdue`(=catch-up), `reveal-ready`, `preparing`, `complete-today`(=completed), `tomorrow-locked`, `journey-complete`, `first-time-empty`, `empty`(=returning-user), `day1-review`, `resume-reading`, `resume-journal`, `midday`, `evening`, `bridge`, `bridge-loading`, `remember-this`, `premium-nudge`, `phase4-stack` (multi-card). Sets QA marker `aboutMe='Seeded Today-screen runtime QA profile.'`; context slots ride `currentSituation`; sets `qaPremiumOverride` for midday/evening/bridge; `setRevenueCatResolved()` |
| `unfold://debug-seed-bible?theme=&accent=` | Seeds reader settings + yellow John 1:1-2 highlight → reader John 1 |
| `unfold://debug-seed-library-targets?target=<t>` | Seeds My Library target content |
| `unfold://debug-seed-reveal` | Seeds devotional → `replace /reveal` |
| `unfold://debug-seed-notification-tap` | Seeds devotional + grants QA premium + schedules real-payload devotional_ready at **+2s** (background the app to catch the tap) |
| `unfold://debug-premium?mode=grant\|clear` | Session `qaPremiumOverride`; clears `debugForceTrialExpired`; forces `revenueCatResolved`; → You tab. Canonical premium/free toggle in QA builds (`__DEV__` is always-granted otherwise) |
| `unfold://debug-reset-beginning` | Cancels reminders; `useUnfoldStore.reset()`; clears companion chats; removes MMKV `unfold-storage`, `unfold-companion-chat`, `@unfold_companion_daily`, `@unfold_exclusive_offer_seen`, `@unfold_onboarding_offer_seen`, `inflight-generation-job`; resets UI-state; `replace /'` — the clean-slate hook (more thorough than user-facing Reset-all-data) |
| `unfold://debug-light-mode` | Theme preview gallery; links to `/welcome-celebration` |
| `unfold://__dev__/unfold-editor-test?autoFuzz=1&limit=20` (also `caseId=`) | Native-editor fuzz harness (HtmlEncoder/Decoder round-trip target) |
| `unfold://onboarding?startAt=<stepId>` | Deep-link into any surviving onboarding step (e.g. `startAt=themeType`) |
| `http://localhost:8081/showcase` (web) | Component showcase; `e2e/showcase.spec.ts` |
| `/(tabs)/(you)/component-catalog` | Orphan design-system gallery (no QA gate of its own) |

### You-tab "QA Tools / Dev Tools" block (visible only when gate on)
Reset to Beginning · Seed Real Devotional + Reveal · Seed Devotional + Notification Tap Test (2s) · Test Reveal Screen · Toggle Light/Dark · Light Mode Component Gallery · Replay Home Tooltips (flips `hasSeenHomeTooltips` post-replace + 600ms) · **Simulate Churned User** (`debugForceTrialExpired` — wins over everything in policy) · Reset Exclusive Offers (clears both offer-seen MMKV keys) · Test Trial-Ending Notification (`debugFireTrialEndingNotification(5)`, id suffixed `-debug`).

### Embedded QA affordances
- ThreeStepPaywall final page: **"Continue for QA"** skip → `themeType` step, no premium.
- Today: "QA: Preview reveal" button (QA + no devotional); `isQaPreparingLoadingPreview` marker; `QA_BRIDGE_TEXT` hardcoded bridge copy; RecommendedSeriesCard short-circuits network when `aboutMe === QA_TODAY_PROFILE_MARKER` (fixed "A Quiet Strength").
- Onboarding `__DEV__` floating step picker (+ "Show all steps").
- Paywall diagnostics JSONL (`unfold-paywall-diagnostics.jsonl`, 500 lines/250KB, key-redacted, mirrored to console) — QA-flag-gated.
- `resetAllRateLimits()` — `__DEV__` only.
- Session overrides in `useUIState` (not persisted): `qaPremiumOverride`, `debugForceTrialExpired`.

### Test surface inventory
- testIDs: tab bar `bottom-tab-{today,bible,ask,journal}`; Today stack `today-stack-card-*`, `today-card-stack*`; bible `bible-reader-preferences-sheet`; notebook `note-more-*`, `create-folder-name-input`, `note-detail-save-indicator-*`. Only 4 testIDs in `src/app` routes — UI automation must use a11y labels/text.
- Maestro: `.maestro/onboarding.yml` and `.maestro/bible-reader-flow.yml` both **stale** (assert removed copy/ids) — effectively dead E2E.
- Jest seams: pure-function suites for compute-devotional-state, streak-helpers, devotional-day-access, sync metadata/pull/push, notifications scheduling/routing, paywall guardrails, premium policy, RC entitlement refresh, companion fallback/SSE; plus brittle **source-string** contract tests (dismissible-surfaces, ambient-art-canvas, debug-seed-route, notebook a11y contract).
- Bug-report bundle (`exportBugReportBundleToFile`) = state-snapshot inspection without device logs.

---

## 5. Risk notes by audit dimension

228 fragment risk notes bucketed (references = `fragment#N`). Cross-fragment duplicates noted inline and counted once per fragment as written.

### D1 — Correctness / state machines (65)
- **Devotional engine core**: devotional#1 streak-freeze over-consumption (`effectiveMissed===1` burns a freeze the next branch would forgive); devotional#2 twin streak paths diverge (passive reconcile never consumes grace → immortal streaks); devotional#3 freeze-earn deduped on `streakLongest` (rebuilt streaks never earn); devotional#4 two `totalDays` sources (home raw vs reader server-owned); devotional#5 `daysCompleted` counts boundary-unfiltered days; devotional#6 `advanceDay` caps at totalDays while sync clamp allows totalDays+1; devotional#9 inflight-job resume assumes day-1 (fallback dayNumber 1); devotional#10 DST/timezone (fixed 24h division, device-local toDateString, server cron in server time); devotional#11 duplicated calendar math (no NaN guard twin); devotional#14 `hasReadToday` two definitions (home vs widget); devotional#15 `generatedAt` heuristic mislabels cron-generated days Overdue; devotional#18 churned users with delivered content bypass premium-paused.
- **Today**: today#2 auto-gen retry/dedupe vs focus-pull identity churn (double job submit); today#3 mixed time sources at midnight (60s clockNow vs per-render `new Date()`); today#4 `getReadingDayLabel` twin path of lock math; today#5 `currentDayData` selection override vs catch-up; today#14 auto-navigate effect stale deps + focus race; today#15 evening/midday window edges + two "today" date formats (`en-CA` vs `toDateString`); today#17 premium `unknown` window drops companion cards for paid users.
- **Routes/nav**: routes#4 cold-start notification race (3 interacting time windows: 4s hydration wait, 150ms retries, 5s recent-nav); routes#5 `shouldClearLastResponse` dead variable (= notifications#9); routes#6 cross-tab alias screens (same component, multiple stacks, `from` params); routes#7 hidden `(you)` tab expo-router edge; routes#8 stats self-replace; routes#9 hand-rolled tab-bar hide/slide state machine desync; routes#10 paywall completion-nav matrix (3 outcomes × 11 entry points); routes#11 `saved` redirect string-with-query href vs object params; routes#12 generating gesture re-enable / poll-flag interplay.
- **Bible**: bible#1 `openNote/noteId` params never read by reader; bible#4 `useBibleDb` per-instance state (concurrent download invisible across screens); bible#5 index auto-nav `replace` (Android back exits tab) + stale Continue card; bible#7 stuck `dragX` when swipe target == current chapter; bible#8 navigator FTS taps drop the verse.
- **Notebook**: notebook#2 Go Deeper pushes wrong dayNumber (currentDay vs currentDayData); notebook#3 CONTINUE/COMPLETED badge disagrees with state; notebook#6 search matches raw HTML ("div" matches everything); notebook#7 `gate()` inside autosave (paywall per keystroke / silent drop on unknown); notebook#10 `initialHtml` once per mount (external updates invisible); notebook#13 legacy markdown → N single-item lists; notebook#22 folder-delete twin paths.
- **You**: you#1 daily-reminder OFF not persisted (re-derives ON; sync hook likely re-schedules); you#2 `cancelAllReminders` kills check-ins owned by another hook without flipping flags; you#3 free-user reminder label/OS divergence; you#5 unknown→denied collapse on You index (inconsistent with checkin-schedule's neutral shell); you#9 series-detail day tap silently switches current devotional (changes reminder payload + Today); you#12 name-edit double-commit paths; you#15 profilePicture self-heal write loop risk.
- **Onboarding**: onboarding#5 sample-job fired with pre-merge `data` snapshot (aspiration possibly missing); onboarding#11 returning-user back-nav walks into unfiltered steps with empty state (12s spinner → recovery).
- **Companion**: companion#1 conversation-switch mid-stream writes tokens into wrong conv / placeholder stuck streaming; companion#4 free message burned before send completes; companion#14 double-send race (isStreaming is async React state); companion#16 abort throttle-flush ordering (build-206 race class).
- **Paywall**: paywall#4 one-shot RC identity sync → sticky session-wide `sdk_error` + permanent `unknown`; paywall#6 raw `user.isPremium` reads bypass tri-state (store streaks, share-card, context-slot); paywall#8 no premium demote when RC not configured (persisted true honored forever).
- **Notifications**: notifications#2 toggle-off resurrection (owner hook re-schedules cancelled check-ins); notifications#3 dual scheduling authority residue (toggle schedules directly AND writes store); notifications#9 hydrate-clear vestige (= routes#5).
- **Widgets**: widgets#2 `endReadingSession` never called (Live Activity lingers); widgets#3 `updateReadingSession` never called (frozen 0m/0%); widgets#5 single-entry `.atEnd` timeline → stale post-midnight flame; widgets#6 weekly progress reads current devotional only; widgets#7 `syncWidgets` races the un-awaited sync pull.

### D2 — React Native performance (5)
- today#9 swipe-gesture object churns every render (`onDismiss` identity) + mid-animation card-array race; today#12 GoldEmberField module-scope `Dimensions.get` (rotation/iPad stale) + full particle-array regen pop; bible#6 whole chapter `.map` in ScrollView w/ per-verse onTextLayout (Psalm 119 = 176 verses); notebook#12 render-phase Reanimated shared-value write in FAB; storage#18 highlight dedupe sort+rebuild on every rehydrate.

### D3 — Security / privacy (16)
- routes#1 + paywall#1 + today#1: **QA tools flag in store-distributed build** — if 218 came from `qa-testflight`, debug routes (store-wiping seeds, premium override, paywall skip, diagnostics) ship in the App Review binary; today#1 specifically: seeds wipe real user data wholesale.
- routes#2 unguarded `unfold://` scheme — every route deep-linkable externally with arbitrary params, no validation layer.
- paywall#9 backend has **no entitlement writer** (no RC webhook; server premium gates flag-disabled) — cost-bearing AI endpoints rely on client-side gating; api#11 client rate limits all fail open + MMKV-resettable (backend middleware is the only real guard — verify parity).
- api#1 `/api/tts-download/:id` + `/api/audio/:hash` mounted without auth/rate-limit (id/hash guessability); api#2 `/api/generate/adaptive-question` optionalAuth (rate-limit keying when uid absent?); api#3 client supplies full system prompt + model + max_tokens to legacy `/api/generate/*` routes (server trusts client); api#16 server-returned `dynamicExample` re-enters future prompts (tamper/staleness loop).
- storage#1 user-facing "Delete all data" leaves AI caches (derived from personal context), trial mirror, bug log, device id, offer flags, and (unverified) all server-side synced data; storage#2 SecureStore failure → permanently unencrypted MMKV holding spiritual profile/journals/chats (+ later key-mismatch open behavior unverified); storage#8 unencrypted `unfold-bible-meta` pattern inconsistency; storage#10 (= api#8) companion thumbs feedback POSTs chat content ×2 (≤5000 chars each) silently — verify consent surface (`hasConsentedToAI` is dead per onboarding#8); storage#16 plaintext AsyncStorage bug log w/ premium status + behavioral snapshot, exported off-device; paywall#18 QA diagnostics mirror full offerings/customer summaries to console in TF builds.

### D4 — Data integrity / storage (34)
- **Loss/corruption**: devotional#16 rehydrate validation resets core arrays to empty on any malformed entry (one MMKV corruption wipes local series); notebook#15 notes/folders excluded from that validity check (corruption passes); bible#11 highlight action destroys every overlapping highlight + its notes without warning, stores mismatched text/range; notebook#5 single-slot undo overwrites prior delete; notebook#1 stale-closure duplicate notes; notebook#17 back-during-bridge-latency saves stale HTML; bible#12 + storage#7 ≥5MB heuristic marks corrupt/partial Bible DB ready (queries silently `[]`); api#15 no checksum/version handshake on DB download.
- **Migrations/persistence**: storage#3 v1→v2 MMKV migration copied only `unfold-storage` then `clearAll()` (device-id/offer/rate-limit keys destroyed → identity churn); storage#4 AsyncStorage migration races rehydration; storage#5 device id (auth credential) in MMKV not Keychain — reinstall orphans server data + RC attribution while encryption key survives (asymmetric); storage#6 `audio-player-state` unversioned persist; storage#12 no partialize on main store (hand-maintained session-flag reset list); storage#11 (= companion#2) killed-mid-stream messages persist as empty `status:'streaming'` rows forever; companion#17 50-conv cap only enforced on new-chat; storage#15 infinite-TTL verse/commentary caches never evicted; api#9 commentary cache key collision-prone (40-char day title), verse cache duplicates per reference casing.
- **Contract/data drift**: you#4 + you#16 **batch-series stretch**: `Math.max(totalDays, user.devotionalLength)` at reading.tsx:376/967/1044/1407 lets a global length change extend existing non-progressive series (the "must not stretch" contract only protects progressive mode); devotional#12 pulled-content shell fabricates `seriesStartDate`/empty userContext (shifts labels + degrades generation after reinstall); devotional#13 totalDays inflation on no-arc merge; bible#2 `bible_highlights`/`bible_reading_positions` in sync-types but no push/pull implementation (silent local-only; reinstall loss); bible#14 deep-link visits overwrite Continue-reading + translation-change duplicates history; notebook#8 empty-note accumulation (`allowEmpty` paths); notebook#9 auto-detected scripture refs additive-only (stale pills forever); notebook#24 empty placeholder journal entries pollute counts/My Responses; onboarding#1 companion name likely persists nowhere for fresh users (`updateUser` no-ops on null user); onboarding#4 aspiration chips dropped from saved data + generation request; onboarding#6 sample devotional persists on abandonment (1-day devotional + no completed flag); onboarding#12 ExclusiveOfferSheet purchase during onboarding may not persist premium (`purchasedDuringOnboarding` stays false); notifications#10 two time formats (12h reminder vs 24h check-ins) with silent 8:00 fallback masking bad data; you#10 Reset-all-data leaves offer keys + ghost inflight job.

### D5 — Networking / offline / errors (23)
- paywall#5 offline cold start = fail-closed premium lockout (policy `unknown` indefinitely; paid users lose reading/audio in flight mode); onboarding#3 RC-disabled/offline onboarding paywall dead-end (hardcoded prices, CTA silently no-ops) + onboarding#2's no-forward-path makes it a stuck state; paywall#11 same silent no-op in ThreeStepPaywall; paywall#15 trialEligibility query unparameterized/no staleTime.
- devotional#7 (= storage#14, api#7) sync pull always `lastPulledAt:null` — full dataset every Today focus, unbounded growth, mid-session `currentDay` moves; devotional#8 auto-gen retries unbounded without backoff when offline/erroring; storage#13 no offline outbox — fire-and-forget read-completion sync silently lost offline (cross-device divergence); api#6 no retry/backoff on any imperative fetch (poll loop throws on any non-ok); api#4 legacy devotional generation default timeout 300s pins UI; api#14 push-token registration fired every app start without dedupe/backoff; api#18 RecommendedSeriesCard fetch has no timeout (skeleton forever); api#13 `fetchVerse` returns null for both offline and bad-reference; companion#5 SSE-failure fallback re-POSTs the same turn (double billing + visible text reset); companion#8 no client timeout on chat (hung connection locks input); onboarding#14 DevotionalSegue 90s timeout vs LLM time + retry-loop logic; bible#3 download progress NaN/Infinity when Content-Length absent (+ size copy mismatch 14 vs 25–30MB); bible#9 FTS5 syntax errors swallowed → misleading "No results"; bible#16 search hook error computed but never rendered; bible#18 bible-api.com external uptime dependency on scripture-tap fallback; today#6 bridge query key embeds whole input object incl. free text (cache-hit vs staleTime disagreement); you#11 every Writing-Style tap = new object = profile-sync POST even on no-op re-selection.

### D6 — Accessibility (2 — thin coverage; treat as audit gap)
- notebook#18 native editor `accessibilityValue` reads a ref (VoiceOver value diverges from JS prop); bible#19 note-marker dot is part of verse text (tap toggles selection; no a11y/discoverability path to the note). NOTE: no fragment ran a dedicated a11y pass — dynamic-type breakpoints (DevotionalCard fontScale ≥1.18/1.32), reduce-motion gates (card stack, ambient, paywall video), and the 4-testID-only tree are the known a11y-adjacent facts; the walkthrough matrices in §6 must carry this dimension.

### D7 — Design system / UX (24)
- onboarding#2 hard paywall: production users cannot complete onboarding without purchasing (App Review + funnel risk); paywall#2 "50% OFF" onboarding badge purchases full-price `$rc_annual` (misleading-pricing exposure); paywall#13 Processing overlay traps user ≤60s with close disabled; paywall#10 currency/locale string mangling (CHF, comma-decimal); notifications#1 unconditional OS permission prompt at first cold start pre-empts contextual 6s pre-prompt; notifications#8 trial-ending tap routes nowhere; notifications#11 permission-denied toggle silently fails (no Settings link); companion#3 "Tap to retry" copy with no handler; companion#9 keyboard-persist-taps comment/code mismatch (list tap never dismisses keyboard); companion#10 return-key send likely never fires (multiline); bible#15 locked FONTS open the highlight upsell sheet (wrong copy); bible#20 context-bar keyboard math on inset-less devices; notebook#14 folder filter shows direct children only (subfolder notes look lost); notebook#16 undo restore order/updatedAt cosmetic; notebook#19 NoteDraftDock lost on app kill (+ `isMinimizingRef` never resets on throw); notebook#23 hub search keyboard tap-through; you#14 overscroll-only search + FlashList/Pan gesture conflicts; today#8 day1-review actions skip the 220ms dismiss animation; today#16 journal-resume card duplicates hero affordance for same day; devotional#20 preparing card hardcodes progress 0 (UI promises progress that never moves); onboarding#9 duplicate fallback question shown twice per run; onboarding#15 forced-dark onboarding seams from light-theme app; widgets#10 widget taps don't deep-link anywhere (confirm intentional); api#17 `sanitizeForPrompt` can mangle legitimate devotional/journal text ("act as", "you are now").

### D8 — Tests / verification (9)
- routes#15 only 4 testIDs across route tree; bible#17 + onboarding#13 Maestro flows stale (assert removed UI) — E2E effectively dead; today#11 source-string tests brittle both directions; today#13 computeDevotionalState comment says 7 states/union has 8 + priority-order doc drift; today#7 QA bridge-preview dismissal no-op confuses testers; you#6 `__DEV__` premium always granted (free tier untestable in dev without churned toggle); onboarding#7 zero analytics calls in onboarding.tsx (funnel untracked); notifications#13 `debug-seed-notification-tap` leaves session `qaPremiumOverride` set (contaminates later premium QA).

### D9 — Native layer / config (17)
- widgets#1 (= routes#14, storage#9) **App Groups entitlement deliberately stripped from app AND extension** while the entire expo-widgets path depends on group UserDefaults — expect RedBox/empty/stale widgets on physical device; simulator doesn't enforce entitlements so sim QA passes. Highest-priority device verification.
- widgets#8 convoluted simulator-detection only under `__DEV__` (JSI hang guard skippable); widgets#9 `liveActivityDisabled` session latch masks recurring failures; widgets#11 `UnfoldReadingSession` not declared in app.json widgets array (prebuild drift); widgets#12 layout strings written only at module import (widget added before first launch → RedBox).
- notifications#4 check-in message chosen at schedule time (same message every fire; all 7 weekday triggers share one message); notifications#5 daily-reminder copy staleness when app unopened (platform limit — verify copy still sane); notifications#7 `UIBackgroundModes: fetch` declared + expo-background-fetch dependency with **zero registered tasks** (App Review question); notifications#12 16/64 pending-notification budget (fine; watch growth); routes#13 daily reminder reuses payload baked at schedule time (documented expo gotcha class).
- notebook#11 two independent keyboard observers (tentap useKeyboard vs native keyboardLayoutGuide) → toolbar drift; notebook#21 HtmlEncoder/Decoder Swift round-trip is the documented gotcha hotspot (fuzz via dev screen).
- paywall#3 churned-winback flag unset but UI ships + winback ASC products only READY_TO_SUBMIT (premature enable → broken sheet); paywall#14 `__DEV__` without test key uses production RC Apple key (sandbox tx in prod project); routes#17 stale local `buildNumber: "183"` vs build 218 (remote versioning — confirm nothing reads it).

### D10 — Backend contract drift (7)
- devotional#17 `syncDevotionalDayRead` pushes full devotional metadata (`clientUpdatedAt = readAt`) racing the server cron's `currentDay` writes — LWW semantics unverified; devotional#19 legacy batch continuation still reachable → client-side days the backend never sees; devotional#22 plain `totalDays` shrink ignored client-side (journey-complete can become unreachable); bible#13 Bible DB version hardcoded `v1` (no upgrade path — stale clients never re-download); api#10 clients parse 3–5 alternative response shapes per AI route (shape change degrades silently to null); companion#15 feedback payload hardcodes `companionName: null` + model string; notifications#14 server stagger offset (random 0–300min, assigned once) vs later `preferredNotificationTime` changes — generation/notification alignment unverified.

### D11 — Dependency hygiene / dead code (23)
- routes#3 undeclared Stack.Screens + orphan `sample-devotional` shipping; routes#16 mega-files (onboarding 3228, (you)/index 2300, reading 2369, unfolded 2043 LOC); today#10 ~10 dead/orphaned Today components incl. EmberAtlas (364) + ContextSlot (366) + unused imports; you#7 orphan routes (stats, saved-passages, component-catalog); you#8 hardcoded "Version 1.0.0"; bible#10 dead `showVerseNumbers`/`paragraphMode` settings; notebook#20 NoteEditor.tsx (700 LOC) dead except 2 naive helpers (`isHtmlContent` = `startsWith('<')`); onboarding#8 dead onboarding state incl. `hasConsentedToAI` never collected (privacy cross-ref D3) + trialPurchaseMutation (= paywall#17); onboarding#10 `flow=newSeries` param read nowhere; devotional#21 INFLIGHT_KEY duplicated in 2 files ("must match" comment); companion#6 thinking/isSearching UI dead; companion#7 AI title generation likely never invoked; companion#12 dead generateCompanionResponse/StreamingCursor/useDrawerGesture/Citation; companion#13 devotional-aware empty-state variants unreachable (`todayTheme` never passed); paywall#7 entitlement string defined 3×+ inline; paywall#12 `_hasFreeTrial` param ignored; paywall#16 paywall `source` param has no callers (latent nav incl. `/generating` replace — confirm dead or deep-link-reachable); notifications#6 dead notification exports + no local devotional-ready sender remains (simulator/no-token users get nothing — verify backend coverage); widgets#4 "reading" Live Activity variant dead (only audio path starts it); storage#17 dead example-state store + **two spellings of trial-eligibility query keys** (invalidation may miss one); api#5 dead multi-candidate fallback loops in 4 services; api#12 TTS cache key must byte-match duplicate inline construction (cost bug class).

### D12 — Android parity (3 noted + systemic gap)
- notebook#4 folder rename uses `Alert.prompt` (iOS-only — silent no-op on Android); you#13 bug-report note prompt same API; companion#11 drawer long-press menu = ActionSheetIOS + Alert.prompt (rename/star/delete broken on Android). Systemic: fragments are iOS-centric; Android-specific surfaces (tentap WebView editor fork + white-flash overlay, notification channel `default`, Android always trial-ineligible by design, Lottie bell gotcha) have no dedicated mapping — treat Android parity as an unmapped subsystem if Android ships.

---

## 6. Walkthrough script skeleton

Each block lists: entry invocation → screens → states to tick off in §1. Run on the **QA TestFlight build** (or dev build + `/debug-premium?mode=clear` for free-tier states, since `__DEV__` forces premium).

### Phase 0 — Build provenance (gating check)
1. Confirm which eas profile produced build 218 (`eas build:list` / build metadata). If `qa-testflight`: D3 headline risks are live in the review binary. Then verify gate behavior: open `unfold://debug-premium` — redirect to You tab means QA off.

### Phase 1 — Onboarding (rows 1–4, 82)
1. `unfold://debug-reset-beginning` → lands on `/` → verify new-user welcome phases.
2. Walk all 32 steps: cinematic tap-gating, adaptive-question loading + airplane-mode fallback, voice input, mirrorBack AI vs fallback, **companion naming** (then verify name actually reaches Companion tab — onboarding#1), devotionalSegue poll states (kill network mid-poll for issue card + retry + 409 recovery), readDevotional 12s recovery, ThreeStepPaywall (video latch, trial page presence, purchase cancel → ExclusiveOfferSheet 50% claim vs Apple sheet price, **QA skip**), themeType/studySubject branching, length/duration, reminderTime.
3. Completion → `/generating`: submit/poll/error-retry/cancel; kill app mid-generation → relaunch → Today inflight resume → `/generating` reconnecting state. Contextual notification pre-prompt (6s) — note whether root-layout `registerPushToken` already burned the OS dialog (notifications#1).
4. Mid-flow abandonment: kill at celebration → relaunch → check Today reconciliation of orphan sample devotional (onboarding#6).
5. Returning-user re-entry: from Today "New Series" → `unfold://onboarding?startAt=themeType` semantics + back-walk oddity (onboarding#11).

### Phase 2 — Today seeded states (rows 22–23, 62–64, 78, 80)
For each of the master prompt's 8 hero states + card-stack states, invoke and verify hero copy/CTA/ambient/a11y:
```
unfold://debug-seed-today?state=unread          (Today label + streak CTA ladder)
unfold://debug-seed-today?state=overdue         (catch-up label + CTA)
unfold://debug-seed-today?state=reveal-ready    (→ /reveal → reading handoff ≤15s)
unfold://debug-seed-today?state=preparing       (shimmer, 5% floor, progressbar a11y)
unfold://debug-seed-today?state=complete-today  (embers GoldEmberField + reflect states)
unfold://debug-seed-today?state=tomorrow-locked (teaser + return CTA + day-menu cap)
unfold://debug-seed-today?state=journey-complete
unfold://debug-seed-today?state=first-time-empty / state=empty (returning variant)
```
Then card stack: `day1-review`, `resume-reading`, `resume-journal`, `midday` (CheckInSheet complete + dismiss-date), `evening` (→ evening-wind-down), `bridge`, `bridge-loading`, `remember-this` (→ reading w/ highlightId), `premium-nudge` (PremiumFeatureSheet mapping), `phase4-stack` (priority order + ≤2 silhouettes + swipe-dismiss thresholds + reduce-motion gesture disable). Repeat 2–3 states with `&theme=light` and a non-gold `&accent=`. Cross-midnight check: leave seeded `complete-today` open past 00:00 (today#3, widgets#5).

### Phase 3 — Reader (row 24)
From seeded `unread`: complete a day end-to-end (celebration → streak → widget sync → reminder refresh); highlight + bookmark + scroll-to via my-content round-trip; audio TTS start (Live Activity appears; confirm it never updates/ends — widgets#2/3); day-menu detents + selectable-day cap; missing-day recovery: seed `preparing`, go offline, open reading → offline countdown/auto-retry → online recovery ladder.

### Phase 4 — Bible (rows 34–36, 67–70)
Fresh install path: Bible tab → DownloadBibleSheet (watch progress; toggle airplane mode for error+retry); then `unfold://debug-seed-bible` → reader John 1:1 with seeded highlight. Verify: verse select → context bar (tab bar instant-hide/restore), color picker premium locks (free build), note add/view/delete (keep-highlight rule), highlight-overwrite destruction (bible#11), Explain sheet states, share → share-card, chapter swipe edges (Gen 1 / Rev 22 rubber-band; same-chapter stuck dragX), navigator 3 modes + search verse-drop, /search 1-char + unbalanced-quote queries (bible#9), Psalm 119 scroll perf, settings sheet (locked font → note wrong upsell copy).

### Phase 5 — Companion (rows 37, 74, 81)
No seed exists — create history manually. Free build: 5-message counter, burn-on-failure (send in airplane mode), limit strip → sheet. Streaming: stop mid-stream, kill app mid-stream → relaunch (stuck-streaming row, companion#2), switch conversation mid-stream (companion#1), suggestion-chip double-tap, deep-link card → reading/journal, verse pill → ScriptureTapSheet → Bible, drawer star/rename/delete, >24h stale archive (device-clock jump).

### Phase 6 — Notebook/Journal (rows 38–42, 71–73, 75, 77)
No seed — create notes manually. Hub segments + swipe, folder create/drill/rename/delete + undo single-slot overwrite, search ("div" HTML match), note-detail edit (autosave indicator, rapid-typing duplicate-note repro attempt notebook#1), scripture insert + pill → Bible, minimize-to-Bible → dock pill on every tab → restore; kill app with dock active (loss); editor fuzz: `unfold://__dev__/unfold-editor-test?autoFuzz=1&limit=20`. Reflections segment: Today card badges vs actual entry, Go Deeper day-number mismatch (notebook#2), my-responses → journal-detail.

### Phase 7 — You tab (rows 43–52, 9)
Today avatar → You. Profile edit (name/avatar), theme/accent/font instant application, daily-reminder toggle OFF→remount resurrection (you#1) + check-in cross-cancel (you#2), reminder time change → verify OS queue via tap-test, Writing Style sync chatter, bug report full ladder, Reset-all-data vs `debug-reset-beginning` diff (storage#1), orphan routes by deep link: `unfold://(tabs)/(you)/stats`, `.../saved-passages`, `.../component-catalog`. Past-devotionals: overscroll search, PDF export (premium), swipe-delete cascade. Series-detail: confirm day tap switches current devotional (you#9). Checkin-schedule: all 3 policy states + per-day skip + all-skipped.

### Phase 8 — Paywall & premium matrix (rows 5, 63–64, 82)
`/debug-premium?mode=clear` (free) then `mode=grant`; "Simulate Churned User" for denied. For each entry point (You ×5, creation gates ×6, share-card, past-devotionals, checkin-schedule, PremiumFeatureSheet, deep link `unfold://paywall`): verify completion-nav (routes#10). Purchase sandbox flow: cancel → offer sheet one-shot (then "Reset Exclusive Offers" to retest), restore paths, error copies (airplane mode), trial-eligibility CTA, processing-overlay trap timing. Offline cold start as paid user → premium lockout duration (paywall#5). Trial notification: "Test Trial-Ending Notification (5s)" → tap → confirm no-route behavior (notifications#8).

### Phase 9 — Widgets (rows 53–56) — PHYSICAL DEVICE REQUIRED
Add all 3 widgets + lock-screen circular BEFORE first app launch (RedBox check, widgets#12), then after launching to Today (snapshot push). Verify on device whether **any** widget populates (App Group stripped — widgets#1). Complete a day → widget flame/streak update; cross midnight without opening app → staleness; start audio → Live Activity appears → stop audio/complete day → activity lingers (widgets#2); tap each widget → confirm plain launch to `/`.

### Phase 10 — Notifications (rows 57–61)
`unfold://debug-seed-notification-tap` → background app → tap at +2s → reveal → reading (warm). Repeat with app killed (cold-start hydration; watch 4s blank-screen window at `/`). Schedule midday/evening via You tab (granted) → verify ids in OS queue, same-message-every-fire (notifications#4), toggle-off resurrection sequence (you#2 → foreground next day). Daily reminder: change time → next-fire correctness; complete day → reminder copy refresh.

### Phase 11 — Cross-cutting matrices (apply to phases 1–10 spot checks)
- **Dark/light + accents**: re-run Phase 2 seeds with `theme=light` + each accent; onboarding forced-dark seams; `debug-light-mode` gallery.
- **Dynamic type**: fontScale ≥1.18 and ≥1.32 (DevotionalCard compact breakpoints), paywall, reader, widgets; only-4-testID a11y-label sweep with VoiceOver on Today/reader/paywall.
- **Reduce motion**: card-stack swipe disabled (X still works), ambient embers suppressed, paywall video instant, Bible/typing-indicator animations.
- **Offline**: cold start offline (premium lockout, Today degraded states), mid-poll generation, companion send, bible-api fallback, sync-push loss (storage#13).
- **Slow network (Network Link Conditioner)**: SSE → fallback double-request (companion#5), 300s legacy timeout, recommendation skeleton (api#18), paywall offerings retry.
- **Backgrounding**: generating background-resume single poll; notification AppState rehydrate; streak reconcile on foreground; widget sync on refocus.
- **Force-quit**: mid-generation (MMKV resume), mid-stream (stuck message), mid-note-edit (autosave + dock loss), mid-download (Bible 5MB auto-ready heuristic), post-reveal (resumeContext 15s expiry).
- **Date/clock**: midnight rollover on Today, DST day, timezone change, device-clock jump (companion daily counter + stale-conv archive).

---

*Ledger maintenance: tick §1 checkboxes as walkthrough phases complete; finder agents should cite risk-note IDs (e.g. `devotional#1`) when confirming or dismissing leads.*
