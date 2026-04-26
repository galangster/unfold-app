import { getCrossTabGestureOptions } from '../useCrossTabBack';

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useNavigation: jest.fn(),
  useRouter: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  impactAsync: jest.fn(),
}));

describe('getCrossTabGestureOptions', () => {
  it('keeps native gestures enabled for cross-tab routes', () => {
    expect(getCrossTabGestureOptions(true)).toEqual({ gestureEnabled: true });
  });

  it('does not override same-tab routes', () => {
    expect(getCrossTabGestureOptions(false)).toBeUndefined();
  });
});
