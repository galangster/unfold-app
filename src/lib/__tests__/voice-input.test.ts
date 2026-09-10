import { fetch as expoFetch } from 'expo/fetch';
import {
  VOICE_INPUT_MAX_BYTES,
  deleteLocalVoiceAudio,
  parseVoiceInputError,
  transcribeVoiceInput,
} from '@/lib/voice-input';

const mockDeleteFile = jest.fn();
let mockFileSize = 1_024;
const mockGetAuthHeaders = jest.fn(async () => ({
  'Content-Type': 'application/json',
  'X-Device-ID': 'device-1',
}));

jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://voice.test',
  getAuthHeaders: () => mockGetAuthHeaders(),
}));

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    exists = true;
    size = mockFileSize;
    constructor(...parts: (string | { uri?: string })[]) {
      this.uri = parts.map((part) => typeof part === 'string' ? part : part.uri ?? '').join('/');
    }
    arrayBuffer = jest.fn(async () => new Uint8Array([9, 8, 7]).buffer);
    delete = mockDeleteFile;
  }
  return { File: MockFile };
});

const mockExpoFetch = expoFetch as jest.Mock;

describe('voice input transcription helper', () => {
  beforeEach(() => {
    mockExpoFetch.mockReset();
    mockDeleteFile.mockReset();
    mockGetAuthHeaders.mockClear();
    mockFileSize = 1_024;
  });

  it('sends authenticated audio/mp4 bytes and returns the transcript', async () => {
    mockExpoFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: jest.fn(async () => JSON.stringify({ transcript: 'I am a parent learning to slow down.' })),
    });

    await expect(transcribeVoiceInput('file:///about-me.m4a', 4_200)).resolves.toBe('I am a parent learning to slow down.');

    expect(mockExpoFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockExpoFetch.mock.calls[0];
    expect(url).toBe('https://voice.test/api/voice-input/transcribe');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('audio/mp4');
    expect(init.headers['X-Device-ID']).toBe('device-1');
    expect(init.headers['X-Audio-Duration-Ms']).toBe('4200');
    expect(typeof init.signal.aborted).toBe('boolean');
    expect(String(init.body.constructor.name)).toBe('MockFile');
  });

  it('caps timer overshoot at the server duration limit', async () => {
    mockExpoFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: jest.fn(async () => JSON.stringify({ transcript: 'Hello.' })),
    });
    await transcribeVoiceInput('file:///about-me.m4a', 120_250);
    expect(mockExpoFetch.mock.calls[0][1].headers['X-Audio-Duration-Ms']).toBe('120000');
  });

  it('omits X-Audio-Duration-Ms when duration is unavailable', async () => {
    mockExpoFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: jest.fn(async () => JSON.stringify({ transcript: 'Hello.' })),
    });

    await transcribeVoiceInput('file:///about-me.m4a');

    expect(mockExpoFetch.mock.calls[0][1].headers['X-Audio-Duration-Ms']).toBeUndefined();
  });

  it('parses standard API errors including 429 and 503', () => {
    expect(parseVoiceInputError(429, JSON.stringify({
      error: { code: 'RATE_LIMITED', message: 'Slow down.' },
    }))).toMatchObject({ code: 'RATE_LIMITED', message: 'Slow down.', status: 429 });

    expect(parseVoiceInputError(503, JSON.stringify({
      error: { code: 'VOICE_CHECK_INS_DISABLED', message: 'Voice is off.' },
    }))).toMatchObject({ code: 'VOICE_CHECK_INS_DISABLED', message: 'Voice is off.', status: 503 });

    expect(parseVoiceInputError(500, 'not-json')).toMatchObject({
      code: 'VOICE_INPUT_REQUEST_FAILED',
      status: 500,
    });
  });

  it('rejects oversized audio before any network call', async () => {
    mockFileSize = VOICE_INPUT_MAX_BYTES + 1;

    await expect(transcribeVoiceInput('file:///too-large.m4a', 1_000)).rejects.toMatchObject({
      code: 'AUDIO_TOO_LARGE',
    });
    expect(mockExpoFetch).not.toHaveBeenCalled();
  });

  it('keeps the local file after a failed transcription', async () => {
    mockExpoFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: jest.fn(async () => JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Try later.' } })),
    });

    await expect(transcribeVoiceInput('file:///about-me.m4a', 2_000)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      message: 'Try later.',
    });
    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  it('does not retry a failed request automatically', async () => {
    mockExpoFetch.mockRejectedValueOnce(new Error('offline'));

    await expect(transcribeVoiceInput('file:///about-me.m4a', 2_000)).rejects.toMatchObject({
      code: 'TRANSCRIBE_NETWORK_FAILED',
    });
    expect(mockExpoFetch).toHaveBeenCalledTimes(1);
  });

  it('honors an external AbortController and does not retry', async () => {
    const controller = new AbortController();
    mockExpoFetch.mockImplementationOnce(async (_url: string, init: { signal: AbortSignal }) => {
      if (init.signal.aborted) throw new Error('aborted');
      await new Promise<void>((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
      return { ok: true, status: 200, text: async () => JSON.stringify({ transcript: 'late' }) };
    });

    const request = transcribeVoiceInput('file:///about-me.m4a', 2_000, controller.signal);
    await Promise.resolve();
    controller.abort();

    await expect(request).rejects.toMatchObject({ code: 'TRANSCRIBE_CANCELLED' });
    expect(mockExpoFetch).toHaveBeenCalledTimes(1);
  });

  it('deletes the local audio file on discard', () => {
    deleteLocalVoiceAudio('file:///about-me.m4a');
    expect(mockDeleteFile).toHaveBeenCalledTimes(1);


  });

  it('does not log audio, transcripts, or personal text while parsing responses', () => {
    const error = parseVoiceInputError(400, JSON.stringify({
      error: { code: 'BAD_AUDIO', message: 'Could not hear that.' },
    }));
    expect(JSON.stringify(error)).not.toContain('I am a parent');
    expect(error.message).toBe('Could not hear that.');
  });
});
