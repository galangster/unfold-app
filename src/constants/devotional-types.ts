// ==========================================
// DEVOTIONAL TYPES & THEME CATEGORIES
// Provides variety in devotional series content and approach
// ==========================================

// Theme categories - broad spiritual topics
export type ThemeCategory =
  | 'trust'
  | 'identity'
  | 'rest'
  | 'purpose'
  | 'healing'
  | 'gratitude'
  | 'surrender'
  | 'courage'
  | 'hope'
  | 'presence'
  | 'conviction'
  | 'joy'
  | 'lament'
  | 'justice'
  | 'discipline'
  | 'wonder';

export interface ThemeCategoryInfo {
  id: ThemeCategory;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  scriptureFocus: string[]; // Books/sections to draw from
  toneGuidance: string;
}

export const THEME_CATEGORIES: ThemeCategoryInfo[] = [
  {
    id: 'trust',
    name: 'Trust',
    description: 'Learning to rest in God\'s faithfulness when life feels uncertain',
    icon: 'Hand',
    scriptureFocus: ['Psalms', 'Proverbs', 'Isaiah', 'Matthew 6', 'Philippians'],
    toneGuidance: 'Steady and reassuring, like a hand on the shoulder during a storm',
  },
  {
    id: 'identity',
    name: 'Identity',
    description: 'Discovering your belovedness and worth in Christ',
    icon: 'Fingerprint',
    scriptureFocus: ['Ephesians', 'Romans 8', 'Galatians', '1 John', 'Colossians'],
    toneGuidance: 'Tender and affirming, speaking truth over shame and doubt',
  },
  {
    id: 'rest',
    name: 'Rest',
    description: 'Slowing down and receiving God\'s peace in a hurried world',
    icon: 'Moon',
    scriptureFocus: ['Psalms 23', 'Matthew 11', 'Hebrews 4', 'Exodus 33', 'Isaiah 30'],
    toneGuidance: 'Quiet and spacious, like an invitation to exhale',
  },
  {
    id: 'purpose',
    name: 'Purpose',
    description: 'Discovering meaning and calling in everyday moments',
    icon: 'Compass',
    scriptureFocus: ['Ephesians 2', 'Romans 12', 'Jeremiah 29', 'Colossians 3', '1 Peter 2'],
    toneGuidance: 'Encouraging and clarifying, helping the reader see the sacred in the ordinary',
  },
  {
    id: 'healing',
    name: 'Healing',
    description: 'Finding wholeness for wounds seen and unseen',
    icon: 'Heart',
    scriptureFocus: ['Psalms (lament)', 'Isaiah 61', 'Luke', 'Revelation 21', '2 Corinthians 1'],
    toneGuidance: 'Gentle and patient, sitting with pain rather than rushing past it',
  },
  {
    id: 'gratitude',
    name: 'Gratitude',
    description: 'Learning to see and savor the gifts already present',
    icon: 'Sparkles',
    scriptureFocus: ['Psalms (thanksgiving)', 'Colossians', 'Philippians', '1 Thessalonians', 'James 1'],
    toneGuidance: 'Wonder-filled and observant, noticing what\'s easily missed',
  },
  {
    id: 'surrender',
    name: 'Surrender',
    description: 'Releasing control and trusting God\'s way over your own',
    icon: 'Wind',
    scriptureFocus: ['Romans 12', 'Proverbs 3', 'Matthew 16', 'Philippians 3', 'Isaiah 55'],
    toneGuidance: 'Honest about the cost, yet hopeful about the freedom',
  },
  {
    id: 'courage',
    name: 'Courage',
    description: 'Finding strength to step forward when fear says stay',
    icon: 'Mountain',
    scriptureFocus: ['Joshua', 'Isaiah 41', 'Deuteronomy 31', 'Acts', '2 Timothy 1'],
    toneGuidance: 'Strong and companioning, like someone who believes in you',
  },
  {
    id: 'hope',
    name: 'Hope',
    description: 'Finding light even in darkness and waiting seasons',
    icon: 'Sun',
    scriptureFocus: ['Romans 5', 'Romans 8', 'Lamentations 3', '1 Peter 1', 'Revelation'],
    toneGuidance: 'Honest about darkness while pointing toward dawn',
  },
  {
    id: 'presence',
    name: 'Presence',
    description: 'Becoming more aware of God with you in every moment',
    icon: 'Eye',
    scriptureFocus: ['Psalms 139', 'Exodus 33', 'John 15', 'Brother Lawrence texts', 'Acts 17'],
    toneGuidance: 'Contemplative and attentive, helping the reader notice God near',
  },
  {
    id: 'conviction',
    name: 'Conviction',
    description: 'Letting Scripture challenge, correct, and sharpen you',
    icon: 'Flame',
    scriptureFocus: ['James', 'Hebrews 12', 'Amos', 'Matthew 23', 'Proverbs', 'Romans 6'],
    toneGuidance: 'Direct and loving, like a coach who believes in your potential — firm but never harsh, honest but never shaming',
  },
  {
    id: 'joy',
    name: 'Joy',
    description: 'Discovering the kind of joy that survives difficulty',
    icon: 'Sparkle',
    scriptureFocus: ['Philippians', 'Nehemiah 8', 'Psalms (praise)', 'Habakkuk 3', 'John 15-16'],
    toneGuidance: 'Vibrant and alive, celebrating without being naive — joy that has weight because it has been tested',
  },
  {
    id: 'lament',
    name: 'Lament',
    description: 'Bringing your grief, anger, and confusion to God without filters',
    icon: 'CloudRain',
    scriptureFocus: ['Psalms (lament)', 'Lamentations', 'Job', 'Ecclesiastes', 'Habakkuk'],
    toneGuidance: 'Raw and honest, sitting in the darkness rather than rushing to light — permission to grieve, rage, and question',
  },
  {
    id: 'justice',
    name: 'Justice',
    description: 'Hearing God\'s heart for the oppressed, the poor, and the forgotten',
    icon: 'Scale',
    scriptureFocus: ['Amos', 'Micah', 'Isaiah 58', 'Luke 4', 'Matthew 25', 'James 2'],
    toneGuidance: 'Prophetic and stirring, awakening compassion and holy restlessness — moving toward action, not guilt',
  },
  {
    id: 'discipline',
    name: 'Discipline',
    description: 'Building habits of prayer, fasting, solitude, and faithfulness',
    icon: 'Target',
    scriptureFocus: ['1 Corinthians 9', 'Hebrews 12', '1 Timothy 4', 'Daniel 6', 'Matthew 6'],
    toneGuidance: 'Encouraging and practical, like a training partner — focused on formation, not perfection',
  },
  {
    id: 'wonder',
    name: 'Wonder',
    description: 'Recovering awe at the beauty and mystery of God',
    icon: 'Stars',
    scriptureFocus: ['Psalms 8', 'Psalms 19', 'Job 38-42', 'Revelation 4-5', 'Isaiah 6', 'Romans 11'],
    toneGuidance: 'Wide-eyed and reverent, helping the reader see what they have stopped noticing — beauty, mystery, the sheer scale of God',
  },
];

