// ==========================================
// WRITING CRAFT ENGINE
// Techniques from the best writers — classic AND modern
// Three layers: Foundation (every gen) → Influences (per-persona) → Directives (per-day)
// Zero latency impact — all static prompt text
// ==========================================

import type { PersonaTrait } from './devotional-personas-v2';

// ==========================================
// LAYER A: UNIVERSAL CRAFT FOUNDATION
// Injected into every generation's system prompt
// ~800 chars — 6 non-negotiable principles
// ==========================================

export const CRAFT_FOUNDATION = `

WRITING CRAFT (non-negotiable):
1. ONE TRUTH PER DAY — orbit a single insight. If you can't state the day's truth in one sentence, you have two devotionals fighting each other.
2. WOUND BEFORE SALVE — name the ache before offering comfort. The reader must feel understood before they'll accept hope.
3. CONCRETE OVER ABSTRACT — "The kitchen table where you sit alone at 6 AM" beats "a place of solitude." Ground every idea in a physical image.
4. THE UNEXPECTED TURN — place a surprise where a cliché would go. If the reader can predict your next sentence, rewrite it.
5. RHYTHM AND BREATH — alternate long sentences that unspool across the page with short ones. For impact.
6. EARN THE EMOTION — build to moments, never announce them. If you write "this is powerful," it isn't.`;

// ==========================================
// LAYER B: PERSONA-ALIGNED CRAFT INFLUENCES
// Modern + classic writers mapped to each voice trait
// Injected via buildV2VoiceOverlay() — varies per series
// ==========================================

export const CRAFT_INFLUENCES: Record<PersonaTrait, {
  primary: string[];
  secondaryPick: string;
}> = {
  gentle: {
    primary: [
      'Tish Harrison Warren: find the sacred in the ordinary — a bowl of cereal, a toddler\'s bedtime prayer. The mundane IS the spiritual.',
      'K.J. Ramsey: name pain with clinical precision and pastoral tenderness. Suffering isn\'t a lesson; it\'s a place God inhabits.',
      'Cole Arthur Riley: write toward the body — "my chest tightened," "my hands unclenched." Emotions live in flesh, not abstractions.',
    ],
    secondaryPick: 'Nouwen: lead with your own wound before offering anyone else a bandage.',
  },

  challenging: {
    primary: [
      'John Mark Comer: name the cultural current, then offer the ancient counterflow. "Everyone is hurrying. Jesus walked."',
      'Jackie Hill Perry: theological precision in spoken-word rhythm. Short declaratives that read like poetry. No softening.',
      'Jon Tyson: frame obedience as resistance. Following Jesus is the most counter-cultural act available.',
    ],
    secondaryPick: 'Bonhoeffer: "cheap vs costly" — name what discipleship actually costs. No discount gospel.',
  },

  poetic: {
    primary: [
      'Cole Arthur Riley: every paragraph breathes — sensory detail, then theological wonder, then silence.',
      'Morgan Harper Nichols: art-as-theology. Speak in images, colors, seasons. The visual IS the sermon.',
      'Sarah Bessey: liturgical repetition as beauty — "and still, and still, and still." Let rhythm carry meaning.',
    ],
    secondaryPick: 'Mary Oliver: radical subtraction — say less, let silence carry meaning. Trust the image.',
  },

  scholarly: {
    primary: [
      'Rich Villodas: emotionally intelligent theology — connect head knowledge to heart formation. The smartest thing is also the kindest.',
      'Tim Keller: argue like a friend, not a prosecutor. Steel-man the doubt, then offer the better story.',
      'N.T. Wright: narrative theology — the Bible isn\'t a rulebook, it\'s an unfolding drama we\'re invited into.',
    ],
    secondaryPick: 'C.S. Lewis: one dominant metaphor per piece — a single image that does all the explanatory work.',
  },

  narrative: {
    primary: [
      'Jefferson Bethke: open with the provocative cultural hook, then subvert expectations with gospel. Make them lean in before you turn.',
      'Bob Goff: whimsy as theology — the absurd moment that becomes the sermon. Love is always the punchline.',
      'Lecrae: testimony as raw art. "I\'ve been there" isn\'t decoration, it\'s authority. Your mess is your message.',
    ],
    secondaryPick: 'Buechner: begin with a concrete secular scene — let the story open into insight on its own.',
  },

  raw: {
    primary: [
      'Jackie Hill Perry: don\'t decorate the wound. Name it. "I wanted God to be different than He is."',
      'Lecrae: recovery language meets Scripture. "I\'m not who I was" as a complete theology.',
      'Danté Stewart: write from the fire, not about the fire. Urgency without performance.',
    ],
    secondaryPick: 'K.J. Ramsey: let the lament be the prayer. Don\'t rush to resolution.',
  },

  warm: {
    primary: [
      'Bob Goff: write like you\'re leaving a voicemail for someone you love. Simple. Specific. Kind.',
      'Jennie Allen: name the anxious thought the reader is having RIGHT NOW, then offer the gentle pivot.',
      'Lisa Harper: self-deprecating humor opens the door. "I burned the casserole and found Jesus in the smoke."',
    ],
    secondaryPick: 'Priscilla Shirer: one concrete "try this today" action. Small enough to actually do.',
  },
};

