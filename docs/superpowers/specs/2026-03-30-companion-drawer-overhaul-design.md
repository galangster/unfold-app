# Companion Drawer Overhaul

## Goal

Replace the bottom-sheet conversation history with a left-side drawer matching the ChatGPT/Claude mobile chat pattern. Add AI-generated conversation titles.

## Architecture

The companion screen gets a full-screen gesture detector that opens an overlay drawer from the left edge. The existing `companion-chat-store.ts` multi-conversation model already supports this — this is primarily a UI swap. A new lightweight endpoint generates conversation titles after the first exchange.

## Components

### 1. CompanionDrawer (new)

**File:** `src/components/companion/CompanionDrawer.tsx`

A left-edge overlay drawer built with Reanimated + Gesture Handler.

**Gesture architecture:**
- Single `Gesture.Pan()` wrapped in `GestureDetector` around the entire companion screen
- When drawer is closed: `hitSlop = { left: 0, width: 36 }` limits activation to left edge
- When drawer is open: hitSlop unconstrained (swipe anywhere to close)
- `activeOffsetX: [-5, 5]` — 5pt horizontal threshold before activation
- `failOffsetY: [-15, 15]` — fails if finger moves 15pt vertically (scrolling)
- Min swipe distance: 60pt — gestures shorter than this are ignored (prevents conflict with hamburger icon tap)

**Keyboard dismiss composition:**
- The existing `TouchableOpacity onPress={Keyboard.dismiss}` wrapper in the companion screen conflicts with a full-screen `GestureDetector`. Replace it with a `Gesture.Tap()` composed via `Gesture.Simultaneous(panGesture, tapGesture)`. The tap gesture calls `Keyboard.dismiss()`, the pan gesture handles drawer open/close. This avoids recognition conflicts.

**Animation:**
- Drawer `translateX` driven by shared value, snaps with `withSpring({ duration: 300, dampingRatio: 1 })` (Reanimated 4.x duration-based spring API — `dampingRatio: 1` produces critically damped motion with zero overshoot)
- Scrim: `rgba(0,0,0,0.5)` opacity interpolated linearly with drawer progress
- Drawer type: front/overlay (main content stays put)

**Layout:**
- Width: `Math.min(screenWidth * 0.80, 320)`
- Full height, positioned absolute left
- Background: `colors.backgroundElevated`

**Accessibility:**
- Drawer container: `accessibilityViewIsModal={true}` when open
- Scrim: `accessibilityLabel="Close drawer"`, `accessibilityRole="button"`

**Snap logic:**
- Projected position = `currentOffset + 0.05 * velocity`
- If projected > 50% of drawer width → open; otherwise → close
- If `|velocity| > 500` → use velocity direction regardless of position

**Contents:**
- **Header:** "New Chat" button (prominent, full width) — archives current conversation, creates new one
- **Conversation list:** FlashList with `estimatedItemSize={60}` (rows) / `estimatedItemSize={32}` (section headers), grouped by Today / This Week / Earlier
- Each row: AI-generated title (falls back to `summary`, then truncated first message), relative timestamp, accent left border if active
- Swipe-left to delete with confirmation alert (matching existing behavior from ConversationHistorySheet)

**Conversation grouping (replaces old "This Week / Last Week / Earlier"):**
- **Today:** `Date.now() - createdAt < 24h`
- **This Week:** `Date.now() - createdAt < 7 days` (and not Today)
- **Earlier:** Everything else

**Selecting a conversation:**
- If the conversation is the active one → close drawer, no action
- If the conversation is archived → set it as active conversation in the store (loads its messages into the chat view), close drawer. The existing `ArchivedConversationView` read-only overlay is removed — all conversations are now interactive when selected from the drawer. This matches ChatGPT behavior where tapping any past conversation loads it as the current chat.

### 2. Companion Screen Header Update

**File:** `src/app/(tabs)/(ask)/index.tsx`

