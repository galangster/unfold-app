// ==========================================
// BIBLE STUDY METHODS ENGINE
// 32 methods spanning analytical, contemplative, creative, genre-specific, and modern approaches
// Used by arc generator to assign methods per day, and by day generator to shape output
// Zero latency impact — all static prompt text, ~50-100 tokens per method card
// ==========================================

// ==========================================
// METHOD CARD TYPE
// ==========================================

export interface BibleStudyMethodCard {
  /** Unique identifier used in arc hints */
  id: string;
  /** Human-readable name */
  name: string;
  /** One-sentence description for arc planning */
  description: string;
  /** Scripture genres this method works best with */
  idealGenres: string[];
  /** The emotional feel this method produces */
  emotionalTexture: string;
  /** Difficulty: 'accessible' (anyone), 'intermediate' (some familiarity), 'advanced' (deep study) */
  difficulty: 'accessible' | 'intermediate' | 'advanced';
  /** Prompt modifier injected into day generation — tells the AI HOW to write this devotional */
  promptModifier: string;
}

// ==========================================
// ANALYTICAL / EXEGETICAL METHODS
// ==========================================

const EXPOSITORY: BibleStudyMethodCard = {
  id: 'expository',
  name: 'Expository (Verse-by-Verse)',
  description: 'Systematic line-by-line analysis unpacking what the text says, meant, and means today.',
  idealGenres: ['epistle', 'dense_narrative', 'law', 'prophecy'],
  emotionalTexture: 'intellectual depth, layered understanding',
  difficulty: 'intermediate',
  promptModifier: `STUDY METHOD: EXPOSITORY
Walk through this passage line by line. For each key phrase:
- Surface what the original audience would have understood
- Drop one piece of historical/linguistic context that reframes meaning
- Connect to a transferable principle
Build understanding progressively — each paragraph should deepen the last. Close with one sharp application question.`,
};

const INDUCTIVE_OIA: BibleStudyMethodCard = {
  id: 'inductive_oia',
  name: 'Inductive Study (OIA)',
  description: 'Self-discovery through Observation, Interpretation, Application — the reader is the detective.',
  idealGenres: ['epistle', 'narrative', 'gospel', 'prophecy'],
  emotionalTexture: 'empowering, detective-like discovery',
  difficulty: 'intermediate',
  promptModifier: `STUDY METHOD: INDUCTIVE (OIA)
Guide the reader to discover truth rather than receiving it. Structure:
- OBSERVE: Point out what's there that most people miss — repeated words, unexpected omissions, structural patterns
- INTERPRET: Ask "why?" questions before giving answers. Let the reader think first.
- APPLY: Use Head (what do I believe?), Heart (what do I feel?), Hands (what will I do?)
Use progressive revelation: "Notice what's missing from this list..." or "Read it again — but watch who ISN'T speaking."`,
};

const WORD_STUDY: BibleStudyMethodCard = {
  id: 'word_study',
  name: 'Word Study',
  description: 'Deep dive into one Hebrew or Greek word — its root, semantic range, and how context shapes meaning.',
  idealGenres: ['poetry', 'epistle', 'prophecy', 'wisdom'],
  emotionalTexture: 'mind-expanding, fresh eyes on familiar text',
  difficulty: 'intermediate',
  promptModifier: `STUDY METHOD: WORD STUDY
Center this devotional around ONE key word from the passage. Tell the word's story:
- The original Hebrew/Greek term and what English translations miss
- How the word's meaning shifts across its biblical appearances
- The specific shade of meaning in TODAY's passage
Write it as narrative, not a dictionary entry: "The Hebrew word here is X. English translates it as Y, but that misses Z. X is the kind of word that..."`,
};

const RHETORICAL_ANALYSIS: BibleStudyMethodCard = {
  id: 'rhetorical_analysis',
  name: 'Rhetorical / Literary Analysis',
  description: 'Surface the literary architecture — parallelism, chiasmus, inclusio, repetition, irony.',
  idealGenres: ['poetry', 'narrative', 'epistle', 'prophecy'],
  emotionalTexture: 'elegant, revelatory — seeing the artistry behind the text',
  difficulty: 'advanced',
  promptModifier: `STUDY METHOD: RHETORICAL ANALYSIS
Reveal the literary structure of this passage, then show what it means:
- Identify the dominant literary device (parallelism, chiasmus, inclusio, repetition, irony/reversal)
- Show the structure visually in words: "Notice how the psalm starts and ends with the same phrase..."
- Explain WHY the author used this structure — what theological point does the form itself make?
The reader should finish thinking "I never noticed that" and appreciate Scripture as both truth AND art.`,
};

const MANUSCRIPT: BibleStudyMethodCard = {
  id: 'manuscript',
  name: 'Manuscript Study',
  description: 'Strip away verse numbers and headings — engage the raw text as the original audience received it.',
  idealGenres: ['epistle', 'narrative', 'gospel'],
  emotionalTexture: 'immersive, raw, seeing the text as whole cloth',
  difficulty: 'advanced',
  promptModifier: `STUDY METHOD: MANUSCRIPT
Present this passage as continuous text — no verse numbers, no section headers. Guide the reader to notice:
- Where does the flow naturally break? Where does the author shift gears?
- What patterns emerge when you read it as a single document?
- What connections do chapter/verse divisions normally hide?
Frame it: "Read this straight through — no stopping. Where does it feel like the turning point? What connects the beginning to the end?"`,
};

