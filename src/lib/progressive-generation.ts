/**
 * Progressive Generation System
 *
 * Generates devotional days one at a time, each informed by the user's
 * accumulated journey context (journal entries, SOAP responses, prayer
 * requests, check-ins, reading patterns).
 *
 * This module complements devotional-service.ts (which handles batch
 * generation for legacy devotionals). It reuses the same backend proxy,
 * system prompts, and persona engine.
 */

import { logBugError, logBugEvent } from './bug-logger';
import { logger as appLogger } from './logger';
import { reportError } from './report-error';
import { fetchStoriesForGeneration, formatStoriesForPrompt } from './story-service';
import {
  postJsonWithBackendFallback,
  getSystemPrompt,
  buildV2VoiceOverlay,
  resolvePersonaForGeneration,
  analyzeScriptureVariety,
  PETER_ENNS_ADDITION,
  STICKY_SENTENCE_INSTRUCTION,
  type GenerationContext,
} from './devotional-service';
import { buildVoiceAdaptationDirective } from '../constants/voice-adaptation';
import {
  CRAFT_FOUNDATION,
  ANTI_SLOP_DIRECTIVE,
  CONVICTION_DIRECTIVE,
  RHETORICAL_QUESTION_DIRECTIVE,
  PARABLE_ANTI_PATTERNS,
  DIALOGUE_ANTI_PATTERNS,
  PATTERN_BREAK_DIRECTIVE,
  getStoryDirectiveForDay,
  getDialogueDirectiveForDay,
} from '../constants/writing-craft';
import {
  BIBLE_STUDY_METHODS,
  ALL_METHOD_IDS,
  buildMethodAssignmentPrompt,
  regionToGenre,
  roleToDifficulty,
  pickMethod,
  type BibleStudyMethodCard,
} from '../constants/bible-study-methods';
import type { PersonaTrait } from '../constants/devotional-personas-v2';
import { useUnfoldStore } from './store';
import type {
  DevotionalDay,
  SeriesArc,
  SeriesArcDay,
  ProgressiveMemory,
  MemoryLayerFull,
  MemoryLayerSummary,
  MemoryLayerNarrative,
  UsedScripture,
  JournalEntry,
  CheckIn,
  Devotional,
} from './store';

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const logger = {
  log: (...args: unknown[]) => { appLogger.log('[ProgressiveGen]', ...args); },
  warn: (...args: unknown[]) => { appLogger.warn('[ProgressiveGen]', ...args); },
  error: (...args: unknown[]) => { appLogger.error('[ProgressiveGen]', ...args); },
};

// ---------------------------------------------------------------------------
// In-flight request deduplication
// ---------------------------------------------------------------------------

const inFlightDayRequests = new Map<string, Promise<DevotionalDay>>();

function dayRequestKey(devotionalId: string, dayNumber: number): string {
  return `${devotionalId}::day-${dayNumber}`;
}

// ---------------------------------------------------------------------------
// Series Arc Generation
// ---------------------------------------------------------------------------

const SERIES_ARC_SYSTEM_PROMPT = `You are a devotional series architect. Given a reader's context and preferences, create a high-level narrative arc for their devotional series.

The arc is a PLAN, not content. Each day gets a brief thematic hint and suggested scripture region — the actual devotional content will be written separately, day by day, informed by the reader's ongoing engagement.

Design the arc with intentional narrative shape: start with foundation, build through deepening and tension, arrive at turning points and resolution. Not every series needs all phases — a 3-day series might be foundation → deepening → resolution.

Respond with valid JSON only. No markdown, no explanation.`;

export async function generateSeriesArc(
  context: GenerationContext,
  usedScriptures: UsedScripture[],
): Promise<{ arc: SeriesArc; title: string }> {
  const scriptureAnalysis = analyzeScriptureVariety(usedScriptures);
  const totalDays = context.devotionalLength;

  const methodPrompt = buildMethodAssignmentPrompt(
    context.writingStyle?.faithBackground,
    context.writingStyle?.depth,
  );

  const userPrompt = `Create a ${totalDays}-day devotional series arc.

READER CONTEXT:
Name: ${context.name}
About them: ${context.aboutMe}
Walking through: ${context.currentSituation}
Feeling: ${context.emotionalState}
Seeking: ${context.spiritualSeeking}
Faith background: ${context.writingStyle?.faithBackground ?? 'growing'}
Depth preference: ${context.writingStyle?.depth ?? 'balanced'}
${context.themeCategory ? `Theme focus: ${context.themeCategory}` : ''}
${context.devotionalType ? `Devotional type: ${context.devotionalType}` : ''}
${context.studySubject ? `Study subject: ${context.studySubject}` : ''}

SCRIPTURE VARIETY:
${scriptureAnalysis.overusedBooks.length > 0 ? `Avoid heavy use of: ${scriptureAnalysis.overusedBooks.join(', ')}` : ''}
${scriptureAnalysis.underexploredRegions.length > 0 ? `Explore: ${scriptureAnalysis.underexploredRegions.join(', ')}` : ''}

${methodPrompt}

JSON SCHEMA:
{
  "title": "Series title (3-6 words, evocative, not generic)",
  "overarchingTheme": "One sentence describing the journey's throughline",
  "narrativeShape": "e.g. Foundation → Deepening → Tension → Resolution",
  "dayHints": [
    {
      "dayNumber": 1,
      "themeHint": "Brief theme for this day (1 sentence)",
      "scriptureRegion": "Bible region (e.g. Gospels & Acts, Wisdom & Poetry)",
      "narrativeRole": "foundation|deepening|tension|turning|resolution",
      "studyMethod": "method_id from the list above"
    }
  ]
}`;

  logger.log(`Generating series arc for ${totalDays}-day series...`);

  const { response } = await postJsonWithBackendFallback(
    '/api/generate/devotional',
    {
      model: 'grok-4-1-fast-non-reasoning',
      max_tokens: 2000,
      system: SERIES_ARC_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    },
    { timeoutMs: 30000 },
  );

  if (!response.ok) {
    throw new Error(`Arc generation failed: ${response.status}`);
  }

  const data = await response.json();
  const text = data?.content?.[0]?.text ?? data?.choices?.[0]?.message?.content ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Arc generation returned no valid JSON');
  }

  let parsed: { title: string; overarchingTheme: string; narrativeShape: string; dayHints: SeriesArcDay[] };
  try {
    parsed = JSON.parse(jsonMatch[0]) as {
      title: string;
      overarchingTheme: string;
      narrativeShape: string;
      dayHints: SeriesArcDay[];
    };
  } catch (parseErr) {
    throw new Error(`Arc generation: JSON parse failed — ${parseErr instanceof Error ? parseErr.message : 'unknown'}`);
  }

  // Sanitize method IDs — LLMs can hallucinate invalid IDs
  const validMethodIds = new Set(ALL_METHOD_IDS);
  for (const hint of parsed.dayHints) {
    if (hint.studyMethod && !validMethodIds.has(hint.studyMethod)) {
      logger.log(`Arc parse: invalid method ID "${hint.studyMethod}" on day ${hint.dayNumber}, clearing`);
      hint.studyMethod = undefined;
    }
  }

  // Ensure dayHints count matches totalDays — pad missing hints
  while (parsed.dayHints.length < totalDays) {
    const nextDay = parsed.dayHints.length + 1;
    logger.log(`Arc parse: padding missing day hint for day ${nextDay}`);
    parsed.dayHints.push({
      dayNumber: nextDay,
      themeHint: 'Continued exploration',
      scriptureRegion: 'any',
      narrativeRole: nextDay === totalDays ? 'resolution' : 'deepening',
    });
  }

  const arc: SeriesArc = {
    totalDaysPlanned: totalDays,
    overarchingTheme: parsed.overarchingTheme,
    narrativeShape: parsed.narrativeShape,
    dayHints: parsed.dayHints.slice(0, totalDays),
    isOpenEnded: false,
    createdAt: new Date().toISOString(),
  };

  logger.log(`Arc generated: "${parsed.title}" — ${arc.narrativeShape}`);
  void logBugEvent('progressive-gen', 'arc-generated', {
    title: parsed.title,
    totalDays,
    shape: arc.narrativeShape,
  });

  return { arc, title: parsed.title ?? arc.overarchingTheme };
}

