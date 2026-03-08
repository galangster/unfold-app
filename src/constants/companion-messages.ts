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
  { condition: 'first_time', text: "Hey. I'm here whenever you want to check in." },
  { condition: 'returning_after_gap', text: "It's good to see you. How have you been?" },
  { condition: 'streak_milestone', text: "You're building something real. How does it feel?" },
  { condition: 'read_today', text: "How did today's reading land?" },
  { condition: 'has_active_not_read', text: 'No rush — how are you today?' },
  { condition: 'between_series', text: "What's been on your mind since your last series?" },
  { condition: 'default', text: 'Quick honest moment — how\'s today going?' },
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
  Grateful_has_active_series: "That gratitude? It's the reading taking root. Hold onto it.",
  Grateful_between_series: 'Grateful between the chapters. That says a lot about where you are.',
  Grateful_first_time: "Starting from a place of gratitude. That's a good sign.",
  Grateful_returning_after_gap: "Glad you're back — and grateful. That's a beautiful place to be.",

  // Peaceful
  Peaceful_has_active_series: 'Peace in the middle of it all. Let that settle deep.',
  Peaceful_between_series: "Peaceful in the pause. That's rare — enjoy it.",
  Peaceful_first_time: "Peace is a good starting point. Let's stay here a minute.",
  Peaceful_returning_after_gap: 'Peaceful return. No rush. This is your pace.',

  // Hopeful
  Hopeful_has_active_series: 'Hope has a way of showing up when you stay consistent.',
  Hopeful_between_series: "Hopeful for what's next? That energy is worth following.",
  Hopeful_first_time: 'Hope brought you here. That matters more than you think.',
  Hopeful_returning_after_gap: 'Coming back with hope. That takes something real.',

  // Restless
  Restless_has_active_series: 'Restlessness can be God stirring something. Pay attention to it.',
  Restless_between_series: "Restless in the gap. Maybe it's time for something new.",
  Restless_first_time: "Restless is honest. You don't have to have it figured out.",
  Restless_returning_after_gap: "Restless but here. That's enough for today.",

  // Heavy
  Heavy_has_active_series: "Heavy is honest. You don't have to carry it alone.",
  Heavy_between_series: "Heavy days happen. You don't have to push through — just be here.",
  Heavy_first_time: "You brought something heavy here. That takes courage.",
  Heavy_returning_after_gap: "Heavy and still showed up. That's not nothing.",

  // Confused
  Confused_has_active_series: "Confusion is part of the process. Stay with it.",
  Confused_between_series: "Not sure what's next? That's okay. Clarity comes.",
  Confused_first_time: "Confused is a fine place to start. No need to rush to answers.",
  Confused_returning_after_gap: "Back with questions. That's more honest than pretending to have answers.",
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
    messages: ['Good morning. How are you today?', 'New day. How are you feeling?'],
  },
  {
    condition: 'first_open_afternoon',
    messages: ['Hey. How\'s the day going?', 'Afternoon check — how are you?'],
  },
  {
    condition: 'first_open_evening',
    messages: ['Winding down? How was today?', 'Evening. How are you sitting?'],
  },
  {
    condition: 'after_reading',
    messages: ['That one was something. How did it land?', 'How are you sitting with that?'],
  },
  {
    condition: 'returning_after_gap',
    messages: ['Hey, good to see you.', 'Welcome back. No guilt.'],
  },
  {
    condition: 'streak_milestone',
    messages: ['Look at that streak. That\'s real.'],
  },
  {
    condition: 'between_series',
    messages: ['What\'s been on your mind lately?', 'Ready for something new?'],
  },
];

export function selectTooltipMessage(condition: string): string | null {
  const trigger = TOOLTIP_TRIGGERS.find((t) => t.condition === condition);
  if (!trigger) return null;
  return trigger.messages[Math.floor(Math.random() * trigger.messages.length)];
}
