import { shouldShowCompletedEmberAmbience } from '../today-ambient-rive';

describe('today ambient ember gating', () => {
  it('shows completed embers only for completed/rest states', () => {
    expect(shouldShowCompletedEmberAmbience({ stateType: 'complete-today', hasReadToday: true })).toBe(true);
    expect(shouldShowCompletedEmberAmbience({ stateType: 'tomorrow-locked', hasReadToday: true })).toBe(true);
    expect(shouldShowCompletedEmberAmbience({ stateType: 'journey-complete', hasReadToday: true })).toBe(true);
    expect(shouldShowCompletedEmberAmbience({ stateType: 'reveal-ready', hasReadToday: true })).toBe(false);
    expect(shouldShowCompletedEmberAmbience({ stateType: 'unread', hasReadToday: false })).toBe(false);
  });

  it('never shows embers before today is actually read', () => {
    expect(shouldShowCompletedEmberAmbience({ stateType: 'complete-today', hasReadToday: false })).toBe(false);
    expect(shouldShowCompletedEmberAmbience({ stateType: 'journey-complete', hasReadToday: false })).toBe(false);
    expect(shouldShowCompletedEmberAmbience({ stateType: 'empty', hasReadToday: false })).toBe(false);
    expect(shouldShowCompletedEmberAmbience({ stateType: 'preparing', hasReadToday: false })).toBe(false);
    expect(shouldShowCompletedEmberAmbience({ stateType: 'premium-paused', hasReadToday: false })).toBe(false);
  });
});
