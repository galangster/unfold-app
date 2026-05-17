import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ArrowRightIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useUnfoldStore, type HighlightColor } from '@/lib/store';
import { DismissCircleButton } from '@/components/home/DismissCircleButton';
import { animateCardDismiss } from '@/lib/card-dismiss-animation';

const HIGHLIGHT_COLORS: Record<HighlightColor, { light: string; dark: string }> = {
  yellow: { light: '#FFDC64', dark: '#C8A55C' },
  green: { light: '#64C864', dark: '#6DAF7B' },
  blue: { light: '#6496FF', dark: '#5B9BD5' },
  purple: { light: '#B464C8', dark: '#9B8EC4' },
  red: { light: '#FF6464', dark: '#D4828F' },
};

const DISPLAY_TEXT_MAX_SCALE = 1.18;
const BODY_TEXT_MAX_SCALE = 1.28;
const LABEL_TEXT_MAX_SCALE = 1.14;

export function RememberThisCard() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const getRandomHighlight = useUnfoldStore((s) => s.getRandomHighlight);
  const setCurrentDevotional = useUnfoldStore((s) => s.setCurrentDevotional);
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const dismissedRememberThisCardDate = useUnfoldStore((s) => s.dismissedRememberThisCardDate);
  const setDismissedRememberThisCardDate = useUnfoldStore((s) => s.setDismissedRememberThisCardDate);
  const todayDate = new Date().toLocaleDateString('en-CA');

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

  if (!highlight || dismissedRememberThisCardDate === todayDate) return null;

  const highlightColorHex = HIGHLIGHT_COLORS[highlight.color || 'yellow'][isDark ? 'dark' : 'light'];
  const devotional = devotionals.find((d) => d.id === highlight.devotionalId);
  const sourceTitle = devotional?.title || highlight.devotionalTitle || 'Untitled Series';
  const useCompactFooter = width < 400 || fontScale >= 1.18;

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

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateCardDismiss();
    setDismissedRememberThisCardDate(todayDate);
  };

  return (
    <Animated.View style={[styles.wrapper, animatedStyle]}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: Platform.OS === 'ios'
              ? alpha(colors.backgroundElevated, isDark ? 0.82 : 0.9)
              : alpha(colors.backgroundElevated, 0.94),
            borderColor: alpha(colors.accent, isDark ? 0.34 : 0.28),
            shadowColor: colors.accent,
          },
        ]}
      >
        {Platform.OS === 'ios' && (
          <BlurView
            intensity={isDark ? 82 : 64}
            tint={isDark ? 'dark' : 'light'}
            style={[StyleSheet.absoluteFill, styles.cardBlur]}
          />
        )}
        <TouchableOpacity
          activeOpacity={0.72}
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={`Saved highlight from Day ${highlight.dayNumber}: ${highlight.highlightedText}`}
          accessibilityHint="Opens the reading at this highlighted passage"
        >
          <View style={styles.headerRow}>
            <View style={styles.headerTextGroup}>
              <Text style={[styles.kicker, { color: highlightColorHex }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>Saved echo</Text>
              <Text style={[styles.title, { color: colors.text }]} maxFontSizeMultiplier={DISPLAY_TEXT_MAX_SCALE}>A line worth carrying</Text>
            </View>
          </View>

          <View
            style={[
              styles.quoteBlock,
              {
                backgroundColor: alpha(highlightColorHex, isDark ? 0.12 : 0.14),
                borderColor: alpha(highlightColorHex, isDark ? 0.28 : 0.26),
              },
            ]}
          >
            <Text style={[styles.quoteMark, { color: highlightColorHex }]}>“</Text>
            <Text
              style={[styles.quoteText, { color: colors.text }]}
              numberOfLines={3}
              maxFontSizeMultiplier={BODY_TEXT_MAX_SCALE}
            >
              {highlight.highlightedText}
            </Text>
          </View>

          <View style={[styles.footerRow, useCompactFooter && styles.footerRowCompact]}>
            <Text
              style={[styles.source, useCompactFooter && styles.sourceCompact, { color: colors.textMuted }]}
              numberOfLines={useCompactFooter ? 2 : 1}
              maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}
            >
              Day {highlight.dayNumber} · {sourceTitle}
            </Text>
            <View style={styles.ctaRow}>
              <Text style={[styles.ctaText, { color: colors.accent }]} maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}>Open highlight</Text>
              <ArrowRightIcon size={12} color={colors.accent} weight="bold" />
            </View>
          </View>
        </TouchableOpacity>
        <DismissCircleButton
          colors={colors}
          onPress={handleDismiss}
          accessibilityLabel="Dismiss saved echo"
          accessibilityHint="Hides this saved echo card for today without deleting the highlight"
          style={styles.dismissButton}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['4'],
    zIndex: 3,
    elevation: 3,
  },
  card: {
    position: 'relative',
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    padding: Spacing['5'],
    overflow: 'visible',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 6,
  },
  cardBlur: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  dismissButton: {
    position: 'absolute',
    top: -9,
    right: -9,
    zIndex: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    marginBottom: Spacing['3'],
    zIndex: 2,
  },
  headerTextGroup: {
    flex: 1,
    paddingRight: Spacing['10'],
  },
  kicker: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.35,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    lineHeight: 27,
    letterSpacing: -0.2,
    marginTop: Spacing['0.5'],
  },
  quoteBlock: {
    borderRadius: Radius.lg,
    borderWidth: 1.25,
    paddingVertical: Spacing['3'],
    paddingHorizontal: Spacing['3'],
    marginBottom: Spacing['3'],
    zIndex: 2,
  },
  quoteMark: {
    fontFamily: FontFamily.display,
    fontSize: 28,
    lineHeight: 26,
    marginBottom: -4,
  },
  quoteText: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: FontSize.base,
    lineHeight: 24,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    zIndex: 2,
  },
  footerRowCompact: {
    alignItems: 'flex-start',
    flexDirection: 'column',
    gap: Spacing['2'],
  },
  source: {
    flex: 1,
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
    lineHeight: 17,
  },
  sourceCompact: {
    flex: 0,
    width: '100%',
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['1'],
  },
  ctaText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.xs,
    lineHeight: 17,
  },
});