const TYPOLOGICAL: BibleStudyMethodCard = {
  id: 'typological',
  name: 'Typological Study',
  description: 'OT people, events, and objects that foreshadow Christ — the shadow points to the substance.',
  idealGenres: ['ot_narrative', 'law', 'prophecy'],
  emotionalTexture: 'awe-inducing, "it was all pointing here"',
  difficulty: 'intermediate',
  promptModifier: `STUDY METHOD: TYPOLOGICAL
Start with the Old Testament scene in vivid narrative detail. Build the reader's connection to the original story. THEN pull back to reveal the New Testament fulfillment — the antitype that is always greater than the type.
Structure: Scene → Tension → Resolution → Reveal ("But centuries later, on a hill not far from this one...")
The reader should feel the Bible's unity — one story, one author behind the authors, pointing to one person.`,
};

const CROSS_REFERENCE: BibleStudyMethodCard = {
  id: 'cross_reference',
  name: 'Cross-Reference / Theme Tracing',
  description: 'Trace a single theme across the entire biblical narrative — how it develops and resolves in Christ.',
  idealGenres: ['any'],
  emotionalTexture: 'epic, cinematic — part of a story larger than any passage',
  difficulty: 'intermediate',
  promptModifier: `STUDY METHOD: CROSS-REFERENCE CHAIN
Today's passage is one link in a chain that runs through the entire Bible. Show where this link sits:
- What came before this theme? (brief OT backdrop)
- What does TODAY'S passage add to the theme?
- Where does the theme go next? (preview without spoiling)
The reader should feel they're watching one act in a multi-act epic. Close with: "Tomorrow we'll see how this thread surfaces again in..."`,
};

const HISTORICAL_CULTURAL: BibleStudyMethodCard = {
  id: 'historical_cultural',
  name: 'Historical-Cultural Background',
  description: 'Investigate the cultural context that transforms how we read the passage.',
  idealGenres: ['gospel', 'ot_narrative', 'epistle', 'law'],
  emotionalTexture: 'illuminating, grounding — the text becomes real',
  difficulty: 'intermediate',
  promptModifier: `STUDY METHOD: HISTORICAL-CULTURAL BACKGROUND
Open with a cultural detail that reframes the passage — something the original audience knew but modern readers miss:
- Social structures (honor-shame, patronage, kinship)
- Geography (why THIS location matters)
- Material culture (houses, farming, meals, weddings, funerals)
- Religious context (temple economics, purity codes, competing belief systems)
The reader should think: "I've read this verse 100 times and never understood it until now."`,
};

// ==========================================
// CONTEMPLATIVE / DEVOTIONAL METHODS
// ==========================================

const LECTIO_DIVINA: BibleStudyMethodCard = {
  id: 'lectio_divina',
  name: 'Lectio Divina (Divine Reading)',
  description: 'Ancient 4-movement contemplative practice: Read, Meditate, Pray, Contemplate.',
  idealGenres: ['poetry', 'gospel', 'short_passage'],
  emotionalTexture: 'intimate, slow, receptive — listening TO God, not studying ABOUT God',
  difficulty: 'accessible',
  promptModifier: `STUDY METHOD: LECTIO DIVINA
Guide the reader through four movements with pacing cues:
1. LECTIO: Present the passage. "Read these words once. Now again, slower."
2. MEDITATIO: "Which phrase stayed with you? Don't choose one — let one choose you. Sit with it."
3. ORATIO: "Tell God what you noticed. What stirred? What are you afraid of? Speak honestly."
4. CONTEMPLATIO: "Release words. Rest in silence. No analysis needed."
Write with spacious pacing. Use short sentences. Leave room for silence between sections.`,
};

const IGNATIAN_CONTEMPLATION: BibleStudyMethodCard = {
  id: 'ignatian_contemplation',
  name: 'Ignatian Contemplation (Imaginative Prayer)',
  description: 'Enter a Gospel scene using all five senses and encounter Jesus within the imagined story.',
  idealGenres: ['gospel', 'ot_narrative'],
  emotionalTexture: 'vivid, emotional, personal encounter',
  difficulty: 'accessible',
  promptModifier: `STUDY METHOD: IGNATIAN CONTEMPLATION
Set the scene with rich sensory detail — sight, sound, smell, texture, temperature. Place the reader IN the story:
- "The air is thick with dust and animal smells. The crowd is pressing in..."
- "You can hear the waves slapping the hull. Someone is sleeping in the stern."
Then invite the reader to encounter Jesus within the scene. What does He do? What does He say? End with a colloquy prompt: "What would you say to Him right now?"
The reader moves from reading ABOUT Jesus to being WITH Jesus.`,
};

