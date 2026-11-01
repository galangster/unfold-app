import React from 'react';
import { PixelRatio, Platform, StyleSheet, Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { BibleVerseText } from '../BibleVerseText';

const layout = (height: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width: 376, height } } });

describe('BibleVerseText native paragraph sizing', () => {
  let tree: renderer.ReactTestRenderer;
  const originalOS = Platform.OS;
  beforeEach(() => {
    Platform.OS = 'ios';
    jest.spyOn(PixelRatio, 'get').mockReturnValue(3);
  });
  afterEach(() => {
    act(() => tree?.unmount());
    Platform.OS = originalOS;
    jest.restoreAllMocks();
  });

  it('corrects the observed native height without growing on later layout events', () => {
    const onLayout = jest.fn();
    const onTextLayout = jest.fn();
    act(() => { tree = renderer.create(<BibleVerseText layoutKey="portrait:20:1" style={{ fontSize: 20 }} onLayout={onLayout} onTextLayout={onTextLayout}>A long verse</BibleVerseText>); });
    act(() => tree.root.findByType(Text).props.onLayout(layout(143.9998779296875)));
    const first = StyleSheet.flatten(tree.root.findByType(Text).props.style);
    expect(first.minHeight).toBeCloseTo(144.33333333333334);
    expect(first.fontSize).toBe(20);
    act(() => tree.root.findByType(Text).props.onLayout(layout(144.333251953125)));
    expect(StyleSheet.flatten(tree.root.findByType(Text).props.style).minHeight).toBe(first.minHeight);
    expect(onLayout).toHaveBeenCalledTimes(2);
    expect(tree.root.findByType(Text).props.onTextLayout).toBe(onTextLayout);
  });

  it.each(['landscape:20:1', 'portrait:32:1', 'portrait:20:3.571', 'portrait:lora:1', 'other-chapter:20:1', 'portrait:20:1:note'])('drops the old height when the paragraph key changes to %s', (nextKey) => {
    act(() => { tree = renderer.create(<BibleVerseText layoutKey="portrait:20:1">A long verse</BibleVerseText>); });
    act(() => tree.root.findByType(Text).props.onLayout(layout(143.9998779296875)));
    const host = tree.root.findByType(Text);
    act(() => tree.update(<BibleVerseText layoutKey={nextKey}>A shorter verse</BibleVerseText>));
    expect(tree.root.findByType(Text)).not.toBe(host);
    expect(StyleSheet.flatten(tree.root.findByType(Text).props.style)?.minHeight).toBeUndefined();
    act(() => tree.root.findByType(Text).props.onLayout(layout(35.99999237060547)));
    expect(StyleSheet.flatten(tree.root.findByType(Text).props.style).minHeight).toBeCloseTo(36.333333333333336);
  });

  it('uses physical pixels on a 2x phone and ignores a zero-height first report', () => {
    jest.spyOn(PixelRatio, 'get').mockReturnValue(2);
    act(() => { tree = renderer.create(<BibleVerseText layoutKey="small">Verse</BibleVerseText>); });
    act(() => tree.root.findByType(Text).props.onLayout(layout(0)));
    expect(StyleSheet.flatten(tree.root.findByType(Text).props.style)?.minHeight).toBeUndefined();
    act(() => tree.root.findByType(Text).props.onLayout(layout(143.9998779296875)));
    expect(StyleSheet.flatten(tree.root.findByType(Text).props.style).minHeight).toBe(144.5);
  });

  it('leaves Android native sizing unchanged', () => {
    Platform.OS = 'android';
    act(() => { tree = renderer.create(<BibleVerseText layoutKey="android">Verse</BibleVerseText>); });
    act(() => tree.root.findByType(Text).props.onLayout(layout(143.9998779296875)));
    expect(StyleSheet.flatten(tree.root.findByType(Text).props.style)?.minHeight).toBeUndefined();
  });
});