// ---------------------------------------------------------------------------
// Phase 5: Open-Ended Series Extension
// ---------------------------------------------------------------------------

/**
 * Evaluates whether a progressive series should be extended beyond its
 * planned arc. Called when the user completes the last planned day.
 *
 * Uses the journey narrative (Layer 3) and recent memory to assess:
 * - Unresolved themes or prayer requests
 * - Momentum and engagement trajectory
 * - Whether the spiritual arc feels "closed" or still in motion
 *
 * Returns { shouldExtend, reason, suggestedDays } via a lightweight Grok call.
 */
export async function evaluateSeriesExtension(
  devotionalId: string,
): Promise<{ shouldExtend: boolean; reason: string; suggestedDays: number }> {
  const store = useUnfoldStore.getState();
  const devotional = store.devotionals.find((d) => d.id === devotionalId);

  if (!devotional?.seriesArc || !devotional.progressiveMemory) {
    return { shouldExtend: false, reason: 'No arc or memory', suggestedDays: 0 };
  }

  // Rate limit: don't re-evaluate within 24h of last extension
  if (devotional.seriesArc.lastExtendedAt) {
    const hoursSinceLast =
      (Date.now() - new Date(devotional.seriesArc.lastExtendedAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceLast < 24) {
      return { shouldExtend: false, reason: 'Extended recently', suggestedDays: 0 };
    }
  }

  const memory = devotional.progressiveMemory;
  const narrative = memory.narrative?.narrative ?? '';
  const recentSummaries = memory.summaries.slice(0, 3).map((s) => s.summary).join('\n');
  const recentFullDays = memory.fullDays
    .map((d) => {
      const parts = [`Day ${d.dayNumber}: "${d.devotionalTitle}"`, `Scripture: ${d.scriptureReference}`];
      if (d.journalContent) parts.push(`Journal: ${d.journalContent.slice(0, 200)}`);
      if (d.checkInMoodLabel) parts.push(`Mood: ${d.checkInMoodLabel}`);
      if (d.prayerRequests?.length) parts.push(`Prayers: ${d.prayerRequests.map((p) => p.text).join('; ')}`);
      return parts.join('\n');
    })
    .join('\n---\n');

  const prompt = `You are evaluating whether a devotional series should continue or end.

SERIES INFO:
Theme: ${devotional.seriesArc.overarchingTheme}
Planned days: ${devotional.seriesArc.totalDaysPlanned}
Days completed: ${devotional.days.filter((d) => d.isRead).length}

JOURNEY NARRATIVE:
${narrative || '(No narrative yet)'}

RECENT SUMMARIES:
${recentSummaries || '(None)'}

RECENT DAYS:
${recentFullDays || '(None)'}

EVALUATE:
1. Are there unresolved themes, prayer requests, or spiritual threads still in motion?
2. Does the reader's engagement suggest momentum (journaling, prayers, emotional check-ins)?
3. Would ending here feel premature or complete?

Respond with JSON only:
{
  "shouldExtend": true/false,
  "reason": "One sentence explaining the decision",
  "suggestedDays": 3-7 (only if shouldExtend is true, else 0)
}

Bias toward extending (3-5 extra days) unless the arc clearly reached resolution.`;

  try {
    logger.log('Evaluating series extension...');

    const { response } = await postJsonWithBackendFallback(
      '/api/generate/devotional',
      {
        model: 'grok-4-1-fast-non-reasoning',
        max_tokens: 300,
        system: 'You evaluate devotional series for continuation. Respond with JSON only.',
        messages: [{ role: 'user', content: prompt }],
      },
      { timeoutMs: 15000 },
    );

    if (!response.ok) {
      throw new Error(`Extension eval failed: ${response.status}`);
    }

    const data = await response.json();
    const text = data?.content?.[0]?.text ?? data?.choices?.[0]?.message?.content ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in extension eval response');

    let result: {
      shouldExtend: boolean;
      reason: string;
      suggestedDays: number;
    };
    try {
      result = JSON.parse(jsonMatch[0]) as typeof result;
    } catch (parseErr) {
      logger.warn('Extension eval JSON parse failed:', parseErr);
      throw new Error(`Extension eval: JSON parse failed — ${parseErr instanceof Error ? parseErr.message : 'unknown'}`);
    }

    logger.log(`Extension eval: shouldExtend=${result.shouldExtend}, reason="${result.reason}"`);
    void logBugEvent('progressive-gen', 'extension-evaluated', {
      devotionalId,
      shouldExtend: result.shouldExtend,
      suggestedDays: result.suggestedDays,
      reason: result.reason,
    });

    const clamped = Math.min(Math.max(result.suggestedDays ?? 0, 0), 7);
    // If LLM says extend but gives 0 days, default to 3
    const days = result.shouldExtend && clamped <= 0 ? 3 : clamped;
    return {
      shouldExtend: result.shouldExtend ?? false,
      reason: (result.reason ?? '').slice(0, 200),
      suggestedDays: days,
    };
  } catch (err) {
    logger.error('Extension evaluation failed:', err);
    // Fail open: don't extend if evaluation errors
    return { shouldExtend: false, reason: 'Evaluation error', suggestedDays: 0 };
  }
}

/**
 * Generates additional arc day hints for an extended series.
 * Called after evaluateSeriesExtension returns shouldExtend=true
 * and the user confirms they want to continue.
 */
export async function generateArcExtension(
  devotionalId: string,
  additionalDays: number,
): Promise<SeriesArcDay[]> {
  const store = useUnfoldStore.getState();
  const devotional = store.devotionals.find((d) => d.id === devotionalId);

  if (!devotional?.seriesArc) {
    throw new Error('No series arc to extend');
  }

  const arc = devotional.seriesArc;
  const currentTotal = devotional.totalDays;
  const narrative = devotional.progressiveMemory?.narrative?.narrative ?? '';

  // Pass full arc method history for better variety awareness
  const existingHints = arc.dayHints
    .map((h) => `Day ${h.dayNumber}: ${h.themeHint} (${h.narrativeRole}${h.studyMethod ? `, method: ${h.studyMethod}` : ''})`)
    .join('\n');

  const recentScriptures = useUnfoldStore.getState().getRecentScriptures(100);
  const scriptureAnalysis = analyzeScriptureVariety(recentScriptures);

  // Get user settings for method assignment
  const user = store.user;
  const recentMethods = arc.dayHints.map((h) => h.studyMethod).filter(Boolean).join(', ');
  const extensionMethodPrompt = buildMethodAssignmentPrompt(
    user?.writingStyle?.faithBackground,
    user?.writingStyle?.depth,
  );

  const prompt = `Extend this devotional series arc with ${additionalDays} more days.

SERIES:
Theme: ${arc.overarchingTheme}
Shape so far: ${arc.narrativeShape}
Current total: ${currentTotal} days (extending to ${currentTotal + additionalDays})

RECENT ARC DAYS:
${existingHints}
${recentMethods ? `Recently used methods (avoid repeating): ${recentMethods}` : ''}

JOURNEY NARRATIVE:
${narrative || '(Reader has been engaged throughout)'}

SCRIPTURE TO AVOID:
${scriptureAnalysis.overusedBooks.length > 0 ? scriptureAnalysis.overusedBooks.join(', ') : 'None'}

FRESH REGIONS TO EXPLORE:
${scriptureAnalysis.underexploredRegions.length > 0 ? scriptureAnalysis.underexploredRegions.join(', ') : 'Any'}

${extensionMethodPrompt}

Generate ${additionalDays} new day hints that:
1. Continue naturally from the existing arc
2. Address any unresolved threads from the journey narrative
3. Build toward a satisfying new resolution point
4. The LAST new day should have narrativeRole "resolution"
5. Each day gets a unique studyMethod from the list above

JSON array only:
[
  {
    "dayNumber": ${currentTotal + 1},
    "themeHint": "...",
    "scriptureRegion": "...",
    "narrativeRole": "deepening|tension|turning|resolution",
    "studyMethod": "method_id"
  }
]`;

  logger.log(`Generating ${additionalDays} extension days for arc...`);

  const { response } = await postJsonWithBackendFallback(
    '/api/generate/devotional',
    {
      model: 'grok-4-1-fast-non-reasoning',
      max_tokens: 1000,
      system: 'You are a devotional series architect extending an existing arc. Respond with a JSON array only.',
      messages: [{ role: 'user', content: prompt }],
    },
    { timeoutMs: 20000 },
  );

  if (!response.ok) {
    throw new Error(`Arc extension failed: ${response.status}`);
  }

  const data = await response.json();
  const text = data?.content?.[0]?.text ?? data?.choices?.[0]?.message?.content ?? '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No JSON array in arc extension response');

  let newHints: SeriesArcDay[];
  try {
    newHints = JSON.parse(jsonMatch[0]) as SeriesArcDay[];
  } catch (parseErr) {
    throw new Error(`Arc extension: JSON parse failed — ${parseErr instanceof Error ? parseErr.message : 'unknown'}`);
  }
  // Validate each hint has required fields
  newHints = newHints.filter((h) => h.dayNumber && h.themeHint && h.narrativeRole);

  // Sanitize method IDs in extension hints
  const validIds = new Set(ALL_METHOD_IDS);
  for (const hint of newHints) {
    if (hint.studyMethod && !validIds.has(hint.studyMethod)) {
      logger.log(`Arc extension: invalid method ID "${hint.studyMethod}" on day ${hint.dayNumber}, clearing`);
      hint.studyMethod = undefined;
    }
  }

  logger.log(`Arc extended with ${newHints.length} new days`);
  void logBugEvent('progressive-gen', 'arc-extended', {
    devotionalId,
    previousTotal: currentTotal,
    newDays: newHints.length,
    newTotal: currentTotal + newHints.length,
  });

  return newHints;
}

