import { useCallback } from 'react';
import { Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { BookOpenIcon } from '@/components/icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { referenceToRoute } from '@/lib/bible-constants';

import { ScriptureRef } from '@/lib/store';

export type { ScriptureRef };

interface ScriptureRefPillProps {
  reference: ScriptureRef;
  /** Optional override style merged onto the pill container */
  style?: ViewStyle;
  /** Use larger variant (for editor/detail views) vs compact (for card list) */
  size?: 'compact' | 'regular';
}

/**
 * Tappable scripture reference chip/pill.
 * Navigates to the Bible reader on press.
 * Compact size (default) used inside NoteCard list items.
 * Regular size used inside the note editor and detail views.
 */
export function ScriptureRefPill({ reference, style, size = 'compact' }: ScriptureRefPillProps) {
  const { colors } = useTheme();
  const router = useRouter();

  const isRegular = size === 'regular';
  const iconSize = isRegular ? 13 : 11;
  const fontSize = isRegular ? 13 : 11;
  const paddingH = isRegular ? 10 : 8;
  const paddingV = isRegular ? 4 : 3;

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Try to parse the reference string for navigation
    const parsed = referenceToRoute(reference.reference);
    if (parsed) {
      router.push({
        pathname: '/(tabs)/(bible)/reader',
        params: {
          bookId: String(parsed.bookId),
          chapter: String(parsed.chapter),
          ...(parsed.verse != null ? { verse: String(parsed.verse) } : {}),
        },
      });
    }
  }, [reference, router]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityRole="link"
      accessibilityLabel={`Open ${reference.reference} in Bible reader`}
      style={[
        styles.container,
        {
          backgroundColor: alpha(colors.accent, 0.05), // 5% accent tint
          paddingHorizontal: paddingH,
          paddingVertical: paddingV,
        },
        style,
      ]}
    >
      <BookOpenIcon
        size={iconSize}
        color={colors.accent}
        weight="light"
        style={{ marginRight: 4 }}
      />
      <Text
        style={[
          styles.text,
          {
            color: colors.accent,
            fontSize,
          },
        ]}
        numberOfLines={1}
      >
        {reference.reference}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 6,
    gap: 4,
  },
  text: {
    fontFamily: FontFamily.uiMedium,
    letterSpacing: 0.3,
  },
});
