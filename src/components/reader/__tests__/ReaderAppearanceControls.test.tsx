import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { ReaderAppearanceControls } from '../ReaderAppearanceControls';
import { ReaderLibraryRow } from '../ReaderLibraryRow';

const renderer = require('react-test-renderer');
const { act } = renderer;

jest.mock('@/lib/store', () => ({
  READING_FONTS: [
    { id: 'source-serif', name: 'Source Serif', preview: 'Classic & warm' },
    { id: 'garamond', name: 'Garamond', preview: 'Elegant & timeless' },
  ],
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

jest.mock('phosphor-react-native', () => ({
  BookmarkSimpleIcon: () => null,
  CaretRightIcon: () => null,
  LockSimpleIcon: () => null,
  MinusIcon: () => null,
  PlusIcon: () => null,
  SunDimIcon: () => null,
  TextAaIcon: () => null,
}));

function create(element: React.ReactElement) {
  let tree: any;
  act(() => {
    tree = renderer.create(element);
  });
  return tree;
}

describe('ReaderAppearanceControls', () => {
  it('renders reader theme, brightness, devotional text size, and font controls with accessible selected state', () => {
    const onThemeModeChange = jest.fn();
    const onBrightnessChange = jest.fn();
    const onResetBrightness = jest.fn();
    const onFontSizeKindChange = jest.fn();
    const onReadingFontChange = jest.fn();
    const onLockedFontPress = jest.fn();

    const tree = create(
      <ReaderAppearanceControls
        themeMode="system"
        onThemeModeChange={onThemeModeChange}
        brightness={0.5}
        brightnessAvailable
        onBrightnessChange={onBrightnessChange}
        onResetBrightness={onResetBrightness}
        fontSizeKind="medium"
        onFontSizeKindChange={onFontSizeKindChange}
        readingFont="source-serif"
        onReadingFontChange={onReadingFontChange}
        isPremium={false}
        onLockedFontPress={onLockedFontPress}
      />,
    );

    expect(JSON.stringify(tree.toJSON())).toContain('Appearance');
    expect(JSON.stringify(tree.toJSON())).toContain('Theme');
    expect(JSON.stringify(tree.toJSON())).toContain('Brightness');
    expect(JSON.stringify(tree.toJSON())).toContain('Text size');
    expect(JSON.stringify(tree.toJSON())).toContain('Reading font');

    const systemButton = tree.root.findByProps({ accessibilityLabel: 'Use system theme' });
    expect(systemButton.props.accessibilityState).toEqual({ selected: true });

    const resetButton = tree.root.findByProps({ accessibilityLabel: 'Reset reader brightness to system level' });
    expect(resetButton.type).toBe(TouchableOpacity);
    expect(resetButton.props.accessibilityRole).toBe('button');
    expect(resetButton.props.accessibilityState).toEqual({ disabled: false });
    expect(StyleSheet.flatten(resetButton.props.style)).toEqual(expect.objectContaining({ minHeight: 44 }));

    const brightnessSlider = tree.root.findByProps({ testID: 'reader-brightness-slider' });
    expect(brightnessSlider.props.accessibilityRole).toBe('adjustable');
    expect(brightnessSlider.props.accessibilityLabel).toBe('Reader brightness');
    expect(brightnessSlider.props.accessibilityState).toEqual({ disabled: false });

    act(() => {
      tree.root.findByProps({ accessibilityLabel: 'Use dark theme' }).props.onPress();
      tree.root.findByProps({ accessibilityLabel: 'Use large text size' }).props.onPress();
      brightnessSlider.props.onValueChange(0.7);
      resetButton.props.onPress();
    });

    expect(onThemeModeChange).toHaveBeenCalledWith('dark');
    expect(onFontSizeKindChange).toHaveBeenCalledWith('large');
    expect(onBrightnessChange).toHaveBeenCalledWith(0.7);
    expect(onResetBrightness).toHaveBeenCalledTimes(1);
  });

  it('routes free font taps to font change and locked font taps to the premium handler', () => {
    const onReadingFontChange = jest.fn();
    const onLockedFontPress = jest.fn();

    const tree = create(
      <ReaderAppearanceControls
        themeMode="dark"
        onThemeModeChange={jest.fn()}
        brightness={null}
        brightnessAvailable={false}
        onBrightnessChange={jest.fn()}
        readingFont="source-serif"
        onReadingFontChange={onReadingFontChange}
        isPremium={false}
        onLockedFontPress={onLockedFontPress}
      />,
    );

    act(() => {
      tree.root.findByProps({ accessibilityLabel: 'Source Serif reading font' }).props.onPress();
      tree.root.findByProps({ accessibilityLabel: 'Garamond reading font, Premium locked' }).props.onPress();
    });

    expect(onReadingFontChange).toHaveBeenCalledWith('source-serif');
    expect(onLockedFontPress).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(tree.toJSON())).toContain('Brightness is not available on this device.');
  });

  it('supports Bible numeric font size controls when bible font size props are supplied', () => {
    const onBibleFontSizeChange = jest.fn();

    const tree = create(
      <ReaderAppearanceControls
        themeMode="light"
        onThemeModeChange={jest.fn()}
        brightness={0.25}
        brightnessAvailable
        onBrightnessChange={jest.fn()}
        bibleFontSize={20}
        onBibleFontSizeChange={onBibleFontSizeChange}
        readingFont="source-serif"
        onReadingFontChange={jest.fn()}
        isPremium
        onLockedFontPress={jest.fn()}
      />,
    );

    act(() => {
      tree.root.findByProps({ accessibilityLabel: 'Decrease Bible text size' }).props.onPress();
      tree.root.findByProps({ accessibilityLabel: 'Increase Bible text size' }).props.onPress();
    });

    expect(onBibleFontSizeChange).toHaveBeenNthCalledWith(1, 19);
    expect(onBibleFontSizeChange).toHaveBeenNthCalledWith(2, 21);
    expect(JSON.stringify(tree.toJSON())).toContain('20');
  });
});

describe('ReaderLibraryRow', () => {
  it('renders a 44pt tappable library row with label, count, and accessibility label', () => {
    const onPress = jest.fn();
    const tree = create(
      <ReaderLibraryRow
        label="Saved highlights & notes"
        count={3}
        onPress={onPress}
        accessibilityLabel="Open 3 saved highlights and notes"
      />,
    );

    const row = tree.root.findByProps({ testID: 'reader-library-row' });
    expect(row.type).toBe(TouchableOpacity);
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe('Open 3 saved highlights and notes');
    expect(row.props.accessibilityState).toEqual({ disabled: false });
    expect(StyleSheet.flatten(row.props.style)).toEqual(expect.objectContaining({ minHeight: 44 }));
    expect(JSON.stringify(tree.toJSON())).toContain('Saved highlights & notes');
    expect(JSON.stringify(tree.toJSON())).toContain('3');

    act(() => {
      row.props.onPress();
    });

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
