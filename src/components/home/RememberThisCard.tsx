import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { HighlighterIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { Radius } from '@/constants/radius';
import { useUnfoldStore, type HighlightColor } from '@/lib/store';

const HIGHLIGHT_COLORS: Record<HighlightColor, { light: string; dark: string }> = {
  yellow: { light: '#FFDC64', dark: '#C8A55C' },
  green: { light: '#64C864', dark: '#6DAF7B' },
  blue: { light: '#6496FF', dark: '#5B9BD5' },
  purple: { light: '#B464C8', dark: '#9B8EC4' },
  red: { light: '#FF6464', dark: '#D4828F' },
};

export function RememberThisCard() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const getRandomHighlight = useUnfoldStore((s) => s.getRandomHighlight);
  const setCurrentDevotional = useUnfoldStore((s) => s.setCurrentDevotional);
  const devotionals = useUnfoldStore((s) => s.devotionals);

  const highlight = getRandomHighlight();

  const opacity = useSharedValue(0);

  useEffect(() => {
    if (highlight) {
      opacity.value = withTiming(1, { duration: 400 });
    }
  }, [highlight, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (!highlight) return null;

  const highlightColorHex = HIGHLIGHT_COLORS[highlight.color || 'yellow'][isDark ? 'dark' : 'light'];

  const devotional = devotionals.find((d) => d.id === highlight.devotionalId);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentDevotional(highlight.devotionalId);
    router.push({
      pathname: '/(tabs)/(today)/reading',
      params: {
        devotionalId: highlight.devotionalId,
        dayNumber: highlight.dayNumber.toString(),
        highlightId: highlight.id,
      },
    });
  };

  return (
    <Animated.View style={[styles.wrapper, animatedStyle]}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`Remember this highlight from Day ${highlight.dayNumber}`}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.inputBackground,
              borderColor: alpha(colors.accent, 0.25),
            },
          ]}
        >
          {/* Label */}
          <View style={styles.labelRow}>
            <HighlighterIcon size={12} color={colors.accent} weight="light" />
            <Text
              style={[
                styles.label,
                { color: colors.accent },
              ]}
            >
              REMEMBER THIS?
            </Text>
          </View>

          {/* Highlighted text with colored left border */}
          <View
            style={[
              styles.quoteBlock,
              { borderLeftColor: highlightColorHex },
            ]}
          >
            <Text
              style={[
                styles.quoteText,
                { color: colors.text },
              ]}
              numberOfLines={3}
            >
              {highlight.highlightedText}
            </Text>
          </View>

          {/* Source */}
          <Text
            style={[
              styles.source,
              { color: colors.textMuted },
            ]}
            numberOfLines={1}
          >
            From Day {highlight.dayNumber} · {devotional?.title || highlight.devotionalTitle || 'Untitled Series'}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 24,
    marginTop: 16,
  },
  card: {
    borderRadius: Radius.card,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  label: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  quoteBlock: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    marginBottom: 10,
  },
  quoteText: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: 16,
    lineHeight: 24,
  },
  source: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
  },
});
