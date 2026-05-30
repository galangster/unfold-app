import React from 'react';
import { ReadingSettingsSheet } from '../ReadingSettingsSheet';

const renderer = require('react-test-renderer');
const { act } = renderer;

const mockUpdateBibleReaderSettings = jest.fn();
const mockUpdateUser = jest.fn();
const mockOnClose = jest.fn();
const mockOnOpenSavedVerses = jest.fn();
const mockOnLockedFontPress = jest.fn();
const mockSetBrightness = jest.fn();
const mockResetBrightness = jest.fn();

let mockStoreState = {
  user: {
    themeMode: 'dark',
    readingFont: 'source-serif',
  },
  bibleReaderSettings: {
    fontSize: 20,
    lineHeightMultiplier: 1.8,
    showVerseNumbers: true,
    paragraphMode: false,
    translation: 'BSB',
  },
  updateBibleReaderSettings: mockUpdateBibleReaderSettings,
  updateUser: mockUpdateUser,
};

jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
  READING_FONTS: [
    { id: 'source-serif', name: 'Source Serif', preview: 'Classic & warm' },
    { id: 'garamond', name: 'Garamond', preview: 'Elegant & timeless' },
  ],
}));

jest.mock('@/hooks/useReaderBrightness', () => ({
  useReaderBrightness: () => ({
    brightness: 0.55,
    brightnessAvailable: true,
    setBrightness: mockSetBrightness,
    resetBrightness: mockResetBrightness,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 10, left: 0 }),
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      accent: '#C8A55C',
      backgroundElevated: '#141210',
      inputBackground: 'rgba(245,240,235,0.05)',
      inputBackgroundFocused: 'rgba(245,240,235,0.08)',
      buttonBackground: 'rgba(245,240,235,0.08)',
      text: '#F5F0EB',
      textMuted: 'rgba(245,240,235,0.6)',
      textSubtle: 'rgba(245,240,235,0.4)',
      textHint: 'rgba(245,240,235,0.25)',
      border: 'rgba(245,240,235,0.08)',
      borderStrong: 'rgba(245,240,235,0.28)',
    },
    isDark: true,
  }),
}));

jest.mock('@react-native-community/slider', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function Slider(props: any) {
    return <View {...props} testID={props.testID ?? 'reader-brightness-slider'} />;
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'Animated.View' },
  Easing: {
    out: jest.fn((value) => value),
    in: jest.fn((value) => value),
    inOut: jest.fn((value) => value),
    bezier: jest.fn(() => 'bezier'),
    cubic: 'cubic',
  },
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  useAnimatedStyle: (factory: () => unknown) => factory(),
  useReducedMotion: () => true,
  useSharedValue: (value: unknown) => ({ value }),
  withTiming: (value: unknown, _config?: unknown, callback?: (finished: boolean) => void) => {
    callback?.(true);
    return value;
  },
}));

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  const makePan = () => {
    const gesture: Record<string, jest.Mock> = {};
    ['activeOffsetY', 'failOffsetX', 'onUpdate', 'onEnd'].forEach((name) => {
      gesture[name] = jest.fn(() => gesture);
    });
    return gesture;
  };
  return {
    Gesture: { Pan: jest.fn(makePan) },
    GestureDetector: ({ children }: any) => <View>{children}</View>,
    GestureHandlerRootView: ({ children, style }: any) => <View style={style}>{children}</View>,
  };
});

jest.mock('phosphor-react-native', () => ({
  BookmarkSimpleIcon: () => null,
  CaretRightIcon: () => null,
  LockSimpleIcon: () => null,
  MinusIcon: () => null,
  PlusIcon: () => null,
  SunDimIcon: () => null,
  TextAaIcon: () => null,
  XIcon: () => null,
}));

function renderSheet(extraProps: Partial<React.ComponentProps<typeof ReadingSettingsSheet>> = {}) {
  let tree: any;
  act(() => {
    tree = renderer.create(
      <ReadingSettingsSheet
        visible
        onClose={mockOnClose}
        tabBarHeight={72}
        savedVersesCount={5}
        onOpenSavedVerses={mockOnOpenSavedVerses}
        isPremium={false}
        onLockedFontPress={mockOnLockedFontPress}
        {...extraProps}
      />,
    );
  });
  return tree;
}

describe('ReadingSettingsSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStoreState = {
      user: {
        themeMode: 'dark',
        readingFont: 'source-serif',
      },
      bibleReaderSettings: {
        fontSize: 20,
        lineHeightMultiplier: 1.8,
        showVerseNumbers: true,
        paragraphMode: false,
        translation: 'BSB',
      },
      updateBibleReaderSettings: mockUpdateBibleReaderSettings,
      updateUser: mockUpdateUser,
    };
  });

  it('renders shared appearance controls plus Bible-specific controls and saved verses row', () => {
    const tree = renderSheet();
    const content = JSON.stringify(tree.toJSON());

    expect(content).toContain('Reader preferences');
    expect(content).toContain('Appearance');
    expect(content).toContain('Brightness');
    expect(content).toContain('Reading font');
    expect(content).toContain('Bible');
    expect(content).toContain('Line height');
    expect(content).toContain('Translation');
    expect(content).toContain('Saved Bible highlights');
    expect(content).toContain('5');
  });

  it('updates theme, brightness, Bible font size, line height, translation, and reading font', () => {
    const tree = renderSheet({ isPremium: true });

    act(() => {
      tree.root.findByProps({ accessibilityLabel: 'Use light theme' }).props.onPress();
      tree.root.findByProps({ testID: 'reader-brightness-slider' }).props.onValueChange(0.78);
      tree.root.findByProps({ accessibilityLabel: 'Increase Bible text size' }).props.onPress();
      tree.root.findByProps({ accessibilityLabel: 'Comfortable line height' }).props.onPress();
      tree.root.findByProps({ accessibilityLabel: 'KJV translation' }).props.onPress();
      tree.root.findByProps({ accessibilityLabel: 'Garamond reading font' }).props.onPress();
    });

    expect(mockUpdateUser).toHaveBeenCalledWith({ themeMode: 'light' });
    expect(mockSetBrightness).toHaveBeenCalledWith(0.78);
    expect(mockUpdateBibleReaderSettings).toHaveBeenCalledWith({ fontSize: 21 });
    expect(mockUpdateBibleReaderSettings).toHaveBeenCalledWith({ lineHeightMultiplier: 2.1 });
    expect(mockUpdateBibleReaderSettings).toHaveBeenCalledWith({ translation: 'KJV' });
    expect(mockUpdateUser).toHaveBeenCalledWith({ readingFont: 'garamond' });
  });

  it('delegates locked reading fonts and saved verses to the parent', () => {
    const tree = renderSheet({ isPremium: false });

    act(() => {
      tree.root.findByProps({ accessibilityLabel: 'Garamond reading font, Premium locked' }).props.onPress();
      tree.root.findByProps({ testID: 'reader-library-row' }).props.onPress();
    });

    expect(mockOnLockedFontPress).toHaveBeenCalledTimes(1);
    expect(mockOnOpenSavedVerses).toHaveBeenCalledTimes(1);
  });
});
