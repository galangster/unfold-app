/**
 * The backend answers a device over its daily AI budget with
 * 429 { error: { code: 'SPEND_CAP_REACHED', retryAfter } } + Retry-After.
 * These helpers tell that apart from ordinary rate limiting and turn
 * retryAfter into calm copy that says roughly when the budget frees up.
 */
import {
  AiBudgetError,
  aiBudgetErrorFromBody,
  dailyAiBudgetMessage,
  formatRetryAfter,
  isDailyAiBudgetMessage,
  parseAiRateLimitBody,
  parseRetryAfterSeconds,
  readAiBudgetError,
} from '@/lib/ai-budget-error';

const spendCapBody = (retryAfter?: number) =>
  JSON.stringify({
    error: {
      code: 'SPEND_CAP_REACHED',
      message: `Daily AI budget used up. Try again in ${retryAfter ?? 0} seconds.`,
      ...(retryAfter === undefined ? {} : { retryAfter }),
    },
  });

const rateLimitedBody = JSON.stringify({
  error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again in 30 seconds.', retryAfter: 30 },
});

describe('parseRetryAfterSeconds', () => {
  it.each([
    [5400, 5400],
    ['5400', 5400],
    [' 42 ', 42],
    [0, 0],
    [12.2, 13],
  ])('reads %p as %p seconds', (input, expected) => {
    expect(parseRetryAfterSeconds(input)).toBe(expected);
  });

  it.each([[undefined], [null], [''], ['soon'], [-1], [NaN], [Infinity], [{}]])(
    'rejects %p',
    (input) => {
      expect(parseRetryAfterSeconds(input)).toBeNull();
    },
  );
});

describe('parseAiRateLimitBody', () => {
  it('reads the code and retryAfter from the JSON envelope', () => {
    expect(parseAiRateLimitBody(spendCapBody(5400))).toEqual({
      code: 'SPEND_CAP_REACHED',
      retryAfterSeconds: 5400,
    });
  });

  it('distinguishes ordinary rate limiting', () => {
    expect(parseAiRateLimitBody(rateLimitedBody)).toEqual({
      code: 'RATE_LIMITED',
      retryAfterSeconds: 30,
    });
  });

  it('falls back to the Retry-After header when the body has no retryAfter', () => {
    expect(parseAiRateLimitBody(spendCapBody(), '900')).toEqual({
      code: 'SPEND_CAP_REACHED',
      retryAfterSeconds: 900,
    });
  });

  it('prefers the body retryAfter over the header', () => {
    expect(parseAiRateLimitBody(spendCapBody(5400), '10').retryAfterSeconds).toBe(5400);
  });

  it.each([[''], [null], [undefined], ['<html>Too Many Requests</html>'], ['{"error":"nope"}']])(
    'survives a non-envelope body (%p) and still honours the header',
    (body) => {
      expect(parseAiRateLimitBody(body, '60')).toEqual({ code: null, retryAfterSeconds: 60 });
    },
  );
});

describe('formatRetryAfter', () => {
  it.each([
    [0, 'about a minute'],
    [30, 'about a minute'],
    [89, 'about a minute'],
    [90, 'about 2 minutes'],
    [300, 'about 5 minutes'],
    [3570, 'about an hour'],
    [3600, 'about an hour'],
    [5400, 'about 2 hours'],
    [43200, 'about 12 hours'],
    [86400, 'about 24 hours'],
  ])('%p seconds → %p', (seconds, expected) => {
    expect(formatRetryAfter(seconds)).toBe(expected);
  });
});

describe('dailyAiBudgetMessage', () => {
  it('says the budget is used up and roughly when it resets', () => {
    expect(dailyAiBudgetMessage(5400)).toBe(
      "You've used up your daily AI budget. It resets in about 2 hours.",
    );
  });

  it('stays calm without a reset estimate', () => {
    expect(dailyAiBudgetMessage(null)).toBe(
      "You've used up your daily AI budget. Please try again later.",
    );
  });

  it('is recognisable to the keyword-based error mappers', () => {
    expect(isDailyAiBudgetMessage(dailyAiBudgetMessage(600))).toBe(true);
    expect(isDailyAiBudgetMessage(dailyAiBudgetMessage(null))).toBe(true);
    expect(isDailyAiBudgetMessage('Rate limit exceeded. Please wait a moment and try again.')).toBe(false);
  });
});

describe('aiBudgetErrorFromBody', () => {
  it('builds an AiBudgetError for a 429 SPEND_CAP_REACHED', () => {
    const err = aiBudgetErrorFromBody(429, spendCapBody(5400), '5400');
    expect(err).toBeInstanceOf(AiBudgetError);
    expect(err).toBeInstanceOf(Error);
    expect(err?.status).toBe(429);
    expect(err?.code).toBe('SPEND_CAP_REACHED');
    expect(err?.retryAfterSeconds).toBe(5400);
    expect(err?.message).toBe("You've used up your daily AI budget. It resets in about 2 hours.");
  });

  it('returns null for an ordinary 429', () => {
    expect(aiBudgetErrorFromBody(429, rateLimitedBody, '30')).toBeNull();
  });

  it('returns null for a non-429 even with a budget-shaped body', () => {
    expect(aiBudgetErrorFromBody(503, spendCapBody(5400))).toBeNull();
  });
});

describe('readAiBudgetError', () => {
  function response(status: number, body: string, retryAfter?: string) {
    const text = jest.fn(async () => body);
    return {
      response: {
        status,
        headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? retryAfter ?? null : null) },
        text,
      },
      text,
    };
  }

  it('reads the body of a budget 429 and takes retryAfter from the header when needed', async () => {
    const { response: res } = response(429, spendCapBody(), '600');
    const err = await readAiBudgetError(res);
    expect(err?.message).toBe("You've used up your daily AI budget. It resets in about 10 minutes.");
  });

  it('does not touch the body of a non-429', async () => {
    const { response: res, text } = response(500, spendCapBody(5400));
    expect(await readAiBudgetError(res)).toBeNull();
    expect(text).not.toHaveBeenCalled();
  });

  it('tolerates a response without headers or a readable body', async () => {
    expect(await readAiBudgetError({ status: 429 })).toBeNull();
    expect(
      await readAiBudgetError({ status: 429, text: async () => { throw new Error('closed'); } }),
    ).toBeNull();
  });
});
