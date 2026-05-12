/**
 * Premium Nudge System — State Management & Logic
 *
 * Tracks nudge impressions, enforces frequency caps, cooldowns,
 * and lifetime limits. Persisted via the main Zustand store.
 *
 * Rules:
 *  - Max 1 nudge per session (app foreground cycle)
 *  - 3-day cooldown between same nudge type
 *  - Never show nudges to premium users
 *  - Total lifetime cap: 10 nudge impressions then stop
 *  - Priority: streak > audio > journey
 */

export type NudgeType = 'streak_freeze' | 'audio_teaser' | 'journey_completion';

export interface NudgeImpression {
  type: NudgeType;
  shownAt: string; // ISO timestamp
}

export interface NudgeState {
  /** All nudge impressions ever shown */
  nudgeImpressions: NudgeImpression[];
  /** Whether a nudge has already been shown this session */
  nudgeShownThisSession: boolean;
  /** Nudge types the user has explicitly dismissed (X button) */
  nudgeDismissals: { type: NudgeType; dismissedAt: string }[];
}

export const NUDGE_INITIAL_STATE: NudgeState = {
  nudgeImpressions: [],
  nudgeShownThisSession: false,
  nudgeDismissals: [],
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum total nudge impressions before we stop showing them forever */
const LIFETIME_CAP = 10;

/** Minimum days between showing the same nudge type */
const COOLDOWN_DAYS = 3;

/** Priority order — lower index = higher priority */
const PRIORITY_ORDER: NudgeType[] = ['streak_freeze', 'audio_teaser', 'journey_completion'];

// ---------------------------------------------------------------------------
// Helpers (pure functions — no store access)
// ---------------------------------------------------------------------------

/** Check if lifetime cap has been reached */
export function hasReachedLifetimeCap(impressions: NudgeImpression[]): boolean {
  return impressions.length >= LIFETIME_CAP;
}

/** Check if a specific nudge type is within its cooldown period */
export function isInCooldown(type: NudgeType, impressions: NudgeImpression[]): boolean {
  const lastShown = impressions
    .filter((i) => i.type === type)
    .sort((a, b) => new Date(b.shownAt).getTime() - new Date(a.shownAt).getTime())[0];

  if (!lastShown) return false;

  const daysSince = (Date.now() - new Date(lastShown.shownAt).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince < COOLDOWN_DAYS;
}

/** Check if nudge was recently dismissed (extra 2-day grace on top of cooldown) */
export function wasRecentlyDismissed(
  type: NudgeType,
  dismissals: { type: NudgeType; dismissedAt: string }[]
): boolean {
  const last = dismissals
    .filter((d) => d.type === type)
    .sort((a, b) => new Date(b.dismissedAt).getTime() - new Date(a.dismissedAt).getTime())[0];

  if (!last) return false;

  const daysSince = (Date.now() - new Date(last.dismissedAt).getTime()) / (1000 * 60 * 60 * 24);
  // After a dismiss, add 2 extra days on top of the regular cooldown
  return daysSince < COOLDOWN_DAYS + 2;
}

/** Get total impression count for a specific type */
export function getImpressionCount(type: NudgeType, impressions: NudgeImpression[]): number {
  return impressions.filter((i) => i.type === type).length;
}

/**
 * Given a set of eligible nudge types, return the highest-priority one.
 * Returns null if none are eligible.
 */
export function pickHighestPriority(eligible: NudgeType[]): NudgeType | null {
  if (eligible.length === 0) return null;

  for (const candidate of PRIORITY_ORDER) {
    if (eligible.includes(candidate)) return candidate;
  }

  return eligible[0];
}

// ---------------------------------------------------------------------------
// Nudge condition checkers (pure — receive data, return boolean)
// ---------------------------------------------------------------------------

export interface NudgeContext {
  screen: 'home' | 'reading';
  isPremium: boolean;
  streakCurrent: number;
  streakJustReset: boolean; // true when streak went from >0 to 0
  totalReadingsCompleted: number; // total days marked as read across all devotionals
  hasUsedAudio: boolean; // whether user has ever played audio
  seriesJustCompleted: string | null; // title of the just-completed series, or null
}

/**
 * Check if the streak freeze nudge should be shown.
 * Trigger: streak reset to 0 (lost) on the home screen.
 */
export function shouldShowStreakNudge(ctx: NudgeContext): boolean {
  if (ctx.screen !== 'home') return false;
  return ctx.streakJustReset;
}

/**
 * Check if the audio teaser nudge should be shown.
 * Trigger: 3+ readings completed, never used audio, on reading screen.
 */
export function shouldShowAudioNudge(ctx: NudgeContext): boolean {
  if (ctx.screen !== 'reading') return false;
  if (ctx.hasUsedAudio) return false;
  return ctx.totalReadingsCompleted >= 3;
}

/**
 * Check if the journey completion nudge should be shown.
 * Trigger: user just completed a devotional series, on home screen.
 */
export function shouldShowJourneyNudge(ctx: NudgeContext): boolean {
  if (ctx.screen !== 'home') return false;
  return ctx.seriesJustCompleted !== null && ctx.seriesJustCompleted.length > 0;
}

// ---------------------------------------------------------------------------
// Main evaluator
// ---------------------------------------------------------------------------

export interface EligibleNudge {
  type: NudgeType;
  message: string;
  cta: string;
  premiumFeature: string; // maps to PremiumFeatureSheet feature key
}

/**
 * Evaluate all nudge conditions and return the highest-priority eligible nudge.
 * Returns null if no nudge should be shown.
 */
export function evaluateNudges(
  ctx: NudgeContext,
  state: NudgeState
): EligibleNudge | null {
  // Gate: never show to premium users
  if (ctx.isPremium) return null;

  // Gate: already shown a nudge this session
  if (state.nudgeShownThisSession) return null;

  // Gate: lifetime cap reached
  if (hasReachedLifetimeCap(state.nudgeImpressions)) return null;

  // Check each nudge type and collect eligible ones
  const eligible: NudgeType[] = [];

  const candidateCheckers: Record<NudgeType, (ctx: NudgeContext) => boolean> = {
    streak_freeze: shouldShowStreakNudge,
    audio_teaser: shouldShowAudioNudge,
    journey_completion: shouldShowJourneyNudge,
  };

  for (const [type, checker] of Object.entries(candidateCheckers) as [NudgeType, (ctx: NudgeContext) => boolean][]) {
    if (!checker(ctx)) continue;
    if (isInCooldown(type, state.nudgeImpressions)) continue;
    if (wasRecentlyDismissed(type, state.nudgeDismissals)) continue;
    eligible.push(type);
  }

  const winner = pickHighestPriority(eligible);
  if (!winner) return null;

  return buildNudgePayload(winner, ctx);
}

/**
 * Build the display payload for a given nudge type.
 */
function buildNudgePayload(type: NudgeType, ctx: NudgeContext): EligibleNudge {
  switch (type) {
    case 'streak_freeze':
      return {
        type: 'streak_freeze',
        message: 'When a day gets away from you, Premium can quietly protect your devotional rhythm.',
        cta: 'See how',
        premiumFeature: 'streak',
      };
    case 'audio_teaser':
      return {
        type: 'audio_teaser',
        message: 'Premium can read today\'s devotional aloud when you need scripture to meet you hands-free.',
        cta: 'Preview audio',
        premiumFeature: 'audio',
      };
    case 'journey_completion': {
      const seriesName = ctx.seriesJustCompleted ?? 'your series';
      return {
        type: 'journey_completion',
        message: `You finished ${seriesName}. Premium can open another personal series whenever you are ready.`,
        cta: 'See Premium paths',
        premiumFeature: 'series',
      };
    }
  }
}
