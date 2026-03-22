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

DEAD PHRASES (never use):
"This is the part that haunts/matters/changes everything", "Here's what's remarkable/the beautiful thing/what we often miss", "And here's the truth/invitation", "In a world where/In a culture that", "It's worth noting/pausing here", "There's something profound/beautiful about", "What if I told you", "Think about that for a moment", "Let that land", "I want you to hear this/Hear me on this", "The reality is/The beautiful truth is", "It hits different", "Maybe, just maybe", "Not in spite of, but because of", "That's the gospel/That's grace", "Can I be honest?/Can we be real?"

STRUCTURAL RULES:
- No Rule of Three as default structure. Vary between 1, 2, 4+ items.
- "We think X. But what if Y?" — max once per devotional.
- No 3+ consecutive sentences with same length/rhythm.
- "Bookend" (same image open/close) — max 1 in 7 days.
- No empty intensifiers: deeply, profoundly, truly, really, incredibly.
- "It's not X. It's Y." — max once per devotional.
- No consecutive technique repetition across days. If a rhetorical move appeared yesterday, do NOT use it today.

TITLE RULES:
No generic titles: "The [Weight] You [Carry]", "What You've Been [X]", "The [Ground] [Beneath]", "[Bread] for the [Morning]", "Learning to [X]", "When the [X] [Y]", "The [Quiet] [Work]".

PERSON REFERENCES:
First mention of any person must include brief context (who, when, why they matter).

NEGATIVE FRAMING BAN (zero tolerance):
- No "Not X. But Y." / "Not X. Y." rhetorical pairs
- No "Not because X, because Y"
- No bullet lists of negatives ("He doesn't..." / "She doesn't..." 2+ times)
- No "Notice what X doesn't say/do/promise"
- No THREE-BEAT NEGATION: "Not X. Not Y. Just Z."
- State what something IS, not what it ISN'T.

SOPHISTICATION TEST:
Would a reader who's heard 100 AI devotionals recognize this as one more? If yes, rewrite.`;

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
// RHETORICAL QUESTIONS DIRECTIVE
// When and how to use rhetorical questions in devotional writing
// Peer to CONVICTION_DIRECTIVE — injected into system prompt
// ==========================================

