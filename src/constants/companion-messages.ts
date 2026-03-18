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
  const fallback = "How are you doing today?";
  if (ctx.isFirstCompanionCheckIn) {
    return COMPANION_QUESTIONS.find((q) => q.condition === 'first_time')?.text ?? fallback;
  }
  if (ctx.daysSinceLastOpen >= 3) {
    return COMPANION_QUESTIONS.find((q) => q.condition === 'returning_after_gap')?.text ?? fallback;
  }
  if (ctx.streakCurrent > 0 && ctx.streakCurrent % 7 === 0) {
    return COMPANION_QUESTIONS.find((q) => q.condition === 'streak_milestone')?.text ?? fallback;
  }
  if (ctx.hasActiveSeries && ctx.hasReadToday) {
    return COMPANION_QUESTIONS.find((q) => q.condition === 'read_today')?.text ?? fallback;
  }
  if (ctx.hasActiveSeries && !ctx.hasReadToday) {
    return COMPANION_QUESTIONS.find((q) => q.condition === 'has_active_not_read')?.text ?? fallback;
  }
  if (!ctx.hasActiveSeries) {
    return COMPANION_QUESTIONS.find((q) => q.condition === 'between_series')?.text ?? fallback;
  }
  return COMPANION_QUESTIONS.find((q) => q.condition === 'default')?.text ?? fallback;
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
  /** Personalized messages when companion has a name */
  namedMessages?: string[];
  /** Personalized messages referencing current devotional theme */
  themedMessages?: string[];
  /** Messages with both name and theme */
  namedThemedMessages?: string[];
}

export const TOOLTIP_TRIGGERS: TooltipTrigger[] = [
  {
    condition: 'first_open_morning',
    messages: ['Morning! How are you feeling?', 'Hey, how\'d you sleep?'],
    namedMessages: ['{name} here. How\'d you sleep?', 'Morning! {name} checking in.'],
    themedMessages: ['Morning! Still thinking about that {theme} series?', 'How\'d you sleep? That {theme} reading was something.'],
    namedThemedMessages: ['{name} here. Still thinking about that {theme} series?'],
  },
  {
    condition: 'first_open_afternoon',
    messages: ['Hey! How\'s your day going?', 'What\'s on your mind today?'],
    namedMessages: ['{name} here. How\'s today going?', 'Hey! What\'s on your mind?'],
    themedMessages: ['How\'s your day? That {theme} passage was on my mind.', 'Afternoon check-in. Still sitting with that {theme} reading?'],
    namedThemedMessages: ['{name} here. That {theme} reading was on my mind too.'],
  },
  {
    condition: 'first_open_evening',
    messages: ['Winding down? How was today?', 'Hey, how are you doing tonight?'],
    namedMessages: ['{name} here. How was today?', 'Evening! {name} checking in.'],
    themedMessages: ['Winding down? How are you sitting with that {theme} series?', 'Evening. That {theme} reading hit different today.'],
    namedThemedMessages: ['{name} here. How are you sitting with that {theme} series?'],
  },
  {
    condition: 'after_reading',
    messages: ['What stood out to you in that one?', 'How are you feeling after that?'],
    namedMessages: ['{name} here. What stood out to you?', 'How are you feeling after that one?'],
  },
  {
    condition: 'returning_after_gap',
    messages: ['Hey! Good to see you back.', 'Welcome back, no pressure.'],
    namedMessages: ['{name} here. Good to see you back!', 'Welcome back! {name} missed you.'],
    themedMessages: ['Welcome back. Ready to pick up that {theme} series?', 'Hey! That {theme} series is waiting for you.'],
    namedThemedMessages: ['{name} here. Ready to pick up that {theme} series?'],
  },
  {
    condition: 'streak_milestone',
    messages: ['That streak is legit. Keep it up!'],
    namedMessages: ['{name} here. That streak is legit!'],
  },
  {
    condition: 'between_series',
    messages: ['What\'s been on your mind lately?', 'Ready to start something new?'],
    namedMessages: ['{name} here. What\'s been on your mind?', '{name} here. Ready to start something new?'],
  },
];

export interface TooltipParams {
  companionName?: string | null;
  currentTheme?: string | null;
  userName?: string | null;
}

function fillTemplate(template: string, params: TooltipParams): string {
  let result = template;
  if (params.companionName) {
    result = result.replace(/{name}/g, params.companionName);
  }
  if (params.currentTheme) {
    result = result.replace(/{theme}/g, params.currentTheme);
  }
  return result;
}

export function selectTooltipMessage(condition: string, params?: TooltipParams): string | null {
  const trigger = TOOLTIP_TRIGGERS.find((t) => t.condition === condition);
  if (!trigger) return null;

  const hasName = params?.companionName;
  const hasTheme = params?.currentTheme;

  // Pick the most personalized message pool available
  let pool: string[];
  if (hasName && hasTheme && trigger.namedThemedMessages?.length) {
    pool = trigger.namedThemedMessages;
  } else if (hasTheme && trigger.themedMessages?.length) {
    pool = trigger.themedMessages;
  } else if (hasName && trigger.namedMessages?.length) {
    pool = trigger.namedMessages;
  } else {
    pool = trigger.messages;
  }

  const message = pool[Math.floor(Math.random() * pool.length)];
  return params ? fillTemplate(message, params) : message;
}
