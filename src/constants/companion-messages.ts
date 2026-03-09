/**
 * Companion Persona Messages
 *
 * The companion is a close friend who's a couple years ahead of you in faith.
 * Not a sage. Not a pastor. Not a therapist. Short, warm, honest. 1-2 lines max.
 */

// --- Context buckets ---
export type CompanionContext =
  | 'has_active_series'
  | 'between_series'
  | 'first_time'
  | 'returning_after_gap';

// --- Emotion pills ---
export const COMPANION_MOODS = [
  { value: 1 as const, label: 'Grateful' },
  { value: 2 as const, label: 'Peaceful' },
  { value: 3 as const, label: 'Hopeful' },
  { value: 4 as const, label: 'Restless' },
  { value: 5 as const, label: 'Heavy' },
  { value: 6 as const, label: 'Confused' },
];

export type CompanionMoodLabel = (typeof COMPANION_MOODS)[number]['label'];

// --- Context-aware questions ---
export interface CompanionQuestion {
  condition: string;
  text: string;
}

export const COMPANION_QUESTIONS: CompanionQuestion[] = [
  { condition: 'first_time', text: "Hey! I'm here whenever you wanna check in." },
  { condition: 'returning_after_gap', text: "Hey, good to see you! How've you been?" },
  { condition: 'streak_milestone', text: "Look at that streak! How are you feeling?" },
  { condition: 'read_today', text: "What'd you think of today's reading?" },
  { condition: 'has_active_not_read', text: 'No rush — how are you doing today?' },
  { condition: 'between_series', text: "What's been on your mind lately?" },
  { condition: 'default', text: 'Real talk — how\'s today going?' },
];

export function selectCompanionQuestion(ctx: {
  isFirstCompanionCheckIn: boolean;
  daysSinceLastOpen: number;
  hasActiveSeries: boolean;
  hasReadToday: boolean;
  streakCurrent: number;
}): string {
  if (ctx.isFirstCompanionCheckIn) {
    return COMPANION_QUESTIONS.find((q) => q.condition === 'first_time')!.text;
  }
  if (ctx.daysSinceLastOpen >= 3) {
    return COMPANION_QUESTIONS.find((q) => q.condition === 'returning_after_gap')!.text;
  }
  if (ctx.streakCurrent > 0 && ctx.streakCurrent % 7 === 0) {
    return COMPANION_QUESTIONS.find((q) => q.condition === 'streak_milestone')!.text;
  }
  if (ctx.hasActiveSeries && ctx.hasReadToday) {
    return COMPANION_QUESTIONS.find((q) => q.condition === 'read_today')!.text;
  }
  if (ctx.hasActiveSeries && !ctx.hasReadToday) {
    return COMPANION_QUESTIONS.find((q) => q.condition === 'has_active_not_read')!.text;
  }
  if (!ctx.hasActiveSeries) {
    return COMPANION_QUESTIONS.find((q) => q.condition === 'between_series')!.text;
  }
  return COMPANION_QUESTIONS.find((q) => q.condition === 'default')!.text;
}

// --- Mood × Context response matrix (24 variants) ---
type ResponseKey = `${CompanionMoodLabel}_${CompanionContext}`;

const COMPANION_RESPONSES: Record<ResponseKey, string> = {
  // Grateful
  Grateful_has_active_series: "Love that. Gratitude hits different when you're in a rhythm.",
  Grateful_between_series: "Grateful even in the in-between — that's real growth.",
  Grateful_first_time: "Starting grateful? I love that energy.",
  Grateful_returning_after_gap: "Back and grateful — that's a great place to be.",

  // Peaceful
  Peaceful_has_active_series: "That peace is the good stuff. Soak it in.",
  Peaceful_between_series: "Peaceful in the pause — that's actually rare. Enjoy it.",
  Peaceful_first_time: "Starting from a peaceful place. I love that for you.",
  Peaceful_returning_after_gap: "Peaceful return. No rush — go at your own pace.",

  // Hopeful
  Hopeful_has_active_series: "Hope and consistency go hand in hand. You're proving it.",
  Hopeful_between_series: "Feeling hopeful about what's next? Follow that.",
  Hopeful_first_time: "Hope is what brought you here. That matters.",
  Hopeful_returning_after_gap: "Coming back hopeful — I respect that.",

  // Restless
  Restless_has_active_series: "Restless can mean something's shifting. Pay attention to that.",
  Restless_between_series: "Feeling restless? Maybe it's time to start something new.",
  Restless_first_time: "Restless is honest. You don't need to have it all figured out.",
  Restless_returning_after_gap: "Restless but you showed up. That counts.",

  // Heavy
  Heavy_has_active_series: "I hear you. You don't have to carry that alone.",
  Heavy_between_series: "Heavy days happen. You don't have to push through — just be here.",
  Heavy_first_time: "Thanks for being honest about that. It takes guts.",
  Heavy_returning_after_gap: "Heavy and still here. That says something about you.",

  // Confused
  Confused_has_active_series: "Confusion is part of the process. It won't last forever.",
  Confused_between_series: "Not sure what's next? Totally fine. Clarity will come.",
  Confused_first_time: "Confused is a fine place to start. No rush.",
  Confused_returning_after_gap: "Coming back with questions is more honest than faking answers.",
};

export function getCompanionResponse(
  moodLabel: CompanionMoodLabel,
  context: CompanionContext,
): string {
  const key = `${moodLabel}_${context}` as ResponseKey;
  return COMPANION_RESPONSES[key] || "I'm glad you checked in. That matters.";
}

// --- Suggestion pills ---
export const COMPANION_SUGGESTIONS: Record<CompanionContext, string[]> = {
  has_active_series: ['Sit with this', 'Continue reading'],
  between_series: ['Start something new', 'Sit with this'],
  first_time: ['Explore a topic', 'Sit with this'],
  returning_after_gap: ['Pick up where I left off', 'Start fresh'],
};

// --- Tooltip messages (unprompted orb communication) ---
export interface TooltipTrigger {
  condition: string;
  messages: string[];
}

export const TOOLTIP_TRIGGERS: TooltipTrigger[] = [
  {
    condition: 'first_open_morning',
    messages: ['Morning! How are you feeling?', 'Hey, how\'d you sleep?'],
  },
  {
    condition: 'first_open_afternoon',
    messages: ['Hey! How\'s your day going?', 'What\'s on your mind today?'],
  },
  {
    condition: 'first_open_evening',
    messages: ['Winding down? How was today?', 'Hey, how are you doing tonight?'],
  },
  {
    condition: 'after_reading',
    messages: ['What stood out to you in that one?', 'How are you feeling after that?'],
  },
  {
    condition: 'returning_after_gap',
    messages: ['Hey! Good to see you back.', 'Welcome back — no pressure.'],
  },
  {
    condition: 'streak_milestone',
    messages: ['That streak is legit. Keep it up!'],
  },
  {
    condition: 'between_series',
    messages: ['What\'s been on your mind lately?', 'Ready to start something new?'],
  },
];

export function selectTooltipMessage(condition: string): string | null {
  const trigger = TOOLTIP_TRIGGERS.find((t) => t.condition === condition);
  if (!trigger) return null;
  return trigger.messages[Math.floor(Math.random() * trigger.messages.length)];
}