// Devotional types - different structural/stylistic approaches
export type DevotionalType =
  | 'personal'        // Deep personalization based on user context (default)
  | 'book_study'      // Walking through a specific book of the Bible
  | 'character_study' // Learning from biblical figures
  | 'psalm_journey'   // Immersive journey through Psalms
  | 'beatitudes'      // Walking through the Beatitudes
  | 'fruit_of_spirit' // Exploring Galatians 5 fruit
  | 'lords_prayer'    // Unpacking the Lord's Prayer
  | 'names_of_god'    // Exploring God's names and character
  | 'seasons'         // Aligned with church calendar/life seasons
  | 'parables';       // Jesus' parables and their meaning

export interface DevotionalTypeInfo {
  id: DevotionalType;
  name: string;
  description: string;
  icon: string;
  minDays: number; // Minimum days for this type to work well
  structureGuidance: string;
  compatibleThemes: ThemeCategory[]; // Which themes work well with this type
}

export const DEVOTIONAL_TYPES: DevotionalTypeInfo[] = [
  {
    id: 'personal',
    name: 'Personal Journey',
    description: 'A devotional crafted around your story and what you\'re walking through',
    icon: 'User',
    minDays: 3,
    structureGuidance: 'Build each day from the reader\'s shared context, selecting scriptures that speak to their specific situation.',
    compatibleThemes: ['trust', 'identity', 'rest', 'purpose', 'healing', 'gratitude', 'surrender', 'courage', 'hope', 'presence', 'conviction', 'joy', 'lament', 'justice', 'discipline', 'wonder'],
  },
  {
    id: 'book_study',
    name: 'Book Study',
    description: 'Walk through a book of the Bible together, chapter by chapter',
    icon: 'BookOpen',
    minDays: 7,
    structureGuidance: 'Move sequentially through the book, letting each day cover a meaningful section. Provide context, unpack key verses, and connect to the reader\'s life.',
    compatibleThemes: ['trust', 'identity', 'purpose', 'hope', 'presence', 'conviction', 'joy', 'wonder'],
  },
  {
    id: 'character_study',
    name: 'Character Study',
    description: 'Learn from the lives of people in Scripture',
    icon: 'Users',
    minDays: 7,
    structureGuidance: 'Each day explores a different moment or aspect of the character\'s journey. Draw parallels to the reader\'s own life without being heavy-handed.',
    compatibleThemes: ['trust', 'identity', 'courage', 'surrender', 'hope', 'conviction', 'lament'],
  },
  {
    id: 'psalm_journey',
    name: 'Psalm Journey',
    description: 'An immersive journey through the prayers and songs of the Psalms',
    icon: 'Music',
    minDays: 7,
    structureGuidance: 'Each day features a complete psalm or section. Let the emotional range of the Psalter guide the journey—lament, thanksgiving, trust, praise.',
    compatibleThemes: ['trust', 'rest', 'healing', 'gratitude', 'hope', 'presence', 'lament', 'joy', 'wonder'],
  },
  {
    id: 'beatitudes',
    name: 'The Beatitudes',
    description: 'Walking through Jesus\' revolutionary blessings in the Sermon on the Mount',
    icon: 'Crown',
    minDays: 7,
    structureGuidance: 'Each day focuses on one beatitude, exploring its countercultural meaning and what it looks like lived out.',
    compatibleThemes: ['identity', 'purpose', 'healing', 'surrender', 'hope', 'conviction', 'justice'],
  },
  {
    id: 'fruit_of_spirit',
    name: 'Fruit of the Spirit',
    description: 'Exploring the character traits that grow as we walk with Jesus',
    icon: 'Leaf',
    minDays: 7,
    structureGuidance: 'Each day focuses on one fruit (or pairs them thoughtfully), exploring what it means and how the Spirit cultivates it in us.',
    compatibleThemes: ['identity', 'rest', 'healing', 'gratitude', 'presence', 'joy', 'discipline'],
  },
  {
    id: 'lords_prayer',
    name: 'The Lord\'s Prayer',
    description: 'Learning to pray as Jesus taught, phrase by phrase',
    icon: 'MessageCircle',
    minDays: 7,
    structureGuidance: 'Each day unpacks a phrase from the prayer, exploring its depth and teaching the reader to pray it as their own.',
    compatibleThemes: ['trust', 'rest', 'surrender', 'presence', 'discipline'],
  },
  {
    id: 'names_of_god',
    name: 'Names of God',
    description: 'Discovering who God is through His names and character',
    icon: 'Flame',
    minDays: 7,
    structureGuidance: 'Each day explores a different name or attribute of God, grounding it in Scripture and showing how it meets the reader where they are.',
    compatibleThemes: ['trust', 'identity', 'healing', 'hope', 'presence', 'wonder'],
  },
  {
    id: 'seasons',
    name: 'Sacred Seasons',
    description: 'Devotionals aligned with Advent, Lent, or life transitions',
    icon: 'Calendar',
    minDays: 7,
    structureGuidance: 'Structure follows the rhythm of the season (preparation, anticipation, reflection, celebration). Let the church calendar or life season guide the arc.',
    compatibleThemes: ['rest', 'gratitude', 'surrender', 'hope', 'presence', 'lament', 'joy', 'wonder'],
  },
  {
    id: 'parables',
    name: 'Parables of Jesus',
    description: 'Stories Jesus told to reveal truth about the Kingdom',
    icon: 'Wheat',
    minDays: 7,
    structureGuidance: 'Each day features one parable. Provide context, unpack the story, and invite the reader into the discomfort and invitation of Jesus\' teaching.',
    compatibleThemes: ['trust', 'identity', 'purpose', 'surrender', 'courage', 'conviction', 'justice'],
  },
];