const SCRIPTURE_MEDITATION: BibleStudyMethodCard = {
  id: 'scripture_meditation',
  name: 'Scripture Meditation & Memorization',
  description: 'Commit a short passage to memory and ruminate on it throughout the day.',
  idealGenres: ['poetry', 'short_passage', 'proverb'],
  emotionalTexture: 'deeply personal, accumulative — builds over the day',
  difficulty: 'accessible',
  promptModifier: `STUDY METHOD: SCRIPTURE MEDITATION
Center this devotional around 1-3 verses maximum. The goal is depth, not breadth.
- Morning prompt: "Read this three times aloud. Write it out by hand if you can."
- Midday prompt: "Return to these words. How do they land differently now?"
- Evening prompt: "How did this verse show up in your day? What did it surface?"
Write a brief, warm reflection that gives the reader just enough to start chewing — then release them to carry the words.`,
};

const BREATH_PRAYER: BibleStudyMethodCard = {
  id: 'breath_prayer',
  name: 'Breath Prayer with Scripture',
  description: 'Extract a short phrase from the passage and synchronize it with breathing.',
  idealGenres: ['poetry', 'short_passage', 'psalm'],
  emotionalTexture: 'calming, embodied — bridges theology and physiology',
  difficulty: 'accessible',
  promptModifier: `STUDY METHOD: BREATH PRAYER
Extract one phrase (4-8 words) from today's passage and split it for breathing:
- Inhale: first half / Exhale: second half
- Example: Inhale "The Lord is" / Exhale "my shepherd"
Write a brief reflection on the passage, then guide the reader through the breath prayer:
"Take the phrase '[X]' from today's reading. Breathe in: '[first half].' Breathe out: '[second half].' Repeat five times. Notice what shifts."`,
};

// ==========================================
// CREATIVE / INTERACTIVE METHODS
// ==========================================

const SOAP_JOURNAL: BibleStudyMethodCard = {
  id: 'soap_journal',
  name: 'SOAP Journaling',
  description: 'Scripture, Observation, Application, Prayer — a structured journaling framework.',
  idealGenres: ['any'],
  emotionalTexture: 'grounded, practical, personal',
  difficulty: 'accessible',
  promptModifier: `STUDY METHOD: SOAP JOURNALING
Structure this devotional to model the SOAP method:
- SCRIPTURE: Present the passage with a brief framing sentence
- OBSERVATION: Share 2-3 things you notice — repeated words, surprises, who's speaking
- APPLICATION: Write one specific, concrete application — not vague but actionable
- PRAYER: Close with a prayer that responds to what was discovered
Keep the tone warm and journalistic — as if writing in a personal journal, not delivering a sermon.`,
};

const VERSE_MAPPING: BibleStudyMethodCard = {
  id: 'verse_mapping',
  name: 'Verse Mapping',
  description: 'Visual multi-layer annotation of a single verse — keywords, Greek/Hebrew, cross-refs, context.',
  idealGenres: ['any'],
  emotionalTexture: 'creative, exploratory — unpacking layer by layer',
  difficulty: 'intermediate',
  promptModifier: `STUDY METHOD: VERSE MAPPING
Focus on a single verse (or 2-3 at most). Unpack it layer by layer:
- Layer 1: THE WORDS — What does each key word mean? Any surprises?
- Layer 2: THE ORIGINAL — Hebrew or Greek meanings that English misses
- Layer 3: THE CONNECTIONS — Cross-references that illuminate this verse
- Layer 4: THE CONTEXT — Historical/cultural details that shift meaning
- Layer 5: THE APPLICATION — What does this layered understanding change for you?
Each layer should build on the last, creating a sense of deepening understanding.`,
};

const SWEDISH_METHOD: BibleStudyMethodCard = {
  id: 'swedish_method',
  name: 'Swedish Method',
  description: 'Three symbols: lightbulb (what shines), question mark (what confuses), arrow (what applies).',
  idealGenres: ['any'],
  emotionalTexture: 'accessible, non-threatening, warm',
  difficulty: 'accessible',
  promptModifier: `STUDY METHOD: SWEDISH METHOD
After presenting the passage, guide the reader through three questions:
- 💡 "What caught your attention? What phrase or image shines?"
- ❓ "What confused you? What doesn't make sense at first read?"
- ➡️ "What felt personal? Where did this passage touch your life?"
Keep the devotional warm and inviting. This method works because it's radically simple — honor that simplicity. Don't over-explain.`,
};

const DISCOVERY_BIBLE_STUDY: BibleStudyMethodCard = {
  id: 'discovery_bible_study',
  name: 'Discovery Bible Study (DBS)',
  description: 'Seven simple questions that let the Bible do the heavy lifting — no expertise required.',
  idealGenres: ['narrative', 'gospel', 'any'],
  emotionalTexture: 'communal, action-oriented, externally focused',
  difficulty: 'accessible',
  promptModifier: `STUDY METHOD: DISCOVERY BIBLE STUDY
Structure the devotional around these core discovery questions:
1. What happens in this passage?
2. What does this tell us about God?
3. What does this tell us about people?
4. How does this change how we see God?
5. How does this change how we treat others?
6. How does this change how we live?
Keep the tone conversational and action-oriented. The final reflection should push outward — not just "what does this mean for me?" but "who needs to hear this?"`,
};

// ==========================================
// TOPICAL / THEMATIC METHODS
// ==========================================

