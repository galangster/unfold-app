import { MMKV } from 'react-native-mmkv';
import { PRIMARY_BACKEND_URL, getAuthHeaders, sanitizeForPrompt } from './api-config';
import { getSharedEncryptionKey } from './mmkv-storage';

export type ScriptureExplainSource = 'bible-reader' | 'devotional-scripture-sheet';

export interface ScriptureExplainDevotionalContext {
  devotionalId?: string;
  devotionalTitle?: string;
  dayNumber?: number;
  dayTitle?: string;
  studyMethod?: string;
}

export interface ScriptureExplainRequest {
  reference: string;
  passageText: string;
  translation: string;
  source: ScriptureExplainSource;
  devotionalContext?: ScriptureExplainDevotionalContext;
}

export interface ScriptureExplanationResponse {
  reference: string;
  translation: string;
  explanation: {
    plainMeaning: string;
    contextNote?: string;
    personalConnection: string;
    reflectionPrompt?: string;
  };
  model: string;
  cacheKey?: string;
}

export type ScriptureExplainApiErrorCode =
  | 'SCRIPTURE_EXPLAIN_TIMEOUT'
  | 'SCRIPTURE_EXPLAIN_RATE_LIMITED'
  | 'SCRIPTURE_EXPLAIN_UNAUTHORIZED'
  | 'SCRIPTURE_EXPLAIN_UNAVAILABLE'
  | 'SCRIPTURE_EXPLAIN_NETWORK_ERROR'
  | 'SCRIPTURE_EXPLAIN_INVALID_RESPONSE';

export class ScriptureExplainApiError extends Error {
  constructor(
    public code: ScriptureExplainApiErrorCode,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'ScriptureExplainApiError';
  }
}

const SCRIPTURE_EXPLAIN_TIMEOUT_MS = 15_000;
const CACHE_KEY_PREFIX = 'scripture_explain_v1';

const scriptureExplainEncKey = getSharedEncryptionKey();
const scriptureExplainCache = scriptureExplainEncKey
  ? new MMKV({ id: 'unfold-scripture-explain-cache', encryptionKey: scriptureExplainEncKey })
  : new MMKV({ id: 'unfold-scripture-explain-cache' });

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeForCache(input: ScriptureExplainRequest): string {
  return JSON.stringify({
    reference: input.reference.trim().toLowerCase(),
    passageText: input.passageText.trim(),
    translation: input.translation.trim().toUpperCase(),
    source: input.source,
    devotionalContext: input.devotionalContext
      ? {
          devotionalId: input.devotionalContext.devotionalId?.trim() ?? null,
          devotionalTitle: input.devotionalContext.devotionalTitle?.trim() ?? null,
          dayNumber: input.devotionalContext.dayNumber ?? null,
          dayTitle: input.devotionalContext.dayTitle?.trim() ?? null,
          studyMethod: input.devotionalContext.studyMethod?.trim() ?? null,
        }
      : null,
  });
}

export function buildScriptureExplainCacheKey(input: ScriptureExplainRequest): string {
  return `${CACHE_KEY_PREFIX}_${stableHash(normalizeForCache(input))}`;
}

function readCachedExplanation(cacheKey: string): ScriptureExplanationResponse | null {
  const raw = scriptureExplainCache.getString(cacheKey);
  if (!raw) return null;

  try {
    return validateScriptureExplanationResponse(JSON.parse(raw));
  } catch {
    scriptureExplainCache.delete(cacheKey);
    return null;
  }
}

function cacheExplanation(cacheKey: string, response: ScriptureExplanationResponse): void {
  scriptureExplainCache.set(cacheKey, JSON.stringify(response));
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ScriptureExplainApiError(
      'SCRIPTURE_EXPLAIN_INVALID_RESPONSE',
      `Invalid scripture explanation response: ${field} must be a non-empty string`,
    );
  }
  return value.trim();
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new ScriptureExplainApiError(
      'SCRIPTURE_EXPLAIN_INVALID_RESPONSE',
      `Invalid scripture explanation response: ${field} must be a string`,
    );
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function validateScriptureExplanationResponse(value: unknown): ScriptureExplanationResponse {
  if (!value || typeof value !== 'object') {
    throw new ScriptureExplainApiError(
      'SCRIPTURE_EXPLAIN_INVALID_RESPONSE',
      'Invalid scripture explanation response: root must be an object',
    );
  }

  const input = value as Record<string, unknown>;
  const explanation = input.explanation;
  if (!explanation || typeof explanation !== 'object') {
    throw new ScriptureExplainApiError(
      'SCRIPTURE_EXPLAIN_INVALID_RESPONSE',
      'Invalid scripture explanation response: explanation must be an object',
    );
  }

  const explanationValue = explanation as Record<string, unknown>;
  const contextNote = optionalString(explanationValue.contextNote, 'explanation.contextNote');
  const reflectionPrompt = optionalString(explanationValue.reflectionPrompt, 'explanation.reflectionPrompt');
  const cacheKey = optionalString(input.cacheKey, 'cacheKey');

  return {
    reference: requireNonEmptyString(input.reference, 'reference'),
    translation: requireNonEmptyString(input.translation, 'translation'),
    explanation: {
      plainMeaning: requireNonEmptyString(explanationValue.plainMeaning, 'explanation.plainMeaning'),
      ...(contextNote ? { contextNote } : {}),
      personalConnection: requireNonEmptyString(explanationValue.personalConnection, 'explanation.personalConnection'),
      ...(reflectionPrompt ? { reflectionPrompt } : {}),
    },
    model: requireNonEmptyString(input.model, 'model'),
    ...(cacheKey ? { cacheKey } : {}),
  };
}

