import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { AppearanceSection } from '../AppearanceSection';
import { shouldStackSettingsPreferenceRow } from '../preference-row-layout';

const renderer = jest.requireActual('react-test-renderer');
const { act } = renderer;

const mockAppearanceState = {
  user: {
    themeMode: 'dark' as 'light' | 'dark' | 'system',
    fontSize: 'medium' as 'small' | 'medium' | 'large',
    readingFont: 'source-serif' as 'source-serif' | 'garamond',
    accentTheme: 'gold',
  },
  updateUser: jest.fn(),
  premium: 'granted' as 'granted' | 'denied',
  window: { width: 402, height: 874, scale: 3, fontScale: 1 },
};

jest.spyOn(jest.requireActual('react-native'), 'useWindowDimensions').mockImplementation(() => ({
  ...mockAppearanceState.window,
}));

jest.mock('react-native-gesture-handler', () => {
  const { TouchableOpacity } = jest.requireActual('react-native');
  return { TouchableOpacity };
});

jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    FadeIn: { duration: () => ({ easing: () => undefined }) },
    useReducedMotion: () => true,
    Easing: {
      out: jest.fn((value) => value),
      in: jest.fn((value) => value),
      inOut: jest.fn((value) => value),
      cubic: 'cubic',
    },
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Warning: 'warning' },
}));

jest.mock('@/components/icons', () =>
  new Proxy({}, { get: (_target, prop) => (typeof prop === 'string' ? prop : undefined) }),
);

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      text: '#F5F0EB',
      textMuted: 'rgba(245,240,235,0.6)',
      textSubtle: 'rgba(245,240,235,0.4)',
      background: '#0B0A09',
      buttonBackground: 'rgba(245,240,235,0.08)',
      buttonBackgroundPressed: 'rgba(245,240,235,0.12)',
      border: 'rgba(245,240,235,0.08)',
      inputBackground: '#141210',
      accent: '#C8A55C',
    },
    isDark: true,
  }),
}));

jest.mock('@/lib/store', () => ({
  ACCENT_THEMES: [{ id: 'gold', name: 'Gold', dark: '#C8A55C', light: '#9A7B3C' }],
  READING_FONTS: [
    { id: 'source-serif', name: 'Source Serif', preview: 'Classic & warm', regular: 'SourceSerifPro_400Regular' },
    { id: 'garamond', name: 'Garamond', preview: 'Elegant & timeless', regular: 'EBGaramond_400Regular' },
  ],
  useUnfoldStore: (selector: (state: { user: typeof mockAppearanceState.user; updateUser: typeof mockAppearanceState.updateUser }) => unknown) =>
    selector({ user: mockAppearanceState.user, updateUser: mockAppearanceState.updateUser }),
}));

jest.mock('@/hooks/usePremiumAccessPolicy', () => ({
  usePremiumAccessPolicy: () => mockAppearanceState.premium,
}));

jest.mock('@/lib/reading-fonts-loader', () => ({
  loadAllReadingFonts: jest.fn(async () => undefined),
  loadReadingFont: jest.fn(async () => undefined),
}));

function createSection() {
  let tree: { root: any; toJSON: () => unknown; unmount: () => void };
  act(() => {
    tree = renderer.create(<AppearanceSection onPremiumFeature={jest.fn()} />);
  });
  return tree!;
}

function flatten(style: unknown) {
  return StyleSheet.flatten(style) as Record<string, unknown>;
}

function labelNode(tree: { root: any }, label: string) {
  return tree.root.findAllByType(Text).find((node: { props: { children?: unknown } }) => node.props.children === label);
}

function chipRowStyle(tree: { root: any }, label: string) {
  return flatten(labelNode(tree, label).parent.props.style);
}

function pressableAncestor(node: { parent?: any; props?: { onPress?: unknown } }): { props: { onPress: () => void } } {
  let current: { parent?: any; props?: { onPress?: unknown } } | undefined = node;
  while (current && typeof current.props?.onPress !== 'function') {
    current = current.parent;
  }
  if (!current || typeof current.props?.onPress !== 'function') {
    throw new Error('expected a pressable ancestor');
  }
  return current as { props: { onPress: () => void } };
}

