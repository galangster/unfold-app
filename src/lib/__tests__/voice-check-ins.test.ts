/* eslint-disable import/first */
const mockValues = new Map<string, string>();
const mockDeleteFile = jest.fn();

jest.mock('@/lib/mmkv-storage', () => ({
  mmkvStorage: {
    getItem: jest.fn((key: string) => mockValues.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => mockValues.set(key, value)),
    removeItem: jest.fn((key: string) => mockValues.delete(key)),
  },
}));

jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://voice.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json', 'X-Device-ID': 'device-1' })),
}));

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digest: jest.fn(async () => new Uint8Array([1, 2, 255]).buffer),
  randomUUID: jest.fn(() => '11111111-1111-4111-8111-111111111111'),
}));

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    exists = true;
    constructor(...parts: (string | { uri?: string })[]) {
      this.uri = parts.map((part) => typeof part === 'string' ? part : part.uri ?? '').join('/');
    }
    arrayBuffer = jest.fn(async () => new Uint8Array([9, 8, 7]).buffer);
    delete = mockDeleteFile;
    static downloadFileAsync = jest.fn();
  }
  return {
    File: MockFile,
    Directory: class { exists = true; create = jest.fn(); uri = 'file:///documents/voice-check-ins'; },
    Paths: { document: { uri: 'file:///documents' } },
  };
});

import {
  createVoiceCheckInDraft,
  discardVoiceCheckInDraft,
  readVoiceCheckInDraft,
  retryPendingVoiceAudioCleanup,
  sendVoiceCheckInDraft,
  VOICE_CHECK_IN_PENDING_DELETIONS_KEY,
} from '@/lib/voice-check-ins';
import { fetch as expoFetch } from 'expo/fetch';

const mockExpoFetch = expoFetch as jest.Mock;

describe('voice check-in local retry', () => {
  beforeEach(() => {
    mockValues.clear();
    mockExpoFetch.mockReset();
    mockDeleteFile.mockReset();
  });

  it('keeps the same draft and idempotency key after an upload failure', async () => {
    const draft = createVoiceCheckInDraft('file:///draft.m4a', 5_014, '2026-09-08T12:00:00.000Z');
    mockExpoFetch.mockRejectedValueOnce(new Error('offline'));

    await expect(sendVoiceCheckInDraft(draft)).rejects.toMatchObject({ code: 'UPLOAD_NETWORK_FAILED' });

    expect(readVoiceCheckInDraft()).toMatchObject({
      idempotencyKey: draft.idempotencyKey,
      audioUri: draft.audioUri,
      audioSha256: '0102ff',
      status: 'failed',
    });
    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  it('removes the local audio only after a ready response reconciles', async () => {
    const draft = createVoiceCheckInDraft('file:///draft.m4a', 5_014, '2026-09-08T12:00:00.000Z');
    mockExpoFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: jest.fn(async () => JSON.stringify({
        checkIn: {
          id: 'saved-1',
          status: 'ready',
          transcript: 'A synthetic check-in.',
          durationMs: 5_014,
          capturedAt: draft.capturedAt,
          createdAt: draft.capturedAt,
          updatedAt: draft.capturedAt,
        },
      })),
    });

    await expect(sendVoiceCheckInDraft(draft)).resolves.toMatchObject({ id: 'saved-1' });
    expect(readVoiceCheckInDraft()).toBeNull();
    expect(mockDeleteFile).toHaveBeenCalledTimes(1);
  });

  it('recovers an interrupted sending state as a retryable failure', () => {
    const draft = createVoiceCheckInDraft('file:///draft.m4a', 5_014);
    mockValues.set('@unfold_voice_check_in_draft_v1', JSON.stringify({ ...draft, status: 'sending' }));

    expect(readVoiceCheckInDraft()).toMatchObject({
      idempotencyKey: draft.idempotencyKey,
      status: 'failed',
    });
  });

  it('does not resurrect a draft when reset removes it during an upload', async () => {
    const draft = createVoiceCheckInDraft('file:///draft.m4a', 5_014);
    let rejectUpload!: (error: Error) => void;
    mockExpoFetch.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectUpload = reject; }));

    const request = sendVoiceCheckInDraft(draft).catch((error) => error);
    for (let attempt = 0; attempt < 5 && mockExpoFetch.mock.calls.length === 0; attempt += 1) {
      await Promise.resolve();
    }
    expect(mockExpoFetch).toHaveBeenCalledTimes(1);
    mockValues.delete('@unfold_voice_check_in_draft_v1');
    rejectUpload(new Error('cancelled'));

    await expect(request).resolves.toMatchObject({ code: 'UPLOAD_NETWORK_FAILED' });
    expect(readVoiceCheckInDraft()).toBeNull();
  });

  it('keeps failed audio cleanup queued until a later retry succeeds', () => {
    createVoiceCheckInDraft('file:///draft.m4a', 5_014);
    mockDeleteFile.mockImplementationOnce(() => { throw new Error('busy'); });

    discardVoiceCheckInDraft(true);

    expect(JSON.parse(mockValues.get(VOICE_CHECK_IN_PENDING_DELETIONS_KEY) ?? '[]')).toEqual(['file:///draft.m4a']);
    mockDeleteFile.mockImplementation(() => undefined);
    retryPendingVoiceAudioCleanup();
    expect(mockValues.has(VOICE_CHECK_IN_PENDING_DELETIONS_KEY)).toBe(false);
  });
});
