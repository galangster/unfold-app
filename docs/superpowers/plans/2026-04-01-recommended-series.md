# Recommended Series — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user finishes a devotional series, show a personalized recommendation (theme, type, reason) instead of a generic "Start a New Study" card.

**Architecture:** Backend-only scoring. New `GET /api/recommendations/next-series` endpoint queries past themes, journal content, mood, scripture coverage, and calendar season to score all 16 themes. One Haiku call generates a personalized reason sentence. Mobile fetches on-demand when the empty state or journey-complete state renders, and displays a recommendation card with "Start This Study" / "or choose something else."

**Tech Stack:** Express + Drizzle (backend), React Native + Zustand (mobile), Haiku 4.5 (reason text), expo-blur (glassmorphism)

---

### Task 1: Recommendation engine — scoring algorithm

**Files:**
- Create: `backend/src/lib/recommendation-engine.ts`

- [ ] **Step 1: Create the scoring engine file with types and base weights**

Create `backend/src/lib/recommendation-engine.ts`:

```typescript
/**
 * Recommendation engine — scores all 16 themes based on user signals
 * and selects the best next series for the user.
 */

import { db } from "../db";
import * as schema from "../db/schema";
import { eq, desc, and } from "drizzle-orm";
import { callAI } from "./ai-client";

// All 16 theme categories — must match the mobile app's ThemeCategory type
const ALL_THEMES = [
  "trust", "identity", "rest", "purpose", "healing", "gratitude",
  "surrender", "courage", "hope", "presence", "conviction", "joy",
  "lament", "justice", "discipline", "wonder",
] as const;

type ThemeCategory = (typeof ALL_THEMES)[number];

// Base weights — same as mobile suggestTheme() for consistency
const BASE_WEIGHTS: Record<ThemeCategory, number> = {
  trust: 14, identity: 14, rest: 10, hope: 10, healing: 9, purpose: 9,
  gratitude: 7, presence: 7, courage: 5, surrender: 5, joy: 8,
  conviction: 6, lament: 6, wonder: 6, justice: 4, discipline: 4,
};

// Mood-to-theme mapping
const MOOD_THEME_MAP: Record<string, ThemeCategory[]> = {
  low: ["healing", "hope", "rest", "lament"],      // mood 1-3
  neutral: ["identity", "purpose", "discipline"],    // mood 4-5
  high: ["gratitude", "joy", "wonder", "courage"],   // mood 6-8
};

// Season-to-theme mapping
function getSeasonalThemes(): ThemeCategory[] {
  const month = new Date().getMonth(); // 0-indexed
  if (month === 11) return ["hope", "wonder", "joy"];           // December (Advent)
  if (month >= 1 && month <= 3) return ["surrender", "lament", "courage"]; // Feb-Apr (Lent)
  if (month === 0) return ["purpose", "discipline", "identity"]; // January (New Year)
  if (month >= 5 && month <= 7) return ["rest", "gratitude", "presence"]; // Jun-Aug (Summer)
  return [];
}

// Theme name mapping for display
const THEME_NAMES: Record<ThemeCategory, string> = {
  trust: "Learning to Trust", identity: "Knowing Who You Are",
  rest: "Finding Rest", purpose: "Living with Purpose",
  healing: "A Path to Healing", gratitude: "Eyes of Gratitude",
  surrender: "The Art of Surrender", courage: "Courage in the Storm",
  hope: "Anchored in Hope", presence: "Being Present",
  conviction: "Honest Before God", joy: "Unexpected Joy",
  lament: "Permission to Grieve", justice: "Seeking Justice",
  discipline: "Faithful Rhythms", wonder: "Recovering Wonder",
};

// Compatible types per theme (simplified from mobile — most themes work with "personal")
const COMPATIBLE_TYPES: Record<string, string[]> = {
  trust: ["personal", "psalm_journey", "character_study"],
  identity: ["personal", "character_study", "book_study"],
  rest: ["personal", "psalm_journey", "lectio_divina"],
  purpose: ["personal", "book_study", "character_study"],
  healing: ["personal", "psalm_journey"],
  gratitude: ["personal", "psalm_journey"],
  surrender: ["personal", "character_study"],
  courage: ["personal", "character_study"],
  hope: ["personal", "psalm_journey", "book_study"],
  presence: ["personal", "psalm_journey", "breath_prayer"],
  conviction: ["personal", "book_study"],
  joy: ["personal", "psalm_journey"],
  lament: ["personal", "psalm_journey"],
  justice: ["personal", "book_study"],
  discipline: ["personal", "book_study", "lords_prayer"],
  wonder: ["personal", "psalm_journey"],
};

export interface Recommendation {
  theme: string;
  themeName: string;
  type: string;
  subject?: string;
  reason: string;
  suggestedLength: 7 | 14;
}

export async function generateRecommendation(userId: string): Promise<Recommendation> {
  if (!db) throw new Error("Database not available");

  // ── Gather signals ────────────────────────────────────────────

  // 1. Past themes (last 10 devotionals)
  const pastDevotionals = await db
    .select({
      themeCategory: schema.syncDevotionals.themeCategory,
      devotionalType: schema.syncDevotionals.devotionalType,
      totalDays: schema.syncDevotionals.totalDays,
      createdAt: schema.syncDevotionals.createdAt,
    })
    .from(schema.syncDevotionals)
    .where(eq(schema.syncDevotionals.clerkUserId, userId))
    .orderBy(desc(schema.syncDevotionals.createdAt))
    .limit(10);

  // 2. Recent journal/reflection content (last 5 days with bodyText)
  const recentDays = await db
    .select({
      title: schema.syncDevotionalDays.title,
      content: schema.syncDevotionalDays.content,
    })
    .from(schema.syncDevotionalDays)
    .where(
      and(
        eq(schema.syncDevotionalDays.clerkUserId, userId),
        schema.syncDevotionalDays.isRead,
      ),
    )
    .orderBy(desc(schema.syncDevotionalDays.readAt))
    .limit(5);

  // 3. Recent mood (last 7 check-ins)
  const recentCheckIns = await db
    .select({ mood: schema.syncCheckIns.mood })
    .from(schema.syncCheckIns)
    .where(eq(schema.syncCheckIns.clerkUserId, userId))
    .orderBy(desc(schema.syncCheckIns.createdAt))
    .limit(7);

  // 4. Used scriptures (all-time for canon coverage)
  const usedBooks = await db
    .select({ book: schema.syncUsedScriptures.book })
    .from(schema.syncUsedScriptures)
    .where(eq(schema.syncUsedScriptures.clerkUserId, userId));

  // 5. User aboutMe for reason text
  const [userRow] = await db
    .select({ aboutMe: schema.syncUsers.aboutMe })
    .from(schema.syncUsers)
    .where(eq(schema.syncUsers.clerkUserId, userId))
    .limit(1);

  // ── Score themes ──────────────────────────────────────────────

  const scores: Record<string, number> = {};
  for (const theme of ALL_THEMES) {
    scores[theme] = BASE_WEIGHTS[theme];
  }

  // Recency penalty
  const pastThemes = pastDevotionals
    .map((d) => d.themeCategory)
    .filter(Boolean) as string[];
  for (let i = 0; i < pastThemes.length; i++) {
    const theme = pastThemes[i];
    if (scores[theme] !== undefined) {
      if (i < 2) scores[theme] *= 0.5;       // Last 2 series: -50%
      else if (i < 4) scores[theme] *= 0.75;  // Last 4 series: -25%
    }
  }

  // Mood boost
  if (recentCheckIns.length > 0) {
    const avgMood =
      recentCheckIns.reduce((sum, c) => sum + (c.mood ?? 5), 0) /
      recentCheckIns.length;
    const moodBucket =
      avgMood <= 3 ? "low" : avgMood <= 5 ? "neutral" : "high";
    const moodThemes = MOOD_THEME_MAP[moodBucket];
    for (const theme of moodThemes) {
      scores[theme] *= 1.25;
    }
  }

  // Season bonus
  const seasonalThemes = getSeasonalThemes();
  for (const theme of seasonalThemes) {
    scores[theme] *= 1.15;
  }

  // Scripture coverage bonus — themes focusing on underexplored regions
  const usedBookSet = new Set(usedBooks.map((b) => b.book));
  const SCRIPTURE_FOCUS: Partial<Record<ThemeCategory, string[]>> = {
    lament: ["Lamentations", "Job", "Psalms"],
    wonder: ["Genesis", "Revelation", "Psalms"],
    justice: ["Amos", "Micah", "Isaiah"],
    discipline: ["Proverbs", "James", "1 Timothy"],
  };
  for (const [theme, books] of Object.entries(SCRIPTURE_FOCUS)) {
    const unexplored = (books as string[]).filter((b) => !usedBookSet.has(b));
    if (unexplored.length >= 2) {
      scores[theme] *= 1.2;
    }
  }

  // Journal theme analysis — use Haiku to extract spiritual themes
  let journalThemes: string[] = [];
  if (recentDays.length >= 2) {
    const journalContent = recentDays
      .map((d) => {
        const content = d.content as Record<string, unknown> | null;
        const reflections = (content?.reflectionQuestions as string[]) ?? [];
        return reflections.join(" ");
      })
      .filter(Boolean)
      .join("\n\n");

    if (journalContent.length > 50) {
      try {
        const { text } = await callAI({
          model: "claude-haiku-4-5-20251001",
          system:
            "You analyze journal reflections to identify spiritual themes. Return ONLY a JSON array of 1-3 theme IDs from this list: " +
            ALL_THEMES.join(", ") +
            '. Example: ["rest","hope"]. No explanation.',
          messages: [
            {
              role: "user",
              content: `These are recent journal reflections from a devotional app user:\n\n${journalContent.slice(0, 2000)}`,
            },
          ],
          maxTokens: 100,
          temperature: 0,
          uid: userId,
          endpoint: "recommendation-journal-analysis",
        });
        const parsed = JSON.parse(text.match(/\[.*\]/s)?.[0] ?? "[]");
        journalThemes = parsed.filter((t: string) =>
          ALL_THEMES.includes(t as ThemeCategory),
        );
      } catch {
        // Journal analysis is optional — proceed without it
      }
    }
  }

  // Apply journal theme boost (+35%)
  for (const theme of journalThemes) {
    if (scores[theme] !== undefined) {
      scores[theme] *= 1.35;
    }
  }

  // ── Select winner ─────────────────────────────────────────────

  const sortedThemes = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const winningTheme = sortedThemes[0][0] as ThemeCategory;

  // Pick compatible type, avoiding most recent
  const lastType = pastDevotionals[0]?.devotionalType ?? "";
  const compatible = COMPATIBLE_TYPES[winningTheme] ?? ["personal"];
  const selectedType =
    compatible.find((t) => t !== lastType) ?? compatible[0];

  // Determine suggested length
  const hasCompletedLong = pastDevotionals.some(
    (d) => (d.totalDays ?? 0) >= 14,
  );
  const lastCreated = pastDevotionals[0]?.createdAt;
  const daysSinceLastSeries = lastCreated
    ? Math.floor(
        (Date.now() - new Date(lastCreated as string).getTime()) /
          (1000 * 60 * 60 * 24),
      )
    : 999;
  const suggestedLength: 7 | 14 =
    daysSinceLastSeries > 30 ? 7 : hasCompletedLong ? 14 : 7;

  // ── Generate reason text ──────────────────────────────────────

  let reason = `A ${suggestedLength}-day series on ${THEME_NAMES[winningTheme].toLowerCase()} — right where you are right now.`;

  try {
    const moodContext =
      recentCheckIns.length > 0
        ? `Recent mood average: ${(recentCheckIns.reduce((s, c) => s + (c.mood ?? 5), 0) / recentCheckIns.length).toFixed(1)}/8`
        : "";
    const journalContext =
      journalThemes.length > 0
        ? `Journal themes: ${journalThemes.join(", ")}`
        : "";

    const { text } = await callAI({
      model: "claude-haiku-4-5-20251001",
      system: `You write one-sentence recommendations for a Bible devotional app. The sentence should feel warm and personal without using the reader's name. Under 25 words. No quotes. No exclamation marks. Reference what you know about where they are spiritually, not just the theme name.`,
      messages: [
        {
          role: "user",
          content: `Recommend a devotional series on "${THEME_NAMES[winningTheme]}" (theme: ${winningTheme}).
User context: ${userRow?.aboutMe ?? "No context available"}
${moodContext}
${journalContext}
Write one sentence explaining why this theme fits them right now.`,
        },
      ],
      maxTokens: 60,
      temperature: 0.7,
      uid: userId,
      endpoint: "recommendation-reason",
    });

    if (text && text.length > 10 && text.length < 200) {
      reason = text.trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // Fallback reason already set above
  }

  return {
    theme: winningTheme,
    themeName: THEME_NAMES[winningTheme],
    type: selectedType,
    suggestedLength,
    reason,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd ~/clawd/work/unfold/backend && npx tsc --noEmit 2>&1 | grep "recommendation" | head -10`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd ~/clawd/work/unfold/backend
git add src/lib/recommendation-engine.ts
git commit -m "feat: add recommendation engine with weighted theme scoring

Scores all 16 themes using 6 signals: recency penalty, journal themes
(via Haiku), mood match, seasonal bonus, scripture coverage, and base
weights. Selects compatible type and generates personalized reason text.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Recommendation route + register

**Files:**
- Create: `backend/src/routes/recommendations.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Create the route handler**

Create `backend/src/routes/recommendations.ts`:

```typescript
import { Router, Request, Response } from "express";
import { generateRecommendation } from "../lib/recommendation-engine";

const router = Router();

/**
 * GET /api/recommendations/next-series
 * Returns a personalized series recommendation for the authenticated user.
 */
router.get("/next-series", async (req: Request, res: Response) => {
  const uid = req.uid;
  if (!uid) {
    return void res.status(401).json({ error: "Unauthenticated" });
  }

  try {
    const recommendation = await generateRecommendation(uid);
    res.json(recommendation);
  } catch (err) {
    console.error("[recommendations] Failed to generate:", err);
    res.status(500).json({ error: "Failed to generate recommendation" });
  }
});

export default router;
```

- [ ] **Step 2: Register the route in index.ts**

In `backend/src/index.ts`, add the import near the other router imports:

```typescript
import recommendationsRouter from "./routes/recommendations";
```

Add the route registration after the `usersRouter` line:

```typescript
// Recommendations — personalized next-series suggestions
app.use("/api/recommendations", authMiddleware, rateLimitMiddleware, recommendationsRouter);
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd ~/clawd/work/unfold/backend && npx tsc --noEmit 2>&1 | head -10`
Expected: No errors (or only pre-existing ones)

- [ ] **Step 4: Test manually with curl**

Start the backend locally (if possible) or test against production:

```bash
curl -s https://unfold-backend-production.up.railway.app/api/recommendations/next-series \
  -H "Authorization: Bearer <clerk-token>" | jq .
```

Expected: JSON with `theme`, `themeName`, `type`, `reason`, `suggestedLength`

- [ ] **Step 5: Commit**

```bash
cd ~/clawd/work/unfold/backend
git add src/routes/recommendations.ts src/index.ts
git commit -m "feat: add GET /api/recommendations/next-series endpoint

Authenticated endpoint that returns a personalized series recommendation
based on the user's reading history, mood, journal themes, and season.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Push backend to GitHub**

```bash
cd ~/clawd/work/unfold/backend && git push origin main
```

---

### Task 3: Mobile — RecommendedSeriesCard component

**Files:**
- Create: `app/mobile/src/components/home/RecommendedSeriesCard.tsx`

- [ ] **Step 1: Create the recommendation card component**

Create `app/mobile/src/components/home/RecommendedSeriesCard.tsx`:

```typescript
/**
 * Recommendation card shown when user has no active series.
 * Fetches a personalized recommendation from the backend and displays
 * theme, reason text, and quick-start CTA.
 */

import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { useAccessibleAnimation } from '@/hooks/useAccessibleAnimation';
import { alpha, AccentGlow } from '@/components/ui';
import { FontFamily } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { useUnfoldStore } from '@/lib/store';
import { PRIMARY_BACKEND_URL, getAuthHeaders } from '@/lib/api-config';

interface Recommendation {
  theme: string;
  themeName: string;
  type: string;
  subject?: string;
  reason: string;
  suggestedLength: 7 | 14;
}

interface RecommendedSeriesCardProps {
  /** "completion" renders inside journey-complete, "empty" renders standalone */
  variant: 'completion' | 'empty';
  onChooseOther: () => void;
}

export function RecommendedSeriesCard({ variant, onChooseOther }: RecommendedSeriesCardProps) {
  const { colors, isDark } = useTheme();
  const { entering } = useAccessibleAnimation();
  const router = useRouter();
  const updateUser = useUnfoldStore((s) => s.updateUser);

  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchRecommendation() {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`${PRIMARY_BACKEND_URL}/api/recommendations/next-series`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: Recommendation = await res.json();
        if (!cancelled) {
          setRecommendation(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    }

    fetchRecommendation();
    return () => { cancelled = true; };
  }, []);

  const handleStartStudy = () => {
    if (!recommendation) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    updateUser({
      selectedTheme: recommendation.theme as any,
      selectedType: recommendation.type as any,
      selectedStudySubject: recommendation.subject,
      devotionalLength: recommendation.suggestedLength as any,
    });
    router.push('/generating');
  };

  // Error or no recommendation → don't render (parent will show generic CTA)
  if (error || (!loading && !recommendation)) return null;

  // Loading state — subtle shimmer
  if (loading) {
    return (
      <Animated.View entering={entering(FadeIn.duration(200))}>
        <View style={[styles.card, {
          backgroundColor: Platform.OS === 'ios'
            ? alpha(colors.backgroundElevated, 0.6)
            : alpha(colors.backgroundElevated, 0.85),
          borderColor: alpha(colors.accent, 0.09),
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 120,
        }]}>
          {Platform.OS === 'ios' && (
            <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          )}
          <ActivityIndicator color={colors.textMuted} size="small" />
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={entering(FadeIn.duration(300))}>
      <View style={[styles.card, {
        backgroundColor: Platform.OS === 'ios'
          ? alpha(colors.backgroundElevated, 0.6)
          : alpha(colors.backgroundElevated, 0.85),
        borderColor: alpha(colors.accent, 0.09),
        overflow: 'hidden',
      }]}>
        {Platform.OS === 'ios' && (
          <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        )}

        {variant === 'empty' && (
          <Text style={[styles.eyebrow, { color: colors.textHint }]}>
            Recommended for you
          </Text>
        )}

        {variant === 'completion' && (
          <View style={[styles.divider, { borderColor: alpha(colors.textMuted, 0.2) }]}>
            <Text style={[styles.dividerText, { color: colors.textMuted }]}>Up Next</Text>
          </View>
        )}

        <Text style={[styles.themeName, { color: colors.text }]}>
          {recommendation!.themeName}
        </Text>

        <Text style={[styles.reason, { color: colors.textMuted }]}>
          {recommendation!.reason}
        </Text>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleStartStudy}
          accessibilityRole="button"
          accessibilityLabel="Start this study"
        >
          <AccentGlow color={colors.accent} intensity="medium" active style={{ borderRadius: Radius.md }}>
            <View style={[styles.cta, { backgroundColor: colors.accent }]}>
              <Text style={[styles.ctaText, { color: colors.background }]}>
                Start This Study
              </Text>
            </View>
          </AccentGlow>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onChooseOther}
          accessibilityRole="button"
          accessibilityLabel="Choose something else"
          style={styles.secondaryAction}
        >
          <Text style={[styles.secondaryText, { color: colors.textMuted }]}>
            or choose something else
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    borderWidth: 1,
    padding: Spacing['5'],
  },
  eyebrow: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    marginBottom: Spacing['3'],
  },
  divider: {
    borderTopWidth: 1,
    paddingTop: Spacing['3'],
    marginBottom: Spacing['3'],
  },
  dividerText: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  themeName: {
    fontFamily: FontFamily.body,
    fontSize: 20,
    fontWeight: '600' as const,
    marginBottom: Spacing['2'],
  },
  reason: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: Spacing['5'],
  },
  cta: {
    paddingVertical: Spacing['3.5'],
    paddingHorizontal: Spacing['4'],
    borderRadius: Radius.md,
    alignItems: 'center' as const,
  },
  ctaText: {
    fontFamily: FontFamily.ui,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  secondaryAction: {
    alignItems: 'center' as const,
    paddingTop: Spacing['3'],
  },
  secondaryText: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd ~/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | grep "RecommendedSeries" | head -5`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd ~/clawd/work/unfold/app/mobile
git add src/components/home/RecommendedSeriesCard.tsx
git commit -m "feat: add RecommendedSeriesCard component

Fetches personalized recommendation from backend, shows theme name
and reason text with Start This Study CTA. Two variants: 'empty'
for returning empty state, 'completion' for journey-complete card.
Glassmorphism styling, shimmer loading, graceful error fallback.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Wire RecommendedSeriesCard into DevotionalCard

**Files:**
- Modify: `app/mobile/src/components/home/DevotionalCard.tsx`

- [ ] **Step 1: Import RecommendedSeriesCard**

Add at the top of `DevotionalCard.tsx`:

```typescript
import { RecommendedSeriesCard } from './RecommendedSeriesCard';
```

- [ ] **Step 2: Update ReturningEmptyState to show recommendation**

Read the current `ReturningEmptyState` function. Replace the body content (the title, subtitle, and "Start a New Study" CTA) with the `RecommendedSeriesCard` as the primary content, keeping the generic CTA as a fallback if the recommendation fails.

Find the `ReturningEmptyState` function and update it to:

```typescript
function ReturningEmptyState({ onCreateNew }: { onCreateNew: () => void }) {
  const { colors, isDark } = useTheme();
  const { entering, reducedMotion } = useAccessibleAnimation();
  const glowOpacity = useSharedValue(0.18);

  useEffect(() => {
    if (reducedMotion) return;
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.38, { duration: 1400 }),
        withTiming(0.18, { duration: 1400 }),
      ),
      -1,
    );
  }, [reducedMotion]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const [showFallback, setShowFallback] = useState(false);

  return (
    <Animated.View entering={entering(FadeIn.duration(400))}>
      <View style={[styles.returningCard, {
        backgroundColor: Platform.OS === 'ios'
          ? alpha(colors.backgroundElevated, 0.6)
          : alpha(colors.backgroundElevated, 0.85),
        borderColor: alpha(colors.accent, 0.12),
        overflow: 'hidden',
      }]}>
        {Platform.OS === 'ios' && (
          <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        )}

        {/* Pulsing accent glow overlay */}
        <Animated.View style={[StyleSheet.absoluteFill, glowStyle, { backgroundColor: colors.accent, borderRadius: Radius.card }]} pointerEvents="none" />

        {/* Ember particles */}
        {!reducedMotion && Array.from({ length: 8 }).map((_, i) => (
          <EmberParticle key={i} index={i} color={colors.accent} />
        ))}

        <RecommendedSeriesCard
          variant="empty"
          onChooseOther={onCreateNew}
        />
      </View>
    </Animated.View>
  );
}
```

Note: The `RecommendedSeriesCard` handles its own loading/error states. When it errors, it returns `null`, so the card will show as empty — which is acceptable for v1. If you want the generic fallback to appear, wrap it:

```typescript
        {showFallback ? (
          <>
            <Text style={[styles.returningTitle, { color: colors.text }]}>
              Ready for your next study?
            </Text>
            {/* ... existing generic CTA ... */}
          </>
        ) : (
          <RecommendedSeriesCard
            variant="empty"
            onChooseOther={onCreateNew}
          />
        )}
