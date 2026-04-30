jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache/' },
  File: jest.fn().mockImplementation((base: string, name: string) => ({
    uri: `${base}${name}`,
    exists: false,
    size: 0,
    delete: jest.fn(),
  })),
  Directory: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  downloadAsync: jest.fn(),
  getInfoAsync: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@/lib/report-error', () => ({ reportError: jest.fn() }));

jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://api.unfoldapp.co',
  getAuthHeaders: jest.fn(),
}));

jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(),
  incrementRateLimit: jest.fn(),
}));

jest.mock('@/lib/audio-cache', () => ({
  recordCachedFile: jest.fn(),
  touchCachedFile: jest.fn(),
  saveMetadata: jest.fn(),
}));

const mockFileSystem = require('expo-file-system/legacy') as {
  downloadAsync: jest.Mock;
  getInfoAsync: jest.Mock;
};
const mockApiConfig = require('@/lib/api-config') as {
  getAuthHeaders: jest.Mock;
};
const mockRateLimit = require('@/lib/rate-limit') as {
  checkRateLimit: jest.Mock;
  incrementRateLimit: jest.Mock;
};

describe('TTS native audio downloads', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockApiConfig.getAuthHeaders.mockResolvedValue({
      'Content-Type': 'application/json',
      'User-Agent': 'Unfold/1.0.0 (ios; 18.5)',
      'X-Device-ID': 'test-device',
    });
    mockRateLimit.checkRateLimit.mockResolvedValue({ allowed: true });
    mockRateLimit.incrementRateLimit.mockResolvedValue(undefined);
    mockFileSystem.downloadAsync.mockResolvedValue({ status: 200 });
    mockFileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 2048 });
  });

  it('passes app headers to backend fallback downloads without a JSON content type', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ downloadId: 'download-id' }),
    }) as unknown as typeof fetch;

    const { streamDevotionalAudio } = require('../tts-service') as typeof import('../tts-service');

    await expect(streamDevotionalAudio('hello backend download', 'grace')).resolves.toEqual({
      audioUrl: expect.stringContaining('tts_'),
    });

    expect(mockFileSystem.downloadAsync).toHaveBeenCalledWith(
      'https://api.unfoldapp.co/api/tts-download/download-id',
      expect.stringContaining('tts_'),
      {
        headers: {
          'User-Agent': 'Unfold/1.0.0 (ios; 18.5)',
          'X-Device-ID': 'test-device',
        },
      },
    );
  });

  it('does not send app/device headers to external audio URLs', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ downloadId: 'download-id', audioUrl: 'https://cdn.example/audio.mp3' }),
    }) as unknown as typeof fetch;

    const { streamDevotionalAudio } = require('../tts-service') as typeof import('../tts-service');

    await expect(streamDevotionalAudio('hello external audio', 'grace')).resolves.toEqual({
      audioUrl: expect.stringContaining('tts_'),
    });

    expect(mockFileSystem.downloadAsync).toHaveBeenCalledWith(
      'https://cdn.example/audio.mp3',
      expect.stringContaining('tts_'),
      undefined,
    );
  });
});
