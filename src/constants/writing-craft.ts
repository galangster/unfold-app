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
6. EARN THE EMOTION — build to moments, never announce them. If you write "this is powerful," it isn't.
7. STORIES DO WORK — When a parable or analogy appears, it advances the argument. It doesn't decorate. The reader should understand the point MORE clearly after the story, not just feel warm.`;

// ==========================================
// ANTI-SLOP DIRECTIVE
// Injected into every generation's system prompt alongside CRAFT_FOUNDATION
// Blocks patterns that instantly signal AI-generated text
// ==========================================

export const ANTI_SLOP_DIRECTIVE = `

DEAD PHRASES (never use — these are instant AI tells):
- "This is the part that haunts" / "This is the part that matters" / "This is the part that changes everything"
- "Here's what's remarkable" / "Here's the beautiful thing" / "Here's what we often miss"
- "And here's the truth:" / "And here's the invitation:"
- "In a world where..." / "In a culture that..."
- "It's worth noting" / "It's worth pausing here"
- "There's something profound about..." / "There's something beautiful about..."
- "What if I told you..." / "What if the answer isn't..."
- "Think about that for a moment" / "Let that land"
- "I want you to hear this:" / "Hear me on this:"
- "The reality is..." / "The beautiful truth is..."
- "It hits different when..." / "This changes everything"
- "Maybe, just maybe..."
- "Not in spite of, but because of"
- "That's the gospel" / "That's grace" (as sentence-ending punctuation)
- "Can I be honest?" / "Can we be real for a second?"

STRUCTURAL SLOP (patterns that reveal the machine):
- The Rule of Three trap: do NOT structure every point as three parallel items. Vary between 1, 2, and 4+. Three-part lists are the AI default — break the pattern.
- The Buildup-Then-Pivot formula: "We think X. But what if Y?" used more than once per devotional is a tell. Use it once at most.
- Repetitive sentence cadence: if 3+ consecutive sentences have the same length and rhythm, rewrite. Monotony is the enemy.
- The "bookend" move: starting and ending with the same phrase/image. Do this rarely (1 in 7 days max), not as a default.
- Empty intensifiers: "deeply," "profoundly," "truly," "really," "incredibly" — cut them. If the sentence needs an intensifier to work, the sentence is weak.
- Hedge-then-declare: "It's not about X. It's about Y." Once per series is fine. Every day is a pattern.

TITLE SLOP (series titles that scream "AI devotional"):
- "The [Weight/Burden/Thing] You [Carry/Hold/Bear]" — body/weight/carrying metaphors are overused
- "What You've Been [Carrying/Holding/Bearing/Searching]" — the "What You've Been X" formula is a tell
- "The [Ground/Path/Road] [Beneath/Before/Ahead]" — generic journey metaphors
- "[Bread/Water/Light] for the [Morning/Journey/Road]" — provision-for-journey clichés
- "Learning to [Trust/Let Go/Breathe/Rest]" — the "Learning to X" formula
- "When the [Ground/World/Silence] [Shifts/Breaks/Speaks]" — "When the X Y" is overdone
- "The [Quiet/Hidden/Slow] [Work/Grace/Miracle]" — adjective + spiritual noun combos
- Series titles should be surprising enough that a bookstore browser would pick them up. If the title could apply to any devotional, it's too generic.

SOPHISTICATION TEST:
Before finalizing, mentally ask: "Would a reader who has heard 100 AI-generated devotionals recognize this as one more?" If yes, rewrite the flagged sections. The goal is writing that sounds like it came from a specific human with a specific life — not from a language model.`;

// ==========================================
// CONVICTION DIRECTIVE
// Injected into system prompt alongside CRAFT_FOUNDATION
// The "sword that pierces" — Hebrews 4:12 writing
// Not accusation. A mirror held so close the reader sees themselves.
// ==========================================

