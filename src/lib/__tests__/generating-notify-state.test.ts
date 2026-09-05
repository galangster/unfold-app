import {
  getNotifyControlState,
  resolveNotifyRequestOutcome,
} from '../generating-notify-state';

describe('resolveNotifyRequestOutcome', () => {
  it('confirms the nudge once the token is registered', () => {
    expect(resolveNotifyRequestOutcome({ granted: true, registration: 'registered' })).toBe('confirmed');
  });

  it('treats a skipped registration (simulator, no project id) as confirmed', () => {
    expect(resolveNotifyRequestOutcome({ granted: true, registration: 'skipped' })).toBe('confirmed');
  });

  it('reports a denied permission whatever the registration did', () => {
    expect(resolveNotifyRequestOutcome({ granted: false, registration: null })).toBe('denied');
    expect(resolveNotifyRequestOutcome({ granted: false, registration: 'registered' })).toBe('denied');
  });

  it('never promises a nudge when the token did not reach the backend', () => {
    expect(resolveNotifyRequestOutcome({ granted: true, registration: 'failed' })).toBe('registration_failed');
  });
});

describe('getNotifyControlState', () => {
  const base = {
    permission: 'unknown' as const,
    hasAskedPermission: false,
    showNotificationPrompt: false,
    isComplete: false,
    outcome: null,
  };

  it('tells the reader the permission is off instead of re-offering the same link', () => {
    const state = getNotifyControlState({
      ...base,
      permission: 'denied',
      hasAskedPermission: true,
      outcome: 'denied',
    });
    expect(state).toBe('denied');
    expect(state).not.toBe('link');
  });

  it('offers the bottom link while the prompt card is hidden and nothing was asked', () => {
    expect(getNotifyControlState(base)).toBe('link');
    expect(getNotifyControlState({ ...base, permission: 'denied' })).toBe('link');
  });

  it('shows the prompt card once its timer fires, before any ask', () => {
    expect(getNotifyControlState({ ...base, showNotificationPrompt: true })).toBe('prompt');
    expect(getNotifyControlState({ ...base, permission: 'denied', showNotificationPrompt: true })).toBe('prompt');
  });

  it('confirms after the reader asked and was granted', () => {
    expect(
      getNotifyControlState({ ...base, permission: 'granted', hasAskedPermission: true, outcome: 'confirmed' }),
    ).toBe('confirmed');
  });

  it('never confirms on the permission alone while the token registration is still in flight', () => {
    // "Feel free to step away" during a stalled registration is the window
    // Jordan fell through: the POST then fails and no push ever comes.
    expect(
      getNotifyControlState({ ...base, permission: 'granted', hasAskedPermission: true, outcome: 'pending' }),
    ).toBe('pending');
    expect(
      getNotifyControlState({ ...base, permission: 'granted', hasAskedPermission: true, outcome: null }),
    ).not.toBe('confirmed');
  });

  it('holds the gentle note back while the mount-time registration is pending', () => {
    expect(getNotifyControlState({ ...base, permission: 'granted', outcome: 'pending' })).toBe('pending');
    expect(getNotifyControlState({ ...base, permission: 'granted', outcome: 'registration_failed' })).toBe(
      'registration-failed',
    );
  });

  it('shows the gentle note when notifications were already on', () => {
    expect(getNotifyControlState({ ...base, permission: 'granted' })).toBe('granted-note');
  });

  it('renders nothing once the devotional is complete', () => {
    expect(getNotifyControlState({ ...base, permission: 'granted', isComplete: true })).toBe('none');
    expect(getNotifyControlState({ ...base, showNotificationPrompt: true, isComplete: true })).toBe('none');
  });

  it('reports a failed registration and keeps the retry path', () => {
    expect(
      getNotifyControlState({
        ...base,
        permission: 'granted',
        hasAskedPermission: true,
        outcome: 'registration_failed',
      }),
    ).toBe('registration-failed');
  });

  it('shows nothing during the ask itself, while the card is still flagged visible', () => {
    expect(
      getNotifyControlState({ ...base, permission: 'denied', hasAskedPermission: true, showNotificationPrompt: true }),
    ).toBe('none');
  });
});