```

However, the simpler approach is to let `RecommendedSeriesCard` handle the fallback internally by rendering the generic content when the fetch fails. The implementer should read the existing `ReturningEmptyState` to determine the cleanest integration — the key requirement is that the recommendation card replaces the static content, and "or choose something else" calls `onCreateNew`.

- [ ] **Step 3: Update JourneyCompleteState to show recommendation below completion**

Find the `JourneyCompleteState` function. After the existing completion content (the checkmark, title, "Series Complete" text), add the `RecommendedSeriesCard` with variant `"completion"`:

```typescript
        <RecommendedSeriesCard
          variant="completion"
          onChooseOther={onCreateNew}
        />
```

This replaces the existing "Start a New Study" button in the journey-complete card.

- [ ] **Step 4: Add `useState` import if not already present**

Ensure `useState` is imported from 'react' at the top of the file.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd ~/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | grep "DevotionalCard" | head -10`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
cd ~/clawd/work/unfold/app/mobile
git add src/components/home/DevotionalCard.tsx
git commit -m "feat: wire RecommendedSeriesCard into empty + journey-complete states

ReturningEmptyState now shows personalized recommendation instead of
generic 'Start a New Study'. JourneyCompleteState shows recommendation
below the completion celebration as 'Up Next'.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Integration verify + push

**Files:**
- All modified files from Tasks 1-4

- [ ] **Step 1: Run all tests**

Run: `cd ~/clawd/work/unfold/app/mobile && npx jest --no-coverage 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 2: Full TypeScript check**

Run: `cd ~/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | grep -v "node_modules\|e2e/\|scripts/\|playwright\|autonomous" | head -20`
Expected: No new errors

- [ ] **Step 3: Push mobile to GitHub**

```bash
cd ~/clawd/work/unfold/app/mobile && git push origin main
```

- [ ] **Step 4: Push backend to GitHub (if not already pushed in Task 2)**

```bash
cd ~/clawd/work/unfold/backend && git push origin main
```

- [ ] **Step 5: Verify in simulator**

Build and run the app. Complete a devotional series (or use a test account with no active series). The returning empty state should show the recommendation card instead of the generic "Start a New Study". Tap "Start This Study" and verify it navigates to the generating screen with the recommended theme pre-filled.

Take a screenshot: `xcrun simctl io booted screenshot /tmp/recommended-series.png && sips -Z 1000 /tmp/recommended-series.png`
