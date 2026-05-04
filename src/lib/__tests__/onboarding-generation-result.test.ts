import {
  buildOnboardingSampleDevotionalId,
  normalizeOnboardingGenerationJobResult,
  normalizeOnboardingSubmitResult,
} from '../onboarding-generation-result';

describe('onboarding generation result helpers', () => {
  it('builds the backend-owned onboarding sample devotional id from the device id', () => {
    expect(buildOnboardingSampleDevotionalId('device-123')).toBe('onboarding-sample-anon_device-123');
  });

  it('keeps legacy string submit fallback results working', () => {
    expect(normalizeOnboardingSubmitResult('job-123')).toEqual({
      jobId: 'job-123',
      devotionalId: null,
    });
  });

  it('captures backend-owned devotional identity from submit fallback results', () => {
    expect(
      normalizeOnboardingSubmitResult({
        jobId: 'job-123',
        devotionalId: 'onboarding-sample-user-1',
      }),
    ).toEqual({
      jobId: 'job-123',
      devotionalId: 'onboarding-sample-user-1',
    });
  });

  it('normalizes a completed onboarding job using the top-level devotionalId', () => {
    const result = normalizeOnboardingGenerationJobResult({
      status: 'complete',
      devotionalId: 'onboarding-sample-user-1',
      dayNumber: 1,
      result: {
        devotionalDay: {
          title: 'A Gentle Start',
          scriptureReference: 'Psalm 23:1',
          scriptureText: 'The Lord is my shepherd',
          dayNumber: 0 as unknown as number,
          bodyText: 'You are not walking alone.',
          quotableLine: 'Grace meets you here.',
          isRead: false,
        },
      },
    });

    expect(result?.devotionalId).toBe('onboarding-sample-user-1');
    expect(result?.devotionalDay.devotionalId).toBe('onboarding-sample-user-1');
    expect(result?.devotionalDay.dayNumber).toBe(1);
    expect(result?.devotionalDay.id).toBe('day-onboarding-sample-user-1-1');
  });

  it('uses the fallback devotionalId captured at submit time when polling omits one', () => {
    const result = normalizeOnboardingGenerationJobResult(
      {
        status: 'complete',
        result: {
          devotionalDay: {
            title: 'Recovered',
            scriptureReference: 'Romans 8:1',
            scriptureText: 'There is now no condemnation',
            dayNumber: 0 as unknown as number,
            bodyText: 'A recovered body.',
            quotableLine: 'Mercy is near.',
            isRead: false,
          },
        },
      },
      'submitted-devotional-id',
    );

    expect(result?.devotionalId).toBe('submitted-devotional-id');
    expect(result?.devotionalDay.id).toBe('day-submitted-devotional-id-1');
  });

  it('does not report readiness for incomplete or malformed completed jobs', () => {
    expect(
      normalizeOnboardingGenerationJobResult({
        status: 'processing',
        devotionalId: 'devo-1',
      }),
    ).toBeNull();

    expect(
      normalizeOnboardingGenerationJobResult({
        status: 'complete',
        result: null,
      }),
    ).toBeNull();

    expect(
      normalizeOnboardingGenerationJobResult({
        status: 'complete',
        result: {
          devotionalDay: {
            title: 'Missing identity',
            scriptureReference: 'Psalm 1:1',
            scriptureText: 'Blessed is the one',
            dayNumber: 0 as unknown as number,
            bodyText: 'Body',
            quotableLine: 'Quote',
            isRead: false,
          },
        },
      }),
    ).toBeNull();
  });
});