const TOPICAL: BibleStudyMethodCard = {
  id: 'topical',
  name: 'Topical Study',
  description: 'Comprehensive examination of a topic across multiple passages, genres, and time periods.',
  idealGenres: ['cross_genre'],
  emotionalTexture: 'comprehensive, authoritative — hearing the full biblical witness',
  difficulty: 'intermediate',
  promptModifier: `STUDY METHOD: TOPICAL
Today's devotional examines a topic through multiple passages. For each passage:
- Read it in its own context (don't flatten diverse texts into one voice)
- Show what THIS passage uniquely contributes to the topic
- Note where passages agree, and where they add tension or nuance
The reader should finish with a richer, more nuanced understanding than any single passage provides.`,
};

const CHARACTER_STUDY: BibleStudyMethodCard = {
  id: 'character_study',
  name: 'Character / Biographical Study',
  description: 'Reconstruct a biblical figure\'s life, choices, failures, and growth as a mirror for the reader.',
  idealGenres: ['ot_narrative', 'gospel', 'narrative'],
  emotionalTexture: 'relatable, narrative-driven — seeing yourself in their story',
  difficulty: 'accessible',
  promptModifier: `STUDY METHOD: CHARACTER STUDY
Tell this character's story as a narrative — with tension, complexity, and humanity:
- Show their strengths AND weaknesses (real people, not cardboard saints)
- Surface the moment of crisis, choice, or transformation
- Let the reader discover the lesson through the story, not from a stated moral
Write the character as someone the reader can see themselves in. Don't idealize. Don't condemn. Show.`,
};

const THEMATIC_THREAD: BibleStudyMethodCard = {
  id: 'thematic_thread',
  name: 'Thematic Thread',
  description: 'Trace one narrow thread through carefully selected passages — deeper than topical, more focused.',
  idealGenres: ['cross_genre'],
  emotionalTexture: 'focused, progressive — the thread tightens each day',
  difficulty: 'intermediate',
  promptModifier: `STUDY METHOD: THEMATIC THREAD
Today's passage carries a single thread that has been building across this series. Show:
- How this passage picks up the thread from previous days
- What NEW dimension this passage adds (it should feel like the thread is tightening)
- A brief preview of where the thread goes next
The reader should feel each day's devotional is part of one continuous argument that grows more compelling.`,
};

// ==========================================
// GENRE-SPECIFIC METHODS
// ==========================================

const NARRATIVE_STUDY: BibleStudyMethodCard = {
  id: 'narrative_study',
  name: 'Narrative / Story Analysis',
  description: 'Follow the story structure: exposition, conflict, climax, resolution. Show, don\'t tell.',
  idealGenres: ['ot_narrative', 'gospel', 'narrative'],
  emotionalTexture: 'tension and resolution — story-driven',
  difficulty: 'accessible',
  promptModifier: `STUDY METHOD: NARRATIVE ANALYSIS
Tell this story with its full narrative tension:
- Set the scene (who, where, what's at stake)
- Build the conflict (don't resolve it too quickly — let the reader sit in the tension)
- Reveal the climax and resolution
- Surface what the resolution reveals about God's character
Biblical narrators show rather than tell — follow their lead. Let the story do the work.`,
};

const POETRY_PSALMS: BibleStudyMethodCard = {
  id: 'poetry_psalms',
  name: 'Poetry & Psalms Study',
  description: 'Slow reading of Hebrew poetry — parallelism, imagery, emotional arc, the turning point.',
  idealGenres: ['poetry', 'psalm', 'song_of_songs'],
  emotionalTexture: 'emotional, beautiful — feeling the turn',
  difficulty: 'intermediate',
  promptModifier: `STUDY METHOD: POETRY / PSALMS
Slow the reader down. This is poetry — it rewards patience:
- Identify the emotional starting point and ending point (psalms MOVE)
- Surface the parallelism: "The psalmist says the same thing twice, but the second line sharpens it..."
- Find the volta (turning point) — often marked by "but" or "yet"
- Let the imagery land: "The Lord is my SHEPHERD — that's not decoration. It's a complete theological claim."
Write with rhythm. Short sentences for impact. Longer ones that unspool like a prayer.`,
};

const WISDOM_STUDY: BibleStudyMethodCard = {
  id: 'wisdom_study',
  name: 'Wisdom Literature Study',
  description: 'Proverbs as patterns (not promises), Ecclesiastes as honest observation, Job as dramatic dialogue.',
  idealGenres: ['wisdom', 'proverb', 'ecclesiastes', 'job'],
  emotionalTexture: 'honest, challenging — permission to wrestle',
  difficulty: 'intermediate',
  promptModifier: `STUDY METHOD: WISDOM LITERATURE
Present this wisdom text as a conversation partner, not a lecture:
- If Proverbs: frame as a pattern/principle, NOT an unconditional promise
- If Ecclesiastes: honor the honesty — "The Teacher refuses to pretend otherwise"
- If Job: remember that Job's friends are WRONG — their neat theology is the book's antagonist
The tone should be honest and grounded. Wisdom literature gives permission to ask hard questions. Don't sanitize that.`,
};

