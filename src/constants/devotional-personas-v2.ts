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
  | 'warm';

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
  | 'wonder';

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
  | 'sensory_scene';

export type TransitionStyle =
  | 'gradual'
  | 'pivot'
  | 'mysterious'
  | 'logical'
  | 'narrative';

export type ClosingStyle =
  | 'question'
  | 'blessing'
  | 'invitation'
  | 'warning'
  | 'reflection'
  | 'doxology';

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
    voice: 'urgent, direct, compelling',
    sentenceStyle: 'Punched. Short. One-two rhythm.',
    keyPhrases: ['Listen...', 'Stop...', 'We must...', 'Don\'t waste...'],
    systemPromptAdditions: [
      'Use binary framing: two paths, two masters',
      'Elevate stakes: "Eternity hangs in the balance"',
      'Stack rhetorical questions: "Are you? Will you? Can you?"',
      'Close with calls to action',
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
}

export function generateDailyVariety(
  length: number,
  userTraits: PersonaTrait[] = ['gentle']
): DayConfiguration[] {
  const configs: DayConfiguration[] = [];
  
  // Ensure variety across days
  const templates = [...STRUCTURAL_TEMPLATES];
  const hooks = Object.keys(HOOK_LIBRARY) as HookStyle[];
  const transitions: TransitionStyle[] = ['gradual', 'pivot', 'mysterious', 'logical', 'narrative'];
  const closings: ClosingStyle[] = ['question', 'blessing', 'invitation', 'warning', 'reflection', 'doxology'];
  
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

export const ALL_TRAITS: PersonaTrait[] = ['gentle', 'challenging', 'poetic', 'scholarly', 'narrative', 'raw', 'warm'];
export const ALL_HOOK_STYLES: HookStyle[] = Object.keys(HOOK_LIBRARY) as HookStyle[];
export const ALL_TRANSITIONS: TransitionStyle[] = ['gradual', 'pivot', 'mysterious', 'logical', 'narrative'];
export const ALL_CLOSINGS: ClosingStyle[] = ['question', 'blessing', 'invitation', 'warning', 'reflection', 'doxology'];