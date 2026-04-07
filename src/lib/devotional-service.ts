import { DevotionalDay, Devotional, Quote, CrossReference, BibleTranslation, UsedScripture, ThemeCategory, DevotionalType, SeriesPersonaRecord } from './store';
import { logBugEvent, logBugError } from './bug-logger';
import { logger } from '@/lib/logger';
import { reportError } from '@/lib/report-error';
import { checkRateLimit, incrementRateLimit, getTimeUntilReset } from './rate-limit';
import {
  getThemeById,
  getDevotionalTypeById,
  BIBLICAL_CHARACTERS,
  BIBLE_BOOKS_FOR_STUDY,
  BiblicalCharacter,
  BibleBookStudy,
} from '../constants/devotional-types';
import { DEVOTIONAL_PERSONAS, DevotionalPersona } from '../constants/devotional-personas';
import {
  PersonaTrait,
  PERSONA_TRAITS,
  STRUCTURAL_TEMPLATES,
  HOOK_LIBRARY,
  HookStyle,
  TransitionStyle,
  ClosingStyle,
  generateDailyVariety,
  DayConfiguration,
  getTemplateById,
  getRandomHook,
  ALL_TRAITS,
} from '../constants/devotional-personas-v2';
import {
  CRAFT_FOUNDATION,
  ANTI_SLOP_DIRECTIVE,
  CONVICTION_DIRECTIVE,
  RHETORICAL_QUESTION_DIRECTIVE,
  PARABLE_ANTI_PATTERNS,
  DIALOGUE_ANTI_PATTERNS,
  PATTERN_BREAK_DIRECTIVE,
  getCraftInfluencesForTraits,
  getDailyCraftDirective,
  getStoryDirectiveForDay,
  getDialogueDirectiveForDay,
} from '../constants/writing-craft';
import { PERSONA_FULL } from '../constants/persona';
import { buildVoiceAdaptationDirective } from '../constants/voice-adaptation';
import { fetchStoriesForGeneration, formatStoriesForPrompt } from './story-service';

// Re-export for use in components
export { DEVOTIONAL_PERSONAS, DevotionalPersona };

// Centralized backend config + auth headers
import { getBackendCandidates, getAuthHeaders, PRIMARY_BACKEND_URL, sanitizeForPrompt } from '@/lib/api-config';

interface BackendPostOptions {
  timeoutMs?: number;
}

interface BackendPostResult {
  response: Response;
  backendUrl: string;
  usedFallback: boolean;
  attempts: number;
}

