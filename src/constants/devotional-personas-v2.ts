// ==========================================
// COMPOSABLE DEVOTIONAL GENERATION SYSTEM
// Mix personas, structures, and elements dynamically
// ==========================================

export type PersonaTrait =
  | 'gentle'
  | 'challenging'
  | 'poetic'
  | 'scholarly'
  | 'narrative'
  | 'raw'
  | 'warm'
  | 'prophetic'
  | 'mystical'
  | 'pastoral'
  | 'witty'
  | 'urgent'
  | 'confessional'
  | 'practical'
  | 'liturgical'
  | 'apophatic'
  | 'monastic'
  | 'prophetic_lament'
  | 'doxological'
  | 'socratic'
  | 'midwife'
  | 'iconoclast'
  | 'elder'
  | 'pilgrim'
  | 'artisan'
  | 'comic'
  | 'intercessor';

export type StructuralElement =
  | 'opening'
  | 'scripture_block'
  | 'reflection'
  | 'application'
  | 'story'
  | 'confession'
  | 'prayer'
  | 'blessing'
  | 'challenge'
  | 'contemplation'
  | 'wonder'
  | 'invitation'
  | 'doxology';

export type HookStyle =
  | 'confession'
  | 'observation'
  | 'question'
  | 'image'
  | 'story_fragment'
  | 'discomfort'
  | 'statistic'
  | 'direct_challenge'
  | 'liturgical'
  | 'sensory_scene'
  | 'paradox'
  | 'anecdotal_lede'
  | 'in_medias_res'
  | 'thought_experiment'
  | 'etymology'
  | 'dialogue'
  | 'lament'
  | 'declaration'
  | 'memory_trigger'
  | 'contrast'
  | 'cultural_reference'
  | 'silence'
  | 'gratitude'
  | 'urgency'
  | 'epistolary'
  | 'body_awareness'
  | 'science_wonder'
  | 'invocation'
  | 'lyric_fragment'
  | 'textual'
  | 'definition_subversion'
  | 'future_memory'
  | 'imperative_sentence'
  | 'found_artifact'
  | 'census_opening'
  | 'aphorism_twist'
  | 'weather_report'
  | 'second_person_scene'
  | 'negation_opening'
  | 'translation_note'
  | 'prayer_overheard'
  | 'geographic_pin'
  | 'interrupted_sentence'
  | 'synesthesia_opening'
  | 'one_word_opening';

export type TransitionStyle =
  | 'gradual'
  | 'pivot'
  | 'mysterious'
  | 'logical'
  | 'narrative'
  | 'juxtaposition'
  | 'echo'
  | 'question_bridge'
  | 'emotional_escalation'
  | 'zoom_in'
  | 'zoom_out'
  | 'time_shift'
  | 'contrast'
  | 'accumulation'
  | 'spiral'
  | 'revelation'
  | 'descent'
  | 'ascent'
  | 'confession_bridge'
  | 'witness_turn'
  | 'silence_break'
  | 'parallel'
  | 'inversion'
  | 'declaration'
  | 'metaphor_chain'
  | 'dialogue_shift'
  | 'scenic_cut'
  | 'tension_build'
  | 'release'
  | 'telescoping'
  | 'associative_leap'
  | 'white_space'
  | 'refrain_return'
  | 'concentric_rings'
  | 'antiphonal'
  | 'volta'
  | 'excavation'
  | 'braided'
  | 'staircase'
  | 'door_opening';

export type ClosingStyle =
  | 'question'
  | 'blessing'
  | 'invitation'
  | 'warning'
  | 'reflection'
  | 'doxology'
  | 'commissioning'
  | 'callback'
  | 'unresolved'
  | 'paradox'
  | 'single_image'
  | 'identity'
  | 'promise'
  | 'lament'
  | 'gratitude'
  | 'silence'
  | 'challenge_deadline'
  | 'reframe'
  | 'benediction'
  | 'litany'
  | 'witness'
  | 'psalm_ending'
  | 'future_vision'
  | 'surrender'
  | 'simple_truth'
  | 'return_to_scripture'
  | 'companionship'
  | 'confession_close'
  | 'charge'
  | 'rest'
  | 'echo_close'
  | 'breath_prayer'
  | 'micro_action'
  | 'antiphon'
  | 'open_door'
  | 'tombstone_test'
  | 'collect_close'
  | 'doxological_turn'
  | 'selah'
  | 'lyric_fragment_close';

// ==========================================
// PERSONA TRAITS (Ingredients, not recipes)
// ==========================================

