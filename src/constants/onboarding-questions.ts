// ==========================================
// DISCOVERY-ORIENTED QUESTION LIBRARY
// These questions are designed to help users discover what they truly need
// Each step builds on the previous, going deeper into the heart
// ==========================================

// STEP 1: THE OPENING - "Where are you right now?"
// Gentle entry point that invites honesty about their current state
export const ENTRY_QUESTIONS = {
  presence: [
    { question: "When you woke up this morning, what was the first thing on your mind?", subtext: "The thought that was already waiting for you." },
    { question: "If I asked you 'how are you really?' what would you say?", subtext: "Not the polite answer. The real one." },
    { question: "What's been sitting with you lately?", subtext: "The thing that's there when the noise quiets down." },
    { question: "Where does your mind go when you have a quiet moment?", subtext: "That place it keeps returning to." },
    { question: "What would you tell someone you really trust about how things are going?", subtext: "The unfiltered version." },
    { question: "If your heart could speak right now, what would it say?", subtext: "Sometimes we know more than we realize." },
  ],
  creative: [
    { question: "If your life right now were a chapter title, what would it be?", subtext: "First instinct is usually right." },
    { question: "If your soul had a weather report, what would it say?", subtext: "Sunny, cloudy, stormy—whatever fits." },
    { question: "What word keeps echoing in you lately?", subtext: "Sometimes a single word captures everything." },
    { question: "What metaphor best describes where you are?", subtext: "Wilderness, ocean, garden, crossroads, home..." },
  ],
  direct: [
    { question: "What's weighing on you?", subtext: "Heavy or light, visible or invisible." },
    { question: "What's been on your heart lately?", subtext: "Whatever comes to mind first." },
    { question: "What are you walking through right now?", subtext: "A season, a challenge, a transition—whatever feels present." },
    { question: "What feels most pressing in your life right now?", subtext: "The thing that keeps tapping you on the shoulder." },
  ],
};

// STEP 2: GOING DEEPER - "What's underneath that?"
// These questions invite users to explore the roots and emotions beneath the surface
export const DEPTH_QUESTIONS = {
  underneath: [
    { question: "And what's underneath all of that?", subtext: "There's usually something deeper." },
    { question: "When you sit with that, what else comes up?", subtext: "Sometimes the first answer isn't the whole story." },
    { question: "What's the feeling beneath the feeling?", subtext: "Dig a little deeper." },
    { question: "If that situation resolved tomorrow, what would still remain?", subtext: "Sometimes there's more to it." },
    { question: "What are you really asking for when you think about this?", subtext: "The prayer beneath the prayer." },
  ],
  why: [
    { question: "Why do you think this matters so much to you?", subtext: "The 'why' often reveals the heart." },
    { question: "What does this situation touch in you?", subtext: "Old wounds, deep hopes, core beliefs..." },
    { question: "What makes this hard?", subtext: "Not the obvious answer—the real one." },
    { question: "What are you afraid might be true?", subtext: "Sometimes naming the fear takes its power." },
    { question: "What do you wish someone understood about this?", subtext: "The part that's hard to explain." },
  ],
  patterns: [
    { question: "Does this feel familiar somehow?", subtext: "Like you've been here before, in a different form." },
    { question: "What does this remind you of?", subtext: "Past experiences have echoes." },
    { question: "What pattern do you see playing out?", subtext: "In your thoughts, reactions, or choices." },
    { question: "How long have you been carrying this?", subtext: "Sometimes we forget how heavy the familiar has become." },
  ],
  emotional: [
    { question: "How does this sit with you, really?", subtext: "There's no wrong way to feel." },
    { question: "What emotion keeps surfacing?", subtext: "Name it if you can. Feel it if you can't." },
    { question: "Where do you notice this in your body?", subtext: "Tension, heaviness, tightness—our bodies know." },
    { question: "What would relief feel like?", subtext: "Let yourself imagine it, just for a moment." },
  ],
};

