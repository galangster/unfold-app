/**
 * Client side of the backend's per-device daily AI budget.
 *
 * When a device has used its daily budget, the AI proxy routes
 * (/api/generate/*) and POST /api/companion/chat answer
 *
 *   429 { error: { code: 'SPEND_CAP_REACHED', message, retryAfter: <seconds> } }
 *
 * plus a Retry-After header, where retryAfter is the time until the oldest
 * counted spend ages out of the trailing 24h window. Ordinary rate limiting
 * uses the same envelope with code 'RATE_LIMITED' and keeps its existing
 * handling. A budget response is final for now: callers show calm copy that
 * says roughly when the budget frees up and never retry it — a second
 * request only costs another 429.
 */

export const SPEND_CAP_REACHED_CODE = 'SPEND_CAP_REACHED';

/** Lead sentence of every daily-budget message; keyword mappers key on it. */
const DAILY_AI_BUDGET_LEAD = "You've used up your daily AI budget.";

export interface AiRateLimitInfo {
  /** `error.code` from the JSON body (SPEND_CAP_REACHED, RATE_LIMITED, …). */
  code: string | null;
  /** Seconds until a retry may succeed — body `retryAfter`, else Retry-After. */
  retryAfterSeconds: number | null;
}

/** The slice of fetch's Response / expo's FetchResponse these helpers touch. */
export interface RateLimitedResponseLike {
  status: number;
  headers?: { get(name: string): string | null } | null;
  text?: () => Promise<string>;
}

/** Whole non-negative seconds from a number or numeric string, else null. */
export function parseRetryAfterSeconds(value: unknown): number | null {
  const seconds =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.ceil(seconds);
}

export function parseAiRateLimitBody(
  bodyText: string | null | undefined,
  retryAfterHeader?: string | null,
): AiRateLimitInfo {
  let code: string | null = null;
  let retryAfterSeconds: number | null = null;

  if (bodyText) {
    try {
      const parsed = JSON.parse(bodyText) as { error?: unknown };
      const error = parsed?.error;
      if (error && typeof error === 'object') {
        const { code: rawCode, retryAfter } = error as { code?: unknown; retryAfter?: unknown };
        if (typeof rawCode === 'string') code = rawCode;
        retryAfterSeconds = parseRetryAfterSeconds(retryAfter);
      }
    } catch {
      // Not JSON (HTML error page, empty body) — nothing to read.
    }
  }

  if (retryAfterSeconds === null) {
    retryAfterSeconds = parseRetryAfterSeconds(retryAfterHeader);
  }

  return { code, retryAfterSeconds };
}

/** "about a minute" / "about 5 minutes" / "about an hour" / "about 2 hours". */
export function formatRetryAfter(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 2) return 'about a minute';
  if (minutes < 60) return `about ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours < 2 ? 'about an hour' : `about ${hours} hours`;
}

export function dailyAiBudgetMessage(retryAfterSeconds: number | null): string {
  if (retryAfterSeconds === null) {
    return `${DAILY_AI_BUDGET_LEAD} Please try again later.`;
  }
  return `${DAILY_AI_BUDGET_LEAD} It resets in ${formatRetryAfter(retryAfterSeconds)}.`;
}

/** True for a message built by dailyAiBudgetMessage — mappers pass it through. */
export function isDailyAiBudgetMessage(message: string): boolean {
  return message.startsWith(DAILY_AI_BUDGET_LEAD);
}

export class AiBudgetError extends Error {
  readonly status = 429;
  readonly code = SPEND_CAP_REACHED_CODE;

  constructor(readonly retryAfterSeconds: number | null) {
    super(dailyAiBudgetMessage(retryAfterSeconds));
    this.name = 'AiBudgetError';
  }
}

export function readRetryAfterHeader(response: RateLimitedResponseLike): string | null {
  try {
    return response.headers?.get('retry-after') ?? null;
  } catch {
    return null;
  }
}

/** An AiBudgetError for a 429 SPEND_CAP_REACHED body; null for anything else. */
export function aiBudgetErrorFromBody(
  status: number,
  bodyText: string | null | undefined,
  retryAfterHeader?: string | null,
): AiBudgetError | null {
  if (status !== 429) return null;
  const info = parseAiRateLimitBody(bodyText, retryAfterHeader);
  return info.code === SPEND_CAP_REACHED_CODE ? new AiBudgetError(info.retryAfterSeconds) : null;
}

/**
 * Reads a failed response's body; only a 429 SPEND_CAP_REACHED yields an
 * error. Callers that were about to throw a bare status error can do
 * `throw (await readAiBudgetError(response)) ?? new Error(...)`.
 */
export async function readAiBudgetError(
  response: RateLimitedResponseLike,
): Promise<AiBudgetError | null> {
  if (response.status !== 429) return null;
  let bodyText = '';
  try {
    bodyText = typeof response.text === 'function' ? await response.text() : '';
  } catch {
    bodyText = '';
  }
  return aiBudgetErrorFromBody(response.status, bodyText, readRetryAfterHeader(response));
}