describe('AppearanceSection preference rows', () => {
  beforeEach(() => {
    mockAppearanceState.user = {
      themeMode: 'dark',
      fontSize: 'medium',
      readingFont: 'source-serif',
      accentTheme: 'gold',
    };
    mockAppearanceState.updateUser.mockReset();
    mockAppearanceState.premium = 'granted';
    mockAppearanceState.window = { width: 402, height: 874, scale: 3, fontScale: 1 };
  });

  it('renders complete Theme, Reading Font, and Font size labels at 402pt default text', () => {
    const tree = createSection();
    expect(labelNode(tree, 'Theme').props.children).toBe('Theme');
    expect(labelNode(tree, 'Reading Font').props.children).toBe('Reading Font');
    expect(labelNode(tree, 'Font size').props.children).toBe('Font size');
    expect(labelNode(tree, 'Source Serif').props.children).toBe('Source Serif');
    expect(labelNode(tree, 'Theme').props.numberOfLines).toBeUndefined();
    expect(labelNode(tree, 'Font size').props.numberOfLines).toBeUndefined();
    expect(chipRowStyle(tree, 'Theme').flexDirection).toBe('row');
    expect(chipRowStyle(tree, 'Font size').flexDirection).toBe('row');
    expect(flatten(tree.root.findByProps({ accessibilityLabel: 'Reading Font' }).props.style).flexDirection).toBe('row');
    expect(shouldStackSettingsPreferenceRow(402, 1)).toBe(false);
  });

  it('keeps theme and font-size selection wired, including chip accessibility state', () => {
    const tree = createSection();
    const dark = tree.root.findByProps({ accessibilityLabel: 'Dark theme' });
    const medium = tree.root.findByProps({ accessibilityLabel: 'Medium font size' });
    expect(dark.props.accessibilityRole).toBe('button');
    expect(dark.props.accessibilityState).toEqual({ selected: true });
    expect(medium.props.accessibilityRole).toBe('button');
    expect(medium.props.accessibilityState).toEqual({ selected: true });

    act(() => {
      tree.root.findByProps({ accessibilityLabel: 'Light theme' }).props.onPress();
      tree.root.findByProps({ accessibilityLabel: 'Large font size' }).props.onPress();
    });

    expect(mockAppearanceState.updateUser).toHaveBeenCalledWith({ themeMode: 'light' });
    expect(mockAppearanceState.updateUser).toHaveBeenCalledWith({ fontSize: 'large' });
  });

  it('opens the family selector and writes the chosen reading font when premium', () => {
    const { loadReadingFont } = jest.requireMock('@/lib/reading-fonts-loader');
    const tree = createSection();
    const toggle = tree.root.findByProps({ accessibilityLabel: 'Reading Font' });
    expect(toggle.props.accessibilityRole).toBe('button');
    expect(toggle.props.accessibilityState).toEqual({ expanded: false });

    act(() => {
      toggle.props.onPress();
    });

    expect(tree.root.findByProps({ accessibilityLabel: 'Reading Font' }).props.accessibilityState).toEqual({
      expanded: true,
    });
    const garamond = tree.root.findAllByType(Text).find((node: { props: { children?: unknown } }) => node.props.children === 'Garamond');
    expect(garamond).toBeTruthy();

    act(() => {
      pressableAncestor(garamond).props.onPress();
    });

    expect(loadReadingFont).toHaveBeenCalledWith('garamond');
    expect(mockAppearanceState.updateUser).toHaveBeenCalledWith({ readingFont: 'garamond' });
  });

  it('routes a locked family tap to the premium handler and does not write the font', () => {
    mockAppearanceState.premium = 'denied';
    const onPremiumFeature = jest.fn();
    let tree: { root: any };
    act(() => {
      tree = renderer.create(<AppearanceSection onPremiumFeature={onPremiumFeature} />);
    });

    act(() => {
      tree.root.findByProps({ accessibilityLabel: 'Reading Font' }).props.onPress();
    });
    const garamond = tree!.root.findAllByType(Text).find((node: { props: { children?: unknown } }) => node.props.children === 'Garamond');
    act(() => {
      pressableAncestor(garamond).props.onPress();
    });

    expect(onPremiumFeature).toHaveBeenCalledWith('font');
    expect(mockAppearanceState.updateUser).not.toHaveBeenCalled();
  });

  it('stacks the three rows at 320/375pt and at enlarged scales through 3.0 without shrinking labels', () => {
    const cases = [
      { width: 320, fontScale: 1 },
      { width: 375, fontScale: 1 },
      { width: 402, fontScale: 1.18 },
      { width: 320, fontScale: 3 },
      { width: 375, fontScale: 3 },
      { width: 402, fontScale: 3 },
    ];

    for (const { width, fontScale } of cases) {
      mockAppearanceState.window = { width, height: 874, scale: 3, fontScale };
      const tree = createSection();
      expect(shouldStackSettingsPreferenceRow(width, fontScale)).toBe(true);
      expect(chipRowStyle(tree, 'Theme').flexDirection).toBe('column');
      expect(chipRowStyle(tree, 'Font size').flexDirection).toBe('column');
      expect(flatten(tree.root.findByProps({ accessibilityLabel: 'Reading Font' }).props.style).flexDirection).toBe('column');
      expect(labelNode(tree, 'Theme').props.children).toBe('Theme');
      expect(labelNode(tree, 'Font size').props.children).toBe('Font size');
      expect(labelNode(tree, 'Reading Font').props.children).toBe('Reading Font');
      expect(labelNode(tree, 'Theme').props.maxFontSizeMultiplier).toBe(1.4);
      expect(labelNode(tree, 'Font size').props.maxFontSizeMultiplier).toBe(1.4);
      expect(flatten(labelNode(tree, 'Theme').props.style).flexShrink).toBe(0);
      expect(flatten(labelNode(tree, 'Source Serif').props.style).flexShrink).toBe(1);
      expect(flatten(labelNode(tree, 'Source Serif').parent.props.style).minWidth).toBe(0);
      act(() => {
        tree.unmount();
      });
    }
  });

  it('lets the Reading Font label shrink-wrap at 320pt and fontScale 3.0 while the icon and chevron stay unsqueezed', () => {
    mockAppearanceState.window = { width: 320, height: 874, scale: 3, fontScale: 3 };
    const tree = createSection();
    const label = labelNode(tree, 'Reading Font');
    expect(label.props.children).toBe('Reading Font');
    expect(flatten(label.props.style)).toEqual(expect.objectContaining({ flexShrink: 1, minWidth: 0 }));
    const leading = label.parent;
    expect(flatten(leading.props.style)).toEqual(
      expect.objectContaining({ flexShrink: 1, minWidth: 0, maxWidth: '100%' }),
    );
    expect(flatten(leading.children[0].props.style).flexShrink).toBe(0);
    const trailing = labelNode(tree, 'Source Serif').parent;
    const chevronWrap = trailing.children[trailing.children.length - 1];
    expect(flatten(chevronWrap.props.style).flexShrink).toBe(0);
  });
});
