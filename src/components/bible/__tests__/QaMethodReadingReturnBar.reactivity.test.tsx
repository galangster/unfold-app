import renderer, { act } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { Spacing } from '@/constants/spacing';
import {
  clearQaMethodReadingReturn,
  setQaMethodReadingReturn,
} from '@/lib/qa-method-reading-return';
import { QaMethodReadingReturnBar } from '../QaMethodReadingReturnBar';

const mockNavigate = jest.fn();

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
  isScripturePracticeEnabled: () => true,
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

describe('mounted QA return bar reactivity', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    clearQaMethodReadingReturn();
  });

  it('shows a pointer set after mount, hides on dismiss, and uses the ordinary tab offset', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<QaMethodReadingReturnBar />);
    });
    expect(tree!.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'qa-method-reading-return-bar')).toHaveLength(0);

    await act(async () => {
      expect(setQaMethodReadingReturn('lectio_divina')).toBe(true);
    });
    expect(tree!.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'qa-method-reading-return-bar')).toHaveLength(1);
    const overlay = tree!.root.findByProps({ testID: 'qa-method-reading-return-bar' }).parent;
    const overlayStyle = StyleSheet.flatten(overlay?.props.style);
    expect(overlayStyle.bottom).toBe(Math.max(12, 8) + 56 + Spacing['2']);

    await act(async () => {
      tree!.root.findByProps({ testID: 'qa-method-reading-return-close' }).props.onPress();
    });
    expect(tree!.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'qa-method-reading-return-bar')).toHaveLength(0);
  });
});