export const RHETORICAL_QUESTION_DIRECTIVE = `

RHETORICAL QUESTIONS:
- Use 0-1 per 5-min devotional, 1-2 per 15-min, 2-3 per 30-min. Zero is fine. Never consecutive.
- Best placement: mid-piece (after trust is built) or closing (sends the reader away thinking). Openings work when the question stops the reader cold — but only if it's rhetorical (brain processes and moves on), not genuine (brain stops to search for an answer).
- Keep under 15 words. If it needs a comma, it's probably two questions fighting.
- Give it its own line when it carries weight. White space lets the question breathe.
- NEVER answer your own rhetorical question in the next sentence. Let the reader sit with it.
- Must reframe, not restate. The question shifts perspective — it doesn't repeat the paragraph above in question form.

STRONG TYPES (default toolkit):
- Reframe: question a hidden assumption ("When did rest become something you had to earn?")
- Mirror: reflect behavior without accusing ("You trust God with eternity. Why not Thursday?")
- Gap-Closer: expose belief vs. behavior ("You've memorized verses about peace. Do your Sunday nights know that?")
- Identity: who are you becoming? ("Who are you becoming in the hours no one is watching?")
- Invitation: open door, not demand ("What if you prayed one honest sentence instead of fifteen polished ones?")
- Reversal: invert the familiar ("What if the wilderness isn't punishment — but the only place quiet enough to hear him?")
- Wound-Namer: articulate what they haven't said ("When was the last time you felt known — not just needed?")

USE CAREFULLY:
- What-If: powerful but overused by AI. Only when it genuinely opens a new door.
- Cost: must make intuitive sense in one read. The cost has to be something the reader can immediately feel, not calculate.

DEFAULTS (override with taste):
- Avoid obvious-answer questions UNLESS the answer is so fundamental it deserves to be re-felt. "Does God not love you?" works because the simplicity IS the point. "Isn't prayer great?" doesn't.
- Avoid question strings (3+ consecutive), writer-answers-own-question, and guilt-without-a-path-forward.
- Commands-as-questions allowed when the persona context calls for direct challenge.
- The best rhetorical question articulates something the reader felt but never formed into words.`;

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
  { id: 'confession_story', name: 'Confession Story', desc: 'A third-person vulnerable moment that builds trust and relatability', example: 'A man who prayed for patience, then lost it in traffic ten minutes later', faithLevel: ['growing', 'mature'] },
  { id: 'cultural_parable', name: 'Cultural Parable', desc: 'Modern culture/technology as spiritual lens', example: 'Phone notifications vs. God\'s still small voice', faithLevel: ['new', 'growing'] },
  { id: 'ancient_wisdom', name: 'Ancient Wisdom Tale', desc: 'Desert fathers, rabbinical stories, church history', example: 'A desert mother who carried two bags of sand to understand forgiveness', faithLevel: ['mature'] },
  { id: 'relationship_scene', name: 'Relationship Scene', desc: 'A specific interaction between people that carries the lesson', example: 'A father teaching his daughter to ride a bike — letting go as trust', faithLevel: ['new', 'growing', 'mature'] },
  { id: 'reversal_story', name: 'Reversal Story', desc: 'Setup leads one direction, truth emerges from the opposite', example: 'The "successful" CEO who envies the janitor\'s peace', faithLevel: ['growing', 'mature'] },
  { id: 'cold_open', name: 'Cold Open', desc: 'Drops the reader into a tense or disorienting moment, then pulls back to reveal how we got here', example: 'The doctor says three words and the room tilts sideways — rewind six months to the prayer you almost didn\'t pray', faithLevel: ['growing', 'mature'] },
  { id: 'object_witness', name: 'Object Witness', desc: 'Centers on a single physical object — a letter, a scar, a key — that carries meaning beyond itself', example: 'A wooden spoon, cracked down the middle, still hanging in the kitchen twenty years after the woman who held it last', faithLevel: ['new', 'growing', 'mature'] },
  { id: 'investigative_reveal', name: 'Investigative Reveal', desc: 'Presents a spiritual question like a journalist chasing a story — gathering clues, building toward a discovery', example: 'Why did an entire first-century church vanish from the record for forty years? The answer rewrites what endurance looks like', faithLevel: ['growing', 'mature'] },
  { id: 'parallel_lives', name: 'Parallel Lives', desc: 'Intercuts between two people in different times or places who face the same spiritual crossroads', example: 'A single mother in Detroit and a monk in 6th-century Ireland both stare at the same impossible choice', faithLevel: ['growing', 'mature'] },
  { id: 'childhood_flashback', name: 'Childhood Flashback', desc: 'Returns to a specific childhood memory and lets adult understanding collide with the child\'s original experience', example: 'You were seven, standing in the garage, watching your dad fix something that wasn\'t broken. You didn\'t understand it then', faithLevel: ['new', 'growing', 'mature'] },
  { id: 'science_discovery', name: 'Science Discovery', desc: 'Uses a real scientific finding or natural phenomenon as the structural backbone, letting the data become the sermon', example: 'Physicists discovered that particles change behavior when observed — eerily close to what the Psalms say about living before God', faithLevel: ['new', 'growing'] },
  { id: 'counterfactual', name: 'What-If Scenario', desc: 'Constructs a hypothetical alternate reality to illuminate the weight of the choice that was actually made', example: 'What if Joseph had quietly divorced Mary like he planned? Trace the cascade: no Bethlehem, no manger, no shepherds summoned', faithLevel: ['growing', 'mature'] },
  { id: 'failure_autopsy', name: 'Failure Autopsy', desc: 'Dissects a specific failure — sitting inside how things fell apart, finding God in the rubble rather than the rescue', example: 'The church plant lasted eleven months. Here is exactly how it died, and what grew in the vacant lot afterward', faithLevel: ['growing', 'mature'] },
  { id: 'place_portrait', name: 'Place Portrait', desc: 'Anchors the entire story in a specific physical location, letting the place itself become the teacher', example: 'The hospital chapel is twelve feet by eight. The carpet is stained. More prayers per square foot than any cathedral', faithLevel: ['new', 'growing', 'mature'] },
  { id: 'mentor_exchange', name: 'Mentor Exchange', desc: 'Captures a single conversation between a mentor and learner where something shifts — the student surpasses or the teacher admits ignorance', example: 'She asked her pastor one question he couldn\'t answer. His silence taught her more than his sermons ever had', faithLevel: ['new', 'growing'] },
  { id: 'time_lapse', name: 'Time Lapse', desc: 'Compresses months or decades into rapid montage, showing how something imperceptibly slow only makes sense at scale', example: 'Day 1 he plants the tree. Day 400 nothing has changed. Day 4,000 his grandchildren sit in its shade', faithLevel: ['growing', 'mature'] },
  { id: 'crisis_decision', name: 'Crisis Decision', desc: 'Puts someone in a pressure-cooker moment with seconds to decide, where instinct reveals formation', example: 'The building is on fire and she has time to grab one thing. What she reaches for reveals everything about what she worships', faithLevel: ['new', 'growing', 'mature'] },
  { id: 'generational_thread', name: 'Generational Thread', desc: 'Traces a single habit, wound, or blessing across three or more generations, showing how spiritual DNA compounds', example: 'His grandmother hummed hymns while she cooked. His mother hummed them while she cried. He hums them now while he prays', faithLevel: ['growing', 'mature'] },
  { id: 'silence_story', name: 'Silence Story', desc: 'Builds around what did NOT happen — the unanswered prayer, the unspoken word — finding meaning in divine or human silence', example: 'For three years she prayed for healing and heard nothing. The nothing became the most important thing God ever said to her', faithLevel: ['mature'] },
  { id: 'vocation_parable', name: 'Vocation Parable', desc: 'Uses the specific mechanics of someone\'s daily work as a precise metaphor for a spiritual process', example: 'A glassblower knows the exact moment the material is hot enough to shape but not so hot it collapses', faithLevel: ['new', 'growing', 'mature'] },
  { id: 'psych_case_study', name: 'Psychology Case Study', desc: 'Presents a real psychological phenomenon and lets it illuminate a biblical truth from an unexpected angle', example: 'Psychologists call it the pratfall effect — we trust people more after they stumble. Paul called it power made perfect in weakness', faithLevel: ['growing', 'mature'] },
  { id: 'dream_vision', name: 'Dream Vision', desc: 'Uses the surreal, symbolic logic of a dream or vision to access truths that linear narrative cannot reach', example: 'In the dream she is building a house but every room she finishes disappears behind her. She wakes up understanding manna', faithLevel: ['growing', 'mature'] },
  { id: 'collective_witness', name: 'Collective Witness', desc: 'Tells the story through a group rather than an individual, showing how shared experience creates meaning no single person could hold', example: 'Nobody remembers who started singing first. By the third verse, every person in the storm shelter was singing the same hymn', faithLevel: ['new', 'growing', 'mature'] },
  { id: 'creative_process', name: 'Creative Process', desc: 'Follows the arc of making something — a painting, a song, a meal — where the struggle with the medium mirrors the struggle with God', example: 'The sculptor says she doesn\'t add marble. She removes everything that isn\'t the figure. Michelangelo learned this from prayer', faithLevel: ['growing', 'mature'] },
  { id: 'medical_narrative', name: 'Medical Narrative', desc: 'Uses the precision of diagnosis, treatment, or recovery as a framework for spiritual truth', example: 'Surgeons call it debridement — cutting away dead tissue so healthy tissue can grow. The most painful part of healing, and not optional', faithLevel: ['growing', 'mature'] },
  { id: 'letter_unsent', name: 'Letter Unsent', desc: 'Frames the story as a letter to someone specific — a younger self, a prodigal friend, God — creating raw intimacy through direct address', example: 'Dear me at nineteen: you are about to make the worst decision of your life, and it will not be the end of your story', faithLevel: ['new', 'growing', 'mature'] },
  { id: 'architectural_parable', name: 'Building Parable', desc: 'Uses the structural logic of architecture — foundations, load-bearing walls, arches — as a precise metaphor for spiritual formation', example: 'The arch only holds because every stone is falling. Remove the keystone and you see the truth: it was always gravity and trust', faithLevel: ['new', 'growing'] },
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
- If the story involves struggle, don't rush to resolution — sit in the tension