// Biblical characters for character studies
export interface BiblicalCharacter {
  name: string;
  description: string;
  keyScriptures: string[];
  themes: ThemeCategory[];
}

export const BIBLICAL_CHARACTERS: BiblicalCharacter[] = [
  {
    name: 'David',
    description: 'Shepherd, poet, king—a man after God\'s own heart who knew both triumph and failure',
    keyScriptures: ['1 Samuel 16-17', 'Psalms', '2 Samuel 11-12', '2 Samuel 22'],
    themes: ['trust', 'identity', 'healing', 'courage', 'surrender'],
  },
  {
    name: 'Ruth',
    description: 'A foreigner who chose faithfulness and found belonging',
    keyScriptures: ['Ruth 1-4'],
    themes: ['trust', 'identity', 'courage', 'hope'],
  },
  {
    name: 'Moses',
    description: 'Reluctant leader who encountered God face to face',
    keyScriptures: ['Exodus 3-4', 'Exodus 33', 'Numbers 20', 'Deuteronomy 34'],
    themes: ['trust', 'purpose', 'surrender', 'courage', 'presence'],
  },
  {
    name: 'Mary (Mother of Jesus)',
    description: 'Young woman who said yes and pondered God\'s mysteries',
    keyScriptures: ['Luke 1-2', 'John 2', 'John 19', 'Acts 1'],
    themes: ['trust', 'surrender', 'hope', 'presence'],
  },
  {
    name: 'Joseph (Genesis)',
    description: 'Dreamer who suffered deeply before seeing God\'s redemption',
    keyScriptures: ['Genesis 37-50'],
    themes: ['trust', 'purpose', 'healing', 'hope', 'surrender'],
  },
  {
    name: 'Peter',
    description: 'Impulsive fisherman who became a rock of the church',
    keyScriptures: ['Matthew 14', 'Matthew 16', 'Luke 22', 'John 21', 'Acts 2'],
    themes: ['identity', 'courage', 'healing', 'surrender'],
  },
  {
    name: 'Hannah',
    description: 'Woman who poured out her grief and received a miracle',
    keyScriptures: ['1 Samuel 1-2'],
    themes: ['trust', 'healing', 'surrender', 'hope', 'presence'],
  },
  {
    name: 'Elijah',
    description: 'Prophet who stood boldly, then ran in fear, then met God in whispers',
    keyScriptures: ['1 Kings 17-19', '2 Kings 2'],
    themes: ['trust', 'rest', 'courage', 'presence'],
  },
  {
    name: 'Esther',
    description: 'Queen who risked everything for her people',
    keyScriptures: ['Esther 1-10'],
    themes: ['identity', 'purpose', 'courage'],
  },
  {
    name: 'Paul',
    description: 'Persecutor turned apostle, transformed by encounter',
    keyScriptures: ['Acts 9', 'Philippians', '2 Corinthians 11-12', '2 Timothy'],
    themes: ['identity', 'purpose', 'healing', 'courage', 'hope'],
  },
];