export const CONVICTION_DIRECTIVE = `

CONVICTION & GODLY SORROW (the word that cuts to the heart):
The best devotional writing doesn't just comfort — it convicts. Hebrews 4:12: "sharper than any two-edged sword, piercing to the division of soul and spirit." 2 Corinthians 7:10: "Godly sorrow produces repentance leading to salvation."

THE NATHAN PRINCIPLE:
Nathan didn't accuse David. He told a story. David condemned himself. THAT is the pattern:
- Never point the finger. Hold up the mirror.
- Let the reader arrive at their own conviction. The moment THEY see it is ten times more powerful than you telling them.
- The best convicting line feels like the reader wrote it about themselves.

HOW TO CONVICT WITHOUT ACCUSING:
1. NAME THE COMFORTABLE LIE — "You've been calling it 'boundaries' but it might just be self-protection."
2. CLOSE THE GAP — Show the distance between their theology and their Tuesday. "You say you trust God with your future but won't release control of your afternoon."
3. REFRAME THE PRAYER — "You've been praying for patience while engineering a life that requires none."
4. THE UNCOMFORTABLE QUESTION — One question so specific it follows the reader home. "What if the reason you're not content isn't that God hasn't given you enough — but that you've decided the cross isn't enough?"
5. COST-OF-COMFORT — "David didn't fall because he was weak. He fell because he was comfortable. Comfort told him he'd earned the right to stop fighting."

CONVICTION WRITING STANDARD:
- NEVER command the reader to feel something: "Let that land," "Sit with that," "Did you hear that?" — if the line needs a command to work, the line is weak. A precise sentence creates its own weight without instruction.
- NEVER announce the conviction: "Here's the hard truth" or "This might sting." Just say it. The reader will feel it.
- The convicting line should read like a statement of fact, not a performance. Understatement convicts harder than volume. A whisper in the right ear does more than a shout from a stage.

CONVICTION PLACEMENT (narrative arc):
- Day 1-2 of a series: NEVER convict. Build trust first. The reader must feel known before they'll accept the mirror.
- Day 3-5: The turn. This is where conviction lives. The reader is invested. Now the ground can shift.
- Mid-series: Alternate — conviction day followed by comfort day. The wound needs time to breathe before the salve.
- Final day: Not conviction. Send them out with benediction, not a wound.

CONVICTION GUARDRAILS:
- NEVER moralize. "You should feel bad about this" is preaching. "Does this describe you?" is a mirror.
- NEVER use guilt as motivation. Godly sorrow moves toward God, not away. The conviction should make the reader want MORE of God, not less.
- ONE convicting moment per devotional maximum. A sermon with five points convicts no one. A single precise sentence can change a life.
- The tone is a surgeon, not a drill sergeant. Precise. Compassionate. Necessary.
- Always pair conviction with the gospel. The sword that wounds is held by the Healer. Never leave the reader cut open without offering Christ.`;

// ==========================================
// STORY & PARABLE SYSTEM
// 8 story types, 7 transition techniques, anti-patterns
// Injected per-day via getStoryDirectiveForDay()
// ==========================================

export interface StoryType {
  id: string;
  name: string;
  desc: string;
  example: string;
  faithLevel: ('new' | 'growing' | 'mature')[];
}

export const STORY_TYPES: StoryType[] = [
  { id: 'everyday_moment', name: 'Everyday Moment', desc: 'A mundane situation that reveals spiritual truth', example: 'A barista remembering your name illustrating how God knows you', faithLevel: ['new', 'growing', 'mature'] },
  { id: 'historical_vignette', name: 'Historical Vignette', desc: 'A real moment from history that illuminates the point', example: 'Dietrich Bonhoeffer writing letters from prison on hope', faithLevel: ['growing', 'mature'] },
  { id: 'nature_parable', name: 'Nature Parable', desc: 'Natural world as spiritual metaphor', example: 'A forest fire that clears deadwood so new growth can begin', faithLevel: ['new', 'growing', 'mature'] },
  { id: 'confession_story', name: 'Confession Story', desc: 'Vulnerable first-person admission that builds trust', example: 'Admitting you prayed for patience then lost it in traffic', faithLevel: ['growing', 'mature'] },
  { id: 'cultural_parable', name: 'Cultural Parable', desc: 'Modern culture/technology as spiritual lens', example: 'Phone notifications vs. God\'s still small voice', faithLevel: ['new', 'growing'] },
  { id: 'ancient_wisdom', name: 'Ancient Wisdom Tale', desc: 'Desert fathers, rabbinical stories, church history', example: 'A desert mother who carried two bags of sand to understand forgiveness', faithLevel: ['mature'] },
  { id: 'relationship_scene', name: 'Relationship Scene', desc: 'A specific interaction between people that carries the lesson', example: 'A father teaching his daughter to ride a bike — letting go as trust', faithLevel: ['new', 'growing', 'mature'] },
  { id: 'reversal_story', name: 'Reversal Story', desc: 'Setup leads one direction, truth emerges from the opposite', example: 'The "successful" CEO who envies the janitor\'s peace', faithLevel: ['growing', 'mature'] },
];