// ---------------------------------------------------------------------------
// Single-Day Progressive Generation
// ---------------------------------------------------------------------------

export async function generateProgressiveDay(
  devotionalId: string,
  dayNumber: number,
  arc: SeriesArc,
  memory: ProgressiveMemory,
  context: GenerationContext,
  usedScriptures: UsedScripture[],
  resolvedPersona?: { primary: PersonaTrait; secondary: PersonaTrait; templateSeed: number },
): Promise<DevotionalDay> {
  // Deduplicate in-flight requests
  const key = dayRequestKey(devotionalId, dayNumber);
  const existing = inFlightDayRequests.get(key);
  if (existing) {
    logger.log(`Day ${dayNumber} generation already in-flight, returning existing promise`);
    return existing;
  }

  const promise = _generateProgressiveDayInternal(
    devotionalId, dayNumber, arc, memory, context, usedScriptures, resolvedPersona,
  );

  inFlightDayRequests.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlightDayRequests.delete(key);
  }
}

async function _generateProgressiveDayInternal(
  devotionalId: string,
  dayNumber: number,
  arc: SeriesArc,
  memory: ProgressiveMemory,
  context: GenerationContext,
  usedScriptures: UsedScripture[],
  resolvedPersona?: { primary: PersonaTrait; secondary: PersonaTrait; templateSeed: number },
): Promise<DevotionalDay> {
  const persona = resolvedPersona ?? resolvePersonaForGeneration(context);
  const scriptureAnalysis = analyzeScriptureVariety(usedScriptures);

  // Build system prompt (same layers as batch generation)
  const baseSystem = getSystemPrompt(0);
  const voiceOverlay = buildV2VoiceOverlay(persona.primary, persona.secondary);
  const voiceAdaptation = buildVoiceAdaptationDirective(
    context.writingStyle?.lifeStage,
    context.writingStyle?.faithBackground,
    context.writingStyle?.depth,
  );
  const patternBreaks = (context.readingDuration ?? 5) >= 15 ? PATTERN_BREAK_DIRECTIVE : '';

  // Conditional injection: conviction only on days 3 through ~70% of the series
  const totalDays = context.devotionalLength;
  const isConvictionDay = dayNumber >= 3 && dayNumber <= Math.ceil(totalDays * 0.7);
  const convictionDirective = isConvictionDay ? CONVICTION_DIRECTIVE : '';

  // Conditional injection: parable/dialogue guardrails only when this day has a story/dialogue
  const durationKey = context.readingDuration === 5 ? '5min' as const : context.readingDuration === 30 ? '30min' as const : '15min' as const;
  const faithBg = context.writingStyle?.faithBackground ?? 'growing';
  const hasStoryToday = getStoryDirectiveForDay(dayNumber, durationKey, faithBg) !== null;
  const hasDialogueToday = getDialogueDirectiveForDay(dayNumber, durationKey, faithBg, hasStoryToday) !== null;
  const parableGuardrails = hasStoryToday ? PARABLE_ANTI_PATTERNS : '';
  const dialogueGuardrails = hasDialogueToday ? DIALOGUE_ANTI_PATTERNS : '';

  // Fetch real stories from the API when this day gets a story directive
  let storiesBlock = '';
  if (hasStoryToday) {
    const dayHint = arc.dayHints.find((h) => h.dayNumber === dayNumber);
    // Derive search themes from arc theme hint, overarching theme, and user context
    const searchThemes: string[] = [];
    if (dayHint?.themeHint) {
      // Extract key words from the theme hint (skip common filler words)
      const words = dayHint.themeHint.toLowerCase().split(/\s+/)
        .filter(w => w.length > 3 && !['this', 'that', 'with', 'from', 'into', 'about', 'their', 'them', 'they', 'have', 'been', 'will', 'your', 'more', 'what', 'when', 'than'].includes(w));
      searchThemes.push(...words.slice(0, 3));
    }
    if (arc.overarchingTheme) {
      const words = arc.overarchingTheme.toLowerCase().split(/\s+/)
        .filter(w => w.length > 3 && !['this', 'that', 'with', 'from', 'into', 'about', 'their', 'them', 'they', 'have', 'been', 'will', 'your', 'more', 'what', 'when', 'than'].includes(w));
      searchThemes.push(...words.slice(0, 2));
    }
    if (context.themeCategory) searchThemes.push(context.themeCategory);

    // Deduplicate
    const uniqueThemes = [...new Set(searchThemes)];

    if (uniqueThemes.length > 0) {
      try {
        const stories = await fetchStoriesForGeneration(uniqueThemes, {
          limit: 3,
          spinnable: true,
        });
        storiesBlock = formatStoriesForPrompt(stories);
        if (storiesBlock) {
          logger.log(`Day ${dayNumber}: fetched ${stories.length} stories for themes [${uniqueThemes.join(', ')}]`);
        }
      } catch {
        // Silent fallback — generation works without stories
        logger.warn(`Day ${dayNumber}: story fetch failed, continuing without`);
      }
    }
  }

  const systemPrompt = [
    baseSystem,
    PETER_ENNS_ADDITION,
    CRAFT_FOUNDATION,
    ANTI_SLOP_DIRECTIVE,
    RHETORICAL_QUESTION_DIRECTIVE,
    convictionDirective,
    parableGuardrails,
    dialogueGuardrails,
    patternBreaks,
    voiceOverlay,
    voiceAdaptation,
    STICKY_SENTENCE_INSTRUCTION,
  ].join('');

  // Build the progressive user prompt
  let userPrompt = buildProgressiveUserPrompt(
    context, dayNumber, arc, memory, scriptureAnalysis,
  );

  // Append real stories from the API (if available) to the user prompt
  if (storiesBlock) {
    userPrompt += `\n\n${storiesBlock}`;
  }

  // Token budget for a single day
  const tokensPerDay =
    context.readingDuration === 30 ? 5000
      : context.readingDuration === 15 ? 3000
      : 2000;
  const maxTokens = Math.max(tokensPerDay + 2000, 6000);

  logger.log(`Generating day ${dayNumber}, maxTokens=${maxTokens}`);

  const { response } = await postJsonWithBackendFallback(
    '/api/generate/devotional',
    {
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    },
    { timeoutMs: 90000 },
  );

  if (!response.ok) {
    throw new Error(`Day ${dayNumber} generation failed: ${response.status}`);
  }

  const data = await response.json();
  const text = data?.content?.[0]?.text ?? data?.choices?.[0]?.message?.content ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Day ${dayNumber}: no valid JSON in response`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    throw new Error(`Day ${dayNumber}: JSON parse failed — ${parseErr instanceof Error ? parseErr.message : 'unknown'}`);
  }
  // Handle both single-day and wrapped responses
  const dayData = parsed.days?.[0] ?? parsed;

  // Resolve the study method used for this day (matches what was injected into the prompt)
  const dayHintForStorage = arc.dayHints.find((h) => h.dayNumber === dayNumber);
  const resolvedMethod = resolveMethodForDay(dayHintForStorage, arc, context);

  const day: DevotionalDay = {
    dayNumber,
    title: dayData.title ?? `Day ${dayNumber}`,
    scriptureReference: dayData.scriptureReference ?? '',
    scriptureText: dayData.scriptureText ?? '',
    bodyText: dayData.bodyText ?? '',
    quotableLine: dayData.quotableLine ?? '',
    isRead: false,
    quotes: dayData.quotes ?? [],
    crossReferences: dayData.crossReferences ?? [],
    reflectionQuestions: dayData.reflectionQuestions ?? [],
    contextNote: dayData.contextNote,
    wordStudy: dayData.wordStudy,
    closingPrayer: dayData.closingPrayer,
    checkInQuestion: dayData.checkInQuestion,
    checkInChips: dayData.checkInChips,
    eveningScriptureRef: dayData.eveningScriptureRef,
    studyMethod: resolvedMethod?.id,
    generatedAt: new Date().toISOString(),
    contextSignals: buildContextSignalList(memory, dayNumber),
  };

  logger.log(`Day ${dayNumber} generated: "${day.title}" — ${day.scriptureReference}`);
  void logBugEvent('progressive-gen', 'day-generated', {
    devotionalId,
    dayNumber,
    title: day.title,
    scriptureReference: day.scriptureReference,
    contextSignals: day.contextSignals?.length ?? 0,
    studyMethod: resolvedMethod?.id ?? 'none',
  });

  // Record method usage for cross-series tracking
  if (resolvedMethod?.id) {
    useUnfoldStore.getState().recordMethodUsage(resolvedMethod.id, devotionalId, dayNumber);
  }

  return day;
}

// ---------------------------------------------------------------------------
// Study Method Resolution
// ---------------------------------------------------------------------------

/**
 * Resolves which Bible study method card to use for a given day.
 * 1. If the arc assigned a studyMethod, look it up directly.
 * 2. Otherwise (legacy series or missing assignment), auto-pick based on
 *    genre, difficulty, and recent methods to avoid repetition.
 */
function resolveMethodForDay(
  dayHint: SeriesArcDay | undefined,
  arc: SeriesArc,
  context: GenerationContext,
): BibleStudyMethodCard | null {
  if (!dayHint) {
    logger.log(`Method resolution: no dayHint — skipping`);
    return null;
  }

  // Path 1: Arc assigned a valid method — look it up
  if (dayHint.studyMethod && BIBLE_STUDY_METHODS[dayHint.studyMethod]) {
    logger.log(`Method resolution day ${dayHint.dayNumber}: arc-assigned → ${dayHint.studyMethod}`);
    return BIBLE_STUDY_METHODS[dayHint.studyMethod];
  }

  // Path 2: Fallback — auto-pick based on genre + difficulty + recency
  const genre = regionToGenre(dayHint.scriptureRegion);
  const difficulty = roleToDifficulty(
    dayHint.narrativeRole,
    context.writingStyle?.faithBackground,
  );

  // Gather recent method IDs from the arc's day hints to avoid repetition
  const currentIndex = arc.dayHints.findIndex(
    (h) => h.dayNumber === dayHint.dayNumber,
  );
  const recentMethodIds = arc.dayHints
    .slice(Math.max(0, currentIndex - 3), currentIndex)
    .map((h) => h.studyMethod)
    .filter((id): id is string => Boolean(id));

  const picked = pickMethod(genre, difficulty, recentMethodIds);
  logger.log(`Method resolution day ${dayHint.dayNumber}: fallback-pick → ${picked?.id ?? 'null'} (genre=${genre}, difficulty=${difficulty})`);
  return picked;
}

// ---------------------------------------------------------------------------
// Prompt Building
// ---------------------------------------------------------------------------

function buildProgressiveUserPrompt(
  context: GenerationContext,
  dayNumber: number,
  arc: SeriesArc,
  memory: ProgressiveMemory,
  scriptureAnalysis: ReturnType<typeof analyzeScriptureVariety>,
): string {
  const dayHint = arc.dayHints.find((h) => h.dayNumber === dayNumber);
  const readingMinutes = context.readingDuration ?? 15;
  const wordTarget =
    readingMinutes === 30 ? '800-1000'
      : readingMinutes === 15 ? '500-700'
      : '250-350';

  const sections: string[] = [];

  // Section 1: Reader context (from onboarding)
  sections.push(`=== READER CONTEXT ===
Name: ${context.name}
About: ${context.aboutMe}
Walking through: ${context.currentSituation}
Feeling: ${context.emotionalState}
Seeking: ${context.spiritualSeeking}
Faith background: ${context.writingStyle?.faithBackground ?? 'growing'}
Bible translation: ${context.bibleTranslation}`);

  // Section 2: Journey narrative (Layer 3)
  if (memory.narrative) {
    sections.push(`=== READER'S JOURNEY NARRATIVE ===
${memory.narrative.narrative}`);
  }

  // Section 3: Summarized history (Layer 2)
  if (memory.summaries.length > 0) {
    const summaryBlock = memory.summaries
      .sort((a, b) => b.startDay - a.startDay)
      .map((s) => `${s.dayRange}: ${s.summary}`)
      .join('\n\n');
    sections.push(`=== SUMMARIZED HISTORY ===
${summaryBlock}`);
  }

  // Section 4: Recent days full detail (Layer 1)
  if (memory.fullDays.length > 0) {
    const fullBlock = memory.fullDays
      .sort((a, b) => b.dayNumber - a.dayNumber)
      .map((d) => {
        const lines = [`Day ${d.dayNumber} — "${d.devotionalTitle}" (${d.scriptureReference})`];
        if (d.readAt) lines.push(`  Read: ${new Date(d.readAt).toLocaleDateString()}`);
        if (d.journalContent) lines.push(`  Journal: ${d.journalContent.slice(0, 500)}`);
        if (d.soapResponses) {
          if (d.soapResponses.observation) lines.push(`  SOAP Observation: ${d.soapResponses.observation.slice(0, 300)}`);
          if (d.soapResponses.application) lines.push(`  SOAP Application: ${d.soapResponses.application.slice(0, 300)}`);
          if (d.soapResponses.prayer) lines.push(`  SOAP Prayer: ${d.soapResponses.prayer.slice(0, 200)}`);
        }
        if (d.questionResponses && d.questionResponses.length > 0) {
          d.questionResponses.forEach((qr) => {
            lines.push(`  Reflection: "${qr.question}" → "${qr.response.slice(0, 200)}"`);
          });
        }
        if (d.prayerRequests && d.prayerRequests.length > 0) {
          d.prayerRequests.forEach((pr) => {
            lines.push(`  Prayer: ${pr.text}${pr.isAnswered ? ' (ANSWERED)' : ''}`);
          });
        }
        if (d.checkInMood) {
          lines.push(`  Check-in: ${d.checkInMoodLabel ?? ''} (${d.checkInMood}/5)${d.checkInChipAnswer ? ` — "${d.checkInChipAnswer}"` : ''}`);
        }
        return lines.join('\n');
      })
      .join('\n\n');
    sections.push(`=== RECENT DAYS (full detail) ===
${fullBlock}`);
  }

  // Section 5: Series arc context
  sections.push(`=== SERIES ARC ===
Theme: ${arc.overarchingTheme}
Shape: ${arc.narrativeShape}
This is Day ${dayNumber} of ${arc.totalDaysPlanned}.${dayHint ? `
Narrative role: ${dayHint.narrativeRole}
Theme hint: ${dayHint.themeHint}
Scripture region: ${dayHint.scriptureRegion}` : ''}`);

  // Section 5.5: Bible study method for this day
  const methodCard = resolveMethodForDay(dayHint, arc, context);
  if (methodCard) {
    sections.push(`=== STUDY METHOD FOR TODAY ===
Method: ${methodCard.name}
${methodCard.promptModifier}

REFLECTION QUESTIONS — shape these to match the study method:
${methodCard.id === 'soap_journal' ? '- Frame questions around Scripture/Observation/Application/Prayer structure' : ''}${methodCard.id === 'lectio_divina' ? '- Frame questions around reading, meditating, praying, contemplating' : ''}${methodCard.id === 'ignatian_contemplation' ? '- Invite the reader to place themselves in the scene — "What do you see? What does Jesus say to you?"' : ''}${methodCard.id === 'verse_mapping' ? '- Ask about cross-references, original language insights, and connections to other passages' : ''}${methodCard.id === 'character_study' ? '- Focus questions on character motivations, choices, and parallels to the reader\'s life' : ''}${!['soap_journal', 'lectio_divina', 'ignatian_contemplation', 'verse_mapping', 'character_study'].includes(methodCard.id) ? `- Align questions with the ${methodCard.name} approach — ask what this method uniquely reveals` : ''}`);
  }

  // Section 6: Scripture variety
  if (scriptureAnalysis.overusedBooks.length > 0 || scriptureAnalysis.underexploredRegions.length > 0) {
    const lines: string[] = ['=== SCRIPTURE VARIETY ==='];
    if (scriptureAnalysis.overusedBooks.length > 0) {
      lines.push(`Avoid as primary: ${scriptureAnalysis.overusedBooks.join(', ')}`);
    }
    if (scriptureAnalysis.underexploredRegions.length > 0) {
      lines.push(`Explore: ${scriptureAnalysis.underexploredRegions.join(', ')}`);
    }
    if (scriptureAnalysis.suggestedBooks.length > 0) {
      lines.push(`Try these books: ${scriptureAnalysis.suggestedBooks.join(', ')}`);
    }
    sections.push(lines.join('\n'));
  }

  // Section 7: Generation instructions
  sections.push(`=== GENERATE DAY ${dayNumber} ===
Write ONE devotional day for a ${readingMinutes}-minute reading (~${wordTarget} words for bodyText).
${dayNumber > 1 ? `
CRITICAL: This day should be deeply informed by the reader's journey so far. Reference their actual words, struggles, prayers, and growth. Do NOT just follow the arc mechanically — let the reader's real engagement shape the content. The arc hint is a guide, not a script.` : ''}

${context.themeCategory ? `Theme focus: ${context.themeCategory}` : ''}
${context.devotionalType ? `Type: ${context.devotionalType}` : ''}
${context.studySubject ? `Subject: ${context.studySubject}` : ''}

Use the reader's context to INFORM the devotional (don't narrate their story back to them).
Use ${context.bibleTranslation} translation. Include the full scripture text.

