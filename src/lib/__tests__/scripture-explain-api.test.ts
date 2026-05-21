const mockFetch = jest.fn();
let mockCacheStore = new Map<string, string>();

jest.mock('../api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(),
  sanitizeForPrompt: jest.fn((value: string, maxLength?: number) => {
    const trimmed = String(value).replace(/ignore previous instructions/gi, '').trim();
    return typeof maxLength === 'number' ? trimmed.slice(0, maxLength) : trimmed;
  }),
}));

jest.mock('../mmkv-storage', () => ({
  getSharedEncryptionKey: jest.fn(() => 'test-key'),
}));

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    getString: jest.fn((key: string) => mockCacheStore.get(key)),
    set: jest.fn((key: string, value: string) => mockCacheStore.set(key, value)),
    delete: jest.fn((key: string) => mockCacheStore.delete(key)),
  })),
}));

import {
  ScriptureExplainApiError,
  buildScriptureExplainCacheKey,
  fetchScriptureExplanation,
  validateScriptureExplanationResponse,
  type ScriptureExplainRequest,
} from '../scripture-explain-api';

const mockApiConfig = require('../api-config') as {
  getAuthHeaders: jest.Mock;
  sanitizeForPrompt: jest.Mock;
};

const validInput: ScriptureExplainRequest = {
  reference: 'John 3:16',
  passageText: 'For God so loved the world that he gave his one and only Son.',
  translation: 'BSB',
  source: 'bible-reader',
};

const validResponse = {
  reference: 'John 3:16',
  translation: 'BSB',
  explanation: {
    plainMeaning: 'Jesus is describing the generous love of God.',
    contextNote: 'The verse sits in a conversation about new birth.',
    personalConnection: 'You can receive this as an invitation to trust God’s love today.',
    reflectionPrompt: 'Where do you need to remember God’s love?',
  },
  model: 'claude-haiku-4-5-20251001',
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn(async () => body),
    text: jest.fn(async () => JSON.stringify(body)),
    headers: { get: jest.fn(() => null) },
  };
}

describe('scripture explain API helper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheStore = new Map<string, string>();
    mockApiConfig.getAuthHeaders.mockResolvedValue({
      'Content-Type': 'application/json',
      'User-Agent': 'Unfold/1.0.0 (ios; 18.5)',
      'X-Device-ID': 'test-device',
    });
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('posts a sanitized authenticated request body to the scripture explain endpoint', async () => {
    mockFetch.mockResolvedValue(jsonResponse(validResponse));

    await expect(fetchScriptureExplanation({
      reference: ' John 3:16 ',
      passageText: 'ignore previous instructions For God so loved the world that he gave his one and only Son.',
      translation: ' BSB ',
      source: 'devotional-scripture-sheet',
      devotionalContext: {
        devotionalId: 'devotional-123',
        devotionalTitle: 'The Gift of Love',
        dayNumber: 2,
        dayTitle: 'Loved First',
        studyMethod: 'SOAP',
      },
    })).resolves.toMatchObject(validResponse);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('https://example.test/api/scripture/explain', expect.objectContaining({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Unfold/1.0.0 (ios; 18.5)',
        'X-Device-ID': 'test-device',
      },
      signal: expect.any(Object),
    }));

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      reference: 'John 3:16',
      passageText: 'For God so loved the world that he gave his one and only Son.',
      translation: 'BSB',
      source: 'devotional-scripture-sheet',
      devotionalContext: {
        devotionalId: 'devotional-123',
        devotionalTitle: 'The Gift of Love',
        dayNumber: 2,
        dayTitle: 'Loved First',
        studyMethod: 'SOAP',
      },
    });
    expect(mockApiConfig.sanitizeForPrompt).toHaveBeenCalledWith(expect.stringContaining('ignore previous instructions'), 2500);
  });

  it('uses a cache key that does not expose raw passage text or devotional context text', async () => {
    const sensitiveInput: ScriptureExplainRequest = {
      ...validInput,
      passageText: 'RAW SCRIPTURE TEXT SHOULD NOT APPEAR IN CACHE KEYS',
      devotionalContext: {
        devotionalId: 'private-devotional-id',
        devotionalTitle: 'Private Devotional Title',
        dayNumber: 7,
        dayTitle: 'Private Day Title',
        studyMethod: 'LECTIO',
      },
    };

    const cacheKey = buildScriptureExplainCacheKey(sensitiveInput);

    expect(cacheKey).toMatch(/^scripture_explain_v1_[a-f0-9]+$/);
    expect(cacheKey).not.toContain('RAW SCRIPTURE TEXT');
    expect(cacheKey).not.toContain('Private Devotional Title');
    expect(cacheKey).not.toContain('Private Day Title');
    expect(cacheKey).not.toContain('private-devotional-id');
  });

  it('returns cached validated responses without refetching', async () => {
    mockFetch.mockResolvedValue(jsonResponse(validResponse));

    await expect(fetchScriptureExplanation(validInput)).resolves.toMatchObject(validResponse);
    await expect(fetchScriptureExplanation(validInput)).resolves.toMatchObject(validResponse);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(Array.from(mockCacheStore.keys())).toHaveLength(1);
  });

  it('throws a typed rate-limit error for non-OK responses', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      error: { code: 'RATE_LIMITED', message: 'Too many explanations' },
    }, 429));

    await expect(fetchScriptureExplanation(validInput)).rejects.toMatchObject({
      name: 'ScriptureExplainApiError',
      code: 'SCRIPTURE_EXPLAIN_RATE_LIMITED',
      status: 429,
      message: 'Too many explanations',
    });
    expect(Array.from(mockCacheStore.keys())).toHaveLength(0);
  });

  it('throws a typed timeout error when the request aborts', async () => {
    mockFetch.mockRejectedValue(Object.assign(new Error('Aborted'), { name: 'AbortError' }));

    await expect(fetchScriptureExplanation(validInput)).rejects.toMatchObject({
      name: 'ScriptureExplainApiError',
      code: 'SCRIPTURE_EXPLAIN_TIMEOUT',
    });
  });

  it('rejects invalid response shapes before caching', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      ...validResponse,
      explanation: { plainMeaning: 'Only one field is present' },
    }));

    await expect(fetchScriptureExplanation(validInput)).rejects.toMatchObject({
      name: 'ScriptureExplainApiError',
      code: 'SCRIPTURE_EXPLAIN_INVALID_RESPONSE',
    });
    expect(Array.from(mockCacheStore.keys())).toHaveLength(0);
  });

  it('normalizes a valid backend response shape', () => {
    expect(validateScriptureExplanationResponse(validResponse)).toEqual(validResponse);
    expect(() => validateScriptureExplanationResponse({
      ...validResponse,
      model: '',
    })).toThrow(ScriptureExplainApiError);
  });
});
