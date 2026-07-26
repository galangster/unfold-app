jest.mock('../mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => store.set(key, value)),
      removeItem: jest.fn((key: string) => store.delete(key)),
    },
    getDeviceId: jest.fn(() => 'test-device-id'),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
    __clearMockStorage: () => store.clear(),
  };
});

import {
  saveOnboardingSampleJob,
  getOnboardingSampleJob,
  clearOnboardingSampleJob,
  ONBOARDING_SAMPLE_JOB_TTL_MS,
} from '../onboarding-sample-job-store';
import { mmkvStorage } from '../mmkv-storage';

beforeEach(() => {
  clearOnboardingSampleJob();
  jest.clearAllMocks();
});

describe('onboarding-sample-job-store', () => {
  it('persists and restores a job scoped to the same device', () => {
    saveOnboardingSampleJob({ jobId: 'job-1', devotionalId: 'dev-1', deviceId: 'device-A' });

    const restored = getOnboardingSampleJob({ deviceId: 'device-A' });
    expect(restored).not.toBeNull();
    expect(restored?.jobId).toBe('job-1');
    expect(restored?.devotionalId).toBe('dev-1');
    expect(restored?.deviceId).toBe('device-A');
    expect(typeof restored?.savedAt).toBe('number');
  });

  it('returns the record when no deviceId scope is requested', () => {
    saveOnboardingSampleJob({ jobId: 'job-1', devotionalId: null, deviceId: 'device-A' });
    expect(getOnboardingSampleJob()?.jobId).toBe('job-1');
  });

  it('returns null when nothing has been persisted', () => {
    expect(getOnboardingSampleJob({ deviceId: 'device-A' })).toBeNull();
  });

  it('ignores a record older than the 24h TTL', () => {
    saveOnboardingSampleJob({ jobId: 'job-1', devotionalId: 'dev-1', deviceId: 'device-A' });

    const wellWithin = getOnboardingSampleJob({
      deviceId: 'device-A',
      now: Date.now() + ONBOARDING_SAMPLE_JOB_TTL_MS - 1000,
    });
    expect(wellWithin?.jobId).toBe('job-1');

    const expired = getOnboardingSampleJob({
      deviceId: 'device-A',
      now: Date.now() + ONBOARDING_SAMPLE_JOB_TTL_MS + 1000,
    });
    expect(expired).toBeNull();
  });

  it('does not let a record from a different device hijack onboarding', () => {
    saveOnboardingSampleJob({ jobId: 'job-1', devotionalId: 'dev-1', deviceId: 'device-A' });
    expect(getOnboardingSampleJob({ deviceId: 'device-B' })).toBeNull();
  });

  it('clears the persisted record', () => {
    saveOnboardingSampleJob({ jobId: 'job-1', devotionalId: 'dev-1', deviceId: 'device-A' });
    clearOnboardingSampleJob();
    expect(getOnboardingSampleJob({ deviceId: 'device-A' })).toBeNull();
  });

  it('ignores malformed persisted JSON', () => {
    mmkvStorage.setItem('onboarding-sample-job-v1', '{not valid json');
    expect(getOnboardingSampleJob({ deviceId: 'device-A' })).toBeNull();
  });

  it('does not persist when jobId or deviceId is missing', () => {
    saveOnboardingSampleJob({ jobId: '', devotionalId: 'dev-1', deviceId: 'device-A' });
    expect(getOnboardingSampleJob()).toBeNull();

    saveOnboardingSampleJob({ jobId: 'job-1', devotionalId: 'dev-1', deviceId: '' });
    expect(getOnboardingSampleJob()).toBeNull();
  });
});