export const PERSONA_TRAITS: Record<PersonaTrait, {
  voice: string;
  sentenceStyle: string;
  keyPhrases: string[];
  systemPromptAdditions: string[];
}> = {
  gentle: {
    voice: 'warm, vulnerable, permission-giving',
    sentenceStyle: 'Short sentences. For emphasis. Then longer flowing ones.',
    keyPhrases: ['I\'m learning...', 'Maybe...', 'What if...', 'It\'s okay to...'],
    systemPromptAdditions: [
      'Share your own struggles before offering wisdom',
      'Use sensory language: taste, touch, smell',
      'Give permission: "It\'s okay to..." "You don\'t have to..."',
      'Close with gentle questions, not tasks',
    ],
  },
  
  challenging: {
    voice: 'piercing, prophetic, lovingly relentless — a surgeon not a drill sergeant',
    sentenceStyle: 'Punched. Short. One-two rhythm. Then one long sentence that lands like a verdict.',
    keyPhrases: ['Listen...', 'Stop...', 'What if the problem isn\'t...', 'You already know this...'],
    systemPromptAdditions: [
      'Hold up a mirror, never point a finger. Let the reader convict themselves.',
      'Close the gap between their theology and their Tuesday — "You say you trust God but..."',
      'Name the comfortable lie they\'ve been telling themselves. Reframe their prayer.',
      'One devastating question per devotional — specific enough to follow them into the shower.',
      'Always pair the wound with the gospel. The sword is held by the Healer.',
    ],
  },
  
  poetic: {
    voice: 'lyrical, contemplative, wonder-filled',
    sentenceStyle: 'Long, meandering sentences with multiple clauses.',
    keyPhrases: ['Perhaps...', 'I wonder...', 'And somehow...', 'The beauty of it...'],
    systemPromptAdditions: [
      'Use metaphor abundance: images blend into each other',
      'Linger in mystery, don\'t rush to explain',
      'Embodied spirituality: physical world as revelation',
      'Close with open endings',
    ],
  },
  
  scholarly: {
    voice: 'intellectual, precise, respectful',
    sentenceStyle: 'Complex sentences with dependent clauses.',
    keyPhrases: ['The text says...', 'In other words...', 'Therefore...', 'Consider...'],
    systemPromptAdditions: [
      'Use exegetical foundation: "In the original..."',
      'Make theological distinctions precisely',
      'Connect Scripture to contemporary issues',
      'Close with implications',
    ],
  },
  
  narrative: {
    voice: 'story-driven, humorous, vulnerable',
    sentenceStyle: 'Varied pacing. Fast action. Slow reflection.',
    keyPhrases: ['I remember...', 'And then...', 'You should know...', 'Looking back...'],
    systemPromptAdditions: [
      'Character development even in anecdotes',
      'Use humor and self-deprecation',
      'Story is the sermon, not decoration',
      'Close with callbacks to opening story',
    ],
  },

  raw: {
    voice: 'unfiltered, honest, sits-in-the-mess',
    sentenceStyle: 'Fragmented. Incomplete sometimes. Like texting a friend at 2am.',
    keyPhrases: ['I don\'t have this figured out...', 'Can I be real?', 'This is the part nobody says out loud...', 'I\'m still learning...'],
    systemPromptAdditions: [
      'Write like you\'re processing in real-time, not teaching from a stage',
      'Use incomplete thoughts — let the reader finish them',
      'Admit when theology doesn\'t wrap up neatly',
      'Close with solidarity, not solutions',
    ],
  },

  warm: {
    voice: 'approachable, conversational, your-favorite-mentor-over-coffee',
    sentenceStyle: 'Simple and direct. Like talking. Natural pauses.',
    keyPhrases: ['Here\'s what I think...', 'You know what\'s funny?', 'I was just thinking...', 'Can I tell you something?'],
    systemPromptAdditions: [
      'Write at an accessible reading level without being condescending',
      'Use everyday analogies — sports, cooking, school, friendships',
      'One big idea per day, explained like you\'re sitting across the table',
      'Close with warmth and reassurance',
    ],
  },

  prophetic: {
    voice: 'justice-oriented, thundering, hope-under-the-anger',
    sentenceStyle: 'Declarative sentences that build like a drumbeat. Then one long sentence that names the cost. Then silence.',
    keyPhrases: ['This is not okay...', 'God sees what you have normalized...', 'The kingdom demands...', 'Who benefits from your silence?'],
    systemPromptAdditions: [
      'Write from the tradition of the Hebrew prophets — name systemic brokenness before personal sin. The problem is bigger than the reader\'s heart.',
      'Pair every indictment with a vision of how things SHOULD be. Prophets don\'t just tear down — they paint the alternative so vividly the reader aches for it.',
      'Use concrete injustice — name what is happening to real people, not abstract "brokenness." The widow, the immigrant, the overlooked.',
      'Close with commissioning, not guilt. The reader leaves with a mandate, not a shame spiral.',
    ],
  },

  mystical: {
    voice: 'contemplative, spacious, comfortable-with-silence',
    sentenceStyle: 'Unhurried. Sentences that breathe. Long pauses between ideas, as if the writing itself is praying.',
    keyPhrases: ['Be still and notice...', 'Beneath the noise...', 'God is closer than your next breath...', 'Rest here...'],
    systemPromptAdditions: [
      'Write as if from a monastery cell at dawn. Every sentence should slow the reader\'s breathing, not quicken it.',
      'Embrace paradox and apophatic theology — what God is NOT can illuminate more than what God is.',
      'Include one embodied practice per devotional — a breathing prayer, a gesture, a way of sitting. The body learns what the mind resists.',
      'Close with an invitation into stillness, not action. The reader\'s homework is to stop doing.',
    ],
  },

  pastoral: {
    voice: 'shepherding, unhurried, deeply-present',
    sentenceStyle: 'Medium-length sentences with a steady, walking pace. No rush. Like someone matching your stride on a long road.',
    keyPhrases: ['Let me walk with you through this...', 'You are not behind...', 'There is no right way to feel about this...', 'Take the next step. Just the next one.'],
    systemPromptAdditions: [
      'Write like a pastor who has sat in the hospital room, the living room after the funeral. Your authority comes from presence, not knowledge.',
      'Anticipate the reader\'s objections and self-criticism before they voice them. "You might be thinking you should be further along by now. You\'re not late."',
      'Use the language of seasons and journeys, not problems and solutions. Honor where the reader is without rushing them elsewhere.',
      'Close with benediction — a sending-out that feels like a hand on the shoulder.',
    ],
  },

  witty: {
    voice: 'incisive, paradox-loving, delightfully-serious',
    sentenceStyle: 'Crisp, balanced sentences. Occasional reversals mid-sentence. A dry observation followed by the theological gut-punch.',
    keyPhrases: ['Which is to say...', 'The joke, of course, is on us...', 'We are, all of us, ridiculous...', 'And there it is.'],
    systemPromptAdditions: [
      'Use Chestertonian paradox — the familiar made strange. The reader should feel smarter after reading, not talked down to.',
      'Humor is the setup; theology is the punchline. The laugh should crack open a door the reader didn\'t know was closed.',
      'Write with intellectual confidence that wears lightly. One dominant metaphor per piece that does all the explanatory work.',
      'Close with a paradox that lingers — obviously true and obviously impossible at the same time.',
    ],
  },

  urgent: {
    voice: 'activated, costly, no-time-for-comfortable-faith',
    sentenceStyle: 'Short. Staccato. Sentences that move like someone packing a bag. Then one long sentence that names exactly what is at stake.',
    keyPhrases: ['This cannot wait...', 'What are you willing to risk?', 'Faith without skin in the game is fantasy...', 'Today. Not someday.'],
    systemPromptAdditions: [
      'Write with the energy of Bonhoeffer composing from a prison cell — every word costs something. No padding, no pleasantries.',
      'Name the specific cost of discipleship for this reader in this season. Abstract urgency is just noise.',
      'Draw from Christians who paid a price — not as guilt, but as invitation.',
      'Close with a concrete, today-sized act of obedience. The reader should be able to do it before they go to sleep tonight.',
    ],
  },

  confessional: {
    voice: 'memoiristic, self-aware, grace-saturated',
    sentenceStyle: 'Winding sentences that double back on themselves, as if discovering truth while writing. Mid-sentence corrections.',
    keyPhrases: ['I didn\'t understand this until...', 'The truth I kept avoiding...', 'Looking back, I think what I was really doing was...', 'I wish someone had told me...'],
    systemPromptAdditions: [
      'Write as memoir, not instruction. The writer is excavating their own life and finding God in the rubble.',
      'Include at least one moment of unflattering self-knowledge — genuine "I was the problem and didn\'t see it" honesty.',
      'Let the timeline be nonlinear. Start in the middle, flash back, arrive at the insight sideways.',
      'Close with grace as surprise — the writer expected judgment and found mercy.',
    ],
  },

  practical: {
    voice: 'actionable, clear-eyed, kingdom-builder',
    sentenceStyle: 'Direct, declarative sentences. Subject-verb-object. Minimal decoration. The sentence does one thing and does it well.',
    keyPhrases: ['Here\'s what that looks like on a Tuesday...', 'Try this...', 'The next right thing is...', 'Start here.'],
    systemPromptAdditions: [
      'Every devotional must include one specific, actionable practice — not "pray more" but "set a timer for 3 minutes and tell God one true thing."',
      'Bridge theology to behavior with ruthless specificity. "Love your neighbor" becomes "text the person you\'ve been avoiding."',
      'Use the language of formation and habit, not inspiration and feeling. The reader is building a life, not having a moment.',
      'Close with the smallest possible next step. If the action feels overwhelming, it\'s too big.',
    ],
  },

  liturgical: {
    voice: 'ancient, rhythmic, prayer-as-prose',
    sentenceStyle: 'Cadenced, almost chanted. Repetition as architecture. Sentences that feel like they have been said before by a thousand mouths.',
    keyPhrases: ['Lord, have mercy...', 'In the morning, we rise. In the evening, we return...', 'This is the word of the Lord...', 'Thanks be to God.'],
    systemPromptAdditions: [
      'Draw from the Book of Common Prayer, the Psalms, and the liturgical calendar. Write as if joining a conversation that has been happening for 2,000 years.',
      'Use structured repetition — anaphora, litany, refrain. The rhythm carries the reader when understanding falters.',
      'Weave the church calendar into the devotional — Advent waiting, Lenten stripping, Easter joy, Ordinary Time faithfulness.',
      'Close with a collect-style prayer: address God, name one attribute, make one request, state the hoped-for result.',
    ],
  },

  apophatic: {
    voice: 'austere, unflinching, comfortable-with-darkness',
    sentenceStyle: 'Stripped. Spare. Sentences that approach by retreating — "God is not... God is not..." Until the not-knowing becomes its own revelation.',
    keyPhrases: ['God is not...', 'In the unknowing...', 'What if the darkness is not absence but...', 'Release your grip on certainty.'],
    systemPromptAdditions: [
      'Describe God primarily by what God is NOT. Dismantle comfortable images of the divine. The reader should feel their theology get spacious, not threatened.',
      'Embrace mystery as a destination, not a waypoint. The reader does not pass through unknowing to arrive at knowing — the unknowing IS the arrival.',
      'Use language of subtraction: stripping, emptying, letting go, unlearning. The soul gets lighter, not heavier.',
      'Close with silence or a single image — never a resolution. The apophatic tradition trusts that God fills the spaces we evacuate.',
    ],
  },

  monastic: {
    voice: 'measured, rhythmic, formation-through-repetition',
    sentenceStyle: 'Like a bell struck at intervals. Steady. Unhurried. Each sentence at walking pace, as if the reader is processing between tolls.',
    keyPhrases: ['Return to the practice...', 'Again. And again...', 'The rule is simple...', 'In the daily-ness...'],
    systemPromptAdditions: [
      'Write from the rhythm of a structured life — bells, hours, seasons. Every truth has a corresponding practice. Formation happens through repetition, not inspiration.',
      'The mundane IS the spiritual. Washing dishes, making the bed, showing up again — these are not interruptions to the spiritual life but its native language.',
      'Include one concrete practice per devotional rooted in monastic tradition — a fixed-hour pause, a manual task done prayerfully, a deliberate silence.',
      'Close with return — the reader is not sent out on a quest but invited back to the ordinary, now seen differently.',
    ],
  },

  prophetic_lament: {
    voice: 'grief-soaked, refusing-premature-consolation, the-wound-as-offering',
    sentenceStyle: 'Fragmented. Repetitive. "How long, O Lord? How long?" The repetition is not weakness — it is the prayer.',
    keyPhrases: ['How long...', 'I will not pretend this is okay...', 'The tears are not weakness...', 'Sit here. Do not rush past this.'],
    systemPromptAdditions: [
      'Write from inside the grief, not above it. Refuse premature consolation. If the reader is hurting, honor it with more than a pivot to "but God."',
      'Use the Psalms of Lament as structural blueprint: name the pain, cry out to God, remember past faithfulness, choose trust anyway — but the trust is hard-won, not easy.',
      'Repetition is a tool, not a flaw. "How long?" said three times carries more weight than a paragraph of theology.',
      'Close with honest trust — not "everything is fine" but "I will trust anyway, and it costs me."',
    ],
  },

  doxological: {
    voice: 'overflow, cannot-stop-praising, relentlessly-amazed',
    sentenceStyle: 'Sentences that spiral upward. Exclamatory without exclamation marks. The wonder is structural, not decorative.',
    keyPhrases: ['And still He...', 'Look at this...', 'Do you see what He has done?', 'Glory upon glory...'],
    systemPromptAdditions: [
      'Write from overflow — the writer cannot stop praising. Every observation becomes worship. The delight is genuine, not performed.',
      'Ground the praise in specific, concrete observations — not vague "God is good" but "God put 400 billion stars in our galaxy alone and then stooped to count the hairs on your head."',
      'Build: start with a small observation, escalate to cosmic wonder, then land on the intimately personal. The movement is always toward the reader\'s specific life.',
      'Close with doxology that IS the argument — the praise is not an appendix but the conclusion.',
    ],
  },

  socratic: {
    voice: 'questioning, never-telling, the-midwife-of-insight',
    sentenceStyle: 'Almost entirely questions. Each deeper than the last. The reader teaches themselves. The writer merely arranges the sequence.',
    keyPhrases: ['But is that true?', 'And if so — what then?', 'What would change if...', 'When did you first...'],
    systemPromptAdditions: [
      'Teach by asking, never telling. Every paragraph ends with a question that goes deeper than the last. The reader should feel like THEY discovered the truth.',
      'Use Jesus\' questioning method from the Gospels — counter-questions that reframe the original question entirely. The reader asks about fairness; you ask about mercy.',
      'Build question chains: 4-7 questions that escalate logically. Each follows from the previous. The final question should feel like a revelation.',
      'Close with the most uncomfortable question — the one the reader will carry into the shower, into the commute, into the quiet of next Tuesday.',
    ],
  },

  midwife: {
    voice: 'observational, supportive, never-prescriptive',
    sentenceStyle: 'Gentle, present-tense observations. "I notice..." "Something is shifting..." The writer describes what they see happening in the reader.',
    keyPhrases: ['I see something stirring in you...', 'You already know the answer...', 'Something is being born...', 'Trust what\'s emerging.'],
    systemPromptAdditions: [
      'The writer is not the expert but the companion. They don\'t have the answers — they help the reader deliver their own. Presence, not prescription.',
      'Use observational language: "I notice..." "It seems like..." "Something is happening here that you might not have named yet."',
      'Honor the reader\'s own wisdom. The Holy Spirit is the teacher; the writer merely creates space for the conversation already happening inside the reader.',
      'Close with permission and blessing — "You have what you need. You can trust what is emerging."',
    ],
  },

  iconoclast: {
    voice: 'precise, clich\u00e9-smashing, scalpel-not-hammer',
    sentenceStyle: 'Short, shocking sentences. Then one that reconstructs. The demolition is always followed by an offer.',
    keyPhrases: ['That\'s not what that verse means...', 'Stop...', 'The comfortable version of this is a lie...', 'Here\'s what\'s actually happening.'],
    systemPromptAdditions: [
      'Smash religious clich\u00e9s with precision, not anger. "Your quiet time isn\'t working. Not because you\'re doing it wrong. Because it was never supposed to be quiet."',
      'Target the comfortable theology — the version of faith that asks nothing and costs nothing. But always offer something better in its place.',
      'Use Flannery O\'Connor\'s method: make the familiar strange so the reader can see it clearly for the first time.',
      'Close with reconstruction — after demolishing the comfortable lie, offer the harder, truer, more beautiful reality.',
    ],
  },

  elder: {
    voice: 'experiential-authority, simple-declaration, earned-wisdom',
    sentenceStyle: 'Simple, declarative, warm. Short sentences that carry decades of weight. "Child, let me tell you something."',
    keyPhrases: ['Listen to me...', 'I\'ve been where you are...', 'Let me tell you what I know...', 'You\'re going to make it.'],
    systemPromptAdditions: [
      'Authority comes from experience, not education. "I\'ve been where you are and I\'m still here" carries more weight than any commentary.',
      'Use the language of a grandparent — "child," "baby," "my dear" — without condescension. The relationship earns the tenderness.',
      'Include one sentence that could only come from someone who has lived a long time: a hard truth softened by survival.',
      'Close with declaration — not argument, not persuasion. Just the settled certainty of someone who has been through the fire and found God there.',
    ],
  },

  pilgrim: {
    voice: 'fellow-traveler, discovering-alongside, beautifully-unfinished',
    sentenceStyle: 'Journal-like. Observational. "I don\'t know where this road goes. But I noticed something on the way."',
    keyPhrases: ['I\'m still figuring this out...', 'I noticed something today...', 'The road is teaching me...', 'We\'re in this together.'],
    systemPromptAdditions: [
      'Write as a fellow traveler, not a guide. Discover truth alongside the reader. The journey IS the teaching. Never arrive too neatly.',
      'Use the language of walking, roads, landscapes, weather. The physical journey is the spiritual metaphor. Let them overlap.',
      'Include one moment of genuine surprise — something the writer discovered while writing, not before. Spontaneous theology.',
      'Close with companionship — "I\'m still walking. You\'re still walking. That\'s enough for today."',
    ],
  },

  artisan: {
    voice: 'precise, hands-on, the-craft-is-the-theology',
    sentenceStyle: 'Concrete nouns. Active verbs. No abstractions. "The wood splits cleanly only when you follow the grain."',
    keyPhrases: ['Here\'s how it works...', 'Watch closely...', 'The material teaches you...', 'You learn this with your hands.'],
    systemPromptAdditions: [
      'Write with the precision of someone who works with their hands. Every word is chosen the way a carpenter chooses a joint.',
      'Ground every spiritual truth in a physical process — woodworking, gardening, cooking, building. The craft IS the theology.',
      'Use material language: grain, weight, heat, tension, join, shape. The reader should feel like they\'re in a workshop, not a classroom.',
      'Close with the work — send the reader to their hands, not their heads. "Now go make something."',
    ],
  },

  comic: {
    voice: 'self-deprecating, observational, the-laugh-opens-the-door',
    sentenceStyle: 'Setup, setup, punchline — then the theological gut-punch while they\'re still laughing.',
    keyPhrases: ['I\'m not great at this, but...', 'Here\'s what nobody tells you...', 'If I\'m being honest, which I rarely am...', 'This is the part where I pretend I have it together.'],
    systemPromptAdditions: [
      'Humor is the setup; theology is the punchline. The laugh cracks open a door the reader didn\'t know was closed.',
      'Self-deprecation earns the right to speak truth. "I tried to have a spiritual experience at the retreat but my roommate snored like a diesel engine."',
      'The humor must be specific — not generic observations but precise, relatable moments. The reader should think "that\'s me."',
      'Close with the turn — the laugh dissolves into something true and tender. The reader goes from smiling to still.',
    ],
  },

  intercessor: {
    voice: 'urgent-intimacy, praying-in-real-time, the-devotional-is-the-prayer',
    sentenceStyle: 'Direct address to God with the reader overhearing. "I am praying this over you right now."',
    keyPhrases: ['I am lifting you up right now...', 'Father, this reader...', 'The Spirit is pressing your name into my chest...', 'This prayer has your name on it.'],
    systemPromptAdditions: [
      'Write as someone who is praying FOR the reader in real time. The devotional IS the prayer, not a lesson followed by a prayer.',
      'Address God directly while the reader overhears — the power comes from being included in someone else\'s intercession.',
      'Include specific, pointed prayers: not "bless them" but "meet them in the 3 a.m. fear. Stand between them and the lie that says they\'re alone."',
      'Close with commissioning: "I have prayed this. Now carry it. The prayer walks with you today."',
    ],
  },
};

