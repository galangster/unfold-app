import { memo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { BookmarkSimpleIcon, PencilLineIcon } from '@/components/icons';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { alpha } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { HIGHLIGHT_COLOR_LABELS, type BibleHighlightColor, type HighlightColor } from '@/lib/store';
import type { SavedItem } from '@/lib/saved-highlights';
import type { SavedBookmarkItem } from '@/lib/saved-items';
import { stripOuterQuotes } from '@/lib/cn';

type ThemeColors = ReturnType<typeof useTheme>['colors'];

export type HighlightKey = HighlightColor | BibleHighlightColor;

export const HIGHLIGHT_COLORS: Record<HighlightKey, { label: string; light: string; dark: string }> = {
  yellow: { label: HIGHLIGHT_COLOR_LABELS.yellow, light: '#FFDC64', dark: '#C8A55C' },
  green: { label: HIGHLIGHT_COLOR_LABELS.green, light: '#64C864', dark: '#6DAF7B' },
  blue: { label: HIGHLIGHT_COLOR_LABELS.blue, light: '#6496FF', dark: '#5B9BD5' },
  purple: { label: HIGHLIGHT_COLOR_LABELS.purple, light: '#B464C8', dark: '#9B8EC4' },
  red: { label: HIGHLIGHT_COLOR_LABELS.red, light: '#FF6464', dark: '#D4828F' },
};

/** Card radius shared with the swipe-action tray so the tray clips to the card. */
export const SAVED_CARD_RADIUS = Radius.lg;
export const SAVED_CARD_GAP = Spacing['3'];

export function savedItemAccessibilityLabel(item: SavedItem): string {
  return `${item.source === 'bible' ? 'Bible' : 'Devotional'} ${item.kind}, ${item.contextLabel}: ${item.note ?? item.text}`;
}

export function bookmarkAccessibilityLabel(item: SavedBookmarkItem): string {
  return `Bookmark, ${item.label}, ${item.reference}: ${item.quote}`;
}

export const SavedRow = memo(function SavedRow({
  item,
  colors,
  isDark,
  onPress,
  /** Set when a parent wrapper already exposes the row to assistive tech. */
  accessibilityElementsHidden,
}: {
  item: SavedItem;
  colors: ThemeColors;
  isDark: boolean;
  onPress: (item: SavedItem) => void;
  accessibilityElementsHidden?: boolean;
}) {
  const colorKey: HighlightKey = item.color ?? 'yellow';
  const accent = HIGHLIGHT_COLORS[colorKey][isDark ? 'dark' : 'light'];

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress(item)}
      style={{
        backgroundColor: colors.inputBackground,
        borderRadius: SAVED_CARD_RADIUS,
        padding: 20,
        marginBottom: SAVED_CARD_GAP,
      }}
      accessibilityRole="button"
      // contextLabel carries the location — "Genesis 1:1 (BSB)" for a verse,
      // the devotional title otherwise — so a screen reader can tell which
      // verse or devotional the text came from.
      accessibilityLabel={savedItemAccessibilityLabel(item)}
      accessibilityElementsHidden={accessibilityElementsHidden}
      importantForAccessibility={accessibilityElementsHidden ? 'no-hide-descendants' : undefined}
    >
      {item.kind === 'note' ? (
        <>
          <Text
            style={{
              fontFamily: FontFamily.body,
              fontSize: FontSize.base,
              color: colors.text,
              lineHeight: 24,
              marginBottom: Spacing['3'],
            }}
            numberOfLines={4}
          >
            {item.note}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing['2'], marginBottom: Spacing['2'] }}>
            <PencilLineIcon size={13} color={colors.accent} weight="light" />
            <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: FontSize.xs, color: colors.accent }}>
              Note · {item.contextLabel}
            </Text>
            {item.color !== null && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: accent }} />
                <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textSubtle }}>
                  Highlighted verse
                </Text>
              </View>
            )}
          </View>
          <Text
            style={{ fontFamily: FontFamily.body, fontSize: 14, color: colors.textMuted, lineHeight: 21 }}
            numberOfLines={2}
          >
            {item.text}
          </Text>
        </>
      ) : (
        <>
          {/* Quoted text with inline highlight tint */}
          <View
            style={{
              backgroundColor: alpha(accent, 0.08),
              borderRadius: 6,
              paddingHorizontal: 10,
              paddingVertical: 8,
              marginBottom: Spacing['3'],
            }}
          >
            <Text style={{ fontFamily: FontFamily.bodyItalic, fontSize: FontSize.base, color: colors.text, lineHeight: 24 }}>
              "{stripOuterQuotes(item.text)}"
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing['2'] }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }} />
            <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted }}>
              {item.contextLabel}
            </Text>
          </View>
        </>
      )}
    </TouchableOpacity>
  );
});

export const BookmarkRow = memo(function BookmarkRow({
  item,
  colors,
  onPress,
  accessibilityElementsHidden,
}: {
  item: SavedBookmarkItem;
  colors: ThemeColors;
  onPress: (item: SavedBookmarkItem) => void;
  accessibilityElementsHidden?: boolean;
}) {
  const { label, reference, quote } = item;
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress(item)}
      style={{
        backgroundColor: colors.inputBackground,
        borderRadius: SAVED_CARD_RADIUS,
        padding: Spacing['5'],
        marginBottom: SAVED_CARD_GAP,
      }}
      accessibilityRole="button"
      accessibilityLabel={bookmarkAccessibilityLabel(item)}
      accessibilityElementsHidden={accessibilityElementsHidden}
      importantForAccessibility={accessibilityElementsHidden ? 'no-hide-descendants' : undefined}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing['2'], gap: Spacing['2'] }}>
        <BookmarkSimpleIcon size={14} color={colors.accent} weight="fill" />
        <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: FontSize.xs, color: colors.accent, letterSpacing: 0.5 }}>
          {label}
        </Text>
        <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: FontSize.xs, color: colors.textSubtle, letterSpacing: 0.5 }}>
          · {reference}
        </Text>
      </View>
      <Text
        style={{ fontFamily: FontFamily.bodyItalic, fontSize: 15, color: colors.text, lineHeight: 22 }}
        numberOfLines={3}
      >
        "{quote}"
      </Text>
    </TouchableOpacity>
  );
});