STORY SOURCES — Draw from the whole world, not just "Christian" examples:
- Real historical figures and events (scientists, athletes, artists, leaders)
- Movies and TV shows the reader has likely seen (The Shawshank Redemption, The Office, Lord of the Rings, etc.)
- Cultural moments, viral stories, news events that illuminate spiritual truth
- Psychology research, scientific discoveries, medical case studies
- Third-person composite stories ("A woman once...", "There was a teacher who...") — these feel authentic without pretending to be personal experience
- Ancient history, mythology (as illustration, not theology), philosophy
- The more unexpected the source, the more the reader pays attention. A Breaking Bad scene that illustrates grace is more memorable than another retelling of the Prodigal Son.

- ALL stories and parables MUST be third person (the POV rules in the persona section apply).`;

// ==========================================
// PATTERN BREAK SYSTEM
// The writing equivalent of jump cuts in short-form video
// Keeps readers engaged by shifting the texture every few paragraphs
// ==========================================

export const PATTERN_BREAK_DIRECTIVE = `
PATTERN BREAKS (how to keep readers engaged through longer devotionals):
Great books never sustain a single mode for too long. Every 2-3 paragraphs, shift the texture. These are your tools:

1. VOICE SHIFT — Go from third-person observation to sudden direct address: "He sat in the dark for three hours. And maybe you have too."
2. LENGTH SHOCK — After 3+ sentences of normal length, drop a 2-word sentence. "He waited." The rhythm break wakes the reader up.
3. FORMAT SHIFT — Break from prose into a single-line question on its own. Or a one-sentence paragraph that forces a pause.
4. REGISTER SHIFT — Move from elevated language to casual in one beat: "The theological term is sanctification. The real-world term is Monday morning."
5. SENSORY INTERRUPT — Drop a physical detail into an abstract passage: "Grace is... well, it is the smell of coffee someone made for you before you woke up."
6. TIME JUMP — "That was 2,000 years ago. This morning, you did the same thing."
7. QUESTION GRENADE — Plant a question so specific it stops the reader mid-scroll: "When was the last time you prayed something you actually meant?"