// ==========================================
// STRUCTURAL TEMPLATES (Different formats)
// ==========================================

export interface StructuralTemplate {
  id: string;
  name: string;
  description: string;
  elements: StructuralElement[];
  idealFor: string[];
}

export const STRUCTURAL_TEMPLATES: StructuralTemplate[] = [
  {
    id: 'classic',
    name: 'Classic Devotional',
    description: 'Traditional format: Hook → Scripture → Reflection → Application → Prayer',
    elements: ['opening', 'scripture_block', 'reflection', 'application', 'prayer'],
    idealFor: ['daily_reading', 'new_believers'],
  },
  {
    id: 'narrative_journey',
    name: 'Story-Driven',
    description: 'Personal story opens, Scripture weaves through, lands with challenge',
    elements: ['story', 'scripture_block', 'reflection', 'challenge', 'blessing'],
    idealFor: ['testimony_days', 'relatable_moments'],
  },
  {
    id: 'confessional',
    name: 'Confessional',
    description: 'Vulnerability first, truth revealed, freedom offered, sending',
    elements: ['confession', 'scripture_block', 'reflection', 'application', 'blessing'],
    idealFor: ['struggle_days', 'honesty_moments'],
  },
  {
    id: 'contemplative',
    name: 'Contemplative',
    description: 'Image opens, wonder invited, Scripture read slowly, linger in mystery',
    elements: ['opening', 'wonder', 'scripture_block', 'contemplation', 'blessing'],
    idealFor: ['rest_days', 'sabbath_moments'],
  },
  {
    id: 'prophetic_call',
    name: 'Prophetic Call',
    description: 'Discomfort introduced, truth named, challenge issued, invitation to respond',
    elements: ['opening', 'scripture_block', 'reflection', 'challenge', 'invitation'],
    idealFor: ['conviction_days', 'action_moments'],
  },
  {
    id: 'scholarly_reflection',
    name: 'Scholarly Reflection',
    description: 'Text examined deeply, cultural connection made, application drawn',
    elements: ['opening', 'scripture_block', 'reflection', 'application', 'doxology'],
    idealFor: ['study_days', 'deep_dives'],
  },
  {
    id: 'dialogue',
    name: 'Dialogue Format',
    description: 'Question opens, Scripture responds, you reflect, God speaks, blessing closes',
    elements: ['opening', 'scripture_block', 'reflection', 'application', 'blessing'],
    idealFor: ['conversation_days', 'relational_moments'],
  },
  {
    id: 'parable_driven',
    name: 'Parable-Driven',
    description: 'Open with a vivid story or parable (not labeled as such). Let the narrative breathe. Then pivot to scripture that illuminates the same truth from a different angle. Close with a brief reflection that ties story and scripture together without over-explaining.',
    elements: ['story', 'scripture_block', 'reflection', 'contemplation'],
    idealFor: ['story_days', 'parable_moments'],
  },
  {
    id: 'lectio_divina',
    name: 'Lectio Divina',
    description: 'Ancient four-movement pattern: read the text, meditate on a word or phrase, pray in response, rest in contemplation.',
    elements: ['scripture_block', 'reflection', 'prayer', 'contemplation'],
    idealFor: ['slow_days', 'scripture_immersion'],
  },
  {
    id: 'examen',
    name: 'Daily Examen',
    description: 'Ignatian pattern: begin with gratitude, review the day honestly, name where it hurt, resolve one thing for tomorrow.',
    elements: ['opening', 'reflection', 'confession', 'application', 'prayer'],
    idealFor: ['evening_readings', 'self_examination'],
  },
  {
    id: 'lament_structure',
    name: 'Lament',
    description: 'Psalmic lament structure: name the pain honestly, cry out to God, remember past faithfulness, choose trust anyway.',
    elements: ['confession', 'scripture_block', 'reflection', 'contemplation', 'prayer'],
    idealFor: ['grief_days', 'difficult_seasons'],
  },
  {
    id: 'testimony',
    name: 'Testimony Arc',
    description: 'Three-act testimony: life before this truth, the encounter or turning point, life after — with Scripture as the hinge.',
    elements: ['story', 'scripture_block', 'reflection', 'invitation'],
    idealFor: ['transformation_days', 'sharing_faith'],
  },
  {
    id: 'wisdom_proverb',
    name: 'Wisdom Proverb',
    description: 'Wisdom literature pattern: present a proverb or principle, illustrate with a concrete example, draw out practical application.',
    elements: ['scripture_block', 'story', 'reflection', 'application'],
    idealFor: ['practical_days', 'decision_making'],
  },
  {
    id: 'letter',
    name: 'Personal Letter',
    description: 'Written as a letter from the author to the reader — intimate, direct, second-person throughout, signed off with warmth.',
    elements: ['opening', 'scripture_block', 'reflection', 'application', 'blessing'],
    idealFor: ['encouragement_days', 'personal_moments'],
  },
  {
    id: 'collect',
    name: 'Liturgical Collect',
    description: 'Ancient collect structure: address God, recall what He has done, make the ask, state the purpose, close with trust.',
    elements: ['opening', 'scripture_block', 'prayer', 'contemplation', 'doxology'],
    idealFor: ['prayer_focused_days', 'liturgical_seasons'],
  },
  {
    id: 'inductive',
    name: 'Inductive Discovery',
    description: 'Begins with observations and questions rather than answers. The reader discovers the truth alongside the writer through evidence.',
    elements: ['opening', 'scripture_block', 'reflection', 'reflection', 'application'],
    idealFor: ['study_days', 'analytical_readers'],
  },
  {
    id: 'covenant_renewal',
    name: 'Covenant Renewal',
    description: 'Recalls God\'s faithfulness, names where we have drifted, and leads to a fresh commitment — a personal covenant renewal.',
    elements: ['opening', 'scripture_block', 'confession', 'invitation', 'prayer'],
    idealFor: ['recommitment_days', 'fresh_starts'],
  },
  {
    id: 'creation_meditation',
    name: 'Creation Meditation',
    description: 'Celtic-inspired: begins in the natural world (sky, water, seasons), sees God revealed in creation, moves inward to the soul.',
    elements: ['wonder', 'scripture_block', 'contemplation', 'reflection', 'blessing'],
    idealFor: ['rest_days', 'nature_connection'],
  },
  {
    id: 'question_answer',
    name: 'Question & Answer',
    description: 'Haggadah-inspired: opens with a real, honest question. Scripture provides the first answer. Reflection deepens it. Closes with a better question.',
    elements: ['opening', 'scripture_block', 'reflection', 'application', 'invitation'],
    idealFor: ['doubt_days', 'seeking_moments'],
  },
  {
    id: 'before_after',
    name: 'Before & After',
    description: 'Draws a sharp line between the old way and the new — what life looks like without this truth vs. with it.',
    elements: ['story', 'scripture_block', 'reflection', 'challenge', 'blessing'],
    idealFor: ['transformation_days', 'identity_formation'],
  },
  {
    id: 'psalmic_praise',
    name: 'Psalmic Praise',
    description: 'Builds from remembrance to declaration to worship — structured like a praise psalm with escalating adoration.',
    elements: ['opening', 'scripture_block', 'wonder', 'contemplation', 'doxology'],
    idealFor: ['celebration_days', 'worship_moments'],
  },
  {
    id: 'two_voices',
    name: 'Two Voices',
    description: 'Alternates between two perspectives — the voice of fear and faith, the world\'s wisdom and God\'s, flesh and spirit.',
    elements: ['opening', 'scripture_block', 'reflection', 'reflection', 'invitation'],
    idealFor: ['tension_days', 'inner_conflict'],
  },
  {
    id: 'slow_read',
    name: 'Slow Read',
    description: 'Almost entirely Scripture with thin layers of reflection between passages. The text does the heavy lifting. Writer steps aside.',
    elements: ['scripture_block', 'contemplation', 'scripture_block', 'contemplation', 'prayer'],
    idealFor: ['scripture_rich_days', 'quiet_days'],
  },
  {
    id: 'imaginative_prayer',
    name: 'Imaginative Prayer',
    description: 'Ignatian imagination: places the reader inside a biblical scene. You smell the dust, hear the crowd, see Jesus turn toward you.',
    elements: ['story', 'scripture_block', 'contemplation', 'reflection', 'prayer'],
    idealFor: ['gospel_readings', 'immersive_days'],
  },
  {
    id: 'promise_claim',
    name: 'Promise & Claim',
    description: 'Centers on one specific promise of God. Examines it in context, tests it against real life, then stakes a claim on it.',
    elements: ['scripture_block', 'reflection', 'story', 'application', 'prayer'],
    idealFor: ['faith_building', 'anxiety_days'],
  },
  {
    id: 'micro_devotional',
    name: 'Micro Devotional',
    description: 'Intentionally brief: one verse, one thought, one prayer. No padding. For the days when less is more.',
    elements: ['scripture_block', 'reflection', 'prayer'],
    idealFor: ['busy_days', 'short_readings'],
  },
  {
    id: 'peeling_back',
    name: 'Peeling Back Layers',
    description: 'Takes one familiar verse and peels it back layer by layer — surface meaning, then deeper, then deepest — like an onion.',
    elements: ['scripture_block', 'reflection', 'reflection', 'application', 'contemplation'],
    idealFor: ['familiar_passages', 'fresh_eyes_days'],
  },
  {
    id: 'gospel_retelling',
    name: 'Gospel Retelling',
    description: 'Retells a biblical event from an unexpected perspective — the bystander, the skeptic, the one who almost missed it.',
    elements: ['story', 'scripture_block', 'reflection', 'wonder', 'invitation'],
    idealFor: ['gospel_readings', 'creative_days'],
  },
  {
    id: 'morning_offering',
    name: 'Morning Offering',
    description: 'Designed for the start of the day: orients the heart, dedicates the hours ahead, asks for one grace to carry.',
    elements: ['opening', 'scripture_block', 'prayer', 'application', 'blessing'],
    idealFor: ['morning_readings', 'daily_intention'],
  },
  {
    id: 'evening_rest',
    name: 'Evening Rest',
    description: 'Designed for night: reviews the day with gentleness, releases what was left undone, receives peace for sleep.',
    elements: ['reflection', 'scripture_block', 'confession', 'contemplation', 'blessing'],
    idealFor: ['evening_readings', 'winding_down'],
  },
  {
    id: 'lowry_loop',
    name: 'Lowry Loop',
    description: 'Narrative sermon: upset equilibrium, analyze discrepancy, disclose the clue, experience the gospel, anticipate consequences.',
    elements: ['opening', 'reflection', 'scripture_block', 'application', 'invitation'],
    idealFor: ['disruptive_days', 'paradigm_shifts'],
  },
  {
    id: 'four_pages',
    name: 'Four Pages',
    description: 'Wilson framework: trouble in the text, trouble in our world, grace in the text, grace in our world. Grace gets the last word.',
    elements: ['scripture_block', 'reflection', 'scripture_block', 'application', 'blessing'],
    idealFor: ['balanced_days', 'grace_emphasis'],
  },
  {
    id: 'chiastic',
    name: 'Chiastic Ring',
    description: 'A-B-C-B\'-A\' structure. The center is the theological hinge; the ending mirrors the beginning from a transformed perspective.',
    elements: ['opening', 'reflection', 'scripture_block', 'reflection', 'opening'],
    idealFor: ['literary_days', 'transformation_arcs'],
  },
  {
    id: 'brueggemann_arc',
    name: 'Brueggemann Arc',
    description: 'Three-phase psalmic movement: orientation (settled faith) \u2192 disorientation (crisis) \u2192 new orientation (deeper faith through suffering).',
    elements: ['opening', 'confession', 'scripture_block', 'reflection', 'blessing'],
    idealFor: ['suffering_days', 'crisis_faith'],
  },
  {
    id: 'mystagogical',
    name: 'Mystagogical',
    description: 'Post-experience reflection: the reader has already had the experience, and the devotional unpacks what just happened to them.',
    elements: ['reflection', 'scripture_block', 'contemplation', 'application', 'prayer'],
    idealFor: ['after_events', 'processing_days'],
  },
  {
    id: 'diatribe',
    name: 'Pauline Diatribe',
    description: 'The writer argues with an imaginary opponent \u2014 raising objections and answering them. The devotional IS the argument.',
    elements: ['opening', 'scripture_block', 'reflection', 'challenge', 'invitation'],
    idealFor: ['doubt_days', 'apologetics_moments'],
  },
  {
    id: 'wisdom_collection',
    name: 'Wisdom Collection',
    description: 'Multiple short, independent insights on a single theme \u2014 proverb-style constellation. The reader finds the one that lands.',
    elements: ['scripture_block', 'reflection', 'reflection', 'reflection', 'blessing'],
    idealFor: ['proverb_days', 'wisdom_literature'],
  },
  {
    id: 'catena',
    name: 'Scripture Chain',
    description: 'A chain of passages connected by a theme \u2014 the texts interpret each other with minimal commentary. The Bible preaches itself.',
    elements: ['scripture_block', 'scripture_block', 'scripture_block', 'contemplation', 'prayer'],
    idealFor: ['scripture_rich_days', 'thematic_studies'],
  },
  {
    id: 'hermit_crab',
    name: 'Hermit Crab',
    description: 'The devotional adopts the form of something else \u2014 a recipe, a medical chart, a real estate listing, a flight safety card.',
    elements: ['story', 'scripture_block', 'reflection', 'application', 'blessing'],
    idealFor: ['creative_days', 'surprise_moments'],
  },
];

