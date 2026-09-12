import renderer, { act } from 'react-test-renderer';
import {
  QaMethodReadingReturnBar,
  buildQaMethodReadingReturnNavigation,
} from '../QaMethodReadingReturnBar';

const mockNavigate = jest.fn();
const mockIsScripturePracticeEnabled = jest.fn(() => true);
const mockResolve = jest.fn();
const mockClear = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    navigate: mockNavigate,
    back: jest.fn(),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 12, left: 0, right: 0 }),
}));

jest.mock('@/lib/scripture-practice-feature', () => ({
  isScripturePracticeEnabled: () => mockIsScripturePracticeEnabled(),
}));

jest.mock('@/lib/qa-method-reading-return', () => ({
  resolveQaMethodReadingReturn: () => mockResolve(),
  clearQaMethodReadingReturn: () => mockClear(),
  useQaMethodReadingReturn: () => mockResolve(),
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

describe('QA sample return bar', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockClear.mockReset();
    mockResolve.mockReset().mockReturnValue({ methodId: 'lectio_divina' });
    mockIsScripturePracticeEnabled.mockReturnValue(true);
  });

  it('returns to the sample route and never uses the production practice pointer', async () => {
    expect(buildQaMethodReadingReturnNavigation('lectio_divina')).toEqual({
      pathname: '/qa-method-readings',
      params: { method: 'lectio_divina' },
    });

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<QaMethodReadingReturnBar />);
    });
    const continueButton = tree!.root.findByProps({ testID: 'qa-method-reading-return-continue' });
    expect(continueButton.props.accessibilityLabel).toContain('Return to sample');
    await act(async () => {
      continueButton.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/qa-method-readings',
      params: { method: 'lectio_divina' },
    });
    expect(mockClear).toHaveBeenCalled();
    expect(JSON.stringify(mockNavigate.mock.calls)).not.toContain('back');
    expect(JSON.stringify(mockNavigate.mock.calls)).not.toContain('scripturePracticeReturn');
  });

  it('clears the QA pointer on dismiss and hides when no context remains', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<QaMethodReadingReturnBar />);
    });
    await act(async () => {
      tree!.root.findByProps({ testID: 'qa-method-reading-return-close' }).props.onPress();
    });
    expect(mockClear).toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();

    mockResolve.mockReturnValue(null);
    await act(async () => {
      tree!.update(<QaMethodReadingReturnBar />);
    });
    expect(tree!.root.findAllByProps({ testID: 'qa-method-reading-return-bar' })).toHaveLength(0);
  });
});