// Bible books suitable for book studies
export interface BibleBookStudy {
  name: string;
  testament: 'old' | 'new';
  description: string;
  chapters: number;
  themes: ThemeCategory[];
  idealLength: 7 | 14 | 30;
}

export const BIBLE_BOOKS_FOR_STUDY: BibleBookStudy[] = [
  { name: 'Philippians', testament: 'new', description: 'Joy in every circumstance', chapters: 4, themes: ['gratitude', 'hope', 'identity'], idealLength: 7 },
  { name: 'James', testament: 'new', description: 'Faith in action', chapters: 5, themes: ['trust', 'purpose', 'courage'], idealLength: 7 },
  { name: 'Ruth', testament: 'old', description: 'Faithfulness and redemption', chapters: 4, themes: ['trust', 'identity', 'hope'], idealLength: 7 },
  { name: 'Colossians', testament: 'new', description: 'The supremacy of Christ', chapters: 4, themes: ['identity', 'purpose', 'presence'], idealLength: 7 },
  { name: '1 John', testament: 'new', description: 'Assurance and love', chapters: 5, themes: ['identity', 'trust', 'presence'], idealLength: 7 },
  { name: 'Jonah', testament: 'old', description: 'Running from God, found by grace', chapters: 4, themes: ['surrender', 'purpose', 'presence'], idealLength: 7 },
  { name: 'Ephesians', testament: 'new', description: 'Our identity and calling in Christ', chapters: 6, themes: ['identity', 'purpose', 'presence'], idealLength: 14 },
  { name: 'Romans', testament: 'new', description: 'The gospel unpacked', chapters: 16, themes: ['identity', 'hope', 'trust'], idealLength: 30 },
  { name: 'Genesis 1-11', testament: 'old', description: 'Beginnings and the human condition', chapters: 11, themes: ['identity', 'purpose', 'trust'], idealLength: 14 },
  { name: 'Ecclesiastes', testament: 'old', description: 'Finding meaning under the sun', chapters: 12, themes: ['purpose', 'rest', 'presence'], idealLength: 14 },
];

