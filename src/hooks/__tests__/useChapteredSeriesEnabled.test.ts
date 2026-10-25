/* eslint-disable import/first */
jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));

const mockFetch = jest.fn();
jest.mock('@/lib/device-credential', () => ({
  authenticatedFetch: (...args: unknown[]) => mockFetch(...args),
}));

import { renderHook, waitFor } from '@testing-library/react-native';
import { resetRemoteConfigForTesting } from '@/lib/remote-config';
import { useChapteredSeriesEnabled } from '../useChapteredSeriesEnabled';

const BODY = {
  version: 1,
  autoTrialSeries: { enabled: false, platforms: ['ios'], maxTrialDays: 7 },
  source: 'db',
};

function respond(body: unknown, ok = true) {
  mockFetch.mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body });
}

describe('useChapteredSeriesEnabled', () => {
  beforeEach(() => {
    resetRemoteConfigForTesting();
    mockFetch.mockReset();
  });

  it('turns on once the config says chapters are enabled', async () => {
    respond({ ...BODY, chapteredSeries: { enabled: true } });
    const { result } = renderHook(() => useChapteredSeriesEnabled());
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('stays off when the config is unreadable', async () => {
    respond({}, false);
    const { result } = renderHook(() => useChapteredSeriesEnabled());
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it('stays off when the server sends no chapteredSeries field', async () => {
    respond(BODY);
    const { result } = renderHook(() => useChapteredSeriesEnabled());
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });
});