const PROPHETIC_STUDY: BibleStudyMethodCard = {
  id: 'prophetic_study',
  name: 'Prophetic Literature Study',
  description: 'Forth-telling before foretelling — ground in historical context, then bridge to present.',
  idealGenres: ['prophecy', 'prophetic_oracle'],
  emotionalTexture: 'urgent, bridging past and present',
  difficulty: 'advanced',
  promptModifier: `STUDY METHOD: PROPHETIC LITERATURE
Ground the prophecy in its historical moment FIRST — who is speaking, to whom, about what crisis?
Then bridge to the present: "Isaiah is speaking to a nation that trusted alliances more than God. The specifics change — chariots become 401(k)s — but the diagnosis is identical."
Follow the prophetic pattern: indictment → judgment → hope. Most prophets end with hope, even when the middle is devastating.`,
};

const EPISTLE_STUDY: BibleStudyMethodCard = {
  id: 'epistle_study',
  name: 'Epistle / Letter Study',
  description: 'Follow the logical flow — map the therefore-because chain, identify the problem being addressed.',
  idealGenres: ['epistle'],
  emotionalTexture: 'logical, persuasive — following an argument',
  difficulty: 'intermediate',
  promptModifier: `STUDY METHOD: EPISTLE
Frame this as a letter to a real community with real problems — because it was:
- "Imagine you're in Corinth. Your church is splitting into factions. Then a letter arrives from Paul."
- Map the logical flow: "Because X is true... therefore Y follows"
- Watch for the pivot from theology to practice
Help the reader follow the argument, not just extract isolated verses.`,
};

// ==========================================
// STRUCTURAL / FRAMEWORK METHODS
// ==========================================

const REDEMPTIVE_HISTORICAL: BibleStudyMethodCard = {
  id: 'redemptive_historical',
  name: 'Redemptive-Historical (Biblical Theology)',
  description: 'Read every passage through the lens of Creation → Fall → Redemption → Restoration.',
  idealGenres: ['any'],
  emotionalTexture: 'grand-scale, purposeful — every passage has a place in the epic',
  difficulty: 'advanced',
  promptModifier: `STUDY METHOD: REDEMPTIVE-HISTORICAL
Place today's passage on the timeline of God's redemptive story:
- Where does this sit in the arc of Creation → Fall → Redemption → Restoration?
- What has God already done before this moment? What hasn't happened yet?
- How does this passage ADVANCE the story — what new move does God make here?
The reader should feel they're watching one scene in a film that spans from Genesis to Revelation, and that this scene matters to the plot.`,
};

const COVENANT_STUDY: BibleStudyMethodCard = {
  id: 'covenant_study',
  name: 'Covenant Study',
  description: 'Examine the passage through the lens of God\'s covenants — their promises, terms, signs, and fulfillment.',
  idealGenres: ['ot_narrative', 'law', 'prophecy', 'epistle'],
  emotionalTexture: 'foundational, relational — God binding Himself to people',
  difficulty: 'advanced',
  promptModifier: `STUDY METHOD: COVENANT
Examine today's passage through the covenant framework:
- Which covenant is active here? (Adamic, Noahic, Abrahamic, Mosaic, Davidic, New)
- What are its elements — promise, terms, sign/seal?
- How does this passage show God keeping His covenant (or the people breaking theirs)?
- How does this covenant connect forward to Christ and the New Covenant?
The reader should see covenants as the backbone of the whole Bible — not legal contracts, but God saying "I am yours, and you are mine."`,
};

const PARABLE_STUDY: BibleStudyMethodCard = {
  id: 'parable_study',
  name: 'Parable Study',
  description: 'Interpret Jesus\' parables with proper guardrails — one central point, audience context, first-century culture.',
  idealGenres: ['gospel', 'parable'],
  emotionalTexture: 'surprising, subversive — parables flip expectations',
  difficulty: 'intermediate',
  promptModifier: `STUDY METHOD: PARABLE
Parables have unique interpretive rules — honor them:
- Identify ONE central truth (resist allegorizing every detail — most details are scenery)
- Ground in first-century Palestinian context: farming, weddings, debt, honor-shame
- Identify the audience — who is Jesus talking TO? What were they expecting Him to say?
- Reveal the surprise: parables subvert. The hero is a Samaritan. The lost son comes home to a party. The workers hired last get paid first.
The reader should feel the shock the original audience felt. If the parable feels comfortable, it hasn't been read correctly.`,
};

const LAMENT_STUDY: BibleStudyMethodCard = {
  id: 'lament_study',
  name: 'Lament Study',
  description: 'Follow the lament structure: address → complaint → trust → petition → praise. Permission to grieve.',
  idealGenres: ['psalm', 'poetry', 'lament'],
  emotionalTexture: 'raw, honest — permission to bring pain to God',
  difficulty: 'accessible',
  promptModifier: `STUDY METHOD: LAMENT
Walk the reader through the lament structure — this is the Bible's built-in grief process:
1. ADDRESS: The psalmist turns TO God, not away. "O Lord..."
2. COMPLAINT: Raw honesty about suffering. Don't soften this.
3. TRUST: Even in pain, a choice to remember who God is.
4. PETITION: A specific ask — not passive, but bold.
5. PRAISE: Often before the answer comes. Praise as an act of defiance against despair.
The reader should feel permission to bring their unfiltered pain to God. 40% of Psalms are laments — this is not the exception, it's the norm.`,
};