function sanitizeInput(input: ScriptureExplainRequest): ScriptureExplainRequest {
  const devotionalContext = input.devotionalContext
    ? {
        ...(input.devotionalContext.devotionalId
          ? { devotionalId: sanitizeForPrompt(input.devotionalContext.devotionalId, 120) }
          : {}),
        ...(input.devotionalContext.devotionalTitle
          ? { devotionalTitle: sanitizeForPrompt(input.devotionalContext.devotionalTitle, 200) }
          : {}),
        ...(input.devotionalContext.dayNumber
          ? { dayNumber: input.devotionalContext.dayNumber }
          : {}),
        ...(input.devotionalContext.dayTitle
          ? { dayTitle: sanitizeForPrompt(input.devotionalContext.dayTitle, 200) }
          : {}),
        ...(input.devotionalContext.studyMethod
          ? { studyMethod: sanitizeForPrompt(input.devotionalContext.studyMethod, 80) }
          : {}),
      }
    : undefined;

  return {
    reference: sanitizeForPrompt(input.reference, 100),
    passageText: sanitizeForPrompt(input.passageText, 2500),
    translation: sanitizeForPrompt(input.translation, 20),
    source: input.source,
    ...(devotionalContext && Object.keys(devotionalContext).length > 0 ? { devotionalContext } : {}),
  };
}

async function fetchWithTimeout(url: string, options: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function parseErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const body = await response.json() as { error?: { message?: unknown } };
    return typeof body.error?.message === 'string' ? body.error.message : undefined;
  } catch {
    try {
      const text = await response.text();
      return text.trim().slice(0, 200) || undefined;
    } catch {
      return undefined;
    }
  }
}

function codeForStatus(status: number): ScriptureExplainApiErrorCode {
  if (status === 401 || status === 403) return 'SCRIPTURE_EXPLAIN_UNAUTHORIZED';
  if (status === 429) return 'SCRIPTURE_EXPLAIN_RATE_LIMITED';
  return 'SCRIPTURE_EXPLAIN_UNAVAILABLE';
}

export async function fetchScriptureExplanation(
  input: ScriptureExplainRequest,
  options: { timeoutMs?: number; useCache?: boolean } = {},
): Promise<ScriptureExplanationResponse> {
  const useCache = options.useCache ?? true;
  const cacheKey = buildScriptureExplainCacheKey(input);

  if (useCache) {
    const cached = readCachedExplanation(cacheKey);
    if (cached) return cached;
  }

  try {
    const response = await fetchWithTimeout(
      `${PRIMARY_BACKEND_URL}/api/scripture/explain`,
      {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify(sanitizeInput(input)),
      },
      options.timeoutMs ?? SCRIPTURE_EXPLAIN_TIMEOUT_MS,
    );

    if (!response.ok) {
      throw new ScriptureExplainApiError(
        codeForStatus(response.status),
        await parseErrorMessage(response) ?? `Scripture explanation failed with status ${response.status}`,
        response.status,
      );
    }

    const parsed = validateScriptureExplanationResponse(await response.json());
    if (useCache) cacheExplanation(cacheKey, parsed);
    return parsed;
  } catch (error) {
    if (error instanceof ScriptureExplainApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ScriptureExplainApiError(
        'SCRIPTURE_EXPLAIN_TIMEOUT',
        'Scripture explanation timed out',
      );
    }
    throw new ScriptureExplainApiError(
      'SCRIPTURE_EXPLAIN_NETWORK_ERROR',
      error instanceof Error ? error.message : 'Scripture explanation network error',
    );
  }
}
