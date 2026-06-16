import {
  selectTodayCompletionAmbience,
  shouldShowCompletedEmberAmbience,
  stableHash,
  TODAY_COMPLETION_AMBIENCE_OPTIONS,
} from '../today-ambient-rive';

describe('today completed ambience gating', () => {
  it('shows completed ambience only for completed/rest states', () => {
    expect(shouldShowCompletedEmberAmbience({ stateType: 'complete-today', hasReadToday: true })).toBe(true);
    expect(shouldShowCompletedEmberAmbience({ stateType: 'tomorrow-locked', hasReadToday: true })).toBe(true);
    expect(shouldShowCompletedEmberAmbience({ stateType: 'journey-complete', hasReadToday: true })).toBe(true);
    expect(shouldShowCompletedEmberAmbience({ stateType: 'reveal-ready', hasReadToday: true })).toBe(false);
    expect(shouldShowCompletedEmberAmbience({ stateType: 'unread', hasReadToday: false })).toBe(false);
  });

  it('never shows ambience before today is actually read', () => {
    expect(shouldShowCompletedEmberAmbience({ stateType: 'complete-today', hasReadToday: false })).toBe(false);
    expect(shouldShowCompletedEmberAmbience({ stateType: 'journey-complete', hasReadToday: false })).toBe(false);
    expect(shouldShowCompletedEmberAmbience({ stateType: 'empty', hasReadToday: false })).toBe(false);
    expect(shouldShowCompletedEmberAmbience({ stateType: 'preparing', hasReadToday: false })).toBe(false);
    expect(shouldShowCompletedEmberAmbience({ stateType: 'premium-paused', hasReadToday: false })).toBe(false);
  });

  it('randomizes completed-day ambience from a stable key', () => {
    const key = 'devotional-123:2026-06-15:1';
    const first = selectTodayCompletionAmbience({
      stateType: 'complete-today',
      hasReadToday: true,
      selectionKey: key,
    });
    const second = selectTodayCompletionAmbience({
      stateType: 'complete-today',
      hasReadToday: true,
      selectionKey: key,
    });

    expect(first).toBe(second);
    expect(TODAY_COMPLETION_AMBIENCE_OPTIONS).toContain(first);
  });

  it('keeps the native ember look as one of the randomized options', () => {
    expect(TODAY_COMPLETION_AMBIENCE_OPTIONS).toContain('ember');
    expect(TODAY_COMPLETION_AMBIENCE_OPTIONS).toContain('wind-leaves-rive');
  });

  it('falls back to embers when no stable key is available', () => {
    expect(selectTodayCompletionAmbience({
      stateType: 'complete-today',
      hasReadToday: true,
      selectionKey: null,
    })).toBe('ember');
  });

  it('does not select Rive or embers for pre-completion states', () => {
    expect(selectTodayCompletionAmbience({
      stateType: 'reveal-ready',
      hasReadToday: false,
      selectionKey: 'anything',
    })).toBeNull();
  });

  it('uses a deterministic unsigned hash', () => {
    expect(stableHash('seeded-qa-devotional:2026-06-15:1')).toBe(3366417401);
  });
});
