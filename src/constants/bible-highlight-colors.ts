/**
 * Bible verse highlight palette. Shared by the Bible reader and the
 * devotional scripture block so a verse highlighted in one surface renders
 * identically in the other.
 */
import type { BibleHighlightColor } from '@/lib/store';

export const HIGHLIGHT_BG: Record<BibleHighlightColor, { light: string; dark: string }> = {
  yellow: { light: 'rgba(255, 245, 112, 0.58)', dark: 'transparent' },
  green: { light: 'rgba(190, 244, 128, 0.5)', dark: 'transparent' },
  blue: { light: 'rgba(170, 220, 255, 0.46)', dark: 'transparent' },
  purple: { light: 'rgba(214, 188, 255, 0.44)', dark: 'transparent' },
  red: { light: 'rgba(255, 190, 190, 0.46)', dark: 'transparent' },
};

export const HIGHLIGHT_TEXT_DARK: Record<BibleHighlightColor, string> = {
  yellow: '#FFE86A',
  green: '#5CFF63',
  blue: '#77B7FF',
  purple: '#D7A8FF',
  red: '#FF7A7A',
};

export const HIGHLIGHT_COLORS: { key: BibleHighlightColor; color: string }[] = [
  { key: 'yellow', color: '#F0C850' },
  { key: 'green', color: '#6BBF7B' },
  { key: 'blue', color: '#6BA3D6' },
  { key: 'purple', color: '#A874C0' },
  { key: 'red', color: '#E87070' },
];

/** Text colour while a verse is selected (inverted against the selection mark). */
export const SELECTED_VERSE_TEXT = { light: '#FFFDF8', dark: '#221B12' } as const;