// STEP 3: THE LONGING - "What would breakthrough look like?"
// These questions help users articulate what they're actually hoping for
export const LONGING_QUESTIONS = {
  breakthrough: [
    { question: "If something shifted in the next few weeks, what would you hope it would be?", subtext: "Let yourself imagine it." },
    { question: "What would feel like a small victory right now?", subtext: "Sometimes small is exactly what we need." },
    { question: "What would it look like for this to turn out well?", subtext: "The version where you can breathe again." },
    { question: "What are you hoping God might do here?", subtext: "Your honest hope, not the 'should' version." },
    { question: "If you woke up tomorrow and something had changed, what would you want it to be?", subtext: "The first thing that comes to mind." },
  ],
  release: [
    { question: "What would you love to be able to let go of?", subtext: "The thing that's heavier than it needs to be." },
    { question: "What permission do you need to give yourself?", subtext: "To rest, to hope, to grieve, to try again." },
    { question: "What would freedom look like in this situation?", subtext: "Not escape—freedom." },
    { question: "If you didn't have to carry this alone, what would change?", subtext: "Imagine the weight being shared." },
  ],
  clarity: [
    { question: "What question keeps circling in your mind?", subtext: "The one you keep coming back to." },
    { question: "If you could have clarity about one thing, what would it be?", subtext: "The fog you most want lifted." },
    { question: "What decision would feel easier if you had peace about it?", subtext: "The crossroads you're standing at." },
    { question: "What would it mean to know you're on the right path?", subtext: "Even without seeing the whole road." },
  ],
  presence: [
    { question: "Where do you want to feel God meeting you?", subtext: "In the mess, in the mundane, in the waiting." },
    { question: "What would it feel like to not be alone in this?", subtext: "Truly accompanied." },
    { question: "If God could sit with you right now, what would you want?", subtext: "Words, silence, comfort—whatever comes." },
    { question: "What kind of presence are you craving?", subtext: "Divine, human, or both." },
  ],
};

// Dynamic subtexts for duration options
export const DURATION_SUBTEXTS = {
  3: ["A sacred pause", "A brief retreat", "Just enough to begin", "A moment of reset", "A short pilgrimage", "Time to catch your breath", "A spiritual clearing", "Enough to plant a seed", "A window of stillness", "A gentle start"],
  7: ["A week of presence", "Seven days of intention", "A rhythm of rest", "A meaningful stretch", "One complete cycle", "Room to settle in", "Time for transformation to begin", "A full week's journey", "Enough days to build momentum", "A contemplative week"],
  14: ["A deeper dive", "Time to establish roots", "A fortnight of formation", "Space for real change", "A sustained practice", "Enough to form new patterns", "A meaningful commitment", "Time to go beneath the surface", "A journey with staying power", "Two weeks of intention"],
  30: ["A month of transformation", "A season of growth", "Time to be remade", "Deep work, lasting change", "A true pilgrimage", "A month-long retreat", "Space for the soul to shift", "Thirty days of becoming", "A committed practice", "Real transformation takes time"],
};

// Dynamic subtexts for reading duration options
export const READING_SUBTEXTS = {
  5: ["A quick breath", "Perfect for busy mornings", "A small pause that matters", "Brief but focused", "A pocket of peace", "Time for one deep thought"],
  15: ["A thoughtful pause", "Time to really settle in", "Long enough to matter", "A substantial moment", "Room for reflection", "Space to go deeper"],
  30: ["A deep dive", "Time for the soul to unfold", "A contemplative practice", "Space for real stillness", "An unhurried journey", "Time to really listen"],
};

// Helper functions
export function pickRandomFromArray<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function getRandomEntryQuestion(variationIndex: number): { question: string; subtext: string } {
  const categories = Object.keys(ENTRY_QUESTIONS) as (keyof typeof ENTRY_QUESTIONS)[];
  const categoryIndex = variationIndex % categories.length;
  const category = categories[categoryIndex];
  return pickRandomFromArray(ENTRY_QUESTIONS[category]);
}

export function getRandomDepthQuestion(variationIndex: number): { question: string; subtext: string } {
  const categories = Object.keys(DEPTH_QUESTIONS) as (keyof typeof DEPTH_QUESTIONS)[];
  const categoryIndex = variationIndex % categories.length;
  const category = categories[categoryIndex];
  return pickRandomFromArray(DEPTH_QUESTIONS[category]);
}

export function getRandomLongingQuestion(variationIndex: number): { question: string; subtext: string } {
  const categories = Object.keys(LONGING_QUESTIONS) as (keyof typeof LONGING_QUESTIONS)[];
  const categoryIndex = variationIndex % categories.length;
  const category = categories[categoryIndex];
  return pickRandomFromArray(LONGING_QUESTIONS[category]);
}

export function getRandomDurationSubtext(days: 3 | 7 | 14 | 30): string {
  return pickRandomFromArray(DURATION_SUBTEXTS[days]);
}

export function getRandomReadingSubtext(minutes: 5 | 15 | 30): string {
  return pickRandomFromArray(READING_SUBTEXTS[minutes]);
}

export function pickRandomVariation(stepId: string, variationIndex: number): { question: string; subtext: string } | null {
  if (stepId === 'currentSituation') return getRandomEntryQuestion(variationIndex);
  if (stepId === 'emotionalState') return getRandomDepthQuestion(variationIndex);
  if (stepId === 'spiritualSeeking') return getRandomLongingQuestion(variationIndex);
  return null;
}