For 15-min devotionals: include 2-3 pattern breaks.
For 30-min devotionals: include 4-6 pattern breaks. The reader should never feel settled for too long.
Pattern breaks are NOT decoration — they re-engage attention at the exact moment it would naturally drift.`;

/**
 * Deterministically select a story directive for a given day.
 * Returns null on "no story" days — stories are a spice, not a staple.
 *
 * Frequency targets:
 *   5-min:  ~20% of days (brief analogy on ~1 in 5 days)
 *   15-min: ~60% of days (developed story on ~3 in 5 days — stories are the backbone)
 *   30-min: ~80% of days (substantial narrative on ~4 in 5 days — books use stories constantly)
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
  //   5min → 2/10 (~20% of days) — brief analogy, rare
  //   15min → 6/10 (~60% of days) — stories are how great writers make points land
  //   30min → 8/10 (~80% of days) — books use real-life examples constantly
  const frequencyThreshold = readingDuration === '5min' ? 2 : readingDuration === '15min' ? 6 : 8;
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
  {
    id: 'jesus_speaks_direct',
    name: 'Jesus Speaks Direct',
    desc: 'Place words in Jesus\' mouth drawn from Gospel patterns — extending his voice into the reader\'s situation (Ignatian contemplation)',
    example: '"You keep rehearsing that conversation, don\'t you? The one where you should have said something. Let it go. I was in the room."',
    craftNote: 'Never invent theology Jesus didn\'t teach. Draw tone and cadence from Gospel speech patterns — short sentences, concrete images, questions that land.',
    faithLevel: ['growing', 'mature'],
  },
  {
    id: 'psalm_to_soul',
    name: 'Psalm to Soul',
    desc: 'Address your own soul in second person, as David does in Psalm 42:5 ("Why are you cast down, O my soul?")',
    example: 'Why are you scrolling at 1 a.m., my soul? What are you looking for in the blue light that you won\'t find?',
    craftNote: 'Use "my soul" or "O my heart" — the archaic address creates distance from the self, which paradoxically creates intimacy. Keep the questions specific.',
    faithLevel: ['new', 'growing', 'mature'],
  },
  {
    id: 'letter_from_future',
    name: 'Letter from Future',
    desc: 'An epistolary address from the reader\'s future self — someone who made it through the current struggle (Pauline tradition reframed)',
    example: '"Dear me-at-27 — the cards were supposed to fall. What you\'ll build next doesn\'t need them."',
    craftNote: 'Open with "Dear me-at-[age]." The future self must know specific details of the present struggle. Tone is tender, not smug. Scars, not just answers.',
    faithLevel: ['new', 'growing', 'mature'],
  },
  {
    id: 'desert_saying',
    name: 'Desert Wisdom Saying',
    desc: 'A brief exchange in the pattern of the Desert Fathers/Mothers: a seeker asks, an elder answers with disarming brevity',
    example: 'A young monk asked Amma Theodora, "How do I stop being angry at God?" She said, "Stop being polite with him first."',
    craftNote: 'The elder\'s answer must reframe the question rather than answer it directly. Keep to 2-3 lines max. The power is in what\'s left unsaid.',
    faithLevel: ['growing', 'mature'],
  },
  {
    id: 'midrash_expansion',
    name: 'Midrash Gap-Fill',
    desc: 'Fill a silence in the biblical text with imagined dialogue — what did Hagar say to herself in the desert? (Jewish midrash tradition)',
    example: 'The text says Naomi told Ruth to go back. It doesn\'t say what Ruth saw in Naomi\'s eyes. Maybe: please go, because if you stay I\'ll have to hope again.',
    craftNote: 'Always name the textual gap explicitly ("The text doesn\'t say..."). The imagined dialogue must be psychologically plausible and theologically careful.',
    faithLevel: ['growing', 'mature'],
  },
  {
    id: 'congregational_response',
    name: 'Call and Response',
    desc: 'Liturgical call-and-response adapted for the page — the writer calls, the reader answers (Black church tradition, Taize)',
    example: 'God is not finished with you.\n(Say it back.)\nGod is not finished with you.\n(Now say it like you believe it.)',
    craftNote: 'Use parenthetical stage directions: (Say it back), (Again), (Now whisper it). Three rounds is the sweet spot. Repetition IS the point.',
    faithLevel: ['new', 'growing', 'mature'],
  },
  {
    id: 'socratic_unraveling',
    name: 'Socratic Unraveling',
    desc: 'A sequence of questions — each building on the last — leading the reader to discover a conclusion themselves (Jesus\' counter-questions)',
    example: 'You say you\'re not good enough. Good enough for what? Who set that bar? Did you agree to it? What if the bar is a fiction?',
    craftNote: 'Minimum 4 questions, maximum 7. Each must logically follow the previous. The final question lands like a revelation. Never answer your own questions.',
    faithLevel: ['new', 'growing', 'mature'],
  },
  {
    id: 'confession_raw',
    name: 'Raw Confession',
    desc: 'First-person vulnerability — the writer confessing failure while the reader overhears (Augustine\'s Confessions meets modern memoir)',
    example: 'I preached about trust on Sunday. On Monday I checked my bank account four times before lunch. The gap between belief and behavior is not yours alone.',
    craftNote: 'Must include a specific, concrete failure — not vague "I struggle too." The confession earns the right to speak. End by gently turning the lens toward the reader.',
    faithLevel: ['new', 'growing', 'mature'],
  },
  {
    id: 'prophetic_indictment',
    name: 'Prophetic Indictment',
    desc: 'God speaking through the writer with holy frustration — not at the reader, but at the systems or lies holding them captive (Amos-level)',
    example: '"You have built altars to productivity and called them discipline. I never asked for this. I asked you to stop."',
    craftNote: 'Target must be an impersonal force (hustle culture, shame, religious performance) — never the reader personally. End with what God actually wants.',
    faithLevel: ['growing', 'mature'],
  },
  {
    id: 'testimony_fragment',
    name: 'Testimony Fragment',
    desc: 'A stranger\'s testimony told in their voice — brief, gritty, specific. Not a full story, just the turn.',
    example: '"I was 44 when I stopped lying to my small group. The week I said \'I\'m not fine,\' three other people exhaled." — Name withheld, Dallas',
    craftNote: 'Attribute to a plausible anonymous source (first name, city). Include one hyper-specific detail. The reader must believe this person exists.',
    faithLevel: ['new', 'growing', 'mature'],
  },
  {
    id: 'god_lament',
    name: 'God\'s Lament',
    desc: 'God grieving — not thundering. Hosea\'s wounded-parent voice. "How can I give you up, Ephraim?"',
    example: '"I watch you punish yourself and call it holiness. Do you know what it is to make something beautiful and watch it try to unmake itself?"',
    craftNote: 'God\'s tone is grief, not anger. Use parent-to-child tenderness. The power comes from God being affected. Sorrow, not guilt-tripping.',
    faithLevel: ['growing', 'mature'],
  },
  {
    id: 'two_prayers',
    name: 'Two Prayers Compared',
    desc: 'Place two prayers side by side — the polished prayer vs. the raw prayer underneath (Luke 18 Pharisee/tax collector)',
    example: 'The prayer you pray: "Lord, give me patience." The prayer underneath: "Lord, make her stop. Or make me stop caring. I\'m so tired."',
    craftNote: 'Surface prayer sounds respectable. Underneath prayer is raw and specific. The underneath prayer is always the real one. Never judge either.',
    faithLevel: ['new', 'growing', 'mature'],
  },
  {
    id: 'divine_question',
    name: 'Divine Question',
    desc: 'God asking the reader a single question — then sitting in the silence. "Where are you?" "What are you doing here?"',
    example: 'There is a question God has been asking you for months. You hear it in the shower. The question is: "What are you afraid will happen if you let yourself be loved?"',
    craftNote: 'Build anticipation before revealing the question. It must be unanswerable in one sentence — it should haunt. Never provide the answer.',
    faithLevel: ['growing', 'mature'],
  },
  {
    id: 'enemy_voice_named',
    name: 'Enemy Voice Named',
    desc: 'Give voice to the accuser — shame, fear, perfectionism — then name it and dismantle it (narrative therapy meets spiritual warfare)',
    example: 'The voice says: "You\'re behind. Everyone your age has figured this out." Notice: it says "everyone" and "only one." That\'s how you know it\'s not God.',
    craftNote: 'The enemy voice must sound real. Then provide a specific diagnostic: "Here\'s how you know it\'s not God..." The identification IS the deliverance.',
    faithLevel: ['new', 'growing', 'mature'],
  },
  {
    id: 'apostolic_charge',
    name: 'Apostolic Charge',
    desc: 'Paul-to-Timothy urgency — an older voice commissioning a younger one with tears and fire (Pauline pastoral epistles)',
    example: 'Listen to me. The faith you received is not decorative. It is a live coal. It will burn you if you hold it and go out if you don\'t. Fan it into flame. Today.',
    craftNote: 'Open with a command: "Listen," "Hear me," "I charge you." Build to a crescendo. The final sentence is an action, not a feeling.',
    faithLevel: ['growing', 'mature'],
  },
  {
    id: 'crowd_whisper',
    name: 'Crowd Whisper',
    desc: 'Multiple unnamed voices speaking fragments — polyphonic narration that places the reader inside the scene',
    example: '"Did you hear what he said?" / "Something about the inside of the cup—" / "My husband says he\'s dangerous." / "My son can see now."',
    craftNote: 'Use slash marks between voices. No attribution — anonymity IS the crowd. 4-6 fragments. At least one voice dissents.',
    faithLevel: ['new', 'growing', 'mature'],
  },
  {
    id: 'body_speaks',
    name: 'Body Speaks',
    desc: 'The body as interlocutor — your clenched jaw, insomnia, tears have something to say (incarnational theology meets somatic awareness)',
    example: 'Your chest has been tight for three weeks. Not a medical condition — a theological one. Your body is holding a grief your mind won\'t schedule time for.',
    craftNote: 'Name a specific body sensation. Interpret it theologically, not medically. The body is an ally, not an inconvenience.',
    faithLevel: ['new', 'growing', 'mature'],
  },
  {
    id: 'saint_letter',
    name: 'Saint\'s Letter to You',
    desc: 'A historical figure writes directly to the reader — Bonhoeffer from prison, Paul from house arrest (communion of saints)',
    example: '"You think your doubts disqualify you. I wrote half my letters from a jail cell with doubts so thick I could taste them. — Paul, from Rome, AD 62"',
    craftNote: 'Research the historical figure\'s actual voice. Sign with name, location, date. Keep to 3-5 sentences. It must sound like them.',
    faithLevel: ['growing', 'mature'],
  },
  {
    id: 'parable_fresh',
    name: 'Modern Parable',
    desc: 'A new parable in Jesus\' pattern — "The kingdom of God is like..." using contemporary objects and scenarios',
    example: 'The kingdom of God is like a woman who deleted her dating app, not because she gave up, but because she realized she\'d been swiping past the life already in front of her.',
    craftNote: 'Must open with "The kingdom of God is like..." The scenario is mundane and contemporary. The ending inverts expectations. One paragraph max.',
    faithLevel: ['new', 'growing', 'mature'],
  },
  {
    id: 'holy_spirit_nudge',
    name: 'Spirit\'s Nudge',
    desc: 'The still, small voice — one quiet sentence embedded in the noise of ordinary life (Elijah at Horeb)',
    example: 'Between "email landlord" and "call Mom back," a sentence appears that you did not write: You are allowed to rest before you\'ve earned it.',
    craftNote: 'The Spirit\'s voice is ONE sentence, embedded inside daily noise. Describe the noise first, then the sentence arrives uninvited.',
    faithLevel: ['new', 'growing', 'mature'],
  },
  {
    id: 'reader_absolves',
    name: 'Reader as Priest',
    desc: 'The reader speaks absolution or blessing over themselves — Protestant priesthood of all believers made active',
    example: 'Say this out loud over yourself. Use your own name. "[Name], you are forgiven for last Tuesday. You are released. Go."',
    craftNote: 'Use explicit stage directions: "Say this out loud," "Put your hand on your chest." The words must be simple enough to actually speak aloud.',
    faithLevel: ['growing', 'mature'],
  },
  {
    id: 'creation_witness',
    name: 'Creation Witness',
    desc: 'Non-human creation speaks — the fig tree, the rock that could cry out, the whale. The material world has testimony (Franciscan tradition)',
    example: '"I am the storm on Galilee. I was not his enemy. I was his stage. He needed them afraid so they could learn what happens when you wake him up." — The storm, Mark 4',
    craftNote: 'The non-human speaker must have a perspective the humans lacked. Sign with identity and biblical reference. It should reveal something about God.',
    faithLevel: ['new', 'growing', 'mature'],
  },
  {
    id: 'benediction_close',
    name: 'Benediction',
    desc: 'A formal blessing spoken over the reader — "May you..." (Aaronic blessing, Celtic blessings)',
    example: 'May your sleep tonight be dreamless in the best way. May you wake and remember: the verdict came back years ago. It was grace.',
    craftNote: 'Open with "May you..." or "May the God who..." Use second person. At least one line should surprise. Close with a period, not an amen.',
    faithLevel: ['new', 'growing', 'mature'],
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