export async function postJsonWithBackendFallback(
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
      let response = await fetch(`${backendUrl}${path}`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      // If 401, the Firebase token may be stale — force refresh and retry once
      if (response.status === 401) {
        logger.warn(`[Devotional] 401 from ${backendUrl}; refreshing token and retrying`);
        clearTimeout(timeoutId); // Clear the old timeout
        const retryController = new AbortController();
        const retryTimeoutId = setTimeout(() => retryController.abort(), timeoutMs);
        try {
          response = await fetch(`${backendUrl}${path}`, {
            method: 'POST',
            headers: await getAuthHeaders(true),
            body: JSON.stringify(payload),
            signal: retryController.signal,
          });
        } finally {
          clearTimeout(retryTimeoutId);
        }
      }

      // If this backend fails and we have a fallback endpoint, try it.
      // This specifically guards against stale/misconfigured deployments returning
      // HTML 404 pages for API routes.
      if (!response.ok && hasAnotherCandidate) {
        logger.warn(
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
        logger.warn(
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

// ---------------------------------------------------------------------------
// SCRIPTURE VARIANCE ENGINE
// ---------------------------------------------------------------------------
// The Bible has 66 books across 9 major regions. Most devotional apps
// over-index on Psalms, Romans, John, and a handful of Paul's epistles.
// This engine ensures each user's experience spans the full canon over time.

const BIBLE_CANON_REGIONS: Record<string, { label: string; books: string[] }> = {
  pentateuch: {
    label: 'Pentateuch (Torah)',
    books: ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'],
  },
  historical: {
    label: 'Historical Books',
    books: ['Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther'],
  },
  wisdom: {
    label: 'Wisdom & Poetry',
    books: ['Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon'],
  },
  majorProphets: {
    label: 'Major Prophets',
    books: ['Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel'],
  },
  minorProphets: {
    label: 'Minor Prophets',
    books: ['Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi'],
  },
  gospels: {
    label: 'Gospels & Acts',
    books: ['Matthew', 'Mark', 'Luke', 'John', 'Acts'],
  },
  pauline: {
    label: 'Pauline Epistles',
    books: ['Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon'],
  },
  generalEpistles: {
    label: 'General Epistles',
    books: ['Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude'],
  },
  apocalyptic: {
    label: 'Apocalyptic',
    books: ['Revelation'],
  },
};

/**
 * Analyze a user's scripture history to find overused books, underexplored
 * regions, and generate smart variety directives for the generation prompt.
 */
export function analyzeScriptureVariety(usedScriptures: UsedScripture[]): {
  overusedBooks: string[];
  underexploredRegions: string[];
  suggestedBooks: string[];
  varietyDirective: string;
} {
  if (usedScriptures.length === 0) {
    return {
      overusedBooks: [],
      underexploredRegions: [],
      suggestedBooks: [],
      varietyDirective: '',
    };
  }

  // Count book usage
  const bookCounts: Record<string, number> = {};
  for (const s of usedScriptures) {
    const book = s.book;
    bookCounts[book] = (bookCounts[book] || 0) + 1;
  }

  // Find overused books (used 3+ times — they've been explored enough recently)
  const totalReferences = usedScriptures.length;
  const overusedBooks = Object.entries(bookCounts)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([book]) => book);

  // Find which regions are covered vs. missing
  const usedBooks = new Set(Object.keys(bookCounts));
  const regionCoverage: Record<string, { total: number; used: number }> = {};
  const underexploredRegions: string[] = [];
  const suggestedBooks: string[] = [];

  for (const [regionKey, region] of Object.entries(BIBLE_CANON_REGIONS)) {
    const used = region.books.filter((b) => usedBooks.has(b)).length;
    regionCoverage[regionKey] = { total: region.books.length, used };

    // Region is underexplored if less than 25% of its books have been used
    if (used / region.books.length < 0.25) {
      underexploredRegions.push(region.label);
      // Suggest 2-3 specific books from underexplored regions
      const unused = region.books.filter((b) => !usedBooks.has(b));
      const picks = unused.sort(() => Math.random() - 0.5).slice(0, 2);
      suggestedBooks.push(...picks);
    }
  }

  // Build the directive
  const parts: string[] = [];

  parts.push(`SCRIPTURE VARIETY & CANON BREADTH (IMPORTANT):
The goal is to help the reader encounter the FULL breadth of Scripture over time — familiar favorites AND hidden gems. Every book of the Bible has something to teach.`);

  if (overusedBooks.length > 0) {
    parts.push(`\nBooks this reader has seen heavily in recent devotionals: ${overusedBooks.join(', ')}.
These are great books — but for THIS series, lean toward passages from OTHER books to keep their experience fresh. You can still reference these in cross-references, just don't make them the primary scripture for most days.`);
  }

  if (underexploredRegions.length > 0) {
    parts.push(`\nRegions of the Bible this reader has NOT explored much yet: ${underexploredRegions.join(', ')}.
Try to include at least 1-2 primary passages from these regions. Great options: ${suggestedBooks.join(', ')}.`);
  }

  parts.push(`\nSCRIPTURE SELECTION PRINCIPLES:
- Mix well-known passages with lesser-studied ones. A devotional on hope doesn't always need Romans 8 — try Lamentations 3, Habakkuk 3, or Zephaniah 3:17.
- For a ${totalReferences > 50 ? 'long-term' : 'newer'} reader: ${totalReferences > 50 ? 'prioritize depth over familiarity — they know the greatest hits' : 'balance familiar anchors with fresh discoveries'}.
- Draw from at least 3 different regions of the Bible across this series.
- The Minor Prophets, wisdom literature (Ecclesiastes, Song of Solomon), and narrative books (Ruth, Esther, Nehemiah, Judges) are gold mines most devotional apps ignore.
- Don't shy away from difficult or surprising texts — Job's complaints, Ecclesiastes's skepticism, Lamentations's grief, Habakkuk's questions. Real faith includes wrestling.`);

  // List previously used references (compact) so the model can simply avoid exact duplicates
  if (usedScriptures.length > 0) {
    const recentRefs = usedScriptures
      .slice(0, 80)
      .map((s) => s.reference);
    // Deduplicate
    const uniqueRefs = [...new Set(recentRefs)];
    parts.push(`\nPreviously used references (avoid exact duplicates as primary scripture, but feel free to reference in cross-references):
${uniqueRefs.slice(0, 60).join(', ')}`);
  }

  return {
    overusedBooks,
    underexploredRegions,
    suggestedBooks,
    varietyDirective: parts.join('\n'),
  };
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

export interface GenerationContext {
  name: string;
  aboutMe: string;
  currentSituation: string;
  emotionalState: string;
  faithImpact: string;
  spiritualSeeking: string;
  readingDuration: 5 | 15 | 30;
  devotionalLength: 3 | 7 | 14 | 30;
  bibleTranslation: BibleTranslation;
  previouslyUsedScriptures?: string[]; // References to avoid repeating (legacy)
  usedScriptureHistory?: UsedScripture[]; // Full scripture objects for variance analysis
  // Theme and type
  themeCategory?: ThemeCategory;
  devotionalType?: DevotionalType;
  studySubject?: string; // For book/character studies
  // Writing persona preference (v1 — kept for backward compat)
  personaTraits?: string;
  // Writing style from user preferences
  writingStyle?: { tone: 'warm' | 'direct' | 'poetic'; depth: 'simple' | 'balanced' | 'theological'; faithBackground: 'new' | 'growing' | 'mature'; lifeStage?: 'student' | 'building' | 'midlife' | 'reflective' };
  // Cross-series freshness history
  seriesPersonaHistory?: SeriesPersonaRecord[];
  // Previously generated series titles — used to prevent repetitive titles across series
  previousSeriesTitles?: string[];
}

interface GeneratedDevotional {
  title: string;
  days: DevotionalDay[];
}

// ==========================================
// V2 PERSONA MAPPING & FRESHNESS ENGINE
// ==========================================

// Map user's WritingStylePreferences to v2 PersonaTrait pair
function mapWritingStyleToTraits(
  writingStyle?: GenerationContext['writingStyle']
): { primary: PersonaTrait; secondary: PersonaTrait } {
  if (!writingStyle) return { primary: 'gentle', secondary: 'narrative' };

  // Map tone → primary trait
  const toneMap: Record<string, PersonaTrait> = {
    warm: 'gentle',
    direct: 'challenging',
    poetic: 'poetic',
  };
  const primary = toneMap[writingStyle.tone] ?? 'gentle';

  // Map depth → secondary trait (avoiding collision with primary)
  const depthMap: Record<string, PersonaTrait> = {
    simple: 'narrative',
    balanced: 'gentle',
    theological: 'scholarly',
  };
  let secondary = depthMap[writingStyle.depth] ?? 'narrative';

  // Avoid primary == secondary collision
  if (secondary === primary) {
    const fallbacks: Record<PersonaTrait, PersonaTrait> = {
      gentle: 'narrative',
      challenging: 'scholarly',
      poetic: 'narrative',
      scholarly: 'poetic',
      narrative: 'gentle',
      raw: 'narrative',
      warm: 'gentle',
      prophetic: 'pastoral',
      mystical: 'poetic',
      pastoral: 'gentle',
      witty: 'scholarly',
      urgent: 'challenging',
      confessional: 'narrative',
      practical: 'warm',
      liturgical: 'mystical',
      apophatic: 'mystical',
      monastic: 'liturgical',
      prophetic_lament: 'raw',
      doxological: 'poetic',
      socratic: 'scholarly',
      midwife: 'gentle',
      iconoclast: 'challenging',
      elder: 'warm',
      pilgrim: 'narrative',
      artisan: 'practical',
      comic: 'warm',
      intercessor: 'pastoral',
    };
    secondary = fallbacks[primary];
  }

  return { primary, secondary };
}

// Select a fresh persona combo that differs from recent history
function selectFreshPersonaCombo(
  baseTraits: { primary: PersonaTrait; secondary: PersonaTrait },
  history: SeriesPersonaRecord[] = []
): { primary: PersonaTrait; secondary: PersonaTrait; templateSeed: number } {
  if (history.length === 0) {
    return { ...baseTraits, templateSeed: 0 };
  }

  let { primary, secondary } = baseTraits;

  // Check consecutive usage of primary trait
  const recentPrimaries = history.slice(0, 3).map((h) => h.primaryTrait as PersonaTrait);
  const primaryUsedConsecutively = recentPrimaries.filter((t) => t === primary).length >= 2;

  if (primaryUsedConsecutively) {
    // Swap primary/secondary for variety
    [primary, secondary] = [secondary, primary];
  }

  // Ensure secondary differs from last series' secondary
  const lastRecord = history[0];
  if (lastRecord && secondary === (lastRecord.secondaryTrait as PersonaTrait)) {
    const alternatives = ALL_TRAITS.filter((t) => t !== primary && t !== secondary);
    if (alternatives.length > 0) {
      secondary = alternatives[Math.floor(Math.random() * alternatives.length)];
    }
  }

  // Offset template rotation seed from last series
  const lastSeed = lastRecord?.templateSeed ?? 0;
  const templateSeed = (lastSeed + 3) % STRUCTURAL_TEMPLATES.length;

  return { primary, secondary, templateSeed };
}

// Build per-day variety instructions for the user prompt
function buildVarietySchedule(
  startDay: number,
  endDay: number,
  totalDays: number,
  primaryTrait: PersonaTrait,
  secondaryTrait: PersonaTrait,
  templateSeed: number,
  readingDuration?: 5 | 15 | 30,
  faithBackground?: 'new' | 'growing' | 'mature'
): string {
  const configs = generateDailyVariety(totalDays, [primaryTrait, secondaryTrait]);

  // Apply template seed offset
  const templates = STRUCTURAL_TEMPLATES;
  const hooks = Object.keys(HOOK_LIBRARY) as HookStyle[];
  const transitions: TransitionStyle[] = ['gradual', 'pivot', 'mysterious', 'logical', 'narrative'];
  const closings: ClosingStyle[] = ['question', 'blessing', 'invitation', 'warning', 'reflection', 'doxology'];

  // Map reading duration for story system
  const durationKey = readingDuration === 5 ? '5min' : readingDuration === 30 ? '30min' : '15min';

  const dayInstructions: string[] = [];

  for (let day = startDay; day <= endDay; day++) {
    const idx = day - 1; // 0-indexed
    const templateIdx = (idx + templateSeed) % templates.length;
    const hookIdx = (idx + templateSeed) % hooks.length;
    const transitionIdx = (idx + templateSeed) % transitions.length;
    const closingIdx = (idx + templateSeed) % closings.length;

    const template = templates[templateIdx];
    const hook = hooks[hookIdx];
    const transition = transitions[transitionIdx];
    const closing = closings[closingIdx];

    // Voice intensity varies by day position in series
    const voiceNote = idx === 0
      ? `Lead with ${primaryTrait} voice`
      : idx % 3 === 0
        ? `Lean into ${secondaryTrait} influence`
        : `Primary ${primaryTrait}, hint of ${secondaryTrait}`;

    const hookExamples = HOOK_LIBRARY[hook].slice(0, 2).join('" or "');

    const craftDirective = getDailyCraftDirective(day);

    // Story directive for this day (may be null on "no story" days)
    const storyDirective = getStoryDirectiveForDay(day, durationKey, faithBackground ?? 'growing');
    // Dialogue directive — never overlaps with story days
    const dialogueDirective = getDialogueDirectiveForDay(day, durationKey, faithBackground ?? 'growing', !!storyDirective);

    let dayInstruction =
      `Day ${day}: ${template.name} structure (${template.elements.join(' → ')}). ` +
      `${voiceNote}. ` +
      `Open with a ${hook} hook (e.g., "${hookExamples}"). ` +
      `Use ${transition} transitions. ` +
      `Close with ${closing} style.\n` +
      `CRAFT: ${craftDirective.directive}`;

    if (storyDirective) {
      dayInstruction += `\n${storyDirective}`;
    } else if (dialogueDirective) {
      dayInstruction += `\n${dialogueDirective}`;
    }

    dayInstructions.push(dayInstruction);
  }

  return `\nPER-DAY VARIETY (each day should feel distinct):\n${dayInstructions.join('\n')}\n`;
}

// Build a lightweight v2 voice overlay for the system prompt
export function buildV2VoiceOverlay(
  primary: PersonaTrait,
  secondary: PersonaTrait
): string {
  const p = PERSONA_TRAITS[primary];
  const s = PERSONA_TRAITS[secondary];

  const craftInfluences = getCraftInfluencesForTraits(primary, secondary);

  return `

VOICE PROFILE:
Primary voice: ${p.voice}
Sentence rhythm: ${p.sentenceStyle}
${p.systemPromptAdditions.map((a) => `- ${a}`).join('\n')}

Secondary influence (${secondary}): ${s.voice}
${s.systemPromptAdditions.slice(0, 2).map((a) => `- ${a}`).join('\n')}
${craftInfluences}
`;
}

// Full system prompt for first attempt — rich personalization
const SYSTEM_PROMPT_FULL = `${PERSONA_FULL}

DEVOTIONAL-SPECIFIC CRAFT:
- Write as if composing something worth reading twice. Each sentence should carry weight.
- Vary openings dramatically — never start consecutive days the same way. Some days begin mid-thought, others with a question, others with an image, others with Scripture itself.
- Trust silence. Not every sentence needs to explain. Let truth sit without commentary.
- The reader's name should appear sparingly — roughly once every 5 days, never at the beginning of a day. Bury it mid-sentence at a moment of encouragement.

THE SHOW-DON'T-TELL PRINCIPLE:
The reader has shared context about their life. Use this to INFORM your writing, not to NARRATE it.
- WRONG: "As a father who works in ministry and design, you understand the tension between calling and responsibility."
- RIGHT: Write about vocation, creativity, or stewardship in ways that will resonate — let them make the connection.
- Never spell out their identity, roles, or circumstances. They know who they are.

The devotional should feel like it was written for any thoughtful Christian — but happens to land well for THIS person because you've chosen themes, scriptures, and angles that speak to their situation without announcing it.

ADDITIONAL ANTI-PATTERNS:
- No rhetorical questions followed immediately by their answers
- No lists of application points
- No "Friend, ..." or pet names
- No manufactured urgency or false intimacy
- No narrating the reader's life back to them
- The Rule of Three: do NOT structure every insight as three parallel items. Vary.

SCRIPTURE HANDLING:
- Let Scripture do the heavy lifting. Quote it fully, then sit with it.
- Sometimes the best commentary is simply placing the text next to the reader's situation and letting the resonance speak.
- Weave 2-3 cross-references naturally, not as proof-texts but as echoes.

SCRIPTURE SELECTION — CANON BREADTH:
- Draw from the FULL breadth of the Bible. Don't default to the "greatest hits" (Psalm 23, Romans 8, John 3, Philippians 4).
- Every series should touch at least 3 different regions: OT narrative, prophets, wisdom literature, gospels, epistles.
- Mine hidden gems: Minor Prophets (Habakkuk, Micah, Zephaniah), wisdom lit (Ecclesiastes, Song of Solomon), OT narrative (Ruth, Esther, Nehemiah, Joseph in Genesis 50).
- Connect unexpected books — pair a Psalm with Habakkuk, link Paul with Ecclesiastes.
- Difficult/surprising texts welcome: Job's complaints, Lamentations's grief, Ecclesiastes's skepticism. Real faith includes hard questions.

STRUCTURE:
- Begin in varied ways — sometimes with Scripture, sometimes with an image, sometimes mid-thought
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
- NEVER write in first person ("I", "I've", "my", "me", "we", "our"). You have no personal experiences. Use second person for the reader, third person for all stories and examples.

WHAT MAKES WRITING RESONATE:
- Direct address using "you."
- Restraint. Say less than you want to.
- Surprise. Place an unexpected word where a cliché would go.
- Rhythm. Alternate between long and short sentences.
- Grounded imagery rather than abstract concepts.

SCRIPTURE HANDLING:
- Let Scripture do the heavy lifting. Quote it fully, then sit with it.
- Weave 2-3 cross-references naturally.
- Draw from the full Bible — not just Psalms, Romans, and John. Include lesser-known books (Minor Prophets, Ruth, Ecclesiastes, Nehemiah, Habakkuk) alongside familiar ones.

STRUCTURE:
- Begin in varied ways—sometimes with Scripture, sometimes with an image, sometimes mid-thought.
- End with invitation, not instruction.

IMPORTANT: Respond with valid JSON only. No markdown, no code blocks.`;

// Minimal system prompt for last-resort retry — purely functional, no personalization
const SYSTEM_PROMPT_MINIMAL = `You are a Christian devotional writer. Write thoughtful, scripture-based daily devotionals with literary quality and theological depth.

STYLE:
- Use second person ("you") throughout.
- NEVER write in first person ("I", "I've", "my", "me"). Use third person for stories and examples.
- Avoid clichés and generic spiritual language.
- Let Scripture speak for itself. Quote passages fully.
- Vary openings across days.
- End each day with invitation, not instruction.

IMPORTANT: Respond with valid JSON only. No markdown, no code blocks.`;

// Get system prompt based on retry level
export function getSystemPrompt(retryLevel: number): string {
  if (retryLevel === 0) return SYSTEM_PROMPT_FULL;
  if (retryLevel === 1) return SYSTEM_PROMPT_SOFT;
  return SYSTEM_PROMPT_MINIMAL;
}

// Get persona-specific system prompt addition
function getPersonaSystemPrompt(personaTraits?: string): string {
  if (!personaTraits) return '';
  
  const persona = DEVOTIONAL_PERSONAS[personaTraits as DevotionalPersona];
  if (!persona) return '';
  
  return `

YOUR WRITING PERSONA: ${persona.name}
${persona.description}

TONE: ${persona.tone}

SENTENCE STYLE: ${persona.sentenceStyle}

KEY PHRASES TO WEAVE IN NATURALLY: ${persona.keyPhrases.join(', ')}

OPENING HOOKS (vary these): ${persona.openingHooks.join(' | ')}

TRANSITIONAL PHRASES: ${persona.transitionalPhrases.join(' | ')}

CLOSING TECHNIQUES: ${persona.closingTechniques.join(' | ')}

SCRIPTURE INTEGRATION: ${persona.scriptureIntegration}

${persona.systemPrompt}`;
}

// Add Peter Enns-inspired conversational depth to all voices
export const PETER_ENNS_ADDITION = `

CONVERSATIONAL DEPTH (Peter Enns-inspired):
- Write like you're talking to a friend who can handle complexity
- Short, punchy sentences that land hard
- One-sentence paragraphs for emphasis — these are your "sticky sentences"
- Theological depth without academic jargon
- The reader should nod and think "I've never heard it put that way before"
- Example sticky sentences: "God isn't looking for believers. He's looking for partners." / "The Bible isn't a book of answers. It's a record of people asking better questions."`;

// Sticky sentence instruction for shareable moments - use when the devotional calls for it
export const STICKY_SENTENCE_INSTRUCTION = `

STICKY SENTENCES: When natural, include ONE standalone sentence as its own paragraph — under 15 words, contains a surprise or reversal, quotable. Not every day needs one.`;

const getReadingLengthGuidance = (duration: 5 | 15 | 30): string => {
  switch (duration) {
    case 5:
      return `5-MINUTE DEVOTIONAL FORMAT:
- Scripture: One focused passage (4-6 verses)
- Body text: 250-350 words of reflection
- Include 1 brief quote from a theologian, author, or church father that illuminates the theme
- End with 1 reflection question (see below)
- If a story/analogy is included: keep it to 40-60 words max (a brief analogy, not a full narrative)
- Total reading time: ~5 minutes
${REFLECTION_QUESTION_CRAFT}`;
    case 15:
      return `15-MINUTE DEVOTIONAL FORMAT:
- Primary Scripture: A substantial passage (6-10 verses)
- Secondary Scripture: 1-2 cross-reference passages woven into the reflection (include full text, 2-4 verses each)
- Body text: 600-800 words of rich, layered reflection
- Include 2-3 quotes from theologians, authors, poets, or church fathers (e.g., C.S. Lewis, Augustine, Dietrich Bonhoeffer, A.W. Tozer, Julian of Norwich, Frederick Buechner, Brennan Manning, etc.) that deepen the meditation
- End with 2-3 reflection questions (see REFLECTION QUESTION CRAFT below)
- Consider including a brief historical or cultural context note where it enriches understanding
- If a story/parable is included: 80-150 words — a developed scene or anecdote, not a sprawling narrative
- Total reading time: ~10-12 minutes, leaving 3-5 minutes for journaling/reflection
${REFLECTION_QUESTION_CRAFT}`;
    case 30:
      return `30-MINUTE DEVOTIONAL FORMAT:
- Primary Scripture: A meaningful passage (6-10 verses)
- Secondary Scripture: 1-2 cross-reference passages woven in (include full text, 2-4 verses each)
- Body text: 800-1000 words of deep, contemplative reflection
- Include 2-3 quotes from theologians, mystics, or authors (C.S. Lewis, Henri Nouwen, Thomas Merton, A.W. Tozer, etc.)
- Include brief historical or cultural context where it enriches understanding
- End with 3-4 reflection questions that progressively deepen (see REFLECTION QUESTION CRAFT below)
- Include a brief closing prayer or benediction written in FIRST PERSON (I/me/my). The reader will pray this aloud — never use their name or third person in the prayer
- If a story/parable is included: 150-250 words — a substantial narrative with specific details and sensory grounding
- Total reading time: ~20 minutes, leaving 10 minutes for journaling/reflection
${REFLECTION_QUESTION_CRAFT}`;
  }
};

const REFLECTION_QUESTION_CRAFT = `
REFLECTION QUESTION CRAFT:
Questions must be specific to today's scripture and make the reader pause. Under 20 words ideal.

BANNED PATTERNS: "What would it feel like to...", "What would it look like if you...", "How might God be inviting you to..."

GOOD EXAMPLES: "What are you pretending is fine?", "Name one thing you're afraid to ask God for.", "If you dropped the performance — what would be left?"

RULES: Never start two consecutive questions the same way. Mix types (What/When/Where/Who/If). Questions escalate: surface → personal → vulnerable.`;

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

  // Common fields for midday check-in and evening wind-down
  const checkInFields = `,
      "checkInQuestion": "A midday reflection question tied to today's theme (15 words max)...",
      "checkInChips": ["Chip answer 1", "Chip answer 2", "Chip answer 3"],
      "eveningScriptureRef": "A calming Psalm or passage for evening reading, e.g. Psalm 4:8"`;

  if (duration === 5) {
    return baseSchema + `,
      "quotes": [{"text": "Quote text...", "author": "Author Name"}],
      "reflectionQuestions": ["One question to carry with them..."]${checkInFields}
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
      "contextNote": "Optional historical or cultural context..."${checkInFields}
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
      "closingPrayer": "A first-person prayer (I/me/my) — never use the reader's name"${checkInFields}
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
  retryLevel: number,
  varietySchedule: string = ''
): string {
  const daysToGenerate = endDay - startDay + 1;
  const isFirstBatch = startDay === 1;

  // Build previous series titles avoidance block
  const previousSeriesTitlesBlock = isFirstBatch && context.previousSeriesTitles && context.previousSeriesTitles.length > 0
    ? `\n   PREVIOUSLY USED SERIES TITLES (do NOT reuse these titles or their themes/metaphors — find fresh, surprising angles):
${context.previousSeriesTitles.map(t => `   - "${t}"`).join('\n')}`
    : '';

  const titleInstruction = isFirstBatch
    ? `1. An evocative, poetic title for the whole series (3-6 words)
   TITLE REQUIREMENTS:
   - Vary structure across different devotionals: noun phrases ("The Quiet Work"), imperatives ("Hold Fast"), single evocative words with modifier ("Unshaken"), metaphorical images ("Salt & Light"), questions without question marks ("Where Mercy Lives"), fragments ("Before the Dawn"), or occasional "When" phrases ("When the Ground Shifts")
   - Make it surprising, not generic—avoid clichés like "Finding Peace" or "A Journey Through"
   - Each title should feel like it could be a book you'd want to pick up
   BANNED TITLE PATTERNS (never use these overused structures):
   - "The [Weight/Burden/Thing] You [Carry/Hold/Bear]"
   - "What You've Been [Carrying/Holding/Bearing/Searching]"
   - "The [Ground/Path/Road] [Beneath/Before/Ahead]"
   - "[Bread/Water/Light] for the [Morning/Journey/Road]"
   - "Learning to [Trust/Let Go/Breathe/Rest]"
   - Avoid body/weight/carrying metaphors unless the theme specifically calls for it
   - Avoid generic journey/path/road metaphors — find unexpected imagery instead${previousSeriesTitlesBlock}`
    : `1. Use this exact series title: "${seriesTitle}"`;

  const previousTitlesNote = previousDayTitles.length > 0
    ? `\n\nPREVIOUS DAY TITLES (do NOT repeat these or start with the same words):
${previousDayTitles.map((t, i) => `Day ${i + 1}: "${t}"`).join('\n')}`
    : '';

  // Build scripture variety directive using the variance engine
  const scriptureVariety = context.usedScriptureHistory && context.usedScriptureHistory.length > 0
    ? analyzeScriptureVariety(context.usedScriptureHistory)
    : context.previouslyUsedScriptures && context.previouslyUsedScriptures.length > 0
      // Legacy fallback: convert string refs to minimal UsedScripture objects
      ? analyzeScriptureVariety(context.previouslyUsedScriptures.map((ref) => ({
          reference: ref,
          book: extractBookFromReference(ref),
          usedAt: new Date().toISOString(),
          devotionalId: 'unknown',
        })))
      : null;
  const scriptureAvoidanceNote = scriptureVariety
    ? `\n\n${scriptureVariety.varietyDirective}`
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
${varietySchedule}
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
How this is showing up in their faith: ${context.faithImpact}
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
${varietySchedule}
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

// Resolve persona traits for the generation — combines user prefs + freshness engine
export function resolvePersonaForGeneration(context: GenerationContext): {
  primary: PersonaTrait;
  secondary: PersonaTrait;
  templateSeed: number;
} {
  const baseTraits = mapWritingStyleToTraits(context.writingStyle);
  return selectFreshPersonaCombo(baseTraits, context.seriesPersonaHistory);
}

// Generate a single batch of days
async function generateBatch(
  context: GenerationContext,
  startDay: number,
  endDay: number,
  seriesTitle: string | null,
  previousDayTitles: string[],
  retryLevel: number = 0,
  resolvedPersona?: { primary: PersonaTrait; secondary: PersonaTrait; templateSeed: number }
): Promise<{ title: string; days: DevotionalDay[] }> {
  const baseSystemPrompt = getSystemPrompt(retryLevel);
  // V2: Use composable voice overlay instead of dead v1 persona system
  const persona = resolvedPersona ?? resolvePersonaForGeneration(context);
  // Craft engine layers degrade gracefully on retry:
  // retryLevel 0: full craft (foundation + persona influences + daily directives)
  // retryLevel 1: foundation only (drop persona influences and daily directives)
  // retryLevel 2: no craft additions (minimal prompt)
  const craftFoundation = retryLevel <= 1 ? CRAFT_FOUNDATION : '';
  const antiSlop = retryLevel <= 1 ? ANTI_SLOP_DIRECTIVE : '';
  // Conviction directive only on days 3 through ~70% of the series (where conviction placement lives)
  const isConvictionDay = startDay >= 3 && startDay <= Math.min(endDay, Math.ceil(context.devotionalLength * 0.7));
  const convictionDirective = retryLevel <= 1 && isConvictionDay ? CONVICTION_DIRECTIVE : '';
  // Parable guardrails only when batch contains a story day
  const durationKey = context.readingDuration === 5 ? '5min' as const : context.readingDuration === 30 ? '30min' as const : '15min' as const;
  const faithBackground = context.writingStyle?.faithBackground ?? 'growing';
  const anyStoryDay = Array.from({length: endDay - startDay + 1}, (_, i) => startDay + i)
    .some(day => getStoryDirectiveForDay(day, durationKey, faithBackground) !== null);
  const parableGuardrails = retryLevel <= 1 && anyStoryDay ? PARABLE_ANTI_PATTERNS : '';
  // Dialogue guardrails only when batch contains a dialogue day
  const anyDialogueDay = Array.from({length: endDay - startDay + 1}, (_, i) => startDay + i)
    .some(day => {
      const hasStory = getStoryDirectiveForDay(day, durationKey, faithBackground) !== null;
      return getDialogueDirectiveForDay(day, durationKey, faithBackground, hasStory) !== null;
    });
  const dialogueGuardrails = retryLevel <= 1 && anyDialogueDay ? DIALOGUE_ANTI_PATTERNS : '';
  // Pattern breaks for 15+ min readings — keeps engagement high through longer content
  const patternBreaks = retryLevel <= 1 && (context.readingDuration ?? 5) >= 15 ? PATTERN_BREAK_DIRECTIVE : '';
  const voiceOverlay = retryLevel === 0 ? buildV2VoiceOverlay(persona.primary, persona.secondary) : '';
  const voiceAdaptation = retryLevel === 0
    ? buildVoiceAdaptationDirective(
        context.writingStyle?.lifeStage,
        context.writingStyle?.faithBackground,
        context.writingStyle?.depth
      )
    : '';
  const rhetoricalQuestions = retryLevel <= 1 ? RHETORICAL_QUESTION_DIRECTIVE : '';
  const systemPrompt = baseSystemPrompt + PETER_ENNS_ADDITION + craftFoundation + antiSlop + rhetoricalQuestions + convictionDirective + parableGuardrails + dialogueGuardrails + patternBreaks + voiceOverlay + voiceAdaptation + STICKY_SENTENCE_INSTRUCTION;
  // V2: Include per-day variety schedule (with craft directives + story system) in the user prompt
  const varietySchedule = retryLevel === 0
    ? buildVarietySchedule(startDay, endDay, context.devotionalLength, persona.primary, persona.secondary, persona.templateSeed, context.readingDuration, context.writingStyle?.faithBackground)
    : '';
  // Fetch real stories from the API for story days in this batch
  let storiesBlock = '';
  if (retryLevel === 0 && anyStoryDay) {
    const searchThemes: string[] = [];
    if (context.themeCategory) searchThemes.push(context.themeCategory);
    if (context.currentSituation) {
      const words = context.currentSituation.toLowerCase().split(/\s+/)
        .filter(w => w.length > 3 && !['this', 'that', 'with', 'from', 'into', 'about', 'their', 'them', 'they', 'have', 'been', 'will', 'your', 'more', 'what', 'when', 'than'].includes(w));
      searchThemes.push(...words.slice(0, 3));
    }
    const uniqueThemes = [...new Set(searchThemes)];
    if (uniqueThemes.length > 0) {
      try {
        const stories = await fetchStoriesForGeneration(uniqueThemes, {
          limit: 5,
          spinnable: true,
        });
        storiesBlock = formatStoriesForPrompt(stories);
        if (storiesBlock) {
          logger.log(`[Devotional] Batch: fetched ${stories.length} stories for themes [${uniqueThemes.join(', ')}]`);
        }
      } catch {
        logger.warn('[Devotional] Batch story fetch failed, continuing without');
      }
    }
  }

  const userPrompt = buildUserPrompt(context, startDay, endDay, seriesTitle, previousDayTitles, retryLevel, varietySchedule)
    + (storiesBlock ? `\n\n${storiesBlock}` : '');

  // Sonnet 4.6 for core devotional generation — quality is the product
  const model = 'claude-sonnet-4-6';
  const timeoutMs = 180000; // 3 min timeout for all days

  // Scale max_tokens based on batch size and reading duration to prevent truncation
  const daysInBatch = endDay - startDay + 1;
  const tokensPerDay = context.readingDuration === 30 ? 5000
    : context.readingDuration === 15 ? 3000
    : 2000;
  const estimatedTokens = daysInBatch * tokensPerDay + 2000; // +2000 for JSON overhead + series title
  const maxTokens = Math.min(Math.max(estimatedTokens, 8000), 32000); // floor 8k, cap 32k

  logger.log(`[Devotional] generateBatch days ${startDay}-${endDay}, retryLevel=${retryLevel}, model=${model}, maxTokens=${maxTokens}, systemPrompt=${systemPrompt.length}chars, userPrompt=${userPrompt.length}chars`);
  void logBugEvent('devotional-service', 'batch-request-started', {
    startDay,
    endDay,
    retryLevel,
    model,
    maxTokens,
  });

  let response: Response;
  let backendUrlUsed = PRIMARY_BACKEND_URL;
  try {
    logger.log(`[Devotional] Sending request to backend for days ${startDay}-${endDay} with model ${model}...`);

    const backendResult = await postJsonWithBackendFallback(
      '/api/generate/devotional',
      {
        model,
        max_tokens: maxTokens,
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

    logger.log(
      `[Devotional] Got response: status=${response.status} for days ${startDay}-${endDay} (backend: ${backendUrlUsed})`
    );
  } catch (fetchError) {
    const fetchMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);

    if (fetchMessage.toLowerCase().includes('timed out')) {
      logger.log(`[Devotional] Request timed out after ${timeoutMs / 1000} seconds`);
      void logBugEvent('devotional-service', 'batch-request-timeout', {
        startDay,
        endDay,
        timeoutMs,
      }, 'warn');
      throw new Error('The request took too long. Please try again — it usually works on the second attempt.');
    }

    logger.log('[Devotional] Fetch error:', fetchMessage);
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
      logger.log('[Devotional] Content filter triggered, will retry with simplified context...');
      throw new Error('CONTENT_FILTER_ERROR');
    }

    // Mark transient upstream/server errors so retry logic can handle them.
    if (response.status === 500 || response.status === 502 || response.status === 503 || response.status === 504) {
      logger.log('[Devotional] Service temporarily unavailable:', response.status);
      throw new Error('TRANSIENT_UPSTREAM_ERROR');
    }

    logger.error('API Error Response:', response.status, errorText);

    if (response.status === 401) {
      throw new Error('API key is invalid or expired. Please contact support.');
    } else if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please wait a moment and try again.');
    }

    throw new Error(`API request failed: ${response.status}`);
  }

  // Read raw text first so we can debug if JSON parsing fails
  const rawResponseText = await response.text();
  logger.log(`[Devotional] Raw response length: ${rawResponseText.length} chars`);

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawResponseText) as Record<string, unknown>;
  } catch (jsonErr) {
    logger.error('[Devotional] response JSON parse failed. First 500 chars:', rawResponseText.substring(0, 500));
    logger.error('[Devotional] Last 200 chars:', rawResponseText.substring(rawResponseText.length - 200));
    throw new Error('Backend response was not valid JSON');
  }

  // Check if the LLM output was truncated
  const stopReason = (data as Record<string, unknown>).stop_reason;
  if (stopReason === 'max_tokens') {
    logger.warn(`[Devotional] Output was truncated (stop_reason: max_tokens, maxTokens=${maxTokens}, daysInBatch=${daysInBatch}). Will retry with adjustments...`);
    throw new Error('OUTPUT_TRUNCATED');
  }

  // If the backend returned a top-level error field despite 200 OK, treat as error
  if ('error' in data && data.error) {
    logger.error('[Devotional] Backend returned 200 with error field:', data.error);
    throw new Error(`Backend error: ${typeof data.error === 'string' ? data.error : JSON.stringify(data.error)}`);
  }

  const content = (data as { content?: { text?: string }[] }).content?.[0]?.text;

  if (typeof content !== 'string' || content.length === 0) {
    logger.error('[Devotional] No content in response. Data keys:', Object.keys(data));
    throw new Error('No content in response');
  }

  logger.log(`[Devotional] Response content length: ${content.length} chars, stop_reason: ${stopReason}`);

  // Parse the JSON response
  let parsed: GeneratedDevotional;
  try {
    parsed = JSON.parse(content) as GeneratedDevotional;
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error('[Devotional] Failed to parse JSON. Raw content (first 500 chars):', content.substring(0, 500));
      throw new Error('Could not parse response as JSON');
    }
    const cleanedJson = jsonMatch[0]
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']');
    try {
      parsed = JSON.parse(cleanedJson) as GeneratedDevotional;
    } catch (innerErr) {
      logger.error('[Devotional] Second JSON parse also failed. Cleaned JSON (last 200 chars):', cleanedJson.substring(cleanedJson.length - 200));
      logger.error('[Devotional] Cleaned JSON length:', cleanedJson.length, 'Original content length:', content.length);
      // Treat unparseable JSON as truncation — triggers batch splitting on retry
      throw new Error('OUTPUT_TRUNCATED');
    }
  }

  // Validate we got all expected days — missing days means output was likely truncated
  const expectedDays = endDay - startDay + 1;
  if (!parsed.days || parsed.days.length < expectedDays) {
    logger.warn(`[Devotional] Expected ${expectedDays} days but got ${parsed.days?.length ?? 0}. Treating as truncated output.`);
    throw new Error('OUTPUT_TRUNCATED');
  }

  // Ensure day numbers are correct
  parsed.days = parsed.days.map((day, index) => ({
    ...day,
    dayNumber: startDay + index,
    isRead: false,
  }));

  return parsed;
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
  maxRetries: number = 3,
  resolvedPersona?: { primary: PersonaTrait; secondary: PersonaTrait; templateSeed: number }
): Promise<{ title: string; days: DevotionalDay[] }> {
  let lastError: Error | null = null;
  const daysInBatch = endDay - startDay + 1;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // On first attempt, pre-sanitize context to reasonable lengths
      const contextToUse = {
        ...context,
        name: sanitizeForPrompt(context.name, 50),
        aboutMe: sanitizeForPrompt(context.aboutMe, 300),
        currentSituation: sanitizeForPrompt(context.currentSituation, 300),
        emotionalState: sanitizeForPrompt(context.emotionalState, 200),
        spiritualSeeking: sanitizeForPrompt(context.spiritualSeeking, 200),
      };

      // retryLevel controls both system prompt and user prompt complexity
      const retryLevel = attempt;

      logger.log(`[Devotional] Attempt ${attempt + 1}/${maxRetries + 1}, retryLevel=${retryLevel}`);

      return await generateBatch(
        contextToUse,
        startDay,
        endDay,
        seriesTitle,
        previousDayTitles,
        retryLevel,
        resolvedPersona
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // OUTPUT_TRUNCATED: batch is too large for the token budget.
      // Split it into smaller sub-batches and generate each separately.
      if (lastError.message === 'OUTPUT_TRUNCATED' && daysInBatch > 1) {
        logger.log(`[Devotional] Output truncated for ${daysInBatch}-day batch (days ${startDay}-${endDay}). Splitting into sub-batches...`);
        void logBugEvent('devotional-service', 'batch-split-on-truncation', {
          startDay, endDay, daysInBatch, attempt,
        }, 'warn');

        const midDay = startDay + Math.floor(daysInBatch / 2);
        const firstHalf = await generateBatchWithRetry(
          context, startDay, midDay - 1, seriesTitle, previousDayTitles, maxRetries, resolvedPersona
        );
        // Use the series title from the first half for the second half
        const updatedTitles = [...previousDayTitles, ...firstHalf.days.map(d => d.title)];
        const secondHalf = await generateBatchWithRetry(
          context, midDay, endDay, firstHalf.title, updatedTitles, maxRetries, resolvedPersona
        );

        return {
          title: firstHalf.title,
          days: [...firstHalf.days, ...secondHalf.days],
        };
      }

      // For single-day truncation, retry is pointless with same params — bump retryLevel to simplify prompt
      if (lastError.message === 'OUTPUT_TRUNCATED' && daysInBatch === 1) {
        logger.log(`[Devotional] Single-day output truncated (day ${startDay}). Will retry with simplified prompt...`);
        // Fall through to normal retry logic — retryLevel increase will strip craft directives
      }

      if (attempt < maxRetries) {
        const isTransientUpstreamError = lastError.message === 'TRANSIENT_UPSTREAM_ERROR';
        const isOutputTruncated = lastError.message === 'OUTPUT_TRUNCATED';
        const isRetryable =
          lastError.message === 'CONTENT_FILTER_ERROR' ||
          isNetworkError(lastError) ||
          isTransientUpstreamError ||
          isOutputTruncated;

        if (isRetryable) {
          const reason = lastError.message === 'CONTENT_FILTER_ERROR'
            ? 'content filter'
            : isTransientUpstreamError
              ? 'upstream service unavailable'
              : isOutputTruncated
                ? 'output truncated (single day)'
                : 'network error';
          logger.log(`[Devotional] ${reason} on attempt ${attempt + 1}, retrying (${attempt + 2}/${maxRetries + 1})...`);
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
    sanitizeForPrompt(context.aboutMe, 120),
    sanitizeForPrompt(context.currentSituation, 120),
    sanitizeForPrompt(context.emotionalState, 120),
    sanitizeForPrompt(context.faithImpact, 120),
    sanitizeForPrompt(context.spiritualSeeking, 120),
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

// Extended return type that includes resolved persona for history tracking
export interface GeneratedDevotionalResult extends GeneratedDevotional {
  resolvedPersona?: { primary: PersonaTrait; secondary: PersonaTrait; templateSeed: number };
}

export async function generateDevotional(
  context: GenerationContext,
  onProgress?: (status: string) => void,
  onDayGenerated?: OnDayGeneratedCallback
): Promise<GeneratedDevotionalResult> {
  // Check rate limit before starting generation
  const rateLimit = await checkRateLimit('devotional');
  if (!rateLimit.allowed) {
    logger.warn('[Devotional] Rate limit exceeded:', rateLimit);
    throw new Error(`Daily devotional generation limit reached. Please try again in ${getTimeUntilReset(rateLimit.resetTime)}.`);
  }

  const requestKey = buildFullGenerationRequestKey(context);
  const existingRequest = inFlightFullGenerationRequests.get(requestKey);

  if (existingRequest) {
    logger.log('[Devotional] Reusing in-flight full generation request');
    void logBugEvent('devotional-service', 'full-generation-deduped');
    return existingRequest;
  }

  const requestPromise = (async () => {
    logger.log(`[Devotional] Generating ${context.devotionalLength}-day, ${context.readingDuration}-minute devotional`);

    const totalDays = context.devotionalLength;
    const batches = buildBatchPlan(totalDays, context.readingDuration);

    logger.log(`[Devotional] Will generate in ${batches.length} batch(es): ${batches.map(b => `${b.start}-${b.end}`).join(', ')}`);

    onProgress?.('Reading your story');

    // Resolve persona once for the entire series
    const resolvedPersona = resolvePersonaForGeneration(context);
    logger.log(`[Devotional] Resolved persona: primary=${resolvedPersona.primary}, secondary=${resolvedPersona.secondary}, templateSeed=${resolvedPersona.templateSeed}`);

    try {
      let seriesTitle: string | null = null;
      const allDays: DevotionalDay[] = [];
      const allDayTitles: string[] = [];

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const { start: startDay, end: endDay } = batches[batchIndex];

        logger.log(`Generating batch ${batchIndex + 1}/${batches.length}: days ${startDay}-${endDay}`);

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
          allDayTitles,
          3,
          resolvedPersona
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

      // Increment rate limit counter on success
      await incrementRateLimit('devotional');

      return {
        title: seriesTitle || 'Your Devotional Series',
        days: allDays,
        resolvedPersona,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      reportError('devotional-generation', error, { phase: 'full-generation' });
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
    faithImpact?: string;
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
    logger.log(`[Devotional] Reusing in-flight continuation request for ${devotional.id}`);
    void logBugEvent('devotional-service', 'continuation-deduped', {
      devotionalId: devotional.id,
    });
    return existingRequest;
  }

  const requestPromise = (async () => {
    const startDay = existingDayCount + 1;
    logger.log(`[Devotional] Continuing generation: days ${startDay}-${targetDays} (${existingDayCount} already exist)`);
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
        faithImpact: devotional.userContext.faithImpact ?? user.faithImpact ?? '',
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
        logger.log(`[Devotional] Continue batch ${batchIndex + 1}/${batches.length}: days ${start}-${end}`);

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
      reportError('devotional-continuation', error, {
        devotionalId: devotional.id,
        phase: 'continuation',
      });
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
    seriesStartDate: new Date().toISOString(),
    userContext: {
      name: context.name,
      aboutMe: context.aboutMe,
      currentSituation: context.currentSituation,
      emotionalState: context.emotionalState,
      faithImpact: context.faithImpact,
    },
    // Include theme and type if provided
    themeCategory: context.themeCategory,
    devotionalType: context.devotionalType || 'personal',
    studySubject: context.studySubject,
    generationMode: 'batch',
  };
}

// Helper function to generate adaptive follow-up questions
export async function generateAdaptiveQuestion(
  previousAnswers: { question: string; answer: string }[],
  nextQuestionBase: { question: string; subtext: string },
  stepPosition?: 'opening' | 'depth' | 'bridge' | 'longing'
): Promise<{ question: string; subtext: string; chips?: string[]; source: 'backend' | 'fallback'; backendUrl?: string }> {
  if (previousAnswers.length === 0) {
    return { ...nextQuestionBase, source: 'fallback' };
  }

  // Check rate limit before making API call
  const rateLimit = await checkRateLimit('adaptive-question');
  if (!rateLimit.allowed) {
    logger.warn('[Adaptive] Rate limit exceeded:', rateLimit);
    // Fall back to base question if rate limited
    return { ...nextQuestionBase, source: 'fallback' };
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
- KEEP IT SHORT for mobile keyboards: question must be <= 110 characters and <= 18 words
- The question MUST sound like something a real person would say out loud in conversation. If it sounds awkward when spoken aloud, rewrite it. Prioritize natural grammar over cleverness.
- Keep punctuation clean; no line breaks in the question

SUBTEXT: One short phrase that gives permission and makes it safe to be honest. Must be <= 85 characters.

CHIPS: Generate 6-8 short quick-select response options (1-3 words each) that are NATURAL ANSWERS to your question. These are tappable chips the user can select instead of typing. They should feel like completions of the question — not generic emotions, but specific to what you asked.

RESPOND WITH VALID JSON ONLY: {"question": "...", "subtext": "...", "chips": ["...", "..."]}`;

    const adaptiveUserPrompt = `Here's what this person has shared so far:

${contextStr}

Generate the next question in this conversation. It should feel like it emerges directly from what they just said — not like a generic template.

IMPORTANT: If they chose a specific study type, book, character, or theme, YOUR QUESTION MUST DIRECTLY REFERENCE AND CONNECT TO THAT CHOICE. Do not ignore what they selected. The question should make them feel like you're paying attention to what they picked and are genuinely curious about why.

Make them feel heard. Do NOT ask a question that steers them toward a predetermined answer.`;

    const backendResult = await postJsonWithBackendFallback(
      '/api/generate/adaptive-question',
      {
        model: 'grok-4-1-fast-non-reasoning',
        max_tokens: 220,
        temperature: 0.7,
        system: adaptiveSystemPrompt,
        messages: [
          {
            role: 'user',
            content: adaptiveUserPrompt,
          },
        ],
      },
      { timeoutMs: 15000 }
    );

    logger.log('[Adaptive] Backend candidates:', getBackendCandidates());
    logger.log('[Adaptive] Backend URL used:', backendResult.backendUrl);
    logger.log('[Adaptive] Backend attempts:', backendResult.attempts);
    logger.log('[Adaptive] Backend used fallback:', backendResult.usedFallback);

    const { response } = backendResult;

    if (!response.ok) {
      const errorText = await response.text();
      logger.warn('[Adaptive] Backend API error (recoverable, using fallback question):', response.status, errorText.substring(0, 200));
      return { ...nextQuestionBase, source: 'fallback' };
    }

    const data = await response.json();

    const clampQuestion = (value: string): string => {
      const trimmed = value.replace(/\s+/g, ' ').trim();
      const words = trimmed.split(' ').slice(0, 18).join(' ');
      const chars = words.slice(0, 110).trim();
      return chars.replace(/[\s,;:-]+$/, '').trim() + (chars.endsWith('?') ? '' : '?');
    };

    const clampSubtext = (value: string): string => value.replace(/\s+/g, ' ').trim().slice(0, 85);

    // Accept already-structured JSON directly from backend.
    if (typeof data?.question === 'string' && data.question.trim()) {
      await incrementRateLimit('adaptive-question');
      return {
        question: clampQuestion(data.question),
        subtext: typeof data?.subtext === 'string' && data.subtext.trim()
          ? clampSubtext(data.subtext)
          : nextQuestionBase.subtext,
        chips: Array.isArray(data?.chips) ? data.chips.filter((c: unknown) => typeof c === 'string' && c.trim()).slice(0, 10) : undefined,
        source: 'backend',
        backendUrl: backendResult.backendUrl,
      };
    }

    const content = data?.content?.[0]?.text;

    if (!content || typeof content !== 'string') {
      logger.warn('[Adaptive] Backend returned no parseable content (recoverable, using fallback question):', data);
      return { ...nextQuestionBase, source: 'fallback' };
    }

    logger.log('[Adaptive] Backend raw content:', content.substring(0, 200));

    // Handle markdown-wrapped JSON (```json ... ```)
    let jsonText = content;
    const markdownMatch = content.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
    if (markdownMatch) {
      jsonText = markdownMatch[1].trim();
      logger.log('[Adaptive] Extracted JSON from markdown');
    } else {
      // Try extracting first JSON object from mixed prose responses.
      const objectMatch = content.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        jsonText = objectMatch[0];
        logger.log('[Adaptive] Extracted JSON object from mixed response');
      }
    }

    let parsedResult: { question?: string; subtext?: string; chips?: string[] };
    try {
      parsedResult = JSON.parse(jsonText) as typeof parsedResult;
    } catch (parseErr) {
      logger.warn('[Adaptive] JSON parse failed:', parseErr, 'Input:', jsonText.substring(0, 200));
      throw new Error(`Adaptive question JSON parse failed: ${parseErr instanceof Error ? parseErr.message : 'unknown'}`);
    }

    logger.log('[Adaptive] Backend parsed result:', {
      question: parsedResult.question?.substring(0, 60),
      subtext: parsedResult.subtext?.substring(0, 40),
      chips: parsedResult.chips?.length,
    });

    // Increment rate limit counter on success
    await incrementRateLimit('adaptive-question');

    return {
      question: clampQuestion(parsedResult.question || nextQuestionBase.question),
      subtext: clampSubtext(parsedResult.subtext || nextQuestionBase.subtext),
      chips: Array.isArray(parsedResult.chips) ? parsedResult.chips.filter(c => typeof c === 'string' && c.trim()).slice(0, 10) : undefined,
      source: 'backend',
      backendUrl: backendResult.backendUrl,
    };
  } catch (err) {
    logger.warn('[Adaptive] Backend parse error (recoverable, using fallback question):', err);
    return { ...nextQuestionBase, source: 'fallback' };
  }
}

// Generate AI mirror-back text for onboarding — acts as a teaser for the devotional
export interface MirrorBackContent {
  reflection: string;
  verse: string;
  verseRef: string;
  anticipation: string;
}

export async function generateMirrorBackText(
  onboardingData: {
    selectedThemes?: string[];
    selectedType?: string;
    emotionalState?: string;
    currentSituation?: string;
    faithImpact?: string;
    spiritualSeeking?: string;
    name?: string;
    aboutMe?: string;
    relationshipWithGod?: string;
    growthGoals?: string[];
    obstacles?: string[];
  }
): Promise<{ content: MirrorBackContent; source: 'backend' | 'fallback' }> {
  const rateLimit = await checkRateLimit('adaptive-question');
  if (!rateLimit.allowed) {
    logger.warn('[MirrorBack] Rate limited, using fallback');
    return { content: buildFallbackMirrorBack(onboardingData), source: 'fallback' };
  }

  try {
    const contextParts: string[] = [];
    if (onboardingData.selectedThemes?.length) {
      contextParts.push(`Selected themes: ${onboardingData.selectedThemes.join(', ')}`);
    }
    if (onboardingData.selectedType) {
      contextParts.push(`Study type: ${onboardingData.selectedType}`);
    }
    if (onboardingData.aboutMe) {
      contextParts.push(`About them: ${onboardingData.aboutMe}`);
    }
    if (onboardingData.relationshipWithGod) {
      contextParts.push(`Relationship with God: ${onboardingData.relationshipWithGod}`);
    }
    if (onboardingData.growthGoals?.length) {
      contextParts.push(`Growth goals: ${onboardingData.growthGoals.join(', ')}`);
    }
    if (onboardingData.obstacles?.length) {
      contextParts.push(`Obstacles: ${onboardingData.obstacles.join(', ')}`);
    }
    if (onboardingData.emotionalState) {
      contextParts.push(`How they're feeling: ${onboardingData.emotionalState}`);
    }
    if (onboardingData.currentSituation) {
      contextParts.push(`Their current situation: ${onboardingData.currentSituation}`);
    }
    if (onboardingData.faithImpact) {
      contextParts.push(`How this is showing up in their faith: ${onboardingData.faithImpact}`);
    }
    if (onboardingData.spiritualSeeking) {
      contextParts.push(`What they're seeking: ${onboardingData.spiritualSeeking}`);
    }

    const systemPrompt = `You write intimate, poetic mirror-back reflections for a Christian devotional app called Unfold. The user just completed onboarding and shared deeply personal details. Your job is to write a reflection that makes them feel SEEN — like something sacred is about to begin.

This is NOT a summary of their answers. This is a mini devotional moment that speaks to the HEART of what they shared. Weave their words into something they didn't know they needed to hear.

VOICE: Warm, unhurried, intimate. Like a trusted spiritual director speaking gently. No exclamation marks. No hype. Write like a poet, not a pastor.

STRUCTURE — return valid JSON:
{
  "reflection": "2-4 sentences. Acknowledge where they are without parroting their words back. Speak to the emotional undercurrent, not the surface details. Use their name once, naturally. Make them feel understood at a level that surprises them.",
  "verse": "A single Bible verse text (BSB translation). Choose something that speaks to the intersection of their obstacles and aspirations. Prefer lesser-known passages.",
  "verseRef": "Book Chapter:Verse",
  "anticipation": "1-2 sentences. Something is being crafted specifically for them right now. Create excitement. Use language that implies this is a beginning, not a product pitch."
}

RULES:
- reflection: 2-4 sentences. Use the person's name ONCE. No questions.
- verse: BSB translation. Avoid Jeremiah 29:11, Philippians 4:13, Romans 8:28 unless truly perfect.
- anticipation: 1-2 sentences. Reference that something is being written for them.
- Speak to the emotional truth, not the biographical facts.
- RESPOND WITH VALID JSON ONLY`;

    const userPrompt = `Here is what ${onboardingData.name || 'this person'} shared during onboarding:\n\n${contextParts.join('\n')}\n\nWrite a mirror-back reflection that makes them feel seen and creates anticipation for what's being written for them right now.`;

    const backendResult = await postJsonWithBackendFallback(
      '/api/generate/adaptive-question',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 750,
        temperature: 0.8,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      },
      { timeoutMs: 12000 },
    );

    const { response } = backendResult;

    if (!response.ok) {
      logger.warn('[MirrorBack] Backend error, using fallback:', response.status);
      return { content: buildFallbackMirrorBack(onboardingData), source: 'fallback' };
    }

    const data = await response.json();

    // Try direct structured response
    if (typeof data?.reflection === 'string' && data.reflection.trim()) {
      await incrementRateLimit('adaptive-question');
      return {
        content: {
          reflection: data.reflection.trim(),
          verse: data.verse?.trim() || 'Be still, and know that I am God.',
          verseRef: data.verseRef?.trim() || 'Psalm 46:10',
          anticipation: data.anticipation?.trim() || 'Something is being written for you right now — crafted for exactly where you are.',
        },
        source: 'backend',
      };
    }

    // Parse from content array (Anthropic-style response)
    const content = data?.content?.[0]?.text;
    if (content && typeof content === 'string') {
      let jsonText = content;
      const markdownMatch = content.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
      if (markdownMatch) jsonText = markdownMatch[1].trim();
      else {
        const objectMatch = content.match(/\{[\s\S]*\}/);
        if (objectMatch) jsonText = objectMatch[0];
      }

      const parsed = JSON.parse(jsonText);
      if (parsed?.reflection) {
        await incrementRateLimit('adaptive-question');
        return {
          content: {
            reflection: parsed.reflection.trim(),
            verse: parsed.verse?.trim() || 'Be still, and know that I am God.',
            verseRef: parsed.verseRef?.trim() || 'Psalm 46:10',
            anticipation: parsed.anticipation?.trim() || 'Something is being written for you right now — crafted for exactly where you are.',
          },
          source: 'backend',
        };
      }
    }

    logger.warn('[MirrorBack] Could not parse backend response, using fallback');
    return { content: buildFallbackMirrorBack(onboardingData), source: 'fallback' };
  } catch (err) {
    logger.warn('[MirrorBack] Error generating mirror-back:', err);
    return { content: buildFallbackMirrorBack(onboardingData), source: 'fallback' };
  }
}

// Fallback mirror-back content when AI generation fails
function buildFallbackMirrorBack(data: { emotionalState?: string; currentSituation?: string; faithImpact?: string; spiritualSeeking?: string; name?: string }): MirrorBackContent {
  const hasEmotional = !!(data.emotionalState || data.currentSituation);
  const hasSeeking = !!data.spiritualSeeking;
  const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
  const nameClause = data.name ? `${data.name}, ` : '';

  let reflection: string;
  if (hasEmotional && hasSeeking) {
    reflection = pick([
      `${nameClause}something real brought you here — a weight you've been carrying, and a hope you haven't let go of.`,
      `Between where you are and where you're reaching, ${nameClause.toLowerCase() || ''}God is already at work.`,
    ]);
  } else if (hasEmotional) {
    reflection = pick([
      `${nameClause}you named something that matters. That kind of honesty is where God meets us.`,
      `What you shared took courage, ${nameClause.toLowerCase() || ''}and it's exactly the right place to begin.`,
    ]);
  } else {
    reflection = pick([
      `${nameClause}something drew you here today. Whatever the reason — you're in the right place.`,
      `You showed up${data.name ? `, ${data.name}` : ''}. That's the beginning of everything.`,
    ]);
  }

  return {
    reflection,
    verse: 'Be still, and know that I am God.',
    verseRef: 'Psalm 46:10',
    anticipation: 'Something is being written for you right now — crafted for exactly where you are.',
  };
}

// Extract the most shareable quotes from a devotional day using AI
export async function extractShareableQuotes(
  dayContent: string,
  dayTitle: string,
  count: number = 2
): Promise<{ text: string; score: number }[]> {
  // Check rate limit before making API call
  const rateLimit = await checkRateLimit('extract-quotes');
  if (!rateLimit.allowed) {
    logger.warn('[ExtractQuotes] Rate limit exceeded');
    return []; // Return empty if rate limited
  }

  try {
    const extractionSystemPrompt = `You are a quote curator for a Christian devotional app. Extract the most shareable, screenshot-worthy sentences from devotional content.

WHAT MAKES A QUOTE SHAREABLE:
- Stands completely alone without any surrounding context
- Contains surprise, reversal, paradox, or profound simplicity
- Uses "you" or speaks directly to the reader
- Theological depth expressed in plain, conversational language
- Short enough to fit on an Instagram story (under 20 words ideal, max 30)
- The kind of line someone would text to a friend or highlight in a book

WHAT TO AVOID:
- Generic Christian platitudes ("God is good," "trust His plan")
- Sentences that need the paragraph around them to make sense
- Anything that reads like a greeting card or bumper sticker
- Overly complex theological language

SCORING (1-10):
- Surprise factor (reversal, unexpected angle): +3
- Brevity (under 15 words): +2
- Direct address ("you"): +1
- Concrete imagery (not abstract): +1
- Strong ending (lands with impact): +1
- Would stop someone mid-scroll: +2

Extract ONLY quotes that appear verbatim in the source content. Do not rephrase or combine sentences.

Respond with valid JSON only: {"quotes": [{"text": "exact quote from content", "score": 8}, ...]}`;

    const extractionUserPrompt = `Day Title: "${dayTitle}"

Content:
${dayContent.substring(0, 3000)}

Extract the top ${count} most shareable quotes from this devotional day. Return ONLY valid JSON.`;

    const backendResult = await postJsonWithBackendFallback(
      '/api/generate/extract-quotes',
      {
        model: 'grok-4-1-fast-non-reasoning',
        max_tokens: 500,
        system: extractionSystemPrompt,
        messages: [
          {
            role: 'user',
            content: extractionUserPrompt,
          },
        ],
      },
      { timeoutMs: 15000 }
    );

    const { response } = backendResult;

    if (!response.ok) {
      logger.log('[Quote Extraction] Backend request failed, using fallback');
      return [];
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      return [];
    }

    let parsedResult: { quotes: { text: string; score: number }[] };
    try {
      parsedResult = JSON.parse(content) as typeof parsedResult;
    } catch (parseErr) {
      logger.warn('[Quote Extraction] JSON parse failed:', parseErr);
      return [];
    }

    // Increment rate limit counter on success
    await incrementRateLimit('extract-quotes');

    return parsedResult.quotes?.slice(0, count) || [];
  } catch (err) {
    logger.log('[Quote Extraction] Error:', err);
    return [];
  }
}