const COMPARATIVE_TRANSLATION: BibleStudyMethodCard = {
  id: 'comparative_translation',
  name: 'Comparative Translation Study',
  description: 'Read the same verse across 4-5 translations and notice what each reveals.',
  idealGenres: ['any'],
  emotionalTexture: 'illuminating, accessible — familiar verses become fresh',
  difficulty: 'accessible',
  promptModifier: `STUDY METHOD: COMPARATIVE TRANSLATION
Present the key verse in 3-4 different translations (ESV, NLT, MSG, and one more):
- Show them side by side
- Note where translations agree (the core meaning is clear)
- Note where they diverge (this is where the richness lives)
- Explain WHY they differ — what's happening in the original language that creates these variations?
The reader should think: "I've read this verse a hundred times, but I never noticed THAT shade of meaning."`,
};

const PRAYING_PSALMS: BibleStudyMethodCard = {
  id: 'praying_psalms',
  name: 'Praying the Psalms',
  description: 'Use the psalm as an actual prayer — substitute your situation into the psalmist\'s language.',
  idealGenres: ['psalm', 'poetry'],
  emotionalTexture: 'conversational, personal — the psalm becomes YOUR prayer',
  difficulty: 'accessible',
  promptModifier: `STUDY METHOD: PRAYING THE PSALMS
Guide the reader to use this psalm as their own prayer:
- Present the psalm with brief context
- Model the substitution: "Where the psalmist says 'my enemies,' insert whatever is opposing you today — anxiety, a diagnosis, a relationship..."
- Walk through the psalm as a prayer script, pausing at key moments
- Close with silence
Augustine said: "If the psalm prays, you pray. If it laments, you lament. If it hopes, you hope." The psalm gives voice to what the reader can't yet articulate.`,
};

const STORYTELLING_RENARRATION: BibleStudyMethodCard = {
  id: 'storytelling_renarration',
  name: 'Scriptural Storytelling / Re-narration',
  description: 'Retell the biblical text in vivid detail, filling the sensory and emotional gaps the text leaves sparse.',
  idealGenres: ['ot_narrative', 'gospel', 'narrative'],
  emotionalTexture: 'immersive, alive — the text becomes a world you enter',
  difficulty: 'accessible',
  promptModifier: `STUDY METHOD: SCRIPTURAL STORYTELLING
Retell this passage as vivid narrative — fill in what the text leaves sparse:
- What did the air smell like? What did the crowd sound like? What was the expression on their face?
- Stay faithful to the text — don't invent theology, but DO invent sensory detail
- Use present tense for immediacy: "He stands. The crowd goes quiet."
- After the retelling, surface the theological truth the story carries
The reader should feel like they were THERE, not reading about it 2,000 years later.`,
};

const EXAMEN_WITH_SCRIPTURE: BibleStudyMethodCard = {
  id: 'examen_with_scripture',
  name: 'Examen with Scripture',
  description: 'Review the day\'s events through the lens of a passage — where did God show up? Where was He absent?',
  idealGenres: ['any'],
  emotionalTexture: 'reflective, integrative — connecting scripture to lived experience',
  difficulty: 'accessible',
  promptModifier: `STUDY METHOD: EXAMEN WITH SCRIPTURE
Guide the reader through an evening review of their day, filtered through today's passage:
1. REPLAY: "Walk back through your day. What moments stand out?"
2. RECOGNIZE: "Where in your day did you see the truth of this passage at work?"
3. RESIST: "Where did you resist or forget what this passage says?"
4. RESPOND: "What would you do differently tomorrow in light of this?"
5. REST: "Release the day to God. Tomorrow is a fresh start."
This method bridges the gap between Bible reading and real life. The passage becomes a diagnostic tool.`,
};

// ==========================================
// ALL METHODS — EXPORTED COLLECTION
// ==========================================

export const BIBLE_STUDY_METHODS: Record<string, BibleStudyMethodCard> = {
  expository: EXPOSITORY,
  inductive_oia: INDUCTIVE_OIA,
  word_study: WORD_STUDY,
  rhetorical_analysis: RHETORICAL_ANALYSIS,
  manuscript: MANUSCRIPT,
  typological: TYPOLOGICAL,
  cross_reference: CROSS_REFERENCE,
  historical_cultural: HISTORICAL_CULTURAL,
  lectio_divina: LECTIO_DIVINA,
  ignatian_contemplation: IGNATIAN_CONTEMPLATION,
  scripture_meditation: SCRIPTURE_MEDITATION,
  breath_prayer: BREATH_PRAYER,
  soap_journal: SOAP_JOURNAL,
  verse_mapping: VERSE_MAPPING,
  swedish_method: SWEDISH_METHOD,
  discovery_bible_study: DISCOVERY_BIBLE_STUDY,
  topical: TOPICAL,
  character_study: CHARACTER_STUDY,
  thematic_thread: THEMATIC_THREAD,
  narrative_study: NARRATIVE_STUDY,
  poetry_psalms: POETRY_PSALMS,
  wisdom_study: WISDOM_STUDY,
  prophetic_study: PROPHETIC_STUDY,
  epistle_study: EPISTLE_STUDY,
  redemptive_historical: REDEMPTIVE_HISTORICAL,
  covenant_study: COVENANT_STUDY,
  parable_study: PARABLE_STUDY,
  lament_study: LAMENT_STUDY,
  comparative_translation: COMPARATIVE_TRANSLATION,
  praying_psalms: PRAYING_PSALMS,
  storytelling_renarration: STORYTELLING_RENARRATION,
  examen_with_scripture: EXAMEN_WITH_SCRIPTURE,
};