CRITICAL — NO FIRST PERSON: NEVER write in first person ("I", "I've", "I'm", "my", "me", "we", "our"). You have no personal experiences. Use second person ("you") for the reader, third person for all stories and examples. WRONG: "I drive past every spring." RIGHT: "A woman drives past every spring." or "You know that feeling when..."

Respond with valid JSON only:
{
  "title": "Day title (evocative, 3-7 words)",
  "scriptureReference": "Book Chapter:Verse-Verse",
  "scriptureText": "Full scripture text in ${context.bibleTranslation}",
  "bodyText": "The devotional content (~${wordTarget} words)",
  "quotableLine": "One memorable, shareable line from the text",
  "quotes": [{"text": "...", "author": "..."}],
  "crossReferences": [{"reference": "...", "text": "Full text"}],
  "reflectionQuestions": ["Question 1", "Question 2", "Question 3"],
  "contextNote": "Brief historical/cultural context for the scripture",
  "closingPrayer": "A closing prayer inspired by today's reading",
  "checkInQuestion": "A midday check-in question related to today's theme",
  "checkInChips": ["Quick response 1", "Quick response 2", "Quick response 3"],
  "eveningScriptureRef": "A calming evening scripture reference"
}`);

  return sections.join('\n\n');
}

function buildContextSignalList(memory: ProgressiveMemory, dayNumber: number): string[] {
  const signals: string[] = [];
  if (dayNumber === 1) {
    signals.push('onboarding context');
    return signals;
  }
  if (memory.narrative) signals.push('journey narrative');
  if (memory.summaries.length > 0) signals.push(`${memory.summaries.length} period summaries`);
  for (const day of memory.fullDays) {
    if (day.journalContent) signals.push(`day ${day.dayNumber} journal`);
    if (day.soapResponses) signals.push(`day ${day.dayNumber} SOAP`);
    if (day.prayerRequests?.length) signals.push(`day ${day.dayNumber} prayers (${day.prayerRequests.length})`);
    if (day.checkInMood) signals.push(`day ${day.dayNumber} mood: ${day.checkInMoodLabel}`);
  }
  return signals;
}

// ---------------------------------------------------------------------------
// Context Buffer Assembly
// ---------------------------------------------------------------------------

/**
 * Assembles the context buffer for next-day generation by pulling from
 * the store's journal entries, check-ins, and devotional data.
 */
export function assembleContextBuffer(
  devotionalId: string,
  completedDayNumber: number,
): MemoryLayerFull {
  const store = useUnfoldStore.getState();
  const devotional = store.devotionals.find((d) => d.id === devotionalId);
  const dayData = devotional?.days.find((d) => d.dayNumber === completedDayNumber);

  // Find journal entry for this day
  const journal = store.journalEntries.find(
    (e) => e.devotionalId === devotionalId && e.dayNumber === completedDayNumber,
  );

  // Find check-ins for this day (any timeOfDay)
  const checkIns = store.checkIns.filter(
    (c) => c.devotionalId === devotionalId && c.dayNumber === completedDayNumber,
  );
  // Use the most recent check-in for the summary
  const latestCheckIn = checkIns[0];

  return {
    dayNumber: completedDayNumber,
    devotionalTitle: dayData?.title ?? `Day ${completedDayNumber}`,
    scriptureReference: dayData?.scriptureReference ?? '',
    journalContent: journal?.content,
    soapResponses: journal?.soapResponses,
    questionResponses: journal?.questionResponses,
    prayerRequests: journal?.prayerRequests,
    checkInMood: latestCheckIn?.mood,
    checkInMoodLabel: latestCheckIn?.moodLabel,
    checkInChipAnswer: latestCheckIn?.chipAnswer,
    readAt: dayData?.readAt,
  };
}

// ---------------------------------------------------------------------------
// Memory Layer Maintenance
// ---------------------------------------------------------------------------

/**
 * After a day is completed, update the progressive memory:
 * 1. Push full-day record into Layer 1 (FIFO, max 3)
 * 2. Check if Layer 2 summarization is needed (every 3 evicted days)
 * 3. Check if Layer 3 narrative update is needed (every 7 completed days)
 */
export async function maintainMemoryLayers(
  devotionalId: string,
  completedDay: number,
): Promise<void> {
  const store = useUnfoldStore.getState();
  const devotional = store.devotionals.find((d) => d.id === devotionalId);
  if (!devotional || devotional.generationMode !== 'progressive') return;

  // Step 1: Assemble and push full-day memory
  const dayMemory = assembleContextBuffer(devotionalId, completedDay);
  store.pushFullDayMemory(devotionalId, dayMemory);

  // Step 2: Check if summarization is needed
  // Summarize when we have 4+ completed days and the oldest full-day record
  // was just evicted (Layer 1 only holds 3, so day 4+ triggers summarization)
  const memory = store.devotionals.find((d) => d.id === devotionalId)?.progressiveMemory;
  if (!memory) return;

  const totalCompletedDays = devotional.days.filter((d) => d.isRead).length;
  const lastSummaryEndDay = memory.summaries.length > 0
    ? Math.max(...memory.summaries.map((s) => s.endDay))
    : 0;

  // Summarize if there are 3+ days not covered by any summary or Layer 1
  const oldestFullDay = memory.fullDays.length > 0
    ? Math.min(...memory.fullDays.map((d) => d.dayNumber))
    : completedDay;
  const unsummarizedDays = oldestFullDay - 1 - lastSummaryEndDay;

  if (unsummarizedDays >= 3) {
    try {
      const summary = await generateMemorySummary(
        devotionalId,
        lastSummaryEndDay + 1,
        oldestFullDay - 1,
      );
      store.addMemorySummary(devotionalId, summary);
      logger.log(`Added summary for days ${summary.startDay}-${summary.endDay}`);
    } catch (err) {
      logger.warn('Memory summarization failed (non-critical):', err);
    }
  }

  // Step 3: Check if narrative update is needed (every 7 days)
  if (totalCompletedDays > 0 && totalCompletedDays % 7 === 0) {
    try {
      const narrative = await generateNarrative(devotionalId);
      store.setNarrativeMemory(devotionalId, narrative);
      logger.log(`Narrative updated at day ${completedDay}`);
    } catch (err) {
      logger.warn('Narrative generation failed (non-critical):', err);
    }
  }
}

async function generateMemorySummary(
  devotionalId: string,
  startDay: number,
  endDay: number,
): Promise<MemoryLayerSummary> {
  const store = useUnfoldStore.getState();
  const devotional = store.devotionals.find((d) => d.id === devotionalId);
  if (!devotional) throw new Error('Devotional not found');

  // Gather raw data for the day range
  const dayContexts: string[] = [];
  for (let day = startDay; day <= endDay; day++) {
    const dayData = devotional.days.find((d) => d.dayNumber === day);
    const journal = store.journalEntries.find(
      (e) => e.devotionalId === devotionalId && e.dayNumber === day,
    );
    const checkIn = store.checkIns.find(
      (c) => c.devotionalId === devotionalId && c.dayNumber === day,
    );

    const lines = [`Day ${day}: "${dayData?.title ?? '?'}" (${dayData?.scriptureReference ?? '?'})`];
    if (journal?.content) lines.push(`  Journal: ${journal.content.slice(0, 300)}`);
    if (journal?.soapResponses?.observation) lines.push(`  Observation: ${journal.soapResponses.observation.slice(0, 200)}`);
    if (journal?.prayerRequests?.length) {
      journal.prayerRequests.forEach((p) => lines.push(`  Prayer: ${p.text}${p.isAnswered ? ' (answered)' : ''}`));
    }
    if (checkIn) lines.push(`  Mood: ${checkIn.moodLabel} (${checkIn.mood}/5)`);
    dayContexts.push(lines.join('\n'));
  }

  const prompt = `Summarize this reader's spiritual journey during Days ${startDay}-${endDay}.

