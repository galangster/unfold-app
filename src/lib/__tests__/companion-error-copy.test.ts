import { dailyAiBudgetMessage } from '../ai-budget-error';
import {
  COMPANION_ERROR_CAPACITY,
  COMPANION_ERROR_CONNECTION,
  companionFacingError,
  companionInterruptedFacingError,
} from '../companion-error-copy';

describe('companionFacingError', () => {
  it('uses connection copy for offline, timeout, and unknown strings', () => {
    expect(companionFacingError('You appear to be offline. Please check your connection and try again.')).toBe(
      COMPANION_ERROR_CONNECTION,
    );
    expect(companionFacingError('The request timed out. Please try again.', 'timeout')).toBe(
      COMPANION_ERROR_CONNECTION,
    );
    expect(companionFacingError('The companion ran into a problem answering.')).toBe(
      COMPANION_ERROR_CONNECTION,
    );
    expect(companionFacingError(null)).toBe(COMPANION_ERROR_CONNECTION);
  });

  it('uses capacity copy for overload and classified server errors', () => {
    expect(companionFacingError('The companion is over capacity right now.')).toBe(
      COMPANION_ERROR_CAPACITY,
    );
    expect(companionFacingError('Model overloaded')).toBe(COMPANION_ERROR_CAPACITY);
    expect(companionFacingError('Our servers are experiencing issues. Please try again in a moment.')).toBe(
      COMPANION_ERROR_CAPACITY,
    );
    expect(companionFacingError('HTTP 503', 'server-error')).toBe(COMPANION_ERROR_CAPACITY);
  });

  it('passes daily AI budget copy through', () => {
    const budget = dailyAiBudgetMessage(3600);
    expect(companionFacingError(budget)).toBe(budget);
  });
});

describe('companionInterruptedFacingError', () => {
  it('shows nothing when the user stopped or no cause was stored', () => {
    expect(companionInterruptedFacingError(undefined)).toBe('');
    expect(companionInterruptedFacingError(null)).toBe('');
    expect(companionInterruptedFacingError('')).toBe('');
  });

  it('keeps capacity and connection copy when a cause was stored', () => {
    expect(companionInterruptedFacingError(COMPANION_ERROR_CAPACITY)).toBe(COMPANION_ERROR_CAPACITY);
    expect(companionInterruptedFacingError('Model overloaded')).toBe(COMPANION_ERROR_CAPACITY);
    expect(companionInterruptedFacingError(COMPANION_ERROR_CONNECTION)).toBe(COMPANION_ERROR_CONNECTION);
  });
});
