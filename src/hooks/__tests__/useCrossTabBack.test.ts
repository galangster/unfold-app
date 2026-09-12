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

  it('maps from=you back to the You tab root', () => {
    expect(getCurrentTabFromSegments(['(tabs)', '(you)', 'settings'])).toBe('(you)');
    expect(isCrossTabBackNavigation('you', ['(tabs)', '(today)', 'my-content'])).toBe(true);
    expect(isCrossTabBackNavigation('you', ['(tabs)', '(you)', 'settings'])).toBe(false);
  });
});

describe('Study tab back routing', () => {
  it('resolves the Study stack and leaves same-stack pops native', () => {
    expect(getCurrentTabFromSegments(['(tabs)', '(study)', 'series-detail'])).toBe('(study)');
    expect(isCrossTabBackNavigation('study', ['(tabs)', '(study)', 'past-devotionals'])).toBe(false);
    expect(isCrossTabBackNavigation('home', ['(tabs)', '(study)', 'index'])).toBe(true);
  });

  it('returns a leftover Study-originated Today reader to the Study tab', () => {
    expect(isCrossTabBackNavigation('study', ['(tabs)', '(today)', 'reading'])).toBe(true);
  });

  it('leaves a Study-hosted reader on the native Study stack', () => {
    expect(isCrossTabBackNavigation('study', ['(tabs)', '(study)', 'reading'])).toBe(false);
    expect(isCrossTabBackNavigation(undefined, ['(tabs)', '(study)', 'reading'])).toBe(false);
  });
});
