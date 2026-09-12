import { CryptoDigestAlgorithm, digest, randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';

import { PRIMARY_BACKEND_URL, getAuthHeaders } from '@/lib/api-config';
import { authenticatedFetch } from './device-credential';
import { mmkvStorage } from '@/lib/mmkv-storage';

export const VOICE_CHECK_IN_DRAFT_KEY = '@unfold_voice_check_in_draft_v1';
export const VOICE_CHECK_IN_PENDING_DELETIONS_KEY = '@unfold_voice_check_in_pending_deletions_v1';
const DRAFT_DIRECTORY = 'voice-check-ins';
export const VOICE_CHECK_IN_MAX_DURATION_MS = 120_000;
const REQUEST_TIMEOUT_MS = 65_000;
const activeUploadControllers = new Map<string, AbortController>();

export interface VoiceCheckInDraft {
  version: 1;
  idempotencyKey: string;
  audioUri: string;
  audioSha256?: string;
  durationMs: number;
  capturedAt: string;
  status: 'ready' | 'sending' | 'failed';
}

export interface SavedVoiceCheckIn {
  id: string;
  status: 'ready';
  transcript: string;
  durationMs: number | null;
  capturedAt: string;
  createdAt: string;
  updatedAt: string;
}

export class VoiceCheckInApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'VoiceCheckInApiError';
  }
}

function saveDraft(draft: VoiceCheckInDraft): VoiceCheckInDraft {
  mmkvStorage.setItem(VOICE_CHECK_IN_DRAFT_KEY, JSON.stringify(draft));
  return draft;
}

function readRawDraft(): VoiceCheckInDraft | null {
  const raw = mmkvStorage.getItem(VOICE_CHECK_IN_DRAFT_KEY) as string | null;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VoiceCheckInDraft;
  } catch {
    return null;
  }
}

function saveDraftIfCurrent(draft: VoiceCheckInDraft): boolean {
  if (readRawDraft()?.idempotencyKey !== draft.idempotencyKey) return false;
  saveDraft(draft);
  return true;
}

function removeDraftIfCurrent(idempotencyKey: string): boolean {
  if (readRawDraft()?.idempotencyKey !== idempotencyKey) return false;
  mmkvStorage.removeItem(VOICE_CHECK_IN_DRAFT_KEY);
  return true;
}

function readPendingDeletions(): string[] {
  const raw = mmkvStorage.getItem(VOICE_CHECK_IN_PENDING_DELETIONS_KEY) as string | null;
  if (!raw) return [];
  try {
    const values = JSON.parse(raw);
    return Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function writePendingDeletions(uris: string[]): void {
  if (uris.length === 0) {
    mmkvStorage.removeItem(VOICE_CHECK_IN_PENDING_DELETIONS_KEY);
    return;
  }
  mmkvStorage.setItem(VOICE_CHECK_IN_PENDING_DELETIONS_KEY, JSON.stringify([...new Set(uris)]));
}

function deleteOrQueueAudio(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    writePendingDeletions([...readPendingDeletions(), uri]);
  }
}

export function retryPendingVoiceAudioCleanup(): void {
  const remaining: string[] = [];
  for (const uri of readPendingDeletions()) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      remaining.push(uri);
    }
  }
  writePendingDeletions(remaining);
}

export function clearVoiceCheckInLocalData(): void {
  const draft = readRawDraft();
  const uris = [...readPendingDeletions(), ...(draft ? [draft.audioUri] : [])];
  // Clear ownership first. A late upload failure cannot restore an erased draft.
  mmkvStorage.removeItem(VOICE_CHECK_IN_DRAFT_KEY);
  mmkvStorage.removeItem(VOICE_CHECK_IN_PENDING_DELETIONS_KEY);
  for (const uri of uris) deleteOrQueueAudio(uri);
  try {
    const directory = new Directory(Paths.document, DRAFT_DIRECTORY);
    if (directory.exists) directory.delete();
  } catch {
    // Individual paths remain queued when known. Unknown directory drift is best effort.
  }
}

export function cancelVoiceCheckInUploads(): void {
  for (const controller of activeUploadControllers.values()) controller.abort();
  activeUploadControllers.clear();
}

export function readVoiceCheckInDraft(): VoiceCheckInDraft | null {
  const raw = readRawDraft();
  if (!raw) return null;
  try {
    const draft = raw;
    if (draft.version !== 1 || !draft.audioUri || !new File(draft.audioUri).exists) {
      mmkvStorage.removeItem(VOICE_CHECK_IN_DRAFT_KEY);
      return null;
    }
    return draft.status === 'sending' ? saveDraft({ ...draft, status: 'failed' }) : draft;
  } catch {
    mmkvStorage.removeItem(VOICE_CHECK_IN_DRAFT_KEY);
    return null;
  }
}

export function createVoiceCheckInDraft(
  audioUri: string,
  durationMs: number,
  capturedAt = new Date().toISOString(),
): VoiceCheckInDraft {
  return saveDraft({
    version: 1,
    idempotencyKey: randomUUID(),
    audioUri,
    durationMs: Math.min(Math.max(1_000, Math.round(durationMs)), VOICE_CHECK_IN_MAX_DURATION_MS),
    capturedAt,
    status: 'ready',
  });
}

export function discardVoiceCheckInDraft(deleteAudio = true): void {
  const draft = readRawDraft();
  mmkvStorage.removeItem(VOICE_CHECK_IN_DRAFT_KEY);
  if (!deleteAudio || !draft) return;
  deleteOrQueueAudio(draft.audioUri);
}

