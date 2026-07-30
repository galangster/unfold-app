/**
 * Reading-font availability registry (PERF: cold-start font split).
 *
 * The app ships six reading families (~9.7 MB of .ttf). Loading all of them in
 * the splash-blocking `useFonts` call in `app/_layout.tsx` delayed first paint
 * for every user, including the ~all of them who only ever read in one family.
 *
 * The eager set is now UI/display faces plus the DEFAULT reading family; the
 * rest are fetched with `Font.loadAsync` on demand (see
 * `reading-fonts-loader.ts`). Because `Font.loadAsync` resolving does not
 * re-render anything on its own, this module doubles as a tiny external store:
 * `useReadingFont()` subscribes to it and falls back to the default family
 * until the requested one is actually registered as loaded, so a reader never
 * paints in the system fallback face and then silently stays there.
 *
 * Deliberately free of `require('…​.ttf')` calls so it stays importable from
 * Jest (the asset requires live in `reading-fonts-loader.ts`).
 */
import { useSyncExternalStore } from 'react';
import type { ReadingFontId } from '@/lib/store';

/** Family used whenever the selected one is not (yet) loaded. */
export const DEFAULT_READING_FONT_ID: ReadingFontId = 'source-serif';

/**
 * Families whose faces are in the splash-blocking `useFonts` call.
 * `inter` is here because Inter is also the app's UI face — it is already
 * eager for reasons unrelated to reading-font choice.
 */
export const EAGER_READING_FONT_IDS = ['source-serif', 'inter'] as const;

/** Families loaded on demand. Must be disjoint from — and cover the rest of — READING_FONTS. */
export const LAZY_READING_FONT_IDS = ['garamond', 'lora', 'crimson', 'merriweather'] as const;

export type LazyReadingFontId = (typeof LAZY_READING_FONT_IDS)[number];

const loaded = new Set<string>(EAGER_READING_FONT_IDS);
const listeners = new Set<() => void>();
let version = 0;

/** Called by the loader once `Font.loadAsync` has resolved for a family. */
export function markReadingFontLoaded(id: ReadingFontId): void {
  if (loaded.has(id)) return;
  loaded.add(id);
  version += 1;
  for (const listener of listeners) listener();
}

export function isReadingFontLoaded(id: ReadingFontId): boolean {
  return loaded.has(id);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getVersion(): number {
  return version;
}

/**
 * Re-render signal for consumers that resolve a reading-font family name.
 * The returned number changes only when a new family finishes loading.
 */
export function useReadingFontAvailability(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

/** Test-only: reset registered families back to the eager set. */
export function __resetReadingFontAvailabilityForTests(): void {
  loaded.clear();
  for (const id of EAGER_READING_FONT_IDS) loaded.add(id);
  version += 1;
  for (const listener of listeners) listener();
}
