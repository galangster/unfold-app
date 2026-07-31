import React from 'react';
import { DevotionalReaderPreferencesSheet } from '../DevotionalReaderPreferencesSheet';

const renderer = require('react-test-renderer');
const { act } = renderer;

const mockUpdateUser = jest.fn();
const mockRouterPush = jest.fn();
const mockOnClose = jest.fn();
const mockOnOpenSavedContent = jest.fn();
const mockOnLockedFontPress = jest.fn();
const mockSetBrightness = jest.fn();
const mockResetBrightness = jest.fn();

let mockStoreState = {
  user: {
    themeMode: 'dark',
    fontSize: 'medium',
    readingFont: 'source-serif',
  },
  updateUser: mockUpdateUser,
};

jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
  READING_FONTS: [
    { id: 'source-serif', name: 'Source Serif', preview: 'Classic & warm' },
    { id: 'garamond', name: 'Garamond', preview: 'Elegant & timeless' },
  ],
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock('@/hooks/useReaderBrightness', () => ({
  useReaderBrightness: () => ({
    brightness: 0.6,
    brightnessAvailable: true,
    setBrightness: mockSetBrightness,
    resetBrightness: mockResetBrightness,
  }),
}));

jest.mock('@/hooks/useSavedHighlights', () => ({
  useSavedHighlights: () => ({ count: { devotional: 4, all: 6 } }),
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

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'Animated.View' },
  Easing: {
    out: jest.fn((value) => value),
    in: jest.fn((value) => value),
    inOut: jest.fn((value) => value),
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
  GearSixIcon: () => null,
  LockSimpleIcon: () => null,
  MinusIcon: () => null,
  PlusIcon: () => null,
  SunDimIcon: () => null,
  TextAaIcon: () => null,
  XIcon: () => null,
}));

function renderSheet(extraProps: Partial<React.ComponentProps<typeof DevotionalReaderPreferencesSheet>> = {}) {
  let tree: any;
  act(() => {
    tree = renderer.create(
      <DevotionalReaderPreferencesSheet
        visible
        onClose={mockOnClose}
        onOpenSavedContent={mockOnOpenSavedContent}
        isPremium={false}
        onLockedFontPress={mockOnLockedFontPress}
        {...extraProps}
      />,
    );
  });
  return tree;
}

describe('DevotionalReaderPreferencesSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStoreState = {
      user: {
        themeMode: 'dark',
        fontSize: 'medium',
        readingFont: 'source-serif',
      },
      updateUser: mockUpdateUser,
    };
  });

  it('renders the shared reader preference groups and devotional saved-library row', () => {
    const tree = renderSheet();
    const content = JSON.stringify(tree.toJSON());

    // Visible "Reader preferences" title + close X were removed (dismissal is
    // swipe-down/backdrop); the sheet keeps its accessible name.
    expect(content).toContain('Devotional reader preferences');
    expect(content).toContain('Appearance');
    expect(content).toContain('Theme');
    expect(content).toContain('Brightness');
    expect(content).toContain('Text size');
    expect(content).toContain('Reading font');
    expect(content).toContain('Saved highlights & notes');
    expect(content).toContain('4');
  });

  it('updates theme, text size, brightness, and reading font through the shared controls', () => {
    const tree = renderSheet({ isPremium: true });

    act(() => {
      tree.root.findByProps({ accessibilityLabel: 'Use light theme' }).props.onPress();
      tree.root.findByProps({ accessibilityLabel: 'Use large text size' }).props.onPress();
      tree.root.findByProps({ testID: 'reader-brightness-slider' }).props.onValueChange(0.72);
      tree.root.findByProps({ accessibilityLabel: 'Reset reader brightness to system level' }).props.onPress();
      tree.root.findByProps({ accessibilityLabel: 'Garamond reading font' }).props.onPress();
    });

    expect(mockUpdateUser).toHaveBeenCalledWith({ themeMode: 'light' });
    expect(mockUpdateUser).toHaveBeenCalledWith({ fontSize: 'large' });
    expect(mockSetBrightness).toHaveBeenCalledWith(0.72);
    expect(mockResetBrightness).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser).toHaveBeenCalledWith({ readingFont: 'garamond' });
  });

  it('keeps premium handling in the parent and routes saved content from the sheet row', () => {
    const tree = renderSheet({ isPremium: false });

    act(() => {
      tree.root.findByProps({ accessibilityLabel: 'Garamond reading font, Premium locked' }).props.onPress();
      tree.root.findByProps({ testID: 'reader-library-row' }).props.onPress();
    });

    expect(mockOnLockedFontPress).toHaveBeenCalledTimes(1);
    expect(mockOnOpenSavedContent).toHaveBeenCalledTimes(1);
  });

  it('closes the sheet and cross-tab pushes to Settings from the All settings row', () => {
    const tree = renderSheet();

    act(() => {
      tree.root.findByProps({ testID: 'reader-all-settings-row' }).props.onPress();
    });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/(tabs)/(you)/settings',
      params: { from: 'home' },
    });
  });
});
