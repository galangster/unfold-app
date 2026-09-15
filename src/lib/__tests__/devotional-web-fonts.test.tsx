import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

import {
  __resetDevotionalWebFontCacheForTests,
  loadDevotionalWebFont,
  useDevotionalWebFont,
} from '../devotional-web-fonts';
import { DEVOTIONAL_WEB_FONT_FAMILIES } from '../devotional-web-font-manifest';

const mockLoadAsync = jest.fn();
const mockBase64 = jest.fn((uri: string) => Promise.resolve(`bytes:${uri}`));

jest.mock('expo-asset', () => ({
  Asset: { loadAsync: (moduleId: number) => mockLoadAsync(moduleId) },
}));

jest.mock('expo-file-system', () => ({
  File: class MockFile {
    constructor(private mockUri: string) {}
    base64() { return mockBase64(this.mockUri); }
  },
}));

function resolvedAsset(moduleId: number) {
  return Promise.resolve([{ localUri: `file:///font-${moduleId}.woff2`, uri: '' }]);
}

function Probe({ nativeFont, onRender }: { nativeFont: string; onRender?: (family: string) => void }) {
  const font = useDevotionalWebFont(nativeFont);
  const family = font?.family ?? 'pending';
  onRender?.(family);
  return <Text testID="font">{family}</Text>;
}

describe('devotional WebView local fonts', () => {
  beforeEach(() => {
    __resetDevotionalWebFontCacheForTests();
    mockLoadAsync.mockReset().mockImplementation(resolvedAsset);
    mockBase64.mockClear();
  });

  it('selects the exact web family for runtime and iOS PostScript aliases', async () => {
    await expect(loadDevotionalWebFont('SourceSerifPro_400Regular')).resolves.toMatchObject({ family: 'Source Serif 4' });
    await expect(loadDevotionalWebFont('SourceSerifPro-Regular')).resolves.toMatchObject({ family: 'Source Serif 4' });
    await expect(loadDevotionalWebFont('Inter-Regular')).resolves.toMatchObject({ family: 'Inter' });
  });

  it('loads only the selected family and de-duplicates its shared variable Roman face', async () => {
    const font = await loadDevotionalWebFont('Lora_400Regular');
    expect(font.css).toContain("font-family: 'Lora'");
    expect(font.css).toContain('font-weight: 400 600');
    expect(font.css).toContain("format('woff2')");
    const selectedModuleCount = new Set(DEVOTIONAL_WEB_FONT_FAMILIES.lora.faces.map((face) => face.moduleId)).size;
    expect(mockLoadAsync).toHaveBeenCalledTimes(selectedModuleCount);
  });

  it('keeps the complete Google Fonts Unicode coverage on each generated face', async () => {
    const font = await loadDevotionalWebFont('SourceSerifPro_400Regular');
    expect(font.css).toContain('unicode-range: U+0000-00FF');
    expect(font.css).toContain('unicode-range: U+0100-02BA');
    expect(font.css).toContain('unicode-range: U+0370-0377');
    expect(font.css).toContain('unicode-range: U+0460-052F');
    expect(font.css.match(/@font-face/g)).toHaveLength(DEVOTIONAL_WEB_FONT_FAMILIES.sourceSerif.faces.length);
  });

  it('reuses a completed family load', async () => {
    const first = loadDevotionalWebFont('CrimsonText_400Regular');
    const second = loadDevotionalWebFont('CrimsonText_400Regular');
    expect(second).toBe(first);
    await first;
    const loadCount = new Set(DEVOTIONAL_WEB_FONT_FAMILIES.crimson.faces.map((face) => face.moduleId)).size;
    expect(mockLoadAsync).toHaveBeenCalledTimes(loadCount);
    await loadDevotionalWebFont('CrimsonText_400Regular');
    expect(mockLoadAsync).toHaveBeenCalledTimes(loadCount);
  });

  it('removes rejected loads from the cache so a later attempt can recover', async () => {
    mockLoadAsync.mockRejectedValueOnce(new Error('temporary read failure'));
    await expect(loadDevotionalWebFont('Merriweather_400Regular')).rejects.toThrow('temporary read failure');
    mockLoadAsync.mockImplementation(resolvedAsset);
    await expect(loadDevotionalWebFont('Merriweather_400Regular')).resolves.toMatchObject({ family: 'Merriweather' });
    expect(mockLoadAsync.mock.calls.length).toBeGreaterThan(2);
  });

  it('ignores a stale async result after the selected family changes', async () => {
    const pending: { resolve: (value: unknown) => void }[] = [];
    mockLoadAsync.mockImplementation((moduleId: number) => new Promise((resolve) => {
      pending.push({ resolve: () => resolve([{ localUri: `file:///font-${moduleId}.woff2`, uri: '' }]) });
    }));

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe nativeFont="SourceSerifPro_400Regular" />);
    });
    const sourceLoadCount = pending.length;
    await act(async () => {
      tree!.update(<Probe nativeFont="Lora_400Regular" />);
    });

    await act(async () => {
      pending.slice(0, sourceLoadCount).forEach(({ resolve }) => resolve(undefined));
      await Promise.resolve();
    });
    expect(tree!.root.findByProps({ testID: 'font' }).props.children).toBe('pending');

    await act(async () => {
      pending.slice(sourceLoadCount).forEach(({ resolve }) => resolve(undefined));
      await Promise.resolve();
    });
    expect(tree!.root.findByProps({ testID: 'font' }).props.children).toBe('Lora');
  });

  it('returns pending on the first render after a loaded family changes', async () => {
    const observations: string[] = [];
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe nativeFont="SourceSerifPro_400Regular" onRender={(family) => observations.push(family)} />);
    });
    expect(observations.at(-1)).toBe('Source Serif 4');

    mockLoadAsync.mockImplementation(() => new Promise(() => {}));
    observations.length = 0;
    act(() => {
      tree!.update(<Probe nativeFont="Lora_400Regular" onRender={(family) => observations.push(family)} />);
    });
    expect(observations[0]).toBe('pending');
    expect(observations).not.toContain('Source Serif 4');
  });
});
