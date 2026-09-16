import { isDailyAiBudgetMessage } from '@/lib/ai-budget-error';
import type { NetworkErrorType } from '@/lib/network-error-handler';

export const COMPANION_ERROR_CONNECTION =
  'Unable to reply. Check your connection and try again.';

export const COMPANION_ERROR_CAPACITY =
  'Companion is over capacity. Try again in a moment.';

const CAPACITY_HINT =
  /over capacity|overloaded|experiencing issues|\b50[234]\b|internal server error/;

export function companionFacingError(
  raw?: string | null,
  networkType?: NetworkErrorType,
): string {
  if (raw && isDailyAiBudgetMessage(raw)) return raw;
  if (networkType === 'server-error') return COMPANION_ERROR_CAPACITY;
  if (raw && CAPACITY_HINT.test(raw.toLowerCase())) return COMPANION_ERROR_CAPACITY;
  return COMPANION_ERROR_CONNECTION;
}
