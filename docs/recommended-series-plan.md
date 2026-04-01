# Recommended Series Feature — Implementation Plan

## Problem
When a user finishes a devotional series, they see a generic "Start a New Study" card. This is a missed opportunity for personalization — the app already knows their reading history, emotional patterns, scripture coverage, and spiritual growth trajectory.

## Solution
Replace the generic empty state with a personalized recommendation: "Based on your journey, we think you'd love..." with a specific theme/type suggestion and clear reasoning.

---

## Architecture

### 1. Recommendation Engine (Backend)

**New endpoint:** `GET /api/recommendations/next-series?uid={userId}`

**Input signals** (queried from database):
| Signal | Source | Weight |
|---|---|---|
| Past themes | `sync_devotional_days` → parent devotional themes | Avoid repetition (negative signal) |
| Recent mood | `check_ins` table — last 7 entries | Match emotional state to theme |
| Scripture coverage | `used_scriptures` table | Suggest underexplored regions |
| Completion pattern | Devotional completion dates | Frequency/consistency informs type |
| Time since last series | Last devotional `completedAt` | Urgency of re-engagement |
| Study method history | `method_usage_history` | Diversify methods |

**Algorithm:**
```
1. Score all 16 themes (trust, identity, rest, purpose, etc.)
2. For each theme:
   a. Base score = default weight from suggestTheme() weights
   b. Recency penalty: -50% if used in last 2 series, -25% if last 4
   c. Mood boost: +30% if theme matches recent emotional state
      - Low mood (1-3) → healing, hope, rest, lament
      - Neutral (4-5) → identity, purpose, discipline
      - High (6-8) → gratitude, joy, wonder, courage
   d. Season bonus: +15% for seasonally relevant themes
      - Advent/Christmas (Dec): hope, wonder, joy
      - Lent/Easter (Feb-Apr): surrender, lament, courage
      - New Year (Jan): purpose, discipline, identity
      - Summer (Jun-Aug): rest, gratitude, presence
   e. Scripture gap bonus: +20% if theme's scriptureFocus
      includes underexplored canon regions
3. Select top theme
4. Pick compatible type using getCompatibleTypes(theme)
5. For book_study/character_study: pick specific subject
   that hasn't been done recently
```

**Response shape:**
```typescript
{
  theme: ThemeCategory;
  type: DevotionalType;
  subject?: string; // For book_study or character_study
  reason: string;   // "You've been exploring identity — this goes deeper"
  confidence: number; // 0-1, used to decide how prominent to make the card
  suggestedLength: 7 | 14; // Based on past completion patterns
}
```

**File:** `backend/src/routes/recommendations.ts` (new route)

### 2. Mobile UI

**Returning Empty State Enhancement** (`DevotionalCard.tsx` → `ReturningEmptyState`)

Current:
```
┌─────────────────────────────┐
│ Ready for your next study?  │
│ Continue growing with a new │
│ personalized series.        │
│                             │
│   [ Start a New Study ]     │
└─────────────────────────────┘
```

Proposed:
```
┌─────────────────────────────┐
│ ✦ Recommended for you       │
│                             │
│ Finding Rest in the         │
│ Overwhelm                   │
│                             │
│ Based on your recent        │
│ check-ins, a 7-day series   │
│ on rest might be exactly    │
│ what you need right now.    │
│                             │
│   [ Start This Study ]      │
│                             │
│   or choose something else  │
└─────────────────────────────┘
```

**Design principles:**
- Same frosted glass/glassmorphism card
- Subtle accent glow on the recommended theme icon
- "or choose something else" links to full onboarding flow
- If confidence < 0.5, fall back to generic empty state
- Card uses critically-damped spring entrance (no bounce)
- Recommendation text is AI-generated (1 sentence, personal)

**New component:** `RecommendedSeriesCard.tsx`

### 3. Data Flow

```
User completes final day of series
  ↓
App marks series complete, navigates to home
  ↓
Home screen renders ReturningEmptyState
  ↓
useEffect fires: GET /api/recommendations/next-series
  ↓
Backend scores all themes using algorithm above
  ↓
Returns: { theme: "rest", type: "personal", reason: "...", suggestedLength: 7 }
  ↓
UI renders RecommendedSeriesCard
  ↓
User taps "Start This Study"
  ↓
Navigate to generating.tsx with pre-filled theme/type
  (Skip theme/type selection in onboarding — go straight to generation)
  ↓
Backend creates generation job with recommended context
```

### 4. Database Requirements

No new tables needed. All data comes from existing tables:
- `sync_devotional_days` (past themes)
- `check_ins` (mood data)
- `used_scriptures` (scripture coverage)
- `generation_jobs` (completion patterns)

### 5. API Integration

**Backend changes:**
1. New route file: `backend/src/routes/recommendations.ts`
2. Register in `backend/src/index.ts`
3. Algorithm in `backend/src/lib/recommendation-engine.ts`

**Mobile changes:**
1. New API call in `src/lib/api.ts` or inline fetch
2. New component: `src/components/home/RecommendedSeriesCard.tsx`
3. Modify `DevotionalCard.tsx` to conditionally render recommendation
4. Modify `generating.tsx` to accept pre-filled theme/type from deep link params

---

## Implementation Order (Vertical Slices)

### Slice 1: Backend recommendation endpoint (Medium)
- Create `recommendation-engine.ts` with scoring algorithm
- Create `recommendations.ts` route
- Wire up to existing database queries
- Test with sample user data

### Slice 2: Mobile recommendation card (Medium)
- Create `RecommendedSeriesCard.tsx` component
- Fetch recommendation in `DevotionalCard.tsx` returning empty state
- Handle loading/error/fallback states
- Spring entrance animation

### Slice 3: Quick-start flow (Small)
- Modify `generating.tsx` to accept `?theme=rest&type=personal&length=7`
- Skip relevant onboarding steps when pre-filled
- Seamless transition from recommendation → generation

### Slice 4: Reason text generation (Small, optional)
- Use Haiku to generate 1-sentence personalized reason
- Cache per user (refresh daily)
- Fallback to template strings if API unavailable

---

## Edge Cases

| Case | Behavior |
|---|---|
| First-ever series (no history) | Use `suggestTheme()` weighted random, skip personalization |
| Only 1 completed series | Light personalization: "Last time you explored X, now try Y" |
| Low confidence (<0.5) | Show generic empty state instead |
| API failure | Fall back to generic "Start a New Study" |
| User has been away >30 days | Re-engagement focus: shorter series (3-7 days), gentler themes |
| All themes explored | Deeper dive: suggest same theme with different type/method |

## Non-Goals (v1)
- No A/B testing framework
- No ML-based recommendations (rule-based is fine for 50-50K users)
- No push notifications for recommendations
- No "recommended series" browsing page (just the empty state card)
