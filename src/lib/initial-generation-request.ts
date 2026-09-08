import { mmkvStorage } from '@/lib/mmkv-storage';
import { newId } from '@/lib/sync-ids';

export const INITIAL_GENERATION_REQUEST_ID_KEY = 'initial-generation-request-id';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readInitialGenerationRequestId(): string | null {
  const stored = mmkvStorage.getItem(INITIAL_GENERATION_REQUEST_ID_KEY) as string | null;
  if (!stored) return null;
  if (UUID_RE.test(stored)) return stored;
  mmkvStorage.removeItem(INITIAL_GENERATION_REQUEST_ID_KEY);
  return null;
}

export function ensureInitialGenerationRequestId(generate: () => string = newId): string {
  const stored = readInitialGenerationRequestId();
  if (stored) return stored;

  const requestId = generate();
  if (!UUID_RE.test(requestId)) {
    throw new Error('Initial generation request ID must be a UUID');
  }
  mmkvStorage.setItem(INITIAL_GENERATION_REQUEST_ID_KEY, requestId);
  return requestId;
}

export function clearInitialGenerationRequestId(): void {
  mmkvStorage.removeItem(INITIAL_GENERATION_REQUEST_ID_KEY);
}