${dayContexts.join('\n\n')}

Respond with JSON:
{
  "summary": "2-3 sentences capturing key themes, growth, and struggles",
  "dominantMoods": ["mood1", "mood2"],
  "keyPrayerThemes": ["theme1", "theme2"],
  "spiritualMovement": "One sentence about direction of growth"
}`;

  const { response } = await postJsonWithBackendFallback(
    '/api/generate/devotional',
    {
      model: 'grok-4-1-fast-non-reasoning',
      max_tokens: 500,
      system: 'You are a pastoral counselor summarizing a reader\'s spiritual journey. Be concise, warm, and observant. Respond with valid JSON only.',
      messages: [{ role: 'user', content: prompt }],
    },
    { timeoutMs: 30000 },
  );

  if (!response.ok) throw new Error(`Summary generation failed: ${response.status}`);

  const data = await response.json();
  const text = data?.content?.[0]?.text ?? data?.choices?.[0]?.message?.content ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Summary: no valid JSON');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    throw new Error(`Summary: JSON parse failed — ${parseErr instanceof Error ? parseErr.message : 'unknown'}`);
  }

  return {
    dayRange: `Days ${startDay}-${endDay}`,
    startDay,
    endDay,
    summary: parsed.summary ?? '',
    dominantMoods: parsed.dominantMoods ?? [],
    keyPrayerThemes: parsed.keyPrayerThemes ?? [],
    spiritualMovement: parsed.spiritualMovement ?? '',
    createdAt: new Date().toISOString(),
  };
}

async function generateNarrative(devotionalId: string): Promise<MemoryLayerNarrative> {
  const store = useUnfoldStore.getState();
  const devotional = store.devotionals.find((d) => d.id === devotionalId);
  if (!devotional) throw new Error('Devotional not found');

  const memory = devotional.progressiveMemory;
  const totalCompleted = devotional.days.filter((d) => d.isRead).length;

  // Gather all summaries + current full days
  const parts: string[] = [];
  if (memory?.summaries.length) {
    memory.summaries
      .sort((a, b) => a.startDay - b.startDay)
      .forEach((s) => parts.push(`${s.dayRange}: ${s.summary} [Moods: ${s.dominantMoods.join(', ')}] [Growth: ${s.spiritualMovement}]`));
  }
  if (memory?.fullDays.length) {
    memory.fullDays
      .sort((a, b) => a.dayNumber - b.dayNumber)
      .forEach((d) => {
        const lines = [`Day ${d.dayNumber}: "${d.devotionalTitle}"`];
        if (d.journalContent) lines.push(`Journal excerpt: ${d.journalContent.slice(0, 200)}`);
        if (d.checkInMoodLabel) lines.push(`Mood: ${d.checkInMoodLabel}`);
        parts.push(lines.join(' | '));
      });
  }

  const prompt = `Write a spiritual biography paragraph (200-300 words) for this reader's devotional journey through ${totalCompleted} days.

