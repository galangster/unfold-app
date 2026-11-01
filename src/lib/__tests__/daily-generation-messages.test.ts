import { getDailyGenerationNotice } from '../daily-generation-messages';

describe('getDailyGenerationNotice', () => {
  it('tells a block that waits on the last saved reading apart from a calendar block', () => {
    expect(getDailyGenerationNotice({ status: 'blocked', reason: 'read-sync-pending' }, 3)).toEqual({
      title: 'Saving your last reading',
      body: 'Day 3 will start once it’s saved. Check again in a moment.',
    });
    expect(getDailyGenerationNotice({ status: 'blocked', reason: 'day-not-ready' }, 3)).toEqual({
      title: 'Day 3 isn’t available yet',
      body: 'Your series is safe. Check again after this day unlocks.',
    });
  });

  it('says a day the server will not retry today is tried again tomorrow', () => {
    expect(getDailyGenerationNotice({
      status: 'failed',
      jobId: 'job-1',
      canRetry: false,
      failureKind: 'job',
      retriesExhausted: true,
    }, 3)).toEqual({
      title: 'We couldn’t prepare Day 3',
      body: 'Your series is safe. We’ll try this reading again tomorrow.',
    });
    // A failure the reader can still retry keeps the screen's own copy.
    expect(getDailyGenerationNotice({ status: 'failed', jobId: 'job-1', canRetry: true, failureKind: 'job' }, 3))
      .toBeNull();
  });
});
