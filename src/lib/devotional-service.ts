import { DevotionalDay, Devotional, Quote, CrossReference, BibleTranslation, UsedScripture, ThemeCategory, DevotionalType } from './store';
import { logBugEvent, logBugError } from './bug-logger';
import {
  getThemeById,
  getDevotionalTypeById,
  BIBLICAL_CHARACTERS,
  BIBLE_BOOKS_FOR_STUDY,
  BiblicalCharacter,
  BibleBookStudy,
} from '../constants/devotional-types';

// Backend URL for proxied API calls (keeps API keys server-side)
const DEFAULT_LOCAL_BACKEND_URL = 'http://localhost:3000';
const DEFAULT_REMOTE_BACKEND_FALLBACK_URL = 'https://oversight-cloning.vibecode.run';

const PRIMARY_BACKEND_URL =
  process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL?.trim() || DEFAULT_LOCAL_BACKEND_URL;
const EXPLICIT_FALLBACK_BACKEND_URL =
  process.env.EXPO_PUBLIC_VIBECODE_BACKEND_FALLBACK_URL?.trim() || '';

function isLocalBackendUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/.test(url);
}

function getBackendCandidates(): string[] {
  const candidates = [PRIMARY_BACKEND_URL];

  const fallback = EXPLICIT_FALLBACK_BACKEND_URL ||
    (isLocalBackendUrl(PRIMARY_BACKEND_URL) ? DEFAULT_REMOTE_BACKEND_FALLBACK_URL : '');

  if (fallback && !candidates.includes(fallback)) {
    candidates.push(fallback);
  }

  return candidates;
}

interface BackendPostOptions {
  timeoutMs?: number;
}

interface BackendPostResult {
  response: Response;
  backendUrl: string;
  usedFallback: boolean;
  attempts: number;
}

