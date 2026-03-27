import {
  computeCompletionStatus,
  type CompletionStatus,
} from '../completion-status';

describe('computeCompletionStatus', () => {
  it('returns completed_with_engagement when read + journal exists', () => {
    expect(
      computeCompletionStatus({
        isRead: true,
        hasJournal: true,
        hasCheckIn: false,
      }),
    ).toBe('completed_with_engagement');
  });

  it('returns completed_with_engagement when read + check-in exists', () => {
    expect(
      computeCompletionStatus({
        isRead: true,
        hasJournal: false,
        hasCheckIn: true,
      }),
    ).toBe('completed_with_engagement');
  });

  it('returns completed_with_engagement when read + both journal and check-in', () => {
    expect(
      computeCompletionStatus({
        isRead: true,
        hasJournal: true,
        hasCheckIn: true,
      }),
    ).toBe('completed_with_engagement');
  });

  it('returns completed_minimal when read but no engagement', () => {
    expect(
      computeCompletionStatus({
        isRead: true,
        hasJournal: false,
        hasCheckIn: false,
      }),
    ).toBe('completed_minimal');
  });

  it('returns in_progress when hasReadAt but not marked read', () => {
    expect(
      computeCompletionStatus({
        isRead: false,
        hasJournal: false,
        hasCheckIn: false,
        hasReadAt: true,
      }),
    ).toBe('in_progress');
  });

  it('returns not_started when no readAt and not read', () => {
    expect(
      computeCompletionStatus({
        isRead: false,
        hasJournal: false,
        hasCheckIn: false,
        hasReadAt: false,
      }),
    ).toBe('not_started');
  });

  it('returns not_started when hasReadAt is omitted', () => {
    expect(
      computeCompletionStatus({
        isRead: false,
        hasJournal: false,
        hasCheckIn: false,
      }),
    ).toBe('not_started');
  });
});