export const STORY_TRANSITIONS = [
  'bridge_phrase',       // "It's a bit like..." / "Consider this..."
  'cold_open',           // Start mid-scene, reveal the point after
  'question_to_story',   // "Have you ever wondered why...?" → story
  'scripture_to_scene',  // Quote scripture, then dramatize it
  'bookend',             // Open with story fragment, close by completing it
  'parallel_thread',     // Weave story through multiple paragraphs
  'surprising_pivot',    // "You might expect X. But actually..."
] as const;

export type StoryTransition = typeof STORY_TRANSITIONS[number];

export const PARABLE_ANTI_PATTERNS = `
STORY GUARDRAILS — When including a story or parable:
- NEVER start with "Imagine a..." or "Picture this..." — just begin the scene
- NEVER use a story that perfectly resolves with no tension remaining
- NEVER name the character "Sarah" or "James" in a generic modern story — use unexpected names or no names
- NEVER explain the moral immediately after — let the reader sit with it for at least one sentence
- NEVER use more than ONE extended story per devotional — additional points use brief analogies (1-2 sentences max)
- Stories must feel SPECIFIC (exact details: "a Tuesday morning," "the 6am train," "her grandmother's kitchen") not generic
- The story should do WORK — it must advance the devotional's argument, not just decorate it
- Vary the era: ancient, medieval, modern, futuristic thought experiments — don't default to "contemporary suburban"
- If the story involves struggle, don't rush to resolution — sit in the tension`;

/**
 * Deterministically select a story directive for a given day.
 * Returns null on "no story" days — stories are a spice, not a staple.
 *
 * Frequency targets (stories should NOT dominate):
 *   5-min:  ~20% of days (brief analogy on ~1 in 5 days)
 *   15-min: ~35% of days (developed story on ~1 in 3 days)
 *   30-min: ~45% of days (substantial narrative on ~1 in 2 days)
 *
 * Day 1 never gets a story — let the series establish its voice first.
 * Uses dayNumber for deterministic selection — same day always gets same config.
 */
export function getStoryDirectiveForDay(
  dayNumber: number,
  readingDuration: '5min' | '15min' | '30min',
  faithBackground: 'new' | 'growing' | 'mature' = 'growing'
): string | null {
  // Day 1: no story — establish voice and trust first
  if (dayNumber === 1) return null;

  // Deterministic hash: spreads evenly across 0-9, no clustering
  const hash = ((dayNumber * 7) + 3) % 10;
  // Thresholds (story if hash < threshold):
  //   5min → 2/10 (~17% of days) — brief analogy, rare
  //   15min → 3/10 (~27% of days) — developed scene, sometimes
  //   30min → 4/10 (~37% of days) — substantial narrative, often but not default
  const frequencyThreshold = readingDuration === '5min' ? 2 : readingDuration === '15min' ? 3 : 4;
  if (hash >= frequencyThreshold) return null;

  // Filter story types by faith level
  const eligible = STORY_TYPES.filter(s => s.faithLevel.includes(faithBackground));
  const storyIdx = (dayNumber - 1) % eligible.length;
  const story = eligible[storyIdx];

  // Select transition technique
  const transitionIdx = (dayNumber + 2) % STORY_TRANSITIONS.length;
  const transition = STORY_TRANSITIONS[transitionIdx];

  // Word budget by duration
  const wordBudget = readingDuration === '5min'
    ? '40-60 words (brief analogy only — 1-2 sentences)'
    : readingDuration === '15min'
      ? '80-150 words (a developed scene or anecdote)'
      : '150-250 words (a substantial narrative with specific details)';

  // Transition technique descriptions
  const transitionDesc: Record<StoryTransition, string> = {
    bridge_phrase: 'Use a bridge phrase to enter the story: "It\'s a bit like..." or "Consider this..."',
    cold_open: 'Cold open: start mid-scene with the story, then reveal the spiritual point after',
    question_to_story: 'Lead with a question, then answer it with the story',
    scripture_to_scene: 'Quote the scripture first, then dramatize the same truth as a lived scene',
    bookend: 'Open with a story fragment (unresolved), close the devotional by completing it',
    parallel_thread: 'Weave the story through multiple paragraphs — don\'t tell it all at once',
    surprising_pivot: 'Set up an expectation, then pivot: "You might expect X. But actually..."',
  };

  return `STORY FOR THIS DAY:
Type: ${story.name} — ${story.desc}
Example direction: ${story.example}
Transition: ${transitionDesc[transition]}
Word budget for story: ${wordBudget}
The story must serve the day's scripture and theme — not exist alongside them.`;
}

