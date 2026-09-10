import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';

import { PRIMARY_BACKEND_URL, getAuthHeaders } from '@/lib/api-config';

export const VOICE_INPUT_MAX_BYTES = 3 * 1024 * 1024;
export const VOICE_INPUT_TIMEOUT_MS = 45_000;
export const VOICE_INPUT_TRANSCRIBE_PATH = '/api/voice-input/transcribe';

export class VoiceInputApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'VoiceInputApiError';
  }
}

export function parseVoiceInputError(status: number, body: string): VoiceInputApiError {
  try {
    const payload = JSON.parse(body) as { error?: { code?: string; message?: string } };
    return new VoiceInputApiError(
      payload.error?.code ?? 'VOICE_INPUT_REQUEST_FAILED',
      payload.error?.message ?? defaultVoiceInputErrorMessage(status),
      status,
    );
  } catch {
    return new VoiceInputApiError('VOICE_INPUT_REQUEST_FAILED', defaultVoiceInputErrorMessage(status), status);
  }
}

function defaultVoiceInputErrorMessage(status?: number): string {
  if (status === 429) return 'Too many transcription requests. Try again in a moment.';
  if (status === 503) return 'Voice transcription is temporarily unavailable.';
  return 'The recording could not be transcribed.';
}

function fileSizeBytes(file: File): number | null {
  const size = (file as File & { size?: unknown }).size;
  return typeof size === 'number' && Number.isFinite(size) ? size : null;
}

export function deleteLocalVoiceAudio(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Best-effort cleanup. Do not persist check-in draft keys for this file.
  }
}

export async function transcribeVoiceInput(
  audioUri: string,
  durationMs?: number,
  externalSignal?: AbortSignal,
): Promise<string> {
  const file = new File(audioUri);
  if (!file.exists) {
    throw new VoiceInputApiError('AUDIO_MISSING', 'The recording file is no longer on this device.');
  }

  const knownSize = fileSizeBytes(file);
  if (knownSize != null && knownSize > VOICE_INPUT_MAX_BYTES) {
    throw new VoiceInputApiError('AUDIO_TOO_LARGE', 'The recording is too large to transcribe.');
  }

  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  if (externalSignal?.aborted) {
    controller.abort();
  } else if (externalSignal) {
    externalSignal.addEventListener('abort', abortFromCaller, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, VOICE_INPUT_TIMEOUT_MS);

  try {
    const authHeaders = await getAuthHeaders();
    const headers: Record<string, string> = {
      ...authHeaders,
      'Content-Type': 'audio/mp4',
    };
    if (durationMs != null && Number.isFinite(durationMs) && durationMs > 0) {
      headers['X-Audio-Duration-Ms'] = String(Math.min(120_000, Math.round(durationMs)));
    }

    let response: Response;
    try {
      response = await expoFetch(`${PRIMARY_BACKEND_URL}${VOICE_INPUT_TRANSCRIBE_PATH}`, {
        method: 'POST',
        body: file,
        signal: controller.signal,
        headers,
      });
    } catch (error) {
      if (error instanceof VoiceInputApiError) throw error;
      throw new VoiceInputApiError(
        timedOut ? 'TRANSCRIBE_TIMEOUT' : controller.signal.aborted ? 'TRANSCRIBE_CANCELLED' : 'TRANSCRIBE_NETWORK_FAILED',
        timedOut
          ? 'Transcription took too long. Your recording is still on this device.'
          : controller.signal.aborted
            ? 'Transcription was cancelled. Your recording is still on this device.'
            : 'The recording could not reach the server. Your recording is still on this device.',
      );
    }

    const body = await response.text();
    if (!response.ok) throw parseVoiceInputError(response.status, body);

    let payload: { transcript?: unknown };
    try {
      payload = JSON.parse(body) as { transcript?: unknown };
    } catch {
      throw new VoiceInputApiError('TRANSCRIBE_INVALID_RESPONSE', 'The transcription response could not be read.', response.status);
    }
    if (typeof payload.transcript !== 'string') {
      throw new VoiceInputApiError('TRANSCRIBE_INVALID_RESPONSE', 'The transcription response was missing text.', response.status);
    }
    return payload.transcript;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', abortFromCaller);
  }
}
