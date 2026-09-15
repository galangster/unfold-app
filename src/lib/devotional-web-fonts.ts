import { useEffect, useState } from 'react';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { logger } from '@/lib/logger';
import {
  DEVOTIONAL_WEB_FONT_FAMILIES,
  type DevotionalWebFontFamilyAssets,
} from '@/lib/devotional-web-font-manifest';

const WEB_FONT_ASSETS: Record<string, DevotionalWebFontFamilyAssets> = {
  SourceSerifPro_400Regular: DEVOTIONAL_WEB_FONT_FAMILIES.sourceSerif,
  'SourceSerifPro-Regular': DEVOTIONAL_WEB_FONT_FAMILIES.sourceSerif,
  EBGaramond_400Regular: DEVOTIONAL_WEB_FONT_FAMILIES.garamond,
  Lora_400Regular: DEVOTIONAL_WEB_FONT_FAMILIES.lora,
  Inter_400Regular: DEVOTIONAL_WEB_FONT_FAMILIES.inter,
  'Inter-Regular': DEVOTIONAL_WEB_FONT_FAMILIES.inter,
  CrimsonText_400Regular: DEVOTIONAL_WEB_FONT_FAMILIES.crimson,
  Merriweather_400Regular: DEVOTIONAL_WEB_FONT_FAMILIES.merriweather,
};

export interface DevotionalWebFont {
  family: string;
  css: string;
}

const cache = new Map<string, Promise<DevotionalWebFont>>();

async function fontSource(moduleId: number): Promise<string> {
  const [asset] = await Asset.loadAsync(moduleId);
  const uri = asset.localUri ?? asset.uri;
  if (Platform.OS === 'web') return `url('${uri}') format('woff2')`;
  return `url(data:font/woff2;base64,${await new File(uri).base64()}) format('woff2')`;
}

export function loadDevotionalWebFont(nativeFont: string): Promise<DevotionalWebFont> {
  const existing = cache.get(nativeFont);
  if (existing) return existing;

  const assets = WEB_FONT_ASSETS[nativeFont];
  if (!assets) return Promise.resolve({ family: 'Georgia', css: '' });

  const sources = new Map<number, Promise<string>>();
  const sourceFor = (moduleId: number) => {
    const existingSource = sources.get(moduleId);
    if (existingSource) return existingSource;
    const source = fontSource(moduleId);
    sources.set(moduleId, source);
    return source;
  };

  const task = Promise.all(assets.faces.map(async (face) => ({
    face,
    source: await sourceFor(face.moduleId),
  }))).then((loadedFaces) => ({
    family: assets.family,
    css: loadedFaces.map(({ face, source }) =>
      `@font-face { font-family: '${assets.family}'; src: ${source}; font-weight: ${face.weight}; font-style: ${face.style}; font-display: block; unicode-range: ${face.unicodeRange}; }`
    ).join('\n'),
  })).catch((error: unknown) => {
    cache.delete(nativeFont);
    throw error;
  });
  cache.set(nativeFont, task);
  return task;
}

export function __resetDevotionalWebFontCacheForTests(): void {
  cache.clear();
}

interface WebFontState {
  nativeFont: string;
  font: DevotionalWebFont | null;
}

export function useDevotionalWebFont(nativeFont: string): DevotionalWebFont | null {
  const [state, setState] = useState<WebFontState>({ nativeFont, font: null });

  useEffect(() => {
    let active = true;
    setState({ nativeFont, font: null });
    loadDevotionalWebFont(nativeFont)
      .then((font) => {
        if (active) setState({ nativeFont, font });
      })
      .catch((error: unknown) => {
        logger.warn(`[fonts] failed to prepare devotional WebView font "${nativeFont}"`, error);
        if (active) setState({ nativeFont, font: { family: 'Georgia', css: '' } });
      });
    return () => {
      active = false;
    };
  }, [nativeFont]);

  return state.nativeFont === nativeFont ? state.font : null;
}