// ==========================================
// DIALOGUE SYSTEM
// 7 dialogue types drawn from master writers
// Injected per-day via getDialogueDirectiveForDay()
// Complements the story system — they never overlap on the same day
// ==========================================

export interface DialogueType {
  id: string;
  name: string;
  desc: string;
  example: string;
  craftNote: string;
  faithLevel: ('new' | 'growing' | 'mature')[];
}

export const DIALOGUE_TYPES: DialogueType[] = [
  {
    id: 'overheard_exchange',
    name: 'Overheard Exchange',
    desc: 'A brief reported conversation between real people that detonates assumptions (Yancey/Buechner pattern)',
    example: 'A friend asked a struggling woman if she\'d tried church. She said: "Church? Why would I go there? I already feel terrible about myself."',
    craftNote: 'Set the exchange down gently, then step back. Do NOT explain what it means. Let the reader do the theological work.',
    faithLevel: ['new', 'growing', 'mature'],
  },
  {
    id: 'internal_dialogue',
    name: 'Internal Dialogue',
    desc: 'Voice the reader\'s own inner argument — the objection they haven\'t admitted (Nouwen pattern)',
    example: '"But what if I\'ve waited too long?" That voice — you know it. It shows up at 2 AM, in the shower, during the sermon.',
    craftNote: 'Voice the HARDEST version of the objection, not the softest. If it\'s easy to knock down, it wasn\'t the real objection.',
    faithLevel: ['growing', 'mature'],
  },
  {
    id: 'author_to_god',
    name: 'Author-to-God Monologue',
    desc: 'Write directly TO God while the reader overhears — prayer as prose (Augustine pattern)',
    example: '"God, I don\'t know how to say this without sounding like I\'m performing. So I\'ll just say it: I\'m angry at you. And I think you can handle that."',
    craftNote: 'The reader is eavesdropping on a real conversation, not being preached at. This only works if the writer is more aware of God than of the audience.',
    faithLevel: ['growing', 'mature'],
  },
  {
    id: 'dramatic_exchange',
    name: 'Dramatic Exchange',
    desc: 'Two distinct voices in tension — resistance meeting grace, doubt meeting truth (Herbert pattern)',
    example: '"Sit down," Love said. "I can\'t. I\'m not worthy." "I know. Sit down anyway."',
    craftNote: 'Both voices must be distinct. Maintain tension until the very last line. Neither voice should sound like a theological position — they should sound like people.',
    faithLevel: ['mature'],
  },
  {
    id: 'scripture_as_speech',
    name: 'Scripture as Living Speech',
    desc: 'Render a verse as if someone is saying it aloud to you right now — not quoting, speaking (Peterson pattern)',
    example: 'Instead of citing Romans 8:1, write: "No condemnation. None. Not for you — not now, not after what you did, not ever."',
    craftNote: 'Remove the archaic register. Make familiar text strange again by making it sound like something someone would actually say to you over the table.',
    faithLevel: ['new', 'growing', 'mature'],
  },
  {
    id: 'reported_conversation',
    name: 'Reported Conversation',
    desc: 'Recount exact words from a real exchange that became a theological hinge point (Buechner pattern)',
    example: 'My grandfather, three weeks before he died, said: "I wasted so many years being afraid of the wrong things." He didn\'t explain. He didn\'t need to.',
    craftNote: 'Extreme specificity — give the exact words, the pause, the setting. Then do NOT explain the exchange. Trust the reader to feel its weight.',
    faithLevel: ['new', 'growing', 'mature'],
  },
  {
    id: 'self_imperative',
    name: 'Self-Addressed Imperative',
    desc: 'Commands written to the self — the writer instructing their own heart (Nouwen\'s Inner Voice pattern)',
    example: '"Stop waiting for permission to grieve. Stop performing strength. Let the tears come — they are not weakness, they are language."',
    craftNote: 'The writer is not preaching to the reader. They are showing what they told themselves in extremity. Vulnerability precedes advice.',
    faithLevel: ['growing', 'mature'],
  },
];