Current header modified:
- **Left:** `ListIcon` (hamburger) — opens drawer
- **Center:** Existing companion animation + companion name (keep the orb/avatar animation, add name beside it)
- **Right:** `PencilSimpleLineIcon` — new chat (archives current, creates fresh)

### 3. AI Conversation Titles

**Backend:** Separate lightweight endpoint `POST /api/companion/title`. Keeping it separate from the SSE chat stream avoids protocol complexity (no new SSE event types, no client-side streaming consumer changes).

**Endpoint spec:**
```
POST /api/companion/title
Body: { messages: [{ role: "user", content: "..." }, { role: "assistant", content: "..." }] }
Response: { title: "Prayer and Anxiety" }
```

Uses Claude Haiku (cheapest, fastest). 3-second timeout. No auth required beyond existing session.

**Approach:** After the first user message + companion response, fire a background call from the client:
```
System: "Generate a 3-6 word title summarizing this conversation. Return ONLY the title text."
User: [first user message]
Assistant: [first companion response snippet, truncated to 200 chars]
```

**Timing:** Non-blocking. Fires after first response completes streaming. Title updates in store asynchronously. If the user taps "New Chat" before the title arrives, the title is still written to the conversation record (even after archiving) via `updateConversation(conversationId, { title })`.

**Fallback:** If AI call fails or times out (3s), truncate first user message to ~40 chars.

**Store changes:**
- Rename existing `summary` field to `title` in the `Conversation` interface. Bump store version to v4. Migration: copy `summary` value into `title` for all existing conversations.
- Add `updateConversation(id, partial)` action for async title writes.
- Add `generateConversationTitle(conversationId)` action that calls the endpoint and updates the store.

### 4. Deleted Files

- **`src/components/companion/ConversationHistorySheet.tsx`** — Replaced by CompanionDrawer
- **`src/components/companion/ArchivedConversationView.tsx`** — No longer needed; selecting a conversation loads it directly

## Gesture Values Reference

| Parameter | Value | Source |
|---|---|---|
| Edge activation width | 36pt | Between react-navigation (32) and Apple touch target (44) |
| Min horizontal offset | 5pt | react-navigation standard |
| Min swipe distance | 60pt | react-navigation standard |
| Min velocity for instant snap | 500 pt/sec | react-navigation standard |
| Fail offset Y | [-15, 15]pt | RNGH ReanimatedDrawerLayout |
| Spring config | `duration: 300, dampingRatio: 1` | Reanimated 4.x critically damped, no overshoot |
| Drawer width | `Math.min(screenWidth * 0.80, 320)` | ChatGPT/Claude visual match |
| Scrim color | `rgba(0,0,0,0.5)` | react-navigation default |
| Velocity projection multiplier | 0.05 | RNGH DRAG_TOSS constant |
| Snap threshold | 50% of drawer width | Industry standard |
| FlashList estimatedItemSize | 60pt (rows), 32pt (headers) | Visual estimate for conversation rows |

## Files Changed

| File | Action | Description |
|---|---|---|
| `components/companion/CompanionDrawer.tsx` | Create | Drawer with gesture, scrim, conversation list |
| `components/companion/ConversationHistorySheet.tsx` | Delete | Replaced by drawer |
| `components/companion/ArchivedConversationView.tsx` | Delete | No longer needed |
| `app/(tabs)/(ask)/index.tsx` | Modify | Replace history sheet + archived view with drawer, update header, replace keyboard-dismiss TouchableOpacity with Gesture.Tap composition |
| `lib/companion-chat-store.ts` | Modify | Rename `summary` to `title`, add `updateConversation()` and `generateConversationTitle()` actions, bump to v4 |
| `lib/companion-service.ts` | Modify | Add `generateConversationTitle()` API call |
| `backend/src/routes/companion.ts` | Modify | Add `POST /api/companion/title` endpoint |

## Out of Scope

- Companion context access (devotional history, reflections) — separate feature
- Prayer list integration — separate feature
- Drawer on other screens — companion only
- Scale/parallax effect on main content — start with simple overlay, upgrade later if desired
