/**
 * Direct coverage for analyzeNetworkError (WR-11 follow-through) — the
 * classifier the companion error path now depends on for user-facing copy.
 */
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

import { analyzeNetworkError } from '../network-error-handler';

describe('analyzeNetworkError', () => {
  it("classifies expo/fetch's iOS drop string as offline", () => {
    const result = analyzeNetworkError(new Error('Network request failed'));
    expect(result.type).toBe('offline');
    expect(result.userFriendlyMessage).toBeTruthy();
    expect(result.userFriendlyMessage).not.toMatch(/undefined|null/);
  });

  it('classifies timeouts', () => {
    expect(analyzeNetworkError(new Error('Request timed out')).type).toBe('timeout');
  });

  it('classifies server errors', () => {
    expect(analyzeNetworkError(new Error('HTTP 500 Internal Server Error')).type).not.toBe('offline');
  });

  it('handles non-Error values without throwing', () => {
    const result = analyzeNetworkError('boom');
    expect(result.type).toBeTruthy();
    expect(result.userFriendlyMessage).toBeTruthy();
  });
});