// ==========================================
// DYNAMIC HOOK LIBRARY (Not fixed per persona)
// ==========================================

export const HOOK_LIBRARY: Record<HookStyle, string[]> = {
  confession: [
    'I used to think... until...',
    'I\'ll be honest...',
    'The embarrassing truth is...',
    'I\'ve been wrestling with...',
    'I never told anyone this, but...',
  ],
  
  observation: [
    'Have you noticed...',
    'The other day, I saw...',
    'There\'s something about...',
    'I keep seeing...',
    'It\'s funny how...',
  ],
  
  question: [
    'What if...',
    'Have you ever...',
    'Why do we...',
    'When did you last...',
    'What would it look like if...',
  ],
  
  image: [
    'The morning light filtered through...',
    'I was knee-deep in...',
    'The coffee grew cold as...',
    'The door creaked open and...',
    'Rain streaked the window while...',
  ],
  
  story_fragment: [
    'The other day, I...',
    'My friend Sarah...',
    'It all started when...',
    'Picture this: a...',
    'I found myself in...',
  ],
  
  discomfort: [
    'This might make you uncomfortable...',
    'I don\'t want to say this, but...',
    'The hard truth is...',
    'Nobody talks about...',
    'Can I be honest with you?',
  ],
  
  statistic: [
    '78% of us...',
    'Studies show that...',
    'The research is clear:...',
    'Most people believe...',
    'Here\'s what the data says...',
  ],
  
  direct_challenge: [
    'Stop. Just stop.',
    'We need to talk about...',
    'Don\'t scroll past this.',
    'Listen closely...',
    'This changes everything:',
  ],
  
  liturgical: [
    'In the name of the Father...',
    'Hear these words...',
    'Thus says the Lord...',
    'Blessed are those who...',
    'As the ancient prayer says...',
  ],
  
  sensory_scene: [
    'The air smelled of...',
    'The room fell silent except for...',
    'My hands trembled as...',
    'The music swelled and...',
    'Tears blurred my vision when...',
  ],

  paradox: [
    'The more tightly you grip it, the faster it slips away.',
    'You have to lose your life to find it — and that\'s not a metaphor.',
    'The weakest moment of your week might be the strongest thing about you.',
    'What if the door you keep pounding on was never locked?',
    'Sometimes the most faithful thing you can do is doubt out loud.',
  ],

  anecdotal_lede: [
    'A woman in my small group said something last Tuesday that I still can\'t shake.',
    'My grandfather never read a theology book, but he once told me something that rewired my faith.',
    'There\'s a barista at my regular coffee shop who, without knowing it, preached the best sermon I heard all year.',
    'A five-year-old in Sunday school answered a question last week that silenced every adult in the room.',
    'I overheard two strangers arguing at the grocery store, and it sounded exactly like a psalm.',
  ],

  in_medias_res: [
    '— and that\'s when I realized I\'d been praying to the wrong version of God.',
    'I was already halfway out the door when the verse hit me.',
    'The tears were already falling before I understood why.',
    'By the time I opened my Bible that morning, the argument had already started in my head.',
    'I didn\'t plan to forgive her. It just happened, mid-sentence, like a reflex.',
  ],

  thought_experiment: [
    'Imagine you woke up tomorrow and every prayer you\'d ever prayed was answered. All of them.',
    'Picture this: God hands you a transcript of every conversation He\'s had about you.',
    'Suppose you couldn\'t earn anything from God — not approval, not blessing, not closeness. What would you do differently?',
    'What if you could rewind to the exact moment you started performing your faith instead of living it?',
    'Imagine your doubt had a voice. What would it actually say if you let it finish?',
  ],

  etymology: [
    'The word "courage" comes from the Latin cor — heart. Not bravery. Heart.',
    'In Hebrew, the word for "compassion" shares a root with "womb."',
    'We say "forgive" like it\'s one act. The Greek says it\'s closer to "release" — like opening a fist.',
    'The English word "worry" traces back to an Old English word meaning "to strangle."',
    'Before "holy" meant morally pure, it meant "set apart." Not better. Just different.',
  ],

  dialogue: [
    '"You don\'t actually believe that, do you?" she asked. And I didn\'t have an answer.',
    '"Tell me one thing you know for sure about God." I opened my mouth. Nothing came out.',
    '"I\'m fine." "You keep saying that." "Because if I stop saying it, I\'ll have to feel something."',
    '"Pray for me." Three words. They cost him everything to say.',
    '"Why do you still go to church?" my friend asked. It was an honest question.',
  ],

  lament: [
    'I don\'t know how to talk to You today, God. I just know I need to.',
    'Some mornings the weight is there before your eyes even open.',
    'There are prayers that don\'t have words — just a long exhale and the hope that it counts.',
    'I keep showing up, but I\'ll be honest: I don\'t know what I\'m showing up for right now.',
    'This is for the version of you that almost didn\'t open this today.',
  ],

  declaration: [
    'Here\'s what\'s true whether you feel it or not.',
    'This is not a suggestion. This is a promise carved into the bedrock of who God is.',
    'Let me say something plainly: you are not too far gone.',
    'No qualifier. No caveat. You are loved. Period.',
    'Before we go any further — you need to hear this: the shame is lying to you.',
  ],

  memory_trigger: [
    'Think back to the last time you felt completely safe. Where were you?',
    'There\'s a version of you at age eight who believed something about God that you\'ve since forgotten.',
    'Remember the first time a Bible verse actually landed — not in your head, but in your chest?',
    'Somewhere in your memory, there\'s a dinner table, a prayer, and a feeling you\'ve been trying to get back to.',
    'Close your eyes. What\'s the first church you remember? Not the building — the feeling.',
  ],

  contrast: [
    'The world says protect yourself. Jesus says lay it down.',
    'On paper, his life was a failure. In eternity, it was a masterpiece.',
    'We scroll past a hundred faces, then wonder why we feel alone.',
    'You can be in the room and still be miles away. You can be miles away and still be held.',
    'Religion says climb. Grace says sit down — you\'re already at the table.',
  ],

  cultural_reference: [
    'There\'s a reason that song has been stuck in your head all week.',
    'Every movie about redemption follows the same arc — and it didn\'t start in Hollywood.',
    'We binge-watch stories about broken people finding their way home, then close the app and forget we\'re in one.',
    'The algorithm knows what you want. God knows what you need. Those are rarely the same thing.',
    'We treat "rest" like a luxury. Every ancient culture treated it like survival.',
  ],

  silence: [
    'Before you read another word, take one breath. Just one.',
    'Don\'t rush past this. Let the quiet sit for a second.',
    'What if today\'s devotional started with you saying nothing at all?',
    'Pause. You\'ve been moving all morning. This is the first still moment.',
    'The most important part of this devotional might be the space between these sentences.',
  ],

  gratitude: [
    'Before anything else today — you woke up. That\'s not nothing.',
    'Right now, something in your life is working. It might be small. Name it.',
    'There is bread on your table and breath in your lungs and someone, somewhere, who is glad you exist.',
    'What if the most radical thing you did today was say "thank you" and actually mean it?',
    'Grace showed up again this morning. It didn\'t ask permission.',
  ],

  urgency: [
    'You\'re running out of somedays.',
    'This is the conversation you\'ve been postponing with God. Today it happens.',
    'The thing you keep pushing to tomorrow? Tomorrow isn\'t promised.',
    'Right now — not after coffee, not after you feel ready — right now is the moment.',
    'Every day you wait to be honest with God is a day you carry weight He already offered to hold.',
  ],

  epistolary: [
    'Dear you — the one who almost skipped this today.',
    'If I could write you a letter and know you\'d actually read it, I\'d start with this.',
    'To the one doing their best and convinced it\'s not enough:',
    'Dear future you — the one who made it through this season:',
    'This one is addressed to the part of you that\'s tired of pretending.',
  ],

  body_awareness: [
    'Where are you holding tension right now? Your jaw? Your shoulders? That\'s not just stress — it\'s a signal.',
    'Your body has been carrying this longer than your mind has been processing it.',
    'Put your hand on your chest. Feel that? You\'re alive. Start there.',
    'You read Scripture with your eyes, but you carry it in your bones.',
    'Notice your breathing right now — shallow, tight, rushed. Your body is trying to tell you what your soul already knows.',
  ],

  science_wonder: [
    'Your brain rewires itself every single night while you sleep. God\'s not done with you — literally.',
    'Light from the nearest star took four years to reach your eyes tonight. Some answers take time too.',
    'A single human cell contains more information than every encyclopedia ever written. You are not random.',
    'Neuroscientists discovered that gratitude physically changes your brain. The psalmists knew this 3,000 years ago.',
    'Every atom in your body was forged inside a dying star. You\'re made of collapse and fire — and God called it good.',
  ],

  invocation: [
    'Come, Holy Spirit. Not as theology. As presence. Right here. Right now.',
    'God of the midnight hours and the 3 a.m. doubts — meet me in this.',
    'Spirit of the living God, fall fresh on these tired, distracted, half-believing bones.',
    'Lord, I\'m opening this with empty hands. Fill them or teach me to sit with the emptiness.',
    'Ancient of Days — the same God who parted seas, I need You to part the fog in my head this morning.',
  ],

  lyric_fragment: [
    '"It is well..." — but is it? Let\'s be honest about the space between the hymn and the hurt.',
    '"Amazing grace, how sweet the sound..." We sing it on autopilot. Today, hear it like it\'s the first time.',
    '"Be still my soul" — three words that are harder than any marathon you\'ll ever run.',
    'There\'s a line in an old hymn: "Prone to wander, Lord, I feel it." Feel it? I live it.',
    '"Come as you are." Not come as you should be. Not come after you\'ve cleaned up. As. You. Are.',
  ],

  textual: [
    'There are four words buried in Romans 8 that change everything if you let them.',
    'Every time you\'ve read this passage, you\'ve skipped over the most important verb.',
    'The original audience hearing this letter for the first time would have gasped at this line.',
    'This verse has been on a thousand coffee mugs. Today we\'re reading what it actually says.',
    'Before this became an Instagram caption, it was a revolutionary act of defiance against an empire.',
  ],

  definition_subversion: [
    'Webster defines "faith" as "belief without proof." Webster has never waited for a biopsy.',
    'The dictionary says "grace" is "unmerited favor." Clinically accurate. Spiritually bankrupt.',
    'Merriam-Webster: "hope — to cherish a desire with anticipation." That\'s not hope. That\'s a wish list.',
    'The textbook calls it "forgiveness." The woman who did it called it "the hardest thing I\'ve ever chosen to repeat."',
    '"Peace: a state of tranquility." Tell that to Jesus in Gethsemane. His peace looked like blood sweat.',
  ],

  future_memory: [
    'Years from now, you\'ll remember this season. Not the anxiety. The thing you almost missed because of it.',
    'The person you\'ll be in five years is watching this moment. They\'re not disappointed. They\'re tender.',
    'One day you\'ll tell someone about this exact struggle, and it will be the reason they don\'t quit.',
    'Future you is already grateful for something happening right now that present you can\'t see yet.',
    'This chapter has a title. You just can\'t read it from inside the page.',
  ],

  imperative_sentence: [
    'Stop reading your Bible like it\'s a self-help book.',
    'Put down the performance. Nobody asked for it.',
    'Tell the truth. Just once today. To one person. Starting with yourself.',
    'Stop apologizing for needing God. That\'s literally the point.',
    'Quit waiting until you feel spiritual enough to pray. Pray from the mess.',
  ],

  found_artifact: [
    'On the wall of a concentration camp, someone scratched: "I believe in the sun even when it is not shining."',
    'Found in the margin of a Bible donated to Goodwill, in pencil: "God, if you\'re real, this is your last chance."',
    'A prayer card left in a library book, dated 1987: "Lord, help me love the person I married instead of the person I imagined."',
    'Written on a napkin at a hospital cafeteria: "Day 47. Still here. That counts for something."',
    'Scratched into a church pew in fading ink: "He showed up." No date. No name.',
  ],

  census_opening: [
    'There are 31,102 verses in the Bible. You have memorized maybe twelve. One of the twelve is about to save you.',
    'The average person spends 11 hours a day consuming media and 7 minutes in prayer. Seven.',
    'You will make roughly 35,000 decisions today. Most of them on autopilot. One of them matters more than you think.',
    'Eighty percent of New Year\'s resolutions fail by February. Spiritual ones aren\'t different. Let\'s talk about why.',
    'There are 8 billion people on Earth. You are reading this. That\'s not statistics. That\'s providence.',
  ],

  aphorism_twist: [
    'They say God helps those who help themselves. That\'s not in the Bible. The Bible says God helps those who can\'t.',
    '"Everything happens for a reason." Actually, some things happen for no reason. And God shows up anyway.',
    'They say time heals all wounds. It doesn\'t. It just teaches you to limp with grace.',
    '"Follow your heart." Scripture says the heart is deceitful above all things. Maybe follow something else.',
    '"God won\'t give you more than you can handle." He will. He absolutely will. That\'s where faith starts.',
  ],

  weather_report: [
    'It rained for the ninth day straight. The ground can\'t absorb another drop. Your heart works the same way.',
    'First frost this morning. Something in you knows what it means — the growing season is over and the rest season is here.',
    'The air has that weight to it — the kind that comes before a storm. Your spirit feels it too.',
    'Everything is thawing. The ice is letting go. Some things in you might be ready to do the same.',
    'The forecast says clear skies. But you know better. Some storms don\'t show up on radar.',
  ],

  second_person_scene: [
    'You\'re in bed. It\'s 11:47 PM. You\'ve scrolled past your alarm time. The question you\'ve been avoiding finds you.',
    'You\'re sitting in the parking lot. The engine is off but you haven\'t gone inside yet. You know why.',
    'You just said "I\'m fine" for the third time today. The first two were reflexes. This last one was a decision.',
    'You\'re staring at the text you haven\'t sent. Three dots. Delete. Three dots. Delete. God is in the hesitation.',
    'You\'re at the table, surrounded by people, and you have never felt more alone. Hold that. Don\'t fix it yet.',
  ],

  negation_opening: [
    'This is not about having more faith. It\'s about having less of the kind you manufactured.',
    'This devotional will not fix your marriage, heal your anxiety, or make Monday morning bearable. It might do something harder.',
    'I\'m not going to tell you it\'s going to be okay. I\'m going to tell you something better.',
    'This isn\'t a pep talk. Those expire. This is a foundation. Those hold.',
    'Today is not about doing more for God. It\'s about what God has already done while you weren\'t looking.',
  ],

  translation_note: [
    'The Hebrew word for "wait" in Psalm 27 — qavah — literally means to twist, to bind like rope. Waiting is not passive. It\'s being woven.',
    'In Greek, the word for "repent" — metanoia — doesn\'t mean "feel bad." It means "change your mind entirely." A complete mental renovation.',
    'The word translated "peace" — shalom — doesn\'t mean absence of conflict. It means everything functioning as it should. Wholeness. Completeness.',
    'When Genesis says God "rested," the Hebrew is shavat. Not exhaustion. Completion. He stopped because it was done.',
    '"Blessed" in the Beatitudes is makarios — not happy, not fortunate. It\'s the word Greeks used for the gods. Jesus is saying: you are living the divine life.',
  ],

  prayer_overheard: [
    '"...and I don\'t even know if you\'re listening, but I\'m going to keep talking because the alternative is silence." That prayer. You\'ve prayed it.',
    '"God, I\'m not angry at you. I\'m angry at the version of you I was taught. Help me find the real one." Someone prayed this last night. Maybe it was you.',
    '"Lord, I believe. Help my unbelief." Mark 9:24. The most honest prayer in Scripture. And yours for the taking.',
    '"I don\'t have the words today. Can my showing up count as the prayer?" It can. It does.',
    '"God, I\'m tired of trying to earn something you already gave me." That exhale you just felt? That\'s the prayer landing.',
  ],

  geographic_pin: [
    '33.7490\u00b0 N, 84.3880\u00b0 W. Atlanta. Third floor, room 304. That\'s where he first prayed a prayer he meant.',
    'Mile marker 47 on I-40, somewhere between Nashville and Memphis. That\'s where she finally stopped bargaining with God.',
    'A park bench in Chicago. November. Cold enough to see your breath. The last place he expected to feel God show up.',
    'Gate B7, O\'Hare International. Delayed flight. Three hours of nothing to do. The most productive quiet time of her life.',
    'Your kitchen. This morning. The exact spot where you stood when the verse hit different.',
  ],

  interrupted_sentence: [
    'The thing about grace is — no, wait. Let me start somewhere else. Let me start with the parking lot.',
    'What I meant to write about today was — actually, I can\'t. Not yet. First I need to tell you what happened.',
    'Forgiveness is — okay, before I define it, can I tell you what it isn\'t? Because I got that wrong for twenty years.',
    'There\'s a verse I want to show you, but — hold on. You need context first. Without context, this verse is a weapon.',
    'I was going to start with the theology. But honestly? Start with your chest. What do you feel right now?',
  ],

  synesthesia_opening: [
    'Grief tastes like metal. Not a metaphor. The morning after, everything she ate tasted like copper. The body keeps its own theology.',
    'Joy has a sound. Not laughter — that comes later. First it sounds like silence. The kind that follows a held breath.',
    'Shame has a temperature. You know this. The heat that starts in your chest and reaches your ears before you can stop it.',
    'Some prayers feel blue. Not sad blue. Sky blue. The kind of open that makes you dizzy with possibility.',
    'Peace smells like rain on pavement. Something old breaking open. Something new being washed clean.',
  ],

  one_word_opening: [
    'Enough. That\'s the word you\'re afraid of. Not "failure." Not "rejection." Enough. As in: are you?',
    'Stay. That\'s it. That\'s the entire sermon. Stay in the room. Stay in the story. Stay.',
    'Beloved. Before you did anything today. Before the to-do list. Before the guilt. Beloved.',
    'Wait. Not the command. The invitation. Wait — as in, something is coming that is worth the pause.',
    'Here. Not there. Not then. Here. God is not in the tomorrow you\'re anxious about. He\'s in the here.',
  ],
};