// Helper functions
export function getThemeById(id: ThemeCategory): ThemeCategoryInfo | undefined {
  return THEME_CATEGORIES.find(t => t.id === id);
}

export function getDevotionalTypeById(id: DevotionalType): DevotionalTypeInfo | undefined {
  return DEVOTIONAL_TYPES.find(t => t.id === id);
}

export function getCompatibleTypes(theme: ThemeCategory): DevotionalTypeInfo[] {
  return DEVOTIONAL_TYPES.filter(type => type.compatibleThemes.includes(theme));
}

export function getCompatibleThemes(type: DevotionalType): ThemeCategoryInfo[] {
  const devotionalType = getDevotionalTypeById(type);
  if (!devotionalType) return THEME_CATEGORIES;
  return THEME_CATEGORIES.filter(theme => devotionalType.compatibleThemes.includes(theme.id));
}

export function getCharactersForTheme(theme: ThemeCategory): BiblicalCharacter[] {
  return BIBLICAL_CHARACTERS.filter(char => char.themes.includes(theme));
}

export function getBooksForTheme(theme: ThemeCategory): BibleBookStudy[] {
  return BIBLE_BOOKS_FOR_STUDY.filter(book => book.themes.includes(theme));
}

// Pick a random theme, weighted toward ones that feel more common/universal
export function suggestTheme(): ThemeCategory {
  const weights: Record<ThemeCategory, number> = {
    trust: 14,
    identity: 14,
    rest: 10,
    hope: 10,
    healing: 9,
    purpose: 9,
    gratitude: 7,
    presence: 7,
    courage: 5,
    surrender: 5,
    joy: 8,
    conviction: 6,
    lament: 6,
    wonder: 6,
    justice: 4,
    discipline: 4,
  };

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;

  for (const [theme, weight] of Object.entries(weights)) {
    random -= weight;
    if (random <= 0) return theme as ThemeCategory;
  }

  return 'trust';
}
