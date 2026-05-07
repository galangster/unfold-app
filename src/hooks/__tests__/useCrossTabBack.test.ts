import {
  getCrossTabGestureOptions,
  getCurrentTabFromSegments,
  isCrossTabBackNavigation,
} from '../useCrossTabBack';

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useNavigation: jest.fn(),
  useRouter: jest.fn(),
  useSegments: jest.fn(),
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

describe('Today alias back routing helpers', () => {
  it('reads the active tab group from expo-router segments', () => {
    expect(getCurrentTabFromSegments(['(tabs)', '(today)', 'my-content'])).toBe('(today)');
    expect(getCurrentTabFromSegments(['(tabs)', '(you)', 'my-content'])).toBe('(you)');
  });

  it('does not treat Today alias screens with from=home as cross-tab pushes', () => {
    expect(isCrossTabBackNavigation('home', ['(tabs)', '(today)', 'my-content'])).toBe(false);
    expect(isCrossTabBackNavigation('home', ['(tabs)', '(today)', 'past-devotionals'])).toBe(false);
  });

  it('still treats hidden You stack screens opened from Today as cross-tab pushes', () => {
    expect(isCrossTabBackNavigation('home', ['(tabs)', '(you)', 'my-content'])).toBe(true);
  });
});