// ==========================================
// HYBRID PERSONA GENERATOR
// Mix 2-3 traits for unique voices
// ==========================================

export interface HybridPersona {
  name: string;
  traits: PersonaTrait[];
  description: string;
}

export function generateHybridPersona(traits: PersonaTrait[]): HybridPersona {
  const traitNames = traits.map(t => t.charAt(0).toUpperCase() + t.slice(1));
  const name = traitNames.join(' ');
  
  const descriptions: Record<string, string> = {
    'gentle_scholarly': 'Warm wisdom that respects your intelligence',
    'challenging_poetic': 'Urgent truth wrapped in beauty',
    'narrative_gentle': 'Stories shared like a trusted friend',
    'scholarly_poetic': 'Deep theology that stirs wonder',
    'challenging_narrative': 'Hard truths told through story',
    'poetic_narrative': 'Lyrical storytelling that lingers',
    'gentle_challenging': 'Conviction with compassion',
    'scholarly_narrative': 'Biblical truth through real stories',
    'gentle_raw': 'Honest comfort from someone who gets it',
    'challenging_raw': 'Uncomfortable truths from someone who lives them',
    'narrative_raw': 'Real stories, unedited and unflinching',
    'poetic_raw': 'Beauty found in the brokenness',
    'raw_scholarly': 'Intellectual honesty about the hard questions',
    'raw_warm': 'Vulnerable and accessible — a real conversation',
    'gentle_warm': 'A hug in written form',
    'challenging_warm': 'Tough love from your favorite mentor',
    'narrative_warm': 'Stories told like a friend catching you up',
    'poetic_warm': 'Simple words that somehow shimmer',
    'scholarly_warm': 'Big ideas made accessible',
    'liturgical_prophetic': 'Ancient prayers that demand justice — the litany becomes a march',
    'mystical_poetic': 'Silence and beauty intertwined — the reader forgets they are reading',
    'gentle_pastoral': 'A shepherd who has been through the valley and walks beside you in yours',
    'pastoral_warm': 'Sunday afternoon on the porch with someone who has seen everything and still believes',
    'prophetic_urgent': 'The house is on fire and the prophet knows where the exits are',
    'scholarly_witty': 'The sharpest mind in the room who never makes you feel small',
    'challenging_witty': 'A surgeon who tells jokes to steady your nerves before the incision',
    'confessional_raw': 'Two friends at midnight telling each other truths they\'ve never said aloud',
    'confessional_narrative': 'A memoir that keeps circling back to the moment everything changed',
    'practical_warm': 'A friend who always knows the next right thing and makes it sound easy',
    'challenging_practical': 'A coach who loves you too much to let you coast — and hands you the playbook',
    'liturgical_mystical': 'A candlelit chapel where the prayers have been said for a thousand years',
    'mystical_pastoral': 'A spiritual director who listens more than they speak and what they say rearranges you',
    'gentle_liturgical': 'Ancient words spoken softly, like a lullaby that is also a creed',
    'narrative_witty': 'A storyteller who makes you laugh, then cry, then think',
    'confessional_gentle': 'Vulnerability offered like a gift — here is my wound, you are safe to show yours',
    'practical_scholarly': 'Deep theology with a Monday-morning action plan',
    'raw_urgent': 'No time for polish — the truth said plainly because the stakes are too high',
    'mystical_scholarly': 'Academic precision dissolved in contemplative wonder — the footnote becomes a prayer',
    'apophatic_mystical': 'Silence as the loudest language — the absence IS the presence',
    'monastic_practical': 'A daily rule that transforms the ordinary into sacrament',
    'prophetic_lament_raw': 'Grief that refuses to perform and won\'t be silenced',
    'doxological_poetic': 'Praise that reads like poetry — beauty as theology\'s native tongue',
    'socratic_scholarly': 'Questions so precise they become scalpels — the reader discovers truth in the wound',
    'midwife_gentle': 'A companion who never tells you what\'s coming, only holds your hand while it arrives',
    'iconoclast_challenging': 'Demolition and reconstruction in the same breath — nothing comfortable survives, but something truer grows',
    'elder_warm': 'Decades of wisdom served with coffee — the hard truths softened by "I\'ve been there"',
    'pilgrim_narrative': 'Stories from the road — discovery and wonder that never settle into certainty',
    'artisan_practical': 'Theology with callused hands — every truth has a physical practice',
    'comic_warm': 'Laughter that becomes a door — you\'re smiling when the truth slips past your defenses',
    'intercessor_pastoral': 'A shepherd who prays you through the valley instead of explaining it',
    'elder_monastic': 'Ancient rhythms held by weathered hands — the daily office as a grandparent\'s gift',
    'doxological_liturgical': 'Worship that feels like it has been happening for a thousand years and will never stop',
    'socratic_iconoclast': 'Questions that demolish assumptions — every answer reveals a deeper question',
    'pilgrim_mystical': 'Walking meditation — the road dissolves into prayer and the destination was always here',
    'apophatic_elder': 'An old woman who says less every year and means more',
    'comic_confessional': 'Laughing at yourself becomes the gateway to honest confession',
    'artisan_monastic': 'A workshop that runs on the hours — the bell rings, you pick up the tools',
    'midwife_prophetic_lament': 'Sitting with the grief without fixing it — presence as prophecy',
  };
  
  const key = traits.slice(0, 2).sort().join('_');
  
  return {
    name,
    traits,
    description: descriptions[key] || `A unique blend of ${traitNames.join(' and ')}`,
  };
}