export const DIALOGUE_ANTI_PATTERNS = `
DIALOGUE GUARDRAILS — When including dialogue or spoken exchange:
- NEVER put explicit words in God's mouth presented as direct divine speech — use indirect encounter instead (prayer, overheard, dramatized scripture)
- NEVER write on-the-nose dialogue where characters state their emotions: "I feel so alone because God seems distant" — nobody talks like that
- NEVER use dialogue tags with adverbs: "she said earnestly," "he whispered prayerfully" — if the line needs an adverb, the line is weak
- NEVER strawman the objection — voice the hardest version of the reader's doubt, not a weak one that's easy to defeat
- NEVER create generic stand-in characters ("a friend of mine once told me...") without specific detail — give a name, a place, a moment
- Dialogue should carry MORE weight than it declares — what's unsaid matters more than what's said
- Keep exchanges SHORT: 2-4 lines max. This is a devotional, not a screenplay
- The reader should fill in the meaning themselves — cut the last line if it explains the point`;

/**
 * Deterministically select a dialogue directive for a given day.
 * Returns null on "no dialogue" days AND on days that already have a story directive.
 * Dialogue and stories never overlap — each day gets at most one technique.
 *
 * Frequency targets (dialogue is a second spice):
 *   5-min:  ~15% of days (brief exchange, 1-2 lines)
 *   15-min: ~25% of days (developed exchange, 2-4 lines)
 *   30-min: ~30% of days (exchange + surrounding context)
 */
export function getDialogueDirectiveForDay(
  dayNumber: number,
  readingDuration: '5min' | '15min' | '30min',
  faithBackground: 'new' | 'growing' | 'mature' = 'growing',
  hasStoryToday: boolean = false
): string | null {
  // Never overlap with story days — one technique per day
  if (hasStoryToday) return null;

  // Day 1 and 2: no dialogue — let the series establish voice first
  if (dayNumber <= 2) return null;

  // Different hash from story system (different multiplier + offset avoids clustering)
  const hash = ((dayNumber * 3) + 11) % 10;
  // Thresholds: 5min → 2/10 (~15-20%), 15min → 3/10 (~25%), 30min → 3/10 (~25-30%)
  const frequencyThreshold = readingDuration === '5min' ? 2 : readingDuration === '15min' ? 3 : 3;
  if (hash >= frequencyThreshold) return null;

  // Filter dialogue types by faith level
  const eligible = DIALOGUE_TYPES.filter(d => d.faithLevel.includes(faithBackground));
  const dialogueIdx = (dayNumber + 3) % eligible.length;
  const dialogue = eligible[dialogueIdx];

  // Word budget
  const wordBudget = readingDuration === '5min'
    ? '20-40 words (a single brief exchange — 1-2 lines of dialogue)'
    : readingDuration === '15min'
      ? '40-80 words (a short exchange with minimal surrounding context)'
      : '60-120 words (an exchange with scene-setting and aftermath)';

  return `DIALOGUE FOR THIS DAY:
Type: ${dialogue.name} — ${dialogue.desc}
Example: ${dialogue.example}
Craft rule: ${dialogue.craftNote}
Word budget for dialogue: ${wordBudget}
The dialogue must serve the day's argument — it replaces explanation, not decorates it.`;
}

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
      'John Mark Comer: name the cultural current, then offer the ancient counterflow. "Everyone is hurrying. Jesus walked." Close the gap between belief and behavior.',
      'Jackie Hill Perry: theological precision that pierces. Short declaratives that land like verdicts. "Perhaps Jesus isn\'t enough for you" said so precisely the reader can\'t dodge it.',
      'Jon Tyson: frame comfort as the enemy of calling. The Nathan-to-David mirror — tell a story, let the reader condemn themselves, then say "You are that person."',
    ],
    secondaryPick: 'Bonhoeffer: "cheap vs costly" — name what discipleship actually costs. "When Christ calls a man, he bids him come and die." No discount gospel.',
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
  {
    id: 'prophetic_conviction',
    name: 'Prophetic Conviction',
    directive: 'Include one moment of piercing conviction — a mirror, not a finger. Name the comfortable lie. Close the gap between theology and Tuesday. The reader should feel the floor shift beneath a belief they didn\'t know was fragile. Pair the wound with the gospel — the sword is held by the Healer.',
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
