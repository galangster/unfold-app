import type { AppStateStatus } from 'react-native';
import { getInitialAmbientAppStateStatus } from '../AmbientArtCanvas';

jest.mock('../../../../assets/rive/today-campfire.riv', () => 1);
jest.mock('../../../../assets/rive/today-canopy-lights.riv', () => 1);
jest.mock('../../../../assets/rive/today-doors.riv', () => 1);
jest.mock('../../../../assets/rive/today-tree.riv', () => 1);
jest.mock('../../../../assets/rive/today-waterfall.riv', () => 1);
jest.mock('../../../../assets/rive/today-wind-leaves.riv', () => 1);

jest.mock('@/components/EmberSystem', () => ({
  EmberSystem: () => null,
}));

jest.mock('@/components/home/TodayCompletionRive', () => ({
  TodayCompletionRive: () => null,
}));

jest.mock('@/hooks/useAccessibility', () => ({
  useAccessibleAnimation: () => ({ reducedMotion: false }),
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: { accent: '#FFFFFF', background: '#000000' },
    isDark: true,
  }),
}));

jest.mock('@/lib/qa-tools', () => ({
  isQaToolsEnabled: () => false,
}));

jest.mock('@/lib/ui-state', () => ({
  useUIState: <T>(selector: (state: { qaAmbienceOverride: null }) => T) => selector({ qaAmbienceOverride: null }),
}));

jest.mock('expo-battery', () => ({
  useLowPowerMode: () => false,
}));

describe('AmbientArtCanvas app-state seed', () => {
  it.each([
    ['active'],
    ['inactive'],
    ['unknown'],
    [null],
    [undefined],
  ])('treats cold-launch %s as active', (state) => {
    expect(getInitialAmbientAppStateStatus(state as AppStateStatus | null | undefined)).toBe('active');
  });

  it('keeps background as inactive for the initial Rive gate', () => {
    expect(getInitialAmbientAppStateStatus('background')).toBe('background');
  });
});