// Predefined hybrid combinations
export const POPULAR_HYBRIDS: HybridPersona[] = [
  generateHybridPersona(['gentle', 'scholarly']),
  generateHybridPersona(['challenging', 'poetic']),
  generateHybridPersona(['narrative', 'gentle']),
  generateHybridPersona(['scholarly', 'poetic']),
  generateHybridPersona(['challenging', 'narrative']),
  generateHybridPersona(['poetic', 'narrative']),
  generateHybridPersona(['gentle', 'challenging']),
  generateHybridPersona(['scholarly', 'narrative']),
  generateHybridPersona(['raw', 'gentle']),
  generateHybridPersona(['raw', 'narrative']),
  generateHybridPersona(['warm', 'narrative']),
  generateHybridPersona(['warm', 'gentle']),
  generateHybridPersona(['raw', 'warm']),
  generateHybridPersona(['challenging', 'warm']),
];

// ==========================================
// DAILY VARIETY ENGINE
// Ensure no two days feel the same
// ==========================================

export interface DayConfiguration {
  dayNumber: number;
  template: string;
  primaryTrait: PersonaTrait;
  secondaryTrait?: PersonaTrait;
  hookStyle: HookStyle;
  transitionStyle: TransitionStyle;
  closingStyle: ClosingStyle;
  storyDirective?: string | null;
}