${parts.join('\n\n')}

This narrative will be used to inform future devotional content. Focus on:
- Their arc of growth and recurring themes
- Pivotal moments or breakthroughs
- Where they seem to be headed spiritually
- Ongoing struggles or prayers

Write in third person ("The reader..."). Be warm but precise. Respond with JSON:
{
  "narrative": "The paragraph..."
}`;

  const { response } = await postJsonWithBackendFallback(
    '/api/generate/devotional',
    {
      model: 'grok-4-1-fast-non-reasoning',
      max_tokens: 800,
      system: 'You are writing a concise spiritual journey narrative for a devotional app\'s memory system. Respond with valid JSON only.',
      messages: [{ role: 'user', content: prompt }],
    },
    { timeoutMs: 30000 },
  );

  if (!response.ok) throw new Error(`Narrative generation failed: ${response.status}`);

  const data = await response.json();
  const text = data?.content?.[0]?.text ?? data?.choices?.[0]?.message?.content ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Narrative: no valid JSON');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    throw new Error(`Narrative: JSON parse failed — ${parseErr instanceof Error ? parseErr.message : 'unknown'}`);
  }
  const existingVersion = memory?.narrative?.version ?? 0;

  return {
    narrative: parsed.narrative ?? '',
    totalDaysCovered: totalCompleted,
    lastUpdatedAt: new Date().toISOString(),
    version: existingVersion + 1,
  };
}

// ---------------------------------------------------------------------------
// Orchestrator: Trigger Next-Day Generation
// ---------------------------------------------------------------------------

/**
 * Main entry point called after day completion or on app open when
 * the next day is missing. Handles memory maintenance + generation.
 */
export async function triggerNextDayGeneration(
  devotionalId: string,
  completedDay: number,
): Promise<DevotionalDay | null> {
  const store = useUnfoldStore.getState();
  const devotional = store.devotionals.find((d) => d.id === devotionalId);

  if (!devotional || devotional.generationMode !== 'progressive') {
    logger.warn('triggerNextDayGeneration called on non-progressive devotional');
    return null;
  }

  const nextDay = completedDay + 1;

  // Check if next day already exists
  if (devotional.days.some((d) => d.dayNumber === nextDay)) {
    logger.log(`Day ${nextDay} already exists, skipping generation`);
    return devotional.days.find((d) => d.dayNumber === nextDay) ?? null;
  }

  // Check if we've reached the end of the series.
  // Always stop at totalDays — even for open-ended series. The extension path
  // explicitly bumps totalDays via extendSeriesArc before triggering generation.
  if (nextDay > devotional.totalDays) {
    logger.log(`Series complete at day ${completedDay} of ${devotional.totalDays}${devotional.seriesArc?.isOpenEnded ? ' (open-ended, awaiting extension)' : ''}`);
    return null;
  }

  // Update generation state
  store.setProgressiveGeneration({
    devotionalId,
    currentDayGeneration: {
      dayNumber: nextDay,
      status: 'generating',
      startedAt: new Date().toISOString(),
      retryCount: 0,
    },
    lastGenerationTriggeredAt: new Date().toISOString(),
  });

  try {
    // Step 1: Maintain memory layers (push completed day context)
    if (completedDay > 0) {
      await maintainMemoryLayers(devotionalId, completedDay);
    }

    // Step 2: Get fresh state after memory update
    const freshDevo = useUnfoldStore.getState().devotionals.find((d) => d.id === devotionalId);
    if (!freshDevo?.seriesArc) {
      throw new Error('No series arc found');
    }

    // Step 3: Build generation context from user profile
    const user = useUnfoldStore.getState().user;
    if (!user) throw new Error('No user profile');

    const recentScriptures = useUnfoldStore.getState().getRecentScriptures(100);

    const context: GenerationContext = {
      name: user.name,
      aboutMe: user.aboutMe,
      currentSituation: user.currentSituation,
      emotionalState: user.emotionalState,
      spiritualSeeking: user.spiritualSeeking,
      readingDuration: user.readingDuration,
      devotionalLength: user.devotionalLength,
      bibleTranslation: user.bibleTranslation,
      themeCategory: freshDevo.themeCategory,
      devotionalType: freshDevo.devotionalType,
      studySubject: freshDevo.studySubject,
      writingStyle: user.writingStyle,
      usedScriptureHistory: recentScriptures,
      seriesPersonaHistory: useUnfoldStore.getState().seriesPersonaHistory,
    };

    // Step 4: Generate the next day
    const memory = freshDevo.progressiveMemory ?? { fullDays: [], summaries: [], narrative: null };
    const day = await generateProgressiveDay(
      devotionalId, nextDay, freshDevo.seriesArc, memory, context, recentScriptures,
    );

    // Step 5: Store the generated day
    store.addGeneratedDay(devotionalId, day);

    // Step 6: Track scripture usage
    if (day.scriptureReference) {
      const book = day.scriptureReference.split(/\s+\d/)[0].trim();
      store.addUsedScriptures([{
        reference: day.scriptureReference,
        book,
        usedAt: new Date().toISOString(),
        devotionalId,
      }]);
    }

    // Step 7: Update generation state
    store.setProgressiveGeneration({
      currentDayGeneration: {
        dayNumber: nextDay,
        status: 'ready',
        completedAt: new Date().toISOString(),
        retryCount: 0,
      },
    });

    logger.log(`Day ${nextDay} generated and stored successfully`);
    return day;
  } catch (err) {
    logger.error(`Failed to generate day ${nextDay}:`, err);
    reportError('progressive-generation', err, { devotionalId, completedDay, nextDay });
    void logBugError('progressive-gen', err instanceof Error ? err : new Error(String(err)), {
      devotionalId,
      completedDay,
      nextDay,
    });

    store.setProgressiveGeneration({
      currentDayGeneration: {
        dayNumber: nextDay,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        retryCount: (store.progressiveGeneration.currentDayGeneration?.retryCount ?? 0) + 1,
      },
    });

    return null;
  }
}