export const ALL_METHOD_IDS = Object.keys(BIBLE_STUDY_METHODS);

// ==========================================
// METHOD SELECTION HELPERS
// ==========================================

/** Methods suitable for beginners / early days in a series */
export const ACCESSIBLE_METHODS = ALL_METHOD_IDS.filter(
  (id) => BIBLE_STUDY_METHODS[id].difficulty === 'accessible'
);

/** Methods for mid-series depth */
export const INTERMEDIATE_METHODS = ALL_METHOD_IDS.filter(
  (id) => BIBLE_STUDY_METHODS[id].difficulty === 'intermediate'
);

/** Methods for late-series deep dives */
export const ADVANCED_METHODS = ALL_METHOD_IDS.filter(
  (id) => BIBLE_STUDY_METHODS[id].difficulty === 'advanced'
);

/** Get methods that match a scripture genre */
export function getMethodsForGenre(genre: string): BibleStudyMethodCard[] {
  return Object.values(BIBLE_STUDY_METHODS).filter(
    (m) => m.idealGenres.includes(genre) || m.idealGenres.includes('any') || m.idealGenres.includes('cross_genre')
  );
}

/** Pick a method that hasn't been used in recent days */
export function pickMethod(
  genre: string,
  difficulty: 'accessible' | 'intermediate' | 'advanced',
  recentMethodIds: string[],
): BibleStudyMethodCard {
  const candidates = Object.values(BIBLE_STUDY_METHODS).filter((m) => {
    const genreMatch = m.idealGenres.includes(genre) || m.idealGenres.includes('any') || m.idealGenres.includes('cross_genre');
    const difficultyMatch = m.difficulty === difficulty;
    const notRecent = !recentMethodIds.includes(m.id);
    return genreMatch && difficultyMatch && notRecent;
  });

  // Fallback: relax difficulty constraint
  if (candidates.length === 0) {
    const relaxed = Object.values(BIBLE_STUDY_METHODS).filter((m) => {
      const genreMatch = m.idealGenres.includes(genre) || m.idealGenres.includes('any') || m.idealGenres.includes('cross_genre');
      const notRecent = !recentMethodIds.includes(m.id);
      return genreMatch && notRecent;
    });
    if (relaxed.length > 0) return relaxed[Math.floor(Math.random() * relaxed.length)];
  }

  // Fallback: relax all constraints
  if (candidates.length === 0) {
    const all = Object.values(BIBLE_STUDY_METHODS);
    return all[Math.floor(Math.random() * all.length)];
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ==========================================
// GENRE MAPPING
// Maps scriptureRegion strings from arc generation to genre tags for method selection
// ==========================================

const REGION_TO_GENRE: Record<string, string> = {
  // Category-level regions (from arc generation)
  'gospels': 'gospel',
  'gospels & acts': 'gospel',
  'gospel': 'gospel',
  'epistles': 'epistle',
  'pauline epistles': 'epistle',
  'general epistles': 'epistle',
  'wisdom & poetry': 'poetry',
  'wisdom': 'wisdom',
  'pentateuch': 'law',
  'law': 'law',
  'torah': 'law',
  'historical books': 'ot_narrative',
  'old testament narrative': 'ot_narrative',
  'prophets': 'prophecy',
  'major prophets': 'prophecy',
  'minor prophets': 'prophecy',
  'apocalyptic': 'apocalyptic',

  // Individual Gospels + Acts
  'matthew': 'gospel',
  'mark': 'gospel',
  'luke': 'gospel',
  'john': 'gospel',
  'acts': 'narrative',

  // Pentateuch
  'genesis': 'ot_narrative',
  'exodus': 'ot_narrative',
  'leviticus': 'law',
  'numbers': 'ot_narrative',
  'deuteronomy': 'law',

  // Historical books
  'joshua': 'ot_narrative',
  'judges': 'ot_narrative',
  'ruth': 'ot_narrative',
  '1 samuel': 'ot_narrative',
  '2 samuel': 'ot_narrative',
  '1 kings': 'ot_narrative',
  '2 kings': 'ot_narrative',
  '1 chronicles': 'ot_narrative',
  '2 chronicles': 'ot_narrative',
  'ezra': 'ot_narrative',
  'nehemiah': 'ot_narrative',
  'esther': 'ot_narrative',

  // Wisdom & Poetry
  'job': 'wisdom',
  'psalms': 'psalm',
  'proverbs': 'wisdom',
  'ecclesiastes': 'wisdom',
  'song of solomon': 'poetry',
  'song of songs': 'poetry',

  // Major Prophets
  'isaiah': 'prophecy',
  'jeremiah': 'prophecy',
  'lamentations': 'poetry',
  'ezekiel': 'prophecy',
  'daniel': 'apocalyptic',

  // Minor Prophets
  'hosea': 'prophecy',
  'joel': 'prophecy',
  'amos': 'prophecy',
  'obadiah': 'prophecy',
  'jonah': 'ot_narrative',
  'micah': 'prophecy',
  'nahum': 'prophecy',
  'habakkuk': 'prophecy',
  'zephaniah': 'prophecy',
  'haggai': 'prophecy',
  'zechariah': 'prophecy',
  'malachi': 'prophecy',

  // Pauline Epistles
  'romans': 'epistle',
  '1 corinthians': 'epistle',
  '2 corinthians': 'epistle',
  'galatians': 'epistle',
  'ephesians': 'epistle',
  'philippians': 'epistle',
  'colossians': 'epistle',
  '1 thessalonians': 'epistle',
  '2 thessalonians': 'epistle',
  '1 timothy': 'epistle',
  '2 timothy': 'epistle',
  'titus': 'epistle',
  'philemon': 'epistle',

  // General Epistles
  'hebrews': 'epistle',
  'james': 'epistle',
  '1 peter': 'epistle',
  '2 peter': 'epistle',
  '1 john': 'epistle',
  '2 john': 'epistle',
  '3 john': 'epistle',
  'jude': 'epistle',

  // Apocalyptic
  'revelation': 'apocalyptic',
};

/** Map a scriptureRegion string to a genre tag for method selection */
export function regionToGenre(scriptureRegion: string): string {
  const lower = scriptureRegion.toLowerCase().trim();
  // Try exact match first
  if (REGION_TO_GENRE[lower]) return REGION_TO_GENRE[lower];
  // Try partial match
  for (const [key, genre] of Object.entries(REGION_TO_GENRE)) {
    if (lower.includes(key)) return genre;
  }
  return 'any';
}

// ==========================================
// NARRATIVE ROLE → DIFFICULTY MAPPING
// Uses the arc's narrative role (not raw day numbers) for smarter method selection
// ==========================================

/** Map narrative role to appropriate method difficulty, adjusted by faith background */
export function roleToDifficulty(
  narrativeRole: string,
  faithBackground?: string,
): 'accessible' | 'intermediate' | 'advanced' {
  // New-faith readers: cap at intermediate even in turning/advanced positions
  const isNew = faithBackground === 'new';

  switch (narrativeRole) {
    case 'foundation':
      return 'accessible';
    case 'deepening':
      return 'intermediate';
    case 'tension':
      return isNew ? 'accessible' : 'intermediate';
    case 'turning':
      return isNew ? 'intermediate' : 'advanced';
    case 'resolution':
      return 'accessible'; // Send the reader off gently
    default:
      return 'intermediate';
  }
}

// ==========================================
// ARC-LEVEL METHOD ASSIGNMENT PROMPT
// Function that builds the prompt, aware of user's settings
// ==========================================

/** Build the method assignment prompt for arc generation, calibrated to user settings */
export function buildMethodAssignmentPrompt(
  faithBackground?: string,
  depth?: string,
): string {
  // Determine max difficulty based on user's settings
  const isNew = faithBackground === 'new';
  const isSimple = depth === 'simple';
  const capAtIntermediate = isNew || isSimple;

  const accessibleList = ACCESSIBLE_METHODS
    .map((id) => `- ${id}: ${BIBLE_STUDY_METHODS[id].name} — ${BIBLE_STUDY_METHODS[id].description}`)
    .join('\n');

  const intermediateList = INTERMEDIATE_METHODS
    .map((id) => `- ${id}: ${BIBLE_STUDY_METHODS[id].name} — ${BIBLE_STUDY_METHODS[id].description}`)
    .join('\n');

  const advancedList = capAtIntermediate
    ? '(Not available for this reader — use accessible and intermediate methods only)'
    : ADVANCED_METHODS
        .map((id) => `- ${id}: ${BIBLE_STUDY_METHODS[id].name} — ${BIBLE_STUDY_METHODS[id].description}`)
        .join('\n');

  return `
BIBLE STUDY METHOD VARIETY (critical for engagement):
Each day should use a different study method to prevent repetitive content.
Reader's faith background: ${faithBackground ?? 'growing'}
Reader's depth preference: ${depth ?? 'balanced'}
${capAtIntermediate ? 'NOTE: This reader prefers simpler approaches — stick to accessible and intermediate methods.' : ''}

ACCESSIBLE (foundation + resolution days):
${accessibleList}

INTERMEDIATE (deepening + tension days):
${intermediateList}

ADVANCED (turning point days${capAtIntermediate ? ' — NOT for this reader' : ''}):
${advancedList}

RULES:
- ZERO REPEATS: Every single day in the series MUST use a DIFFERENT study method. Never assign the same method twice in one series.
- Match method to scripture genre (don't apply epistle analysis to a psalm)
- Map narrative role to difficulty: foundation→accessible, deepening→intermediate, tension→intermediate, turning→advanced, resolution→accessible
- Include the assigned method ID in each day's arc hint as "studyMethod"
- IMPORTANT: Use EXACT method IDs from the lists above (e.g. "lectio_divina", not "lectio-divina" or "Lectio Divina")
- If unsure which method fits, use "expository" as a safe default
- DO NOT default to lectio_divina — spread across all available methods
`;
}