export function generateDailyVariety(
  length: number,
  userTraits: PersonaTrait[] = ['gentle']
): DayConfiguration[] {
  const configs: DayConfiguration[] = [];
  
  // Ensure variety across days
  const templates = [...STRUCTURAL_TEMPLATES];
  const hooks = Object.keys(HOOK_LIBRARY) as HookStyle[];
  const transitions = ALL_TRANSITIONS;
  const closings = ALL_CLOSINGS;
  
  for (let i = 0; i < length; i++) {
    // Rotate through different structures
    const template = templates[i % templates.length];
    
    // Vary persona intensity (primary always from user, secondary rotates)
    const secondaryTraits = userTraits.length > 1 
      ? userTraits.filter(t => t !== userTraits[0])
      : ['poetic', 'narrative', 'scholarly', 'challenging'] as PersonaTrait[];
    
    configs.push({
      dayNumber: i + 1,
      template: template.id,
      primaryTrait: userTraits[0],
      secondaryTrait: i > 0 ? secondaryTraits[i % secondaryTraits.length] : undefined,
      hookStyle: hooks[i % hooks.length],
      transitionStyle: transitions[i % transitions.length],
      closingStyle: closings[i % closings.length],
    });
  }
  
  return configs;
}

// ==========================================
// SYSTEM PROMPT BUILDER
// Assemble final prompt from mixed elements
// ==========================================