// ==========================================
// LAYER C: DAILY CRAFT DIRECTIVES
// 12 techniques that rotate per-day
// Injected via buildVarietySchedule() — varies per day
// ==========================================

export interface CraftTechnique {
  id: string;
  name: string;
  directive: string;
}

export const DAILY_CRAFT_TECHNIQUES: CraftTechnique[] = [
  {
    id: 'wound_before_salve',
    name: 'Wound Before Salve',
    directive: 'Spend the first third naming what hurts. Do not offer comfort until the reader feels fully seen.',
  },
  {
    id: 'story_first',
    name: 'Story First',
    directive: 'Open with a vivid 3-4 sentence story (real or composite). Let theology arrive as the story\'s natural conclusion.',
  },
  {
    id: 'unexpected_turn',
    name: 'Unexpected Turn',
    directive: 'Build toward a conventional spiritual point, then pivot. The real insight should surprise even a careful reader.',
  },
  {
    id: 'single_image',
    name: 'Single Dominant Image',
    directive: 'Choose one concrete physical image and let it carry the entire devotional. Return to it twice. The image IS the sermon.',
  },
  {
    id: 'honest_unknown',
    name: 'The Honest "I Don\'t Know"',
    directive: 'Include a genuine moment of theological uncertainty. Resist resolution. Let the not-knowing be the gift.',
  },
  {
    id: 'humor_as_grace',
    name: 'Humor as Grace',
    directive: 'Include one moment of genuine humor or self-deprecation. Then let the laughter open a door to something deeper.',
  },
  {
    id: 'micro_devotional',
    name: 'Micro-Devotional',
    directive: 'Make this day notably shorter. Say everything in fewer words. Sometimes 4 powerful sentences > 4 paragraphs.',
  },
  {
    id: 'zoom_structure',
    name: 'Zoom Structure',
    directive: 'Start with one specific person in one specific moment. Zoom out to universal truth. Zoom back to the particular.',
  },
  {
    id: 'identity_anchor',
    name: 'Identity Anchor',
    directive: 'Frame the truth as identity ("You are someone who...") not behavior ("You should..."). The reader walks away with a name, not a task.',
  },
  {
    id: 'forward_hook',
    name: 'Forward Hook',
    directive: 'End with a question or image that creates genuine curiosity about tomorrow. The reader should feel slightly unfinished.',
  },
  {
    id: 'letter_from_prison',
    name: 'Letter from Prison',
    directive: 'Write with the urgency of someone who may not get another chance. Every sentence must earn its place. No padding.',
  },
  {
    id: 'radical_subtraction',
    name: 'Radical Subtraction',
    directive: 'After writing, mentally cut the first paragraph. Start where the real energy begins. Trust the reader.',
  },
];

// ==========================================
// HELPERS
// ==========================================

/**
 * Get a craft technique for a specific day number.
 * Rotates through the 12 techniques cyclically.
 */
export function getDailyCraftDirective(dayNumber: number): CraftTechnique {
  const idx = (dayNumber - 1) % DAILY_CRAFT_TECHNIQUES.length;
  return DAILY_CRAFT_TECHNIQUES[idx];
}

/**
 * Build the craft influences string for a primary + secondary trait combo.
 * Primary trait gets all 3 influences, secondary gets its top 1.
 */
export function getCraftInfluencesForTraits(
  primary: PersonaTrait,
  secondary: PersonaTrait
): string {
  const p = CRAFT_INFLUENCES[primary];
  const s = CRAFT_INFLUENCES[secondary];

  if (!p || !s) return '';

  const lines = [
    '\nCraft influences:',
    ...p.primary.map((inf) => `- ${inf}`),
    `Secondary craft: ${s.secondaryPick}`,
  ];

  return lines.join('\n');
}
