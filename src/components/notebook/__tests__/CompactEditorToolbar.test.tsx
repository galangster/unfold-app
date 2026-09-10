import { StyleSheet, Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { CompactEditorToolbar } from '../CompactEditorToolbar';

jest.mock('@/components/icons', () => {
  const { View } = require('react-native');
  return {
    BookBookmarkIcon: (props: Record<string, unknown>) => <View {...props} />,
    TextAaIcon: (props: Record<string, unknown>) => <View {...props} />,
  };
});

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      accent: '#8B6826',
      backgroundElevated: '#FFFFFF',
      border: '#D8D0C4',
      text: '#201C18',
    },
  }),
}));

describe('CompactEditorToolbar', () => {
  it('exposes two readable editor actions and forwards explicit taps', () => {
    const onOpenFormatting = jest.fn();
    const onInsertScripture = jest.fn();
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <CompactEditorToolbar
          onOpenFormatting={onOpenFormatting}
          onInsertScripture={onInsertScripture}
        />,
      );
    });

    const formatting = tree!.root.findByProps({ accessibilityLabel: 'Formatting' });
    const scripture = tree!.root.findByProps({ accessibilityLabel: 'Insert Scripture' });
    expect(formatting.props.accessibilityRole).toBe('button');
    expect(scripture.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(formatting.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(StyleSheet.flatten(scripture.props.style).minHeight).toBeGreaterThanOrEqual(44);

    act(() => formatting.props.onPress());
    act(() => scripture.props.onPress());
    expect(onOpenFormatting).toHaveBeenCalledTimes(1);
    expect(onInsertScripture).toHaveBeenCalledTimes(1);
    act(() => tree!.unmount());
  });

  it('stacks actions and lets labels wrap at large text sizes', () => {
    const dimensions = jest.spyOn(jest.requireActual('react-native'), 'useWindowDimensions');
    dimensions.mockReturnValue({ width: 320, height: 640, scale: 2, fontScale: 2 });
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <CompactEditorToolbar
          onOpenFormatting={jest.fn()}
          onInsertScripture={jest.fn()}
        />,
      );
    });

    const scripture = tree!.root.findByProps({ accessibilityLabel: 'Insert Scripture' });
    expect(StyleSheet.flatten(scripture.props.style).flexDirection).toBe('column');
    const label = tree!.root.findAllByType(Text).find((node) => node.props.children === 'Insert Scripture');
    expect(StyleSheet.flatten(label!.props.style).flexShrink).toBe(1);
    act(() => tree!.unmount());
    dimensions.mockRestore();
  });
});
