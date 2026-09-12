import renderer, { act } from 'react-test-renderer';
import {
  DevotionalReturnBar,
  buildPracticeReturnNavigation,
} from '../DevotionalReturnBar';

type PracticeReturn = {
  target: {
    devotionalId: string;
    dayNumber: number;
    hostTab: '(today)' | '(study)';
    methodId: string;
  };
  destination: 'practice' | 'reading';
};

const mockNavigate = jest.fn();
const mockSetScripturePracticeReturn = jest.fn();
const mockResolvePracticeReturn = jest.fn();
const mockIsScripturePracticeEnabled = jest.fn(() => true);

const practiceReturn: PracticeReturn = {
  target: {
    devotionalId: 'devo-1',
    dayNumber: 4,
    hostTab: '(today)',
    methodId: 'lectio_divina',
  },
  destination: 'practice',
};

const readingReturn: PracticeReturn = {
  target: {
    devotionalId: 'devo-9',
    dayNumber: 2,
    hostTab: '(study)',
    methodId: 'comparative_translation',
  },
  destination: 'reading',
};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    navigate: mockNavigate,
    back: jest.fn(),
    dismissTo: jest.fn(),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 12, left: 0, right: 0 }),
}));

jest.mock('@/lib/scripture-practice-feature', () => ({
  isScripturePracticeEnabled: () => mockIsScripturePracticeEnabled(),
}));

jest.mock('@/lib/scripture-practice', () => ({
  resolvePracticeReturn: (...args: unknown[]) => mockResolvePracticeReturn(...args),
}));

jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: unknown) => unknown) =>
    selector({
      scripturePracticeReturn: practiceReturn,
      devotionals: [{ id: 'devo-1' }],
      currentDevotionalId: 'devo-1',
      setScripturePracticeReturn: mockSetScripturePracticeReturn,
      resumeContext: { route: 'home', touchedAt: 99 },
    }),
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      background: '#000',
      backgroundElevated: '#111',
      text: '#fff',
      accent: '#C8A55C',
      borderStrong: '#444',
    },
  }),
}));

jest.mock('@/components/icons', () => new Proxy({}, {
  get: (_target, name) => (name === '__esModule' ? true : () => null),
}));

describe('practice return route identity', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockSetScripturePracticeReturn.mockReset();
    mockResolvePracticeReturn.mockReset().mockReturnValue(practiceReturn);
    mockIsScripturePracticeEnabled.mockReturnValue(true);
  });

  it('reuses the host reading route and practice params only for a practice destination', () => {
    expect(buildPracticeReturnNavigation(practiceReturn)).toEqual({
      pathname: '/(tabs)/(today)/reading',
      params: {
        devotionalId: 'devo-1',
        dayNumber: '4',
        practice: '1',
        practiceMethod: 'lectio_divina',
      },
    });
    expect(buildPracticeReturnNavigation(readingReturn)).toEqual({
      pathname: '/(tabs)/(study)/reading',
      params: {
        devotionalId: 'devo-9',
        dayNumber: '2',
      },
    });
    expect(buildPracticeReturnNavigation(readingReturn).params).not.toHaveProperty('practice');
    expect(buildPracticeReturnNavigation(readingReturn).params).not.toHaveProperty('practiceMethod');
  });

  it('navigates with the validated route and never calls router.back', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<DevotionalReturnBar />);
    });
    const continueButton = tree!.root.findByProps({ testID: 'devotional-return-continue' });
    await act(async () => {
      continueButton.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/(tabs)/(today)/reading',
      params: {
        devotionalId: 'devo-1',
        dayNumber: '4',
        practice: '1',
        practiceMethod: 'lectio_divina',
      },
    });
    expect(mockSetScripturePracticeReturn).toHaveBeenCalledWith(null);
    expect(JSON.stringify(mockNavigate.mock.calls)).not.toContain('back');
  });

  it('clears the pointer on explicit close and stays hidden when the gate or identity fails', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<DevotionalReturnBar />);
    });
    const close = tree!.root.findByProps({ testID: 'devotional-return-close' });
    await act(async () => {
      close.props.onPress();
    });
    expect(mockSetScripturePracticeReturn).toHaveBeenCalledWith(null);
    expect(mockNavigate).not.toHaveBeenCalled();

    mockResolvePracticeReturn.mockReturnValue(null);
    await act(async () => {
      tree.update(<DevotionalReturnBar />);
    });
    expect(tree!.root.findAllByProps({ testID: 'devotional-return-bar' })).toHaveLength(0);

    mockIsScripturePracticeEnabled.mockReturnValue(false);
    mockResolvePracticeReturn.mockReturnValue(practiceReturn);
    await act(async () => {
      tree.update(<DevotionalReturnBar />);
    });
    expect(tree!.root.findAllByProps({ testID: 'devotional-return-bar' })).toHaveLength(0);
    expect(JSON.stringify(mockResolvePracticeReturn.mock.calls)).not.toContain('touchedAt');
    expect(JSON.stringify(mockResolvePracticeReturn.mock.calls)).not.toContain('resumeContext');
  });
});
