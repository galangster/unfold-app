# Recommended Series Feature — Design Spec

## Problem

When a user finishes a devotional series, they see a generic "Start a New Study" card. The app already knows their reading history, journal reflections, emotional patterns, and scripture coverage — but none of that informs what they do next.

## Solution

Replace the generic empty state with a personalized recommendation card that suggests a specific theme, type, and length based on the user's history. The recommendation is computed entirely on the backend, fetched on-demand, and displayed as an enhanced returning-user empty state.

---

## Design

### 1. Recommendation Engine (Backend)

**Endpoint:** `GET /api/recommendations/next-series`
- Authenticated via Clerk (same as all other endpoints)
- Returns a single recommendation object

**Input signals** (queried from existing DB tables, no new tables):

| Signal | Source Table | Effect | Weight |
|---|---|---|---|
| Past themes | `sync_devotionals` | Recency penalty: -50% if used in last 2 series, -25% if last 4 | Highest (avoids repetition) |
| Journal/reflection themes | `sync_devotional_days` (last 3-5 entries) | Haiku extracts dominant spiritual themes, maps to theme clusters | +35% boost |
| Recent mood | `check_ins` (last 7 entries) | Low (1-3) → healing/hope/rest/lament. Neutral (4-5) → identity/purpose/discipline. High (6-8) → gratitude/joy/wonder/courage | +25% boost |
| Season | Calendar date | Advent→hope/wonder/joy. Lent→surrender/lament/courage. New Year→purpose/discipline. Summer→rest/gratitude/presence | +15% boost |
| Scripture coverage | `used_scriptures` | Themes whose `scriptureFocus` overlaps underexplored canon regions get a bonus | +20% boost |
| Base weight | Hardcoded | Existing `suggestTheme()` weights (trust/identity heaviest) | Baseline |

**Algorithm:**
1. Score all 16 themes using the weighted signals above
2. Select top-scoring theme
3. Pick compatible type via `getCompatibleTypes(theme)`, avoiding the user's most recent type
4. For `book_study`/`character_study`: pick a specific subject not done before
5. Determine suggested length: 7 days default, 14 if user has completed 14+ day series before, cap at 7 if user absent >30 days
6. Call Haiku once for reason text: input = chosen theme + recent mood + journal themes + user's aboutMe. Output = 1 sentence, no name, under 25 words. Fallback = template string if Haiku fails

**Response shape:**
```typescript
{
  theme: string;        // "rest"
  themeName: string;    // "Finding Rest"
  type: string;         // "personal"
  subject?: string;     // only for book_study/character_study
  reason: string;       // "Your recent reflections suggest a quieter season might be what you need."
  suggestedLength: 7 | 14;
}
```

**New files:**
- `backend/src/lib/recommendation-engine.ts` — scoring algorithm
- `backend/src/routes/recommendations.ts` — route handler, registered in `index.ts`

**Caching:** None for v1. Only called when empty state renders (low frequency).

### 2. Mobile UI — Two Touchpoints

**Touchpoint 1: Journey complete card**

When the user finishes their final day and returns to home, the `JourneyCompleteState` card renders. After it appears, fetch the recommendation. Once loaded, transition the card to show the recommendation below the completion celebration:

```
┌──────────────────────────────────┐
│ Series Complete                  │
│ "Finding God in the Overwhelm"  │
│                                  │
│ ── Up Next ──────────────────── │
│                                  │
│ A 7-day series on rest           │
│                                  │
│ Your recent reflections suggest  │
│ a quieter season might be what   │
│ you need.                        │
│                                  │
│   [ Start This Study ]           │
│   or choose something else       │
└──────────────────────────────────┘
```

**Touchpoint 2: Returning empty state**

If the user doesn't act immediately and comes back later, the `ReturningEmptyState` shows the recommendation:

```
┌──────────────────────────────────┐
│ Recommended for you              │
│                                  │
│ Finding Rest                     │
│                                  │
│ Your recent reflections suggest  │
│ a quieter season might be what   │
│ you need.                        │
│                                  │
│   [ Start This Study ]           │
│   or choose something else       │
└──────────────────────────────────┘
```

**Both cards:**
- Same glassmorphism styling as all other home cards
- Left-aligned text
- Critically-damped spring entrance (no bounce, under 350ms)
- Shimmer skeleton while recommendation loads (~200-500ms)
- If fetch fails → fall back to generic "Start a New Study"
- No user name in the reason text
- "Start This Study" → `generating.tsx` with pre-filled params
- "or choose something else" → existing `handleCreateNew()` flow

**New component:** `src/components/home/RecommendedSeriesCard.tsx`

### 3. Quick-Start Data Flow

```
User taps "Start This Study"
  ↓
Set store fields: selectedTheme, selectedType, selectedStudySubject, devotionalLength
  ↓
Navigate to /generating
  ↓
generating.tsx reads theme/type/length from user store (existing behavior)
  ↓
Submits generation job with pre-filled context
  ↓
Shows "Preparing your devotional..." loading
  ↓
Day 1 generated → normal flow begins
```

`generating.tsx` already reads `user.selectedTheme`, `user.selectedType`, `user.selectedStudySubject`, and `user.devotionalLength` from the store. The recommendation card just sets these before navigating — no route params needed.

**"Or choose something else"** → calls existing `handleCreateNew()` → full onboarding flow, unchanged.

### 4. Recommendation Fetch Strategy

- Fetched on-demand when empty state or journey-complete state renders
- Brief shimmer skeleton during load (~200-500ms)
- If API fails → fall back to generic empty state ("Start a New Study")
- If confidence is very low (first-ever series, no history) → use `suggestTheme()` weighted random, skip Haiku reason, show template reason text

---

## Files Changed

| File | Change |
|---|---|
| `backend/src/lib/recommendation-engine.ts` | NEW: scoring algorithm, theme selection, Haiku reason text |
| `backend/src/routes/recommendations.ts` | NEW: GET /api/recommendations/next-series endpoint |
| `backend/src/index.ts` | Register recommendations route |
| `app/mobile/src/components/home/RecommendedSeriesCard.tsx` | NEW: recommendation card component |
| `app/mobile/src/components/home/DevotionalCard.tsx` | Modify ReturningEmptyState + JourneyCompleteState to fetch and render recommendation |
| `app/mobile/src/app/generating.tsx` | Accept pre-filled theme/type/length from recommendation |

## Edge Cases

| Case | Behavior |
|---|---|
| First-ever series (no history) | Weighted random theme, template reason text, no Haiku call |
| Only 1 completed series | Light personalization: suggest complementary theme |
| API failure | Fall back to generic "Start a New Study" |
| User absent >30 days | Suggest shorter series (7 days), gentler themes (rest, hope) |
| All 16 themes explored | Suggest same theme with different type/method for deeper dive |
| Haiku call fails | Template reason: "A {length}-day series on {theme} — right where you are right now." |

## Non-Goals (v1)

- No A/B testing framework
- No ML-based recommendations (rule-based scoring is sufficient for 50-50K users)
- No push notifications for recommendations
- No "browse recommendations" page (just the empty state card)
- No caching (endpoint is low-frequency)
