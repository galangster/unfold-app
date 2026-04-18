const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'http://test',
  getAuthHeaders: jest.fn().mockResolvedValue({ Authorization: 'Bearer test' }),
}));

jest.mock('@/lib/mmkv-storage', () => ({
  mmkvStorage: {
    getItem: jest.fn(() => null),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  v5: jest.fn((value: string, namespace: string) => `uuidv5:${namespace}:${value}`),
}));

import {
  normalizeDevotionalIdentity,
  normalizeGeneratedDayIdentity,
  reconcileGenerationResultIdentity,
} from '../generation-reconciliation';
import { recoverCompletedGenerationResult } from '../generation-api';
import { compositeId } from '../sync-ids';

describe('generation reconciliation', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('normalizes a generated day with stable devotional identity fields', () => {
    const normalized = normalizeGeneratedDayIdentity('devo-123', {
      dayNumber: 2,
      title: 'Hope',
      scriptureReference: 'Psalm 23:1',
      scriptureText: 'The Lord is my shepherd',
      bodyText: 'Body',
      quotableLine: 'Quote',
      isRead: false,
    });

    expect(normalized.devotionalId).toBe('devo-123');
    expect(normalized.dayNumber).toBe(2);
    expect(normalized.id).toBe(compositeId('devo-123', 2));
  });

  it('normalizes devotional days defensively before local insertion', () => {
    const devotional = normalizeDevotionalIdentity({
      id: 'devo-456',
      title: 'Series',
      totalDays: 2,
      currentDay: 1,
      days: [
        {
          dayNumber: 1,
          title: 'Day 1',
          scriptureReference: 'John 1:1',
          scriptureText: 'In the beginning',
          bodyText: 'Text',
          quotableLine: 'Line',
          isRead: false,
        },
        {
          dayNumber: 2,
          title: 'Day 2',
          scriptureReference: 'John 1:2',
          scriptureText: 'He was with God',
          bodyText: 'More text',
          quotableLine: 'Line 2',
          isRead: false,
        },
      ],
      createdAt: '2026-04-18T00:00:00.000Z',
      userContext: {
        name: 'Nick',
        aboutMe: '',
        currentSituation: '',
        emotionalState: '',
      },
      generationMode: 'progressive',
    });

    expect(devotional.days).toHaveLength(2);
    expect(devotional.days[0].devotionalId).toBe('devo-456');
    expect(devotional.days[1].id).toBe(compositeId('devo-456', 2));
  });

  it('reconciles a job result onto the expected devotional/day identity', () => {
    const reconciled = reconcileGenerationResultIdentity(
      {
        devotionalDay: {
          dayNumber: 0 as unknown as number,
          title: 'Recovered',
          scriptureReference: 'Romans 8:1',
          scriptureText: 'No condemnation',
          bodyText: 'Recovered text',
          quotableLine: 'Recovered line',
          isRead: false,
        },
      },
      'devo-789',
      3,
    );

    expect(reconciled.devotionalId).toBe('devo-789');
    expect(reconciled.devotionalDay.dayNumber).toBe(3);
    expect(reconciled.devotionalDay.devotionalId).toBe('devo-789');
    expect(reconciled.devotionalDay.id).toBe(compositeId('devo-789', 3));
  });

  it('recovers completed jobs through discovery and returns normalized output', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        jobId: 'job-find',
        status: 'complete',
        result: {
          devotionalDay: {
            title: 'Found day',
            scriptureReference: 'Psalm 1:1',
            scriptureText: 'Blessed is the man',
            bodyText: 'Body',
            quotableLine: 'Quote',
            isRead: false,
          },
        },
      }),
    });

    const recovered = await recoverCompletedGenerationResult({
      devotionalId: 'devo-find',
      dayNumber: 4,
    });

    expect(recovered?.devotionalId).toBe('devo-find');
    expect(recovered?.devotionalDay.dayNumber).toBe(4);
    expect(recovered?.devotionalDay.devotionalId).toBe('devo-find');
    expect(mockFetch.mock.calls[0][0]).toContain('find-completed');
  });

  it('recovers completed jobs from an existing job id and normalizes the day identity', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        jobId: 'job-409',
        status: 'complete',
        result: {
          devotionalId: 'server-devo',
          devotionalDay: {
            dayNumber: 7,
            title: 'Recovered from 409',
            scriptureReference: 'Psalm 7:1',
            scriptureText: 'Save me',
            bodyText: 'Text',
            quotableLine: 'Quote',
            isRead: false,
          },
        },
      }),
    });

    const recovered = await recoverCompletedGenerationResult({
      devotionalId: 'local-devo',
      dayNumber: 7,
      existingJobId: 'job-409',
    });

    expect(recovered?.devotionalId).toBe('server-devo');
    expect(recovered?.devotionalDay.devotionalId).toBe('server-devo');
    expect(recovered?.devotionalDay.id).toBe(compositeId('server-devo', 7));
    expect(mockFetch.mock.calls[0][0]).toContain('/api/jobs/job-409');
  });
});