export function buildSystemPrompt(
  primaryTrait: PersonaTrait,
  secondaryTrait: PersonaTrait | undefined,
  template: StructuralTemplate,
  hookStyle: HookStyle
): string {
  const primary = PERSONA_TRAITS[primaryTrait];
  const secondary = secondaryTrait ? PERSONA_TRAITS[secondaryTrait] : null;
  
  const parts = [
    `You are writing a ${template.name.toLowerCase()}.`,
    '',
    `Primary voice: ${primary.voice}`,
    `Sentence style: ${primary.sentenceStyle}`,
    '',
    'Voice guidelines:',
    ...primary.systemPromptAdditions.map(p => `- ${p}`),
  ];
  
  if (secondary) {
    parts.push(
      '',
      `Secondary influence: ${secondary.voice}`,
      'Additional texture:',
      ...secondary.systemPromptAdditions.slice(0, 2).map(p => `- ${p}`)
    );
  }
  
  parts.push(
    '',
    `Structure: ${template.elements.join(' → ')}`,
    '',
    `Opening approach: Use a ${hookStyle} hook`,
    `Available hooks: ${HOOK_LIBRARY[hookStyle].slice(0, 3).join('; ')}...`,
    '',
    'CRITICAL: Never use the same opening hook twice in a series. Each day must feel fresh and distinct.'
  );
  
  return parts.join('\n');
}

// ==========================================
// EXPORT HELPERS
// ==========================================

export function getRandomHook(style: HookStyle): string {
  const hooks = HOOK_LIBRARY[style];
  return hooks[Math.floor(Math.random() * hooks.length)];
}

export function getTemplateById(id: string): StructuralTemplate | undefined {
  return STRUCTURAL_TEMPLATES.find(t => t.id === id);
}

export const ALL_TRAITS: PersonaTrait[] = ['gentle', 'challenging', 'poetic', 'scholarly', 'narrative', 'raw', 'warm', 'prophetic', 'mystical', 'pastoral', 'witty', 'urgent', 'confessional', 'practical', 'liturgical', 'apophatic', 'monastic', 'prophetic_lament', 'doxological', 'socratic', 'midwife', 'iconoclast', 'elder', 'pilgrim', 'artisan', 'comic', 'intercessor'];
export const ALL_HOOK_STYLES: HookStyle[] = Object.keys(HOOK_LIBRARY) as HookStyle[];
export const ALL_TRANSITIONS: TransitionStyle[] = [
  'gradual', 'pivot', 'mysterious', 'logical', 'narrative',
  'juxtaposition', 'echo', 'question_bridge', 'emotional_escalation', 'zoom_in',
  'zoom_out', 'time_shift', 'contrast', 'accumulation', 'spiral',
  'revelation', 'descent', 'ascent', 'confession_bridge', 'witness_turn',
  'silence_break', 'parallel', 'inversion', 'declaration', 'metaphor_chain',
  'dialogue_shift', 'scenic_cut', 'tension_build', 'release', 'telescoping',
  'associative_leap', 'white_space', 'refrain_return', 'concentric_rings', 'antiphonal',
  'volta', 'excavation', 'braided', 'staircase', 'door_opening',
];
export const ALL_CLOSINGS: ClosingStyle[] = [
  'question', 'blessing', 'invitation', 'warning', 'reflection', 'doxology',
  'commissioning', 'callback', 'unresolved', 'paradox', 'single_image', 'identity',
  'promise', 'lament', 'gratitude', 'silence', 'challenge_deadline', 'reframe',
  'benediction', 'litany', 'witness', 'psalm_ending', 'future_vision', 'surrender',
  'simple_truth', 'return_to_scripture', 'companionship', 'confession_close', 'charge', 'rest',
  'echo_close', 'breath_prayer', 'micro_action', 'antiphon', 'open_door',
  'tombstone_test', 'collect_close', 'doxological_turn', 'selah', 'lyric_fragment_close',
];