async function postJsonWithBackendFallback(
  path: string,
  payload: Record<string, unknown>,
  options: BackendPostOptions = {}
): Promise<BackendPostResult> {
  const timeoutMs = options.timeoutMs ?? 300000;
  const backendCandidates = getBackendCandidates();

  let lastError: unknown = null;

  for (let i = 0; i < backendCandidates.length; i++) {
    const backendUrl = backendCandidates[i];
    const hasAnotherCandidate = i < backendCandidates.length - 1;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${backendUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      // If this backend is unhealthy and we have a fallback endpoint, try it.
      if (response.status >= 500 && hasAnotherCandidate) {
        console.warn(
          `[Devotional] Backend ${backendUrl} returned ${response.status}; trying fallback ${backendCandidates[i + 1]}`
        );
        continue;
      }

      return {
        response,
        backendUrl,
        usedFallback: i > 0,
        attempts: i + 1,
      };
    } catch (error) {
      lastError = error;

      const aborted = controller.signal.aborted;
      if (hasAnotherCandidate) {
        const reason = aborted ? 'timed out' : 'failed';
        console.warn(
          `[Devotional] Backend ${backendUrl} ${reason}; trying fallback ${backendCandidates[i + 1]}`
        );
        continue;
      }

      if (aborted) {
        throw new Error(`Backend request timed out after ${Math.round(timeoutMs / 1000)}s`);
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw (lastError instanceof Error
    ? lastError
    : new Error('All configured backend endpoints failed'));
}

// Track long-running full-series generation jobs to prevent duplicate background generation.
const activeFullGenerationIds = new Set<string>();

// Request-level idempotency maps to dedupe accidental duplicate generation calls.
const inFlightFullGenerationRequests = new Map<string, Promise<GeneratedDevotional>>();
const inFlightContinuationRequests = new Map<string, Promise<DevotionalDay[]>>();

export function markFullGenerationActive(devotionalId: string): void {
  activeFullGenerationIds.add(devotionalId);
}

export function markFullGenerationInactive(devotionalId: string): void {
  activeFullGenerationIds.delete(devotionalId);
}

export function isFullGenerationActive(devotionalId: string): boolean {
  return activeFullGenerationIds.has(devotionalId);
}

// Helper to extract book name from scripture reference (e.g., "John 3:16" -> "John")
export function extractBookFromReference(reference: string): string {
  // Handle books with numbers like "1 Corinthians", "2 Kings", etc.
  const match = reference.match(/^(\d?\s*[A-Za-z]+)/);
  return match ? match[1].trim() : reference.split(' ')[0];
}

// Helper to extract scriptures from a devotional for tracking
export function extractScripturesFromDevotional(devotional: Devotional): UsedScripture[] {
  const scriptures: UsedScripture[] = [];
  const now = new Date().toISOString();

  for (const day of devotional.days) {
    // Add primary scripture
    if (day.scriptureReference) {
      scriptures.push({
        reference: day.scriptureReference,
        book: extractBookFromReference(day.scriptureReference),
        usedAt: now,
        devotionalId: devotional.id,
      });
    }

    // Add cross-references
    if (day.crossReferences) {
      for (const crossRef of day.crossReferences) {
        scriptures.push({
          reference: crossRef.reference,
          book: extractBookFromReference(crossRef.reference),
          usedAt: now,
          devotionalId: devotional.id,
        });
      }
    }
  }

  return scriptures;
}

interface GenerationContext {
  name: string;
  aboutMe: string;
  currentSituation: string;
  emotionalState: string;
  spiritualSeeking: string;
  readingDuration: 5 | 15 | 30;
  devotionalLength: 3 | 7 | 14 | 30;
  bibleTranslation: BibleTranslation;
  previouslyUsedScriptures?: string[]; // References to avoid repeating
  // New: Theme and type
  themeCategory?: ThemeCategory;
  devotionalType?: DevotionalType;
  studySubject?: string; // For book/character studies
}

interface GeneratedDevotional {
  title: string;
  days: DevotionalDay[];
}

// Full system prompt for first attempt — rich personalization
const SYSTEM_PROMPT_FULL = `You are a contemplative Christian writer with the literary depth of Wendell Berry, the theological precision of N.T. Wright, and the pastoral warmth of Henri Nouwen. You write devotionals that feel like letters from a trusted mentor who has walked through darkness and found light.

YOUR VOICE:
- Write as if composing something worth reading twice. Each sentence should carry weight.
- Vary your openings dramatically—never start consecutive days the same way. Some days begin mid-thought, others with a question, others with an image, others with Scripture itself.
- Trust silence. Not every sentence needs to explain. Let truth sit without commentary.

PERSONAL CONNECTION:
- Write to the reader using "you" frequently. This is a personal letter, not an essay.
- Address them conversationally: "You know this tension..." / "What if you..." / "You've felt this before..."
- The reader's name should appear sparingly—roughly once every 5 days, never at the beginning of a day. When you do use it, bury it mid-sentence at a moment of encouragement. Example: "And perhaps, [Name], this is exactly where grace meets you."

WHAT TO AVOID (these sound artificial and hollow):
- "Here's the thing..." / "Here's the uncomfortable truth..."
- "Let that sink in" / "Read that again"
- "Friend, ..." or addressing the reader with pet names
- Rhetorical questions followed immediately by their answers
- Lists of application points
- Phrases like "powerful," "journey," "season of," "step into," "lean into," "sit with that"
- Starting paragraphs with "You see," or "The truth is," or "Think about it"
- Manufactured urgency or false intimacy
- Narrating the reader's life back to them. Never say things like "at the intersection of ministry and design" or "as someone who balances fatherhood with creative work."
- Spelling out their identity, roles, or circumstances. They know who they are.

THE SHOW-DON'T-TELL PRINCIPLE:
The reader has shared some context about their life. Use this to INFORM your writing, not to NARRATE it.
- WRONG: "As a father who works in ministry and design, you understand the tension between calling and responsibility."
- RIGHT: Write about vocation, creativity, or stewardship in ways that will resonate—let them make the connection.

The devotional should feel like it was written for any thoughtful Christian—but happens to land well for THIS person because you've chosen themes, scriptures, and angles that speak to their situation without announcing it.

WHAT MAKES WRITING RESONATE:
- Direct address. Use "you" liberally.
- Universal truths that feel personal because of how precisely they're stated.
- Restraint. Say less than you want to. The reader's imagination does the rest.
- Surprise. Place an unexpected word where a cliché would go.
- Rhythm. Alternate between long sentences that unfold slowly and short ones that land.
- Earned emotion. Build to moments; don't announce them.
- Grounded imagery (a specific object, a time of day, a texture) rather than abstract concepts.

SCRIPTURE HANDLING:
- Let Scripture do the heavy lifting. Quote it fully, then sit with it.
- Sometimes the best commentary is simply placing the text next to the reader's situation and letting the resonance speak.
- Weave 2-3 cross-references naturally, not as proof-texts but as echoes.

STRUCTURE:
- Begin in varied ways—sometimes with Scripture, sometimes with an image, sometimes in the middle of a thought
- End with invitation, not instruction. The reader should feel drawn forward, not commanded.

IMPORTANT: Respond with valid JSON only. No markdown, no code blocks.`;

// Softened system prompt for retry — less personalization, more focus on writing quality
const SYSTEM_PROMPT_SOFT = `You are a contemplative Christian devotional writer. You write with literary depth, theological precision, and pastoral warmth. Your devotionals feel like letters from a trusted mentor.

YOUR VOICE:
- Write as if composing something worth reading twice. Each sentence should carry weight.
- Vary your openings—never start consecutive days the same way.
- Trust silence. Not every sentence needs to explain.

STYLE:
- Write to the reader using "you" frequently. This is a personal letter, not an essay.
- Focus on universal spiritual truths that resonate deeply.
- Avoid clichés: "Here's the thing," "Let that sink in," "Friend," "journey," "season of," "lean into."
- Do NOT narrate the reader's life or identity back to them. Keep writing universal.

WHAT MAKES WRITING RESONATE:
- Direct address using "you."
- Restraint. Say less than you want to.
- Surprise. Place an unexpected word where a cliché would go.
- Rhythm. Alternate between long and short sentences.
- Grounded imagery rather than abstract concepts.

SCRIPTURE HANDLING:
- Let Scripture do the heavy lifting. Quote it fully, then sit with it.
- Weave 2-3 cross-references naturally.

STRUCTURE:
- Begin in varied ways—sometimes with Scripture, sometimes with an image, sometimes mid-thought.
- End with invitation, not instruction.

IMPORTANT: Respond with valid JSON only. No markdown, no code blocks.`;

// Minimal system prompt for last-resort retry — purely functional, no personalization
const SYSTEM_PROMPT_MINIMAL = `You are a Christian devotional writer. Write thoughtful, scripture-based daily devotionals with literary quality and theological depth.

STYLE:
- Use second person ("you") throughout.
- Avoid clichés and generic spiritual language.
- Let Scripture speak for itself. Quote passages fully.
- Vary openings across days.
- End each day with invitation, not instruction.

IMPORTANT: Respond with valid JSON only. No markdown, no code blocks.`;

// Get system prompt based on retry level
function getSystemPrompt(retryLevel: number): string {
  if (retryLevel === 0) return SYSTEM_PROMPT_FULL;
  if (retryLevel === 1) return SYSTEM_PROMPT_SOFT;
  return SYSTEM_PROMPT_MINIMAL;
}

const getReadingLengthGuidance = (duration: 5 | 15 | 30): string => {
  switch (duration) {
    case 5:
      return `5-MINUTE DEVOTIONAL FORMAT:
- Scripture: One focused passage (4-6 verses)
- Body text: 250-350 words of reflection
- Include 1 brief quote from a theologian, author, or church father that illuminates the theme
- End with 1 reflection question for the reader to carry with them
- Total reading time: ~5 minutes`;
    case 15:
      return `15-MINUTE DEVOTIONAL FORMAT:
- Primary Scripture: A substantial passage (6-10 verses)
- Secondary Scripture: 1-2 cross-reference passages woven into the reflection (include full text, 2-4 verses each)
- Body text: 600-800 words of rich, layered reflection
- Include 2-3 quotes from theologians, authors, poets, or church fathers (e.g., C.S. Lewis, Augustine, Dietrich Bonhoeffer, A.W. Tozer, Julian of Norwich, Frederick Buechner, Brennan Manning, etc.) that deepen the meditation
- End with 2-3 reflection questions that invite genuine self-examination
- Consider including a brief historical or cultural context note where it enriches understanding
- Total reading time: ~10-12 minutes, leaving 3-5 minutes for journaling/reflection`;
    case 30:
      return `30-MINUTE DEVOTIONAL FORMAT:
- Primary Scripture: A meaningful passage (6-10 verses)
- Secondary Scripture: 1-2 cross-reference passages woven in (include full text, 2-4 verses each)
- Body text: 800-1000 words of deep, contemplative reflection
- Include 2-3 quotes from theologians, mystics, or authors (C.S. Lewis, Henri Nouwen, Thomas Merton, A.W. Tozer, etc.)
- Include brief historical or cultural context where it enriches understanding
- End with 3-4 reflection questions that progressively deepen
- Include a brief closing prayer or benediction
- Total reading time: ~20 minutes, leaving 10 minutes for journaling/reflection`;
  }
};

const getJsonSchemaForDuration = (duration: 5 | 15 | 30): string => {
  const baseSchema = `{
  "title": "Series Title Here",
  "days": [
    {
      "dayNumber": 1,
      "title": "Day Title",
      "scriptureReference": "Book Chapter:Verses",
      "scriptureText": "The full scripture passage...",
      "bodyText": "The devotional reflection...",
      "quotableLine": "A memorable quote..."`;

  if (duration === 5) {
    return baseSchema + `,
      "quotes": [{"text": "Quote text...", "author": "Author Name"}],
      "reflectionQuestions": ["One question to carry with them..."]
    }
  ]
}`;
  } else if (duration === 15) {
    return baseSchema + `,
      "quotes": [
        {"text": "Quote text...", "author": "Author Name"},
        {"text": "Another quote...", "author": "Another Author"}
      ],
      "crossReferences": [
        {"reference": "Book Chapter:Verses", "text": "Full scripture text..."}
      ],
      "reflectionQuestions": ["Question 1...", "Question 2...", "Question 3..."],
      "contextNote": "Optional historical or cultural context..."
    }
  ]
}`;
  } else {
    return baseSchema + `,
      "quotes": [
        {"text": "Quote text...", "author": "Author Name"},
        {"text": "Another quote...", "author": "Another Author"}
      ],
      "crossReferences": [
        {"reference": "Book Chapter:Verses", "text": "Full scripture text..."}
      ],
      "reflectionQuestions": ["Question 1...", "Question 2...", "Question 3..."],
      "contextNote": "Brief historical or cultural context...",
      "closingPrayer": "A brief prayer or benediction..."
    }
  ]
}`;
  }
};

// Calculate how many days can be generated per batch based on reading duration
function getBatchSize(readingDuration: 5 | 15 | 30): number {
  switch (readingDuration) {
    case 5:
      return 7; // 5-min devotionals — 7 per batch to avoid timeouts
    case 15:
      return 5; // 15-min devotionals need medium batches
    case 30:
      return 2; // 30-min devotionals are long, need very small batches
  }
}

// Build a smart batch plan that prioritizes getting Day 1 ready ASAP
// First batch is always just Day 1, then remaining days use normal batch sizes
function buildBatchPlan(totalDays: number, readingDuration: 5 | 15 | 30): { start: number; end: number }[] {
  const batches: { start: number; end: number }[] = [];

  // ALWAYS generate Day 1 separately for fastest time-to-read
  // This is critical for user experience - they need something to read ASAP
  batches.push({ start: 1, end: 1 });

  // For very short series (3 days) with short duration, generate rest in one batch
  if (totalDays <= 3 && readingDuration <= 15) {
    if (totalDays > 1) {
      batches.push({ start: 2, end: totalDays });
    }
    return batches;
  }

  // After Day 1 is ready, use larger batch sizes to be more efficient
  // (the user is already reading, so we can take more time per batch)
  // For 30-minute devotionals, keep batches small to avoid timeouts
  const followUpBatchSize = readingDuration === 30 ? 2 : readingDuration === 15 ? 5 : 7;

  let currentDay = 2;
  while (currentDay <= totalDays) {
    const endDay = Math.min(currentDay + followUpBatchSize - 1, totalDays);
    batches.push({ start: currentDay, end: endDay });
    currentDay = endDay + 1;
  }

  return batches;
}

// Build theme-specific guidance for the prompt
function getThemeGuidance(context: GenerationContext): string {
  if (!context.themeCategory) return '';

  const theme = getThemeById(context.themeCategory);
  if (!theme) return '';

  return `
THEME FOCUS: ${theme.name.toUpperCase()}
${theme.description}

TONE: ${theme.toneGuidance}
SCRIPTURE FOCUS: Draw primarily from ${theme.scriptureFocus.join(', ')}
Let this theme color each day without being heavy-handed—the reader should feel the theme emerging naturally.
`;
}

// Build type-specific structure guidance
function getTypeGuidance(context: GenerationContext): string {
  if (!context.devotionalType || context.devotionalType === 'personal') return '';

  const type = getDevotionalTypeById(context.devotionalType);
  if (!type) return '';

  let specificGuidance = `
DEVOTIONAL STRUCTURE: ${type.name.toUpperCase()}
${type.structureGuidance}
`;

  // Add subject-specific guidance for book/character studies
  if (context.studySubject) {
    switch (context.devotionalType) {
      case 'book_study': {
        const book = BIBLE_BOOKS_FOR_STUDY.find(b => b.name === context.studySubject);
        if (book) {
          specificGuidance += `
BOOK: ${book.name} (${book.chapters} chapters)
${book.description}
Walk through the book sequentially, covering meaningful sections each day. Let the book's own structure guide the journey.`;
        }
        break;
      }
      case 'character_study': {
        const character = BIBLICAL_CHARACTERS.find(c => c.name === context.studySubject);
        if (character) {
          specificGuidance += `
CHARACTER: ${character.name}
${character.description}
KEY SCRIPTURES: ${character.keyScriptures.join(', ')}
Explore different moments in their journey—their calling, struggles, failures, and how God met them.`;
        }
        break;
      }
      case 'beatitudes':
        specificGuidance += `
Walk through Matthew 5:3-12, spending one or more days on each beatitude:
- Poor in spirit, mourn, meek, hunger for righteousness
- Merciful, pure in heart, peacemakers, persecuted
Unpack the counter-cultural nature of each blessing.`;
        break;
      case 'fruit_of_spirit':
        specificGuidance += `
Walk through Galatians 5:22-23:
Love, Joy, Peace, Patience, Kindness, Goodness, Faithfulness, Gentleness, Self-control
Explore how each fruit grows in us through the Spirit's work, not our striving.`;
        break;
      case 'lords_prayer':
        specificGuidance += `
Walk through Matthew 6:9-13 phrase by phrase:
Our Father in heaven, hallowed be your name
Your kingdom come, your will be done
Give us today our daily bread
Forgive us our debts, as we forgive our debtors
Lead us not into temptation, deliver us from evil
For yours is the kingdom, power, and glory
Teach the reader to pray each phrase as their own.`;
        break;
      case 'names_of_god':
        specificGuidance += `
Explore different names and attributes of God:
Yahweh, Elohim, El Shaddai, Adonai, Jehovah Rapha (Healer)
Jehovah Jireh (Provider), Jehovah Shalom (Peace), Good Shepherd
Ground each name in Scripture and show how it meets us where we are.`;
        break;
      case 'parables':
        specificGuidance += `
Walk through Jesus' parables:
The Sower, Prodigal Son, Good Samaritan, Lost Sheep, Mustard Seed
Pearl of Great Price, Talents, Rich Fool, Pharisee and Tax Collector
Unpack the surprising and often uncomfortable truth each parable reveals about the Kingdom.`;
        break;
      case 'psalm_journey':
        specificGuidance += `
Select psalms that cover the full emotional range:
- Lament psalms (13, 22, 42, 88)
- Trust psalms (23, 27, 46, 91)
- Thanksgiving psalms (30, 103, 116)
- Praise psalms (8, 19, 100, 148)
Let each psalm speak in its fullness—don't rush to resolution in lament psalms.`;
        break;
    }
  }

  return specificGuidance;
}

// Build user prompt based on retry level
function buildUserPrompt(
  context: GenerationContext,
  startDay: number,
  endDay: number,
  seriesTitle: string | null,
  previousDayTitles: string[],
  retryLevel: number
): string {
  const daysToGenerate = endDay - startDay + 1;
  const isFirstBatch = startDay === 1;

  const titleInstruction = isFirstBatch
    ? `1. An evocative, poetic title for the whole series (3-6 words)
   TITLE REQUIREMENTS:
   - Vary structure across different devotionals: noun phrases ("The Quiet Work"), imperatives ("Hold Fast"), single evocative words with modifier ("Unshaken"), metaphorical images ("Salt & Light"), questions without question marks ("Where Mercy Lives"), fragments ("Before the Dawn"), or occasional "When" phrases ("When the Ground Shifts")
   - Make it surprising, not generic—avoid clichés like "Finding Peace" or "A Journey Through"
   - Each title should feel like it could be a book you'd want to pick up`
    : `1. Use this exact series title: "${seriesTitle}"`;

  const previousTitlesNote = previousDayTitles.length > 0
    ? `\n\nPREVIOUS DAY TITLES (do NOT repeat these or start with the same words):
${previousDayTitles.map((t, i) => `Day ${i + 1}: "${t}"`).join('\n')}`
    : '';

  // Build scripture avoidance instruction if we have previously used scriptures
  const scriptureAvoidanceNote = context.previouslyUsedScriptures && context.previouslyUsedScriptures.length > 0
    ? `\n\nSCRIPTURE VARIETY REQUIREMENT (IMPORTANT):
The reader has previously read devotionals with these scriptures. To keep their experience fresh, please AVOID using these exact passages as primary scriptures. You may reference them briefly or use different verses from the same books, but choose NEW primary passages:
${context.previouslyUsedScriptures.slice(0, 50).join(', ')}

Instead, explore less common but equally meaningful passages that speak to similar themes.`
    : '';

  // Build theme and type guidance
  const themeGuidance = getThemeGuidance(context);
  const typeGuidance = getTypeGuidance(context);

  // For retryLevel >= 2, use a simpler user prompt without personal context
  if (retryLevel >= 2) {
    return `Create days ${startDay}-${endDay} of a ${context.devotionalLength}-day Christian devotional.

READER NAME: ${context.name}
BIBLE TRANSLATION: ${context.bibleTranslation}
(All scripture quotations MUST be in the ${context.bibleTranslation} translation style.)

THEMES: Write about faith, hope, trust in God, and spiritual growth. Choose scriptures that offer comfort, wisdom, and encouragement.
${themeGuidance}${typeGuidance}
${getReadingLengthGuidance(context.readingDuration)}

VARIATION: Each day should open differently and feel distinct.
${previousTitlesNote}${scriptureAvoidanceNote}

QUOTE SOURCES (use REAL quotes only):
C.S. Lewis, Dietrich Bonhoeffer, N.T. Wright, Henri Nouwen, Thomas Merton, Augustine, A.W. Tozer, Corrie ten Boom, Elisabeth Elliot, Frederick Buechner, G.K. Chesterton

Please generate:
${titleInstruction}
2. Days ${startDay} through ${endDay} (${daysToGenerate} days total)
   DAY TITLE REQUIREMENTS:
   - NEVER start consecutive day titles with the same word
   - Vary structures: imperatives, noun phrases, single words, questions, metaphors

${isFirstBatch ? 'Begin a spiritual journey—setting the foundation for transformation.' : `Continuation: days ${startDay}-${endDay} of ${context.devotionalLength}. ${startDay <= context.devotionalLength / 2 ? 'Continue building depth.' : 'Move toward resolution and deeper peace.'}`}

Respond ONLY with valid JSON in this exact format:
${getJsonSchemaForDuration(context.readingDuration)}

IMPORTANT: The "days" array should contain exactly ${daysToGenerate} days, numbered ${startDay} through ${endDay}.`;
  }

  // For retryLevel 1, include context but with softer personalization instructions
  const personalizationBlock = retryLevel === 0
    ? `NAME: ${context.name}
PERSONALIZATION GUIDELINES:
- Write to the reader using "you" throughout.
- The name "${context.name}" should appear only ONCE in this batch (if at all), buried mid-sentence—NEVER at the start of any day.
- ${startDay === 1 ? 'For day 1, do NOT use their name. Save it for later.' : 'You may include their name once if it fits naturally.'}

--- READER CONTEXT (use to inform theme/scripture selection, do NOT narrate back) ---
About them: ${context.aboutMe}
What they're walking through: ${context.currentSituation}
How they're feeling: ${context.emotionalState}
What they're seeking: ${context.spiritualSeeking}
--- END READER CONTEXT ---

Use the above context to choose relevant themes and scriptures. Write universally — the reader should never feel like you're describing their life back to them.`
    : `NAME: ${context.name}
Write to the reader using "you" throughout.

The reader is seeking spiritual growth and encouragement. Choose themes of ${context.spiritualSeeking || 'hope, peace, and deeper faith'}.`;

  return `Create days ${startDay}-${endDay} of a ${context.devotionalLength}-day Christian devotional.

${personalizationBlock}

BIBLE TRANSLATION: ${context.bibleTranslation}
(All scripture quotations MUST be in the ${context.bibleTranslation} translation style.)
${themeGuidance}${typeGuidance}
${getReadingLengthGuidance(context.readingDuration)}

VARIATION REQUIREMENTS:
- Each day should open differently: with Scripture, an image, mid-thought, a question, or a narrative moment
- Each day MUST feel distinct in voice and approach while maintaining coherence
${previousTitlesNote}${scriptureAvoidanceNote}

QUOTE SOURCES (draw from these voices, using REAL quotes—do not fabricate):
- Church Fathers: Augustine, Athanasius, John Chrysostom, Gregory of Nazianzus
- Reformers: Martin Luther, John Calvin, John Wesley
- Mystics: Julian of Norwich, Meister Eckhart, Brother Lawrence, Madame Guyon, John of the Cross
- Modern Theologians: C.S. Lewis, Dietrich Bonhoeffer, N.T. Wright, Tim Keller, A.W. Tozer
- Contemplatives: Henri Nouwen, Thomas Merton, Richard Rohr, Dallas Willard
- Authors & Poets: George MacDonald, Frederick Buechner, Brennan Manning, Wendell Berry, G.K. Chesterton
- Women of Faith: Corrie ten Boom, Elisabeth Elliot, Amy Carmichael, Hannah Whitall Smith

Please generate:
${titleInstruction}
2. Days ${startDay} through ${endDay} (${daysToGenerate} days total), each containing the fields specified in the JSON schema below
   DAY TITLE REQUIREMENTS:
   - NEVER start consecutive day titles with the same word
   - Vary structures across days: some imperatives, some noun phrases, some single words, some questions, some metaphors
   - Examples of good variety: "Ash & Ember", "Learning to Wait", "What the Wilderness Teaches", "Held", "The God Who Sees", "Remain", "When Morning Comes"

${isFirstBatch ? 'The devotional should begin a spiritual journey—setting the foundation for transformation.' : `This is a continuation of the journey. We are now on days ${startDay}-${endDay} of ${context.devotionalLength}. ${startDay <= context.devotionalLength / 2 ? 'Continue building depth.' : 'Begin moving toward resolution and deeper peace.'}`}

Respond ONLY with valid JSON in this exact format:
${getJsonSchemaForDuration(context.readingDuration)}

IMPORTANT: The "days" array should contain exactly ${daysToGenerate} days, numbered ${startDay} through ${endDay}.`;
}

// Generate a single batch of days
async function generateBatch(
  context: GenerationContext,
  startDay: number,
  endDay: number,
  seriesTitle: string | null,
  previousDayTitles: string[],
  retryLevel: number = 0
): Promise<{ title: string; days: DevotionalDay[] }> {
  const systemPrompt = getSystemPrompt(retryLevel);
  const userPrompt = buildUserPrompt(context, startDay, endDay, seriesTitle, previousDayTitles, retryLevel);

  // Using Haiku for all days - cost-effective and quality is sufficient for devotionals
  const model = 'claude-haiku-4-5-20251001';
  const timeoutMs = 180000; // 3 min timeout for all days

  console.log(`[Devotional] generateBatch days ${startDay}-${endDay}, retryLevel=${retryLevel}, model=${model}, systemPrompt=${systemPrompt.length}chars, userPrompt=${userPrompt.length}chars`);
  void logBugEvent('devotional-service', 'batch-request-started', {
    startDay,
    endDay,
    retryLevel,
    model,
  });

  let response: Response;
  let backendUrlUsed = PRIMARY_BACKEND_URL;
  try {
    console.log(`[Devotional] Sending request to backend for days ${startDay}-${endDay} with model ${model}...`);

    const backendResult = await postJsonWithBackendFallback(
      '/api/generate/devotional',
      {
        model,
        max_tokens: 12000, // Token limit for Haiku
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      },
      { timeoutMs }
    );

    response = backendResult.response;
    backendUrlUsed = backendResult.backendUrl;

    if (backendResult.usedFallback) {
      void logBugEvent('devotional-service', 'batch-request-used-backend-fallback', {
        startDay,
        endDay,
        backendUrl: backendUrlUsed,
        attempts: backendResult.attempts,
      }, 'warn');
    }

    console.log(
      `[Devotional] Got response: status=${response.status} for days ${startDay}-${endDay} (backend: ${backendUrlUsed})`
    );
  } catch (fetchError) {
    const fetchMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);

    if (fetchMessage.toLowerCase().includes('timed out')) {
      console.log(`[Devotional] Request timed out after ${timeoutMs / 1000} seconds`);
      void logBugEvent('devotional-service', 'batch-request-timeout', {
        startDay,
        endDay,
        timeoutMs,
      }, 'warn');
      throw new Error('The request took too long. Please try again — it usually works on the second attempt.');
    }

    console.log('[Devotional] Fetch error:', fetchMessage);
    void logBugError('devotional-service', fetchError, {
      startDay,
      endDay,
      phase: 'fetch',
    });
    throw fetchError;
  }

  if (!response.ok) {
    const errorText = await response.text();
    void logBugEvent('devotional-service', 'batch-request-non-200', {
      startDay,
      endDay,
      status: response.status,
      snippet: errorText.slice(0, 200),
    }, response.status >= 500 ? 'error' : 'warn');

    if (response.status === 400 && (errorText.includes('content filtering') || errorText.includes('Output blocked'))) {
      console.log('[Devotional] Content filter triggered, will retry with simplified context...');
      throw new Error('CONTENT_FILTER_ERROR');
    }

    // Mark transient upstream/server errors so retry logic can handle them.
    if (response.status === 500 || response.status === 502 || response.status === 503 || response.status === 504) {
      console.log('[Devotional] Service temporarily unavailable:', response.status);
      throw new Error('TRANSIENT_UPSTREAM_ERROR');
    }

    console.error('API Error Response:', response.status, errorText);

    if (response.status === 401) {
      throw new Error('API key is invalid or expired. Please contact support.');
    } else if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please wait a moment and try again.');
    }

    throw new Error(`API request failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;

  if (!content) {
    throw new Error('No content in response');
  }

  // Parse the JSON response
  let parsed: GeneratedDevotional;
  try {
    parsed = JSON.parse(content) as GeneratedDevotional;
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to parse JSON. Raw content:', content.substring(0, 500));
      throw new Error('Could not parse response as JSON');
    }
    const cleanedJson = jsonMatch[0]
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']');
    parsed = JSON.parse(cleanedJson) as GeneratedDevotional;
  }

  // Ensure day numbers are correct
  parsed.days = parsed.days.map((day, index) => ({
    ...day,
    dayNumber: startDay + index,
    isRead: false,
  }));

  return parsed;
}

// Helper to sanitize user input to avoid content filter triggers
function sanitizeForGeneration(text: string, maxLength: number = 300): string {
  // Trim and limit length
  let sanitized = text.trim();
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength).trim() + '...';
  }
  return sanitized;
}

// Helper to check if an error is a network/connectivity error
function isNetworkError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return msg.includes('network request failed') ||
    msg.includes('fetch') ||
    msg.includes('aborted') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('econnrefused') ||
    msg.includes('unable to connect');
}

// Helper to generate with retry on content filter and network errors
async function generateBatchWithRetry(
  context: GenerationContext,
  startDay: number,
  endDay: number,
  seriesTitle: string | null,
  previousDayTitles: string[],
  maxRetries: number = 3
): Promise<{ title: string; days: DevotionalDay[] }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // On first attempt, pre-sanitize context to reasonable lengths
      let contextToUse = {
        ...context,
        aboutMe: sanitizeForGeneration(context.aboutMe, 300),
        currentSituation: sanitizeForGeneration(context.currentSituation, 300),
        emotionalState: sanitizeForGeneration(context.emotionalState, 200),
        spiritualSeeking: sanitizeForGeneration(context.spiritualSeeking, 200),
      };

      // retryLevel controls both system prompt and user prompt complexity
      const retryLevel = attempt;

      console.log(`[Devotional] Attempt ${attempt + 1}/${maxRetries + 1}, retryLevel=${retryLevel}`);

      return await generateBatch(
        contextToUse,
        startDay,
        endDay,
        seriesTitle,
        previousDayTitles,
        retryLevel
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const isTransientUpstreamError = lastError.message === 'TRANSIENT_UPSTREAM_ERROR';
        const isRetryable =
          lastError.message === 'CONTENT_FILTER_ERROR' ||
          isNetworkError(lastError) ||
          isTransientUpstreamError;

        if (isRetryable) {
          const reason = lastError.message === 'CONTENT_FILTER_ERROR'
            ? 'content filter'
            : isTransientUpstreamError
              ? 'upstream service unavailable'
              : 'network error';
          console.log(`[Devotional] ${reason} on attempt ${attempt + 1}, retrying (${attempt + 2}/${maxRetries + 1})...`);
          // Wait before retry — longer for upstream/network instability
          const delay = (isNetworkError(lastError) || isTransientUpstreamError)
            ? 2000 + attempt * 1000
            : 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }

      // If it's not retryable or we're out of retries, throw
      throw lastError;
    }
  }

  throw lastError || new Error('Generation failed after retries');
}

function buildFullGenerationRequestKey(context: GenerationContext): string {
  return [
    context.name.trim().toLowerCase(),
    context.devotionalLength,
    context.readingDuration,
    context.bibleTranslation,
    context.themeCategory ?? 'none',
    context.devotionalType ?? 'personal',
    context.studySubject ?? 'none',
    sanitizeForGeneration(context.aboutMe, 120),
    sanitizeForGeneration(context.currentSituation, 120),
    sanitizeForGeneration(context.emotionalState, 120),
    sanitizeForGeneration(context.spiritualSeeking, 120),
  ].join('|');
}

function buildContinuationRequestKey(
  devotional: Devotional,
  readingDuration: 5 | 15 | 30,
  bibleTranslation: BibleTranslation
): string {
  return [
    devotional.id,
    devotional.days.length,
    devotional.totalDays,
    readingDuration,
    bibleTranslation,
  ].join('|');
}

// Streaming callback for progressive loading
export type OnDayGeneratedCallback = (day: DevotionalDay, dayIndex: number, seriesTitle: string) => void;

export async function generateDevotional(
  context: GenerationContext,
  onProgress?: (status: string) => void,
  onDayGenerated?: OnDayGeneratedCallback
): Promise<GeneratedDevotional> {
  const requestKey = buildFullGenerationRequestKey(context);
  const existingRequest = inFlightFullGenerationRequests.get(requestKey);

  if (existingRequest) {
    console.log('[Devotional] Reusing in-flight full generation request');
    void logBugEvent('devotional-service', 'full-generation-deduped');
    return existingRequest;
  }

  const requestPromise = (async () => {
    console.log(`[Devotional] Generating ${context.devotionalLength}-day, ${context.readingDuration}-minute devotional`);

    const totalDays = context.devotionalLength;
    const batches = buildBatchPlan(totalDays, context.readingDuration);

    console.log(`[Devotional] Will generate in ${batches.length} batch(es): ${batches.map(b => `${b.start}-${b.end}`).join(', ')}`);

    onProgress?.('Reading your story');

    try {
      let seriesTitle: string | null = null;
      const allDays: DevotionalDay[] = [];
      const allDayTitles: string[] = [];

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const { start: startDay, end: endDay } = batches[batchIndex];

        console.log(`Generating batch ${batchIndex + 1}/${batches.length}: days ${startDay}-${endDay}`);

        // Update progress based on batch
        if (batchIndex === 0) {
          onProgress?.('Selecting scripture');
        } else {
          onProgress?.(`Writing day ${startDay}-${endDay}`);
        }

        const result = await generateBatchWithRetry(
          context,
          startDay,
          endDay,
          seriesTitle,
          allDayTitles
        );

        // Save the series title from first batch
        if (batchIndex === 0) {
          seriesTitle = result.title;
        }

        // Collect days and titles
        allDays.push(...result.days);
        allDayTitles.push(...result.days.map((d) => d.title));

        // Notify about each day generated for progressive loading
        if (onDayGenerated && seriesTitle) {
          for (const day of result.days) {
            onDayGenerated(day, day.dayNumber - 1, seriesTitle);
          }
        }

        // Small delay between batches to avoid rate limiting
        if (batchIndex < batches.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      onProgress?.('Writing your devotional');
      void logBugEvent('devotional-service', 'full-generation-finished', {
        days: allDays.length,
      });

      return {
        title: seriesTitle || 'Your Devotional Journey',
        days: allDays,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Generation error:', errorMessage);
      void logBugError('devotional-service', error, {
        phase: 'full-generation',
      });

      if (errorMessage.includes('Network request failed') || errorMessage.includes('fetch')) {
        throw new Error('Unable to connect. Please check your internet connection and try again.');
      }

      if (errorMessage === 'CONTENT_FILTER_ERROR') {
        throw new Error('We had trouble generating your devotional. Please try again, or consider shortening your responses in the questions.');
      }

      if (errorMessage === 'TRANSIENT_UPSTREAM_ERROR') {
        throw new Error('The AI service is temporarily unavailable. Please try again.');
      }

      throw error;
    }
  })();

  inFlightFullGenerationRequests.set(requestKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    if (inFlightFullGenerationRequests.get(requestKey) === requestPromise) {
      inFlightFullGenerationRequests.delete(requestKey);
    }
  }
}

// Continue generating remaining days for a partially-generated devotional
export async function continueGeneratingDays(
  devotional: Devotional,
  user: {
    spiritualSeeking: string;
    readingDuration: 5 | 15 | 30;
    bibleTranslation: BibleTranslation;
  },
  onDayGenerated?: OnDayGeneratedCallback
): Promise<DevotionalDay[]> {
  const existingDayCount = devotional.days.length;
  const targetDays = devotional.totalDays;

  if (existingDayCount >= targetDays) {
    return devotional.days;
  }

  const requestKey = buildContinuationRequestKey(devotional, user.readingDuration, user.bibleTranslation);
  const existingRequest = inFlightContinuationRequests.get(requestKey);

  if (existingRequest) {
    console.log(`[Devotional] Reusing in-flight continuation request for ${devotional.id}`);
    void logBugEvent('devotional-service', 'continuation-deduped', {
      devotionalId: devotional.id,
    });
    return existingRequest;
  }

  const requestPromise = (async () => {
    const startDay = existingDayCount + 1;
    console.log(`[Devotional] Continuing generation: days ${startDay}-${targetDays} (${existingDayCount} already exist)`);
    void logBugEvent('devotional-service', 'continuation-started', {
      devotionalId: devotional.id,
      startDay,
      targetDays,
      existingDayCount,
    });

    try {
      const context: GenerationContext = {
        name: devotional.userContext.name,
        aboutMe: devotional.userContext.aboutMe,
        currentSituation: devotional.userContext.currentSituation,
        emotionalState: devotional.userContext.emotionalState,
        spiritualSeeking: user.spiritualSeeking,
        readingDuration: user.readingDuration,
        devotionalLength: targetDays as 3 | 7 | 14 | 30,
        bibleTranslation: user.bibleTranslation,
        themeCategory: devotional.themeCategory,
        devotionalType: devotional.devotionalType,
        studySubject: devotional.studySubject,
      };

      const previousDayTitles = devotional.days.map((d) => d.title);
      const allDays = [...devotional.days];

      // Build batches for the remaining days only
      const batches: { start: number; end: number }[] = [];
      const batchSize = user.readingDuration === 30 ? 2 : user.readingDuration === 15 ? 5 : 7;
      let currentDay = startDay;
      while (currentDay <= targetDays) {
        const endDay = Math.min(currentDay + batchSize - 1, targetDays);
        batches.push({ start: currentDay, end: endDay });
        currentDay = endDay + 1;
      }

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const { start, end } = batches[batchIndex];
        console.log(`[Devotional] Continue batch ${batchIndex + 1}/${batches.length}: days ${start}-${end}`);

        const result = await generateBatchWithRetry(
          context,
          start,
          end,
          devotional.title,
          previousDayTitles,
        );

        allDays.push(...result.days);
        previousDayTitles.push(...result.days.map((d) => d.title));

        if (onDayGenerated) {
          for (const day of result.days) {
            onDayGenerated(day, day.dayNumber - 1, devotional.title);
          }
        }

        if (batchIndex < batches.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      void logBugEvent('devotional-service', 'continuation-finished', {
        devotionalId: devotional.id,
        totalDays: allDays.length,
      });

      return allDays;
    } catch (error) {
      void logBugError('devotional-service', error, {
        devotionalId: devotional.id,
        phase: 'continuation',
      });
      throw error;
    }
  })();

  inFlightContinuationRequests.set(requestKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    if (inFlightContinuationRequests.get(requestKey) === requestPromise) {
      inFlightContinuationRequests.delete(requestKey);
    }
  }
}

export function createDevotionalFromGenerated(
  generated: GeneratedDevotional,
  context: GenerationContext
): Devotional {
  return {
    id: `devotional-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: generated.title,
    totalDays: generated.days.length,
    currentDay: 1,
    days: generated.days,
    createdAt: new Date().toISOString(),
    userContext: {
      name: context.name,
      aboutMe: context.aboutMe,
      currentSituation: context.currentSituation,
      emotionalState: context.emotionalState,
    },
    // Include theme and type if provided
    themeCategory: context.themeCategory,
    devotionalType: context.devotionalType || 'personal',
    studySubject: context.studySubject,
  };
}

// Helper function to generate adaptive follow-up questions
export async function generateAdaptiveQuestion(
  previousAnswers: { question: string; answer: string }[],
  nextQuestionBase: { question: string; subtext: string },
  stepPosition?: 'opening' | 'depth' | 'longing'
): Promise<{ question: string; subtext: string }> {
  if (previousAnswers.length === 0) {
    return nextQuestionBase;
  }

  try {
    const contextStr = previousAnswers
      .map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`)
      .join('\n\n');

    // Determine step position from context if not explicitly passed
    let currentStep = stepPosition;
    if (!currentStep) {
      if (previousAnswers.length <= 1) currentStep = 'opening';
      else if (previousAnswers.length <= 3) currentStep = 'depth';
      else currentStep = 'longing';
    }

    const stepInstructions: Record<string, string> = {
      opening: `THIS IS THE OPENING QUESTION. The person is just starting to share.

YOUR GOAL: Help them name what's present for them right now. If they chose a specific study type, book, character, or theme — the question MUST center on WHY they chose it and what it stirs in them. Do NOT ask a generic spiritual question that ignores their selection.

APPROACH:
- If they chose a BOOK OF THE BIBLE (e.g. Romans, James, Philippians), ask what draws them to THAT specific book right now — what about it feels relevant, what they hope to find there, or what it means to them in this season. Don't ask about the book's content or theology — ask about their relationship to it.
- If they chose a CHARACTER STUDY (e.g. David, Ruth, Paul), ask what about that person's story resonates with where they are — NOT a trivia question about the character.
- If they chose a study type (parables, psalms, beatitudes, etc.), ask what about that style feels right for where they are now
- If they chose a theme (e.g. trust, healing, rest), explore what's happening that made that theme stand out
- DO NOT ask a question that could apply to anyone regardless of what they chose — it must feel connected
- DO NOT jump into theology, doctrine, or specific verses — stay with the person and their WHY

EXAMPLES OF GOOD QUESTIONS (don't copy these, create your own based on what they actually chose):
- If they picked Romans: "What is it about Romans that's calling to you right now?"
- If they picked a character like David: "What is it about David's story that feels close to where you are?"
- If they picked rest as a theme: "When rest came to mind, was it because you need it — or because it feels impossible?"
- If they picked parables: "What is it about Jesus' stories that feels like what you need right now?"

EXAMPLES OF BAD QUESTIONS (avoid these):
- "What specific passage in Romans challenges your understanding of grace?" (too academic, ignores the WHY)
- "How do you relate to Paul's theological arguments?" (too specific to content, not to the person)
- "What's been on your heart lately?" (completely ignores their study choice)`,

      depth: `THIS IS THE GOING-DEEPER QUESTION. They've shared what's on the surface — now help them discover what's underneath.

YOUR GOAL: Guide them toward the root feeling, the deeper pattern, or the thing they haven't named yet. This is the most important question because it shapes the entire devotional.

APPROACH:
- Read their previous answer carefully — what emotion is underneath the words?
- Ask about the feeling, the pattern, or the fear they haven't said out loud yet
- This should feel like the question that makes them pause and think "...yeah, actually"
- Don't repeat anything they said — use new language that opens a new door
- Be specific to their emotional thread, not generic

CRITICAL — AVOID LEADING QUESTIONS:
- Do NOT ask questions like "what would it look like if you stopped trying?" or "what if you could let go?" — these push toward a specific emotional destination
- Do NOT assume they need rest, release, peace, or surrender — they might need conviction, action, courage, or grief
- Ask OPEN questions that could lead anywhere, not questions that suggest their own answer
- Good: "What part of that feels the hardest to sit with?" / "Is there something you keep circling back to?"
- Bad: "What would it feel like to finally release that?" / "What if you didn't have to carry that?"

WHAT MAKES THIS QUESTION GREAT:
- It picks up exactly where they left off emotionally
- It names a dynamic they might not have seen — without assuming where it leads
- It invites them somewhere they haven't gone yet, without prescribing the destination`,

      longing: `THIS IS THE LONGING/BREAKTHROUGH QUESTION. They've shared what's happening and what's underneath — now help them name what they actually want.

YOUR GOAL: Help them articulate what they're hoping for, longing for, or need from God in this season. This answer directly shapes what their devotional will address.

APPROACH:
- They've been vulnerable — honor that by asking something that moves toward what THEY want, not what you think they should want
- If they chose a specific study type or theme, connect this question back to it — why did that study feel like the right vehicle for this season?
- Don't be artificially positive, but orient toward what could be different
- Let their answers guide the direction — someone who shared about anger needs a different question than someone who shared about exhaustion

CRITICAL — AVOID LEADING QUESTIONS:
- Do NOT always steer toward peace/freedom/release — some people need direction, conviction, or permission to grieve
- Do NOT ask "what would it feel like to be free from that?" — this assumes freedom is what they want
- Ask what THEY are looking for, not what sounds like a good devotional answer
- Good: "What are you actually hoping happens through this?" / "If this devotional could give you one thing, what would it be?"
- Bad: "What would it look like to finally find peace?" / "How would it feel to just let God carry that?"

WHAT MAKES THIS QUESTION GREAT:
- It helps them discover what they're actually asking for (they might not know yet)
- It connects their struggle to their unique hope — not a generic spiritual outcome
- It gives enough to build a devotional that will genuinely meet them where they are`,
    };

    const adaptiveSystemPrompt = `You generate deeply personal follow-up questions for a Christian devotional app's discovery process. You are NOT adapting a template — you are creating a genuinely new question that emerges naturally from what this specific person has shared.

YOUR ROLE: You're like a wise spiritual director who listens so well that your next question makes the person feel truly heard and helps them discover something about themselves.

${stepInstructions[currentStep] || stepInstructions.depth}

CRITICAL RULES:
- Generate a COMPLETELY ORIGINAL question — do NOT use templates or common phrasings
- The question MUST feel like it could only be asked to THIS person based on what they've shared
- If they chose a study type or theme, make the questions RELEVANT to that choice — don't ignore it
- Pick up the emotional thread of their answers, not the biographical details
- NEVER reference specific biographical details like family roles (dad, mom, husband, wife), job titles, names, or locations — speak only to the emotional current beneath their words
- The question should feel like the natural next beat in a real conversation
- Vary your style: sometimes direct, sometimes metaphorical, sometimes a simple "why"
- Never start with "And" — vary your openings
- NEVER ask questions that suggest their own answer (e.g. "what if you let go?" implies they should let go)
- NEVER steer every conversation toward peace/rest/freedom — people have diverse needs
- Ask questions that could genuinely lead to DIFFERENT answers from different people

SUBTEXT: One short phrase that gives permission and makes it safe to be honest. Should feel different each time — warm, curious, spacious, gentle, or grounding.

RESPOND WITH VALID JSON ONLY: {"question": "...", "subtext": "..."}`;

    const adaptiveUserPrompt = `Here's what this person has shared so far:

${contextStr}

Generate the next question in this conversation. It should feel like it emerges directly from what they just said — not like a generic template.

IMPORTANT: If they chose a specific study type, book, character, or theme, YOUR QUESTION MUST DIRECTLY REFERENCE AND CONNECT TO THAT CHOICE. Do not ignore what they selected. The question should make them feel like you're paying attention to what they picked and are genuinely curious about why.

Make them feel heard. Do NOT ask a question that steers them toward a predetermined answer.`;

    const backendResult = await postJsonWithBackendFallback(
      '/api/generate/adaptive-question',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: adaptiveSystemPrompt,
        messages: [
          {
            role: 'user',
            content: adaptiveUserPrompt,
          },
        ],
      },
      { timeoutMs: 20000 }
    );

    const { response } = backendResult;

    if (!response.ok) {
      return nextQuestionBase;
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      return nextQuestionBase;
    }

    const parsedResult = JSON.parse(content) as { question: string; subtext: string };
    return {
      question: parsedResult.question || nextQuestionBase.question,
      subtext: parsedResult.subtext || nextQuestionBase.subtext,
    };
  } catch {
    return nextQuestionBase;
  }
}
