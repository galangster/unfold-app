import React from 'react';
import { StyleSheet, Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { FontFamily } from '@/constants/fonts';
import { TomorrowPreview } from '../TomorrowPreview';

const colors = {
  text: '#111111',
  textMuted: '#777777',
  border: '#DDDDDD',
};

describe('TomorrowPreview', () => {
  it('uses a divider, quiet label, upright serif title, and left-aligned prose', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <TomorrowPreview
          title="A quieter morning"
          teaser="The next day stays with the same thread."
          colors={colors}
        />,
      );
    });

    expect(tree!.root.findByProps({ testID: 'tomorrow-divider' })).toBeTruthy();
    expect(tree!.root.findByProps({ testID: 'tomorrow-label' }).props.children).toBe('Tomorrow');
    expect(tree!.root.findByProps({ testID: 'tomorrow-title' }).props.children).toBe('A quieter morning');
    expect(tree!.root.findByProps({ testID: 'tomorrow-teaser' }).props.children)
      .toBe('The next day stays with the same thread.');

    const titleStyle = StyleSheet.flatten(tree!.root.findByProps({ testID: 'tomorrow-title' }).props.style);
    const teaserStyle = StyleSheet.flatten(tree!.root.findByProps({ testID: 'tomorrow-teaser' }).props.style);
    expect(titleStyle.fontFamily).toBe(FontFamily.display);
    expect(titleStyle.textAlign).toBe('left');
    expect(teaserStyle.fontFamily).toBe(FontFamily.body);
    expect(teaserStyle.fontStyle).not.toBe('italic');
    expect(teaserStyle.textAlign).toBe('left');

    const labels = tree!.root.findAllByType(Text).map((node) => node.props.children);
    expect(labels).not.toContainEqual(expect.stringMatching(/sunrise/i));
  });
});