function hex(arrayBuffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(arrayBuffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function responseError(status: number, body: string): Promise<VoiceCheckInApiError> {
  try {
    const payload = JSON.parse(body) as { error?: { code?: string; message?: string } };
    return new VoiceCheckInApiError(
      payload.error?.code ?? 'VOICE_CHECK_IN_REQUEST_FAILED',
      payload.error?.message ?? 'The check-in could not be sent.',
      status,
    );
  } catch {
    return new VoiceCheckInApiError('VOICE_CHECK_IN_REQUEST_FAILED', 'The check-in could not be sent.', status);
  }
}

export async function sendVoiceCheckInDraft(draft: VoiceCheckInDraft): Promise<SavedVoiceCheckIn> {
  const file = new File(draft.audioUri);
  if (!file.exists) throw new VoiceCheckInApiError('AUDIO_MISSING', 'The recording file is no longer on this device.');

  let audioSha256 = draft.audioSha256;
  if (!audioSha256) {
    let audioBytes: ArrayBuffer;
    try {
      audioBytes = await file.arrayBuffer();
    } catch {
      throw new VoiceCheckInApiError('AUDIO_READ_FAILED', 'The recording could not be read for sending.');
    }
    try {
      // ExpoCrypto's iOS native function accepts a TypedArray for its third
      // argument. TypeScript's BufferSource also permits ArrayBuffer, but the
      // native argument caster does not.
      audioSha256 = hex(await digest(CryptoDigestAlgorithm.SHA256, new Uint8Array(audioBytes)));
    } catch {
      throw new VoiceCheckInApiError('AUDIO_HASH_FAILED', 'The recording could not be verified for sending.');
    }
  }
  const sendingDraft = { ...draft, audioSha256, status: 'sending' as const };
  if (!saveDraftIfCurrent(sendingDraft)) {
    throw new VoiceCheckInApiError('DRAFT_REPLACED', 'This recording is no longer the current draft.');
  }
  const controller = new AbortController();
  activeUploadControllers.set(sendingDraft.idempotencyKey, controller);
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const authHeaders = await getAuthHeaders();
    let response: Response;
    try {
      response = await expoFetch(`${PRIMARY_BACKEND_URL}/api/voice-check-ins`, {
        method: 'POST',
        body: file,
        signal: controller.signal,
        headers: {
          ...authHeaders,
          'Content-Type': 'audio/mp4',
          'X-Idempotency-Key': sendingDraft.idempotencyKey,
          'X-Audio-SHA256': audioSha256,
          'X-Audio-Duration-Ms': String(sendingDraft.durationMs),
          'X-Recorded-At': sendingDraft.capturedAt,
        },
      });
    } catch (error) {
      if (error instanceof VoiceCheckInApiError) throw error;
      throw new VoiceCheckInApiError(
        controller.signal.aborted ? 'UPLOAD_TIMEOUT' : 'UPLOAD_NETWORK_FAILED',
        controller.signal.aborted ? 'Sending took too long.' : 'The recording could not reach the server.',
      );
    }
    const body = await response.text();
    if (!response.ok) throw await responseError(response.status, body);
    const payload = JSON.parse(body) as { checkIn?: SavedVoiceCheckIn };
    if (response.status === 202 || payload.checkIn?.status !== 'ready' || !payload.checkIn.transcript) {
      throw new VoiceCheckInApiError('TRANSCRIPTION_PENDING', 'Transcription is still processing. Try again in a moment.', response.status);
    }
    removeDraftIfCurrent(sendingDraft.idempotencyKey);
    deleteOrQueueAudio(file.uri);
    return payload.checkIn;
  } catch (error) {
    saveDraftIfCurrent({ ...sendingDraft, status: 'failed' });
    throw error;
  } finally {
    clearTimeout(timer);
    activeUploadControllers.delete(sendingDraft.idempotencyKey);
  }
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const headers = await getAuthHeaders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await authenticatedFetch(`${PRIMARY_BACKEND_URL}${path}`, {
      ...init,
      headers: { ...headers, ...init?.headers },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw await responseError(response.status, text);
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timer);
  }
}

export async function listVoiceCheckIns(): Promise<SavedVoiceCheckIn[]> {
  // The backend returns the newest 25 records. The sheet can expand this full bounded page.
  const payload = await requestJson('/api/voice-check-ins') as { checkIns?: SavedVoiceCheckIn[] };
  return payload.checkIns ?? [];
}

export async function editVoiceCheckIn(id: string, transcript: string): Promise<SavedVoiceCheckIn> {
  const payload = await requestJson(`/api/voice-check-ins/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ transcript }),
  }) as { checkIn: SavedVoiceCheckIn };
  return payload.checkIn;
}

export async function deleteVoiceCheckIn(id: string): Promise<void> {
  await requestJson(`/api/voice-check-ins/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function seedVoiceCheckInDraftFromUrl(url: string): Promise<VoiceCheckInDraft> {
  const directory = new Directory(Paths.document, DRAFT_DIRECTORY);
  if (!directory.exists) directory.create({ idempotent: true, intermediates: true });
  const destination = new File(directory, 'qa-synthetic-check-in.m4a');
  const file = await File.downloadFileAsync(url, destination, { idempotent: true });
  return createVoiceCheckInDraft(file.uri, 5_014);
}
