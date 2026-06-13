import { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CaretLeftIcon, HighlighterIcon, BookOpenIcon, QuotesIcon } from 'phosphor-react-native';
import { Duration, Ease } from '@/constants/animations';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, Highlight, HighlightColor } from '@/lib/store';
import { stripOuterQuotes } from '@/lib/cn';

const HIGHLIGHT_COLORS: Record<HighlightColor, { label: string; light: string; dark: string }> = {
  yellow: { label: 'General', light: '#FFDC64', dark: '#C8A55C' },
  green: { label: 'Growth', light: '#64C864', dark: '#6DAF7B' },
  blue: { label: 'Prayer', light: '#6496FF', dark: '#5B9BD5' },
  purple: { label: 'Questions', light: '#B464C8', dark: '#9B8EC4' },
  red: { label: 'Important', light: '#FF6464', dark: '#D4828F' },
};

export default function HighlightsScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const highlights = useUnfoldStore((s) => s.highlights);
  const devotionals = useUnfoldStore((s) => s.devotionals);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleHighlightPress = (highlight: Highlight) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Navigate to the specific day with the highlight
    router.push({
      pathname: '/(tabs)/(today)/reading',
      params: { 
        devotionalId: highlight.devotionalId,
        dayNumber: highlight.dayNumber.toString(),
        highlightId: highlight.id,
      },
    });
  };

  // Group highlights by devotional
  const highlightsByDevotional = highlights.reduce((acc, highlight) => {
    const devotional = devotionals.find(d => d.id === highlight.devotionalId);
    const key = highlight.devotionalId;
    if (!acc[key]) {
      acc[key] = {
        devotional,
        highlights: [],
      };
    }
    acc[key].highlights.push(highlight);
    return acc;
  }, {} as Record<string, { devotional: typeof devotionals[0] | undefined; highlights: Highlight[] }>);

  const totalHighlights = highlights.length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: Spacing['4'],
          paddingVertical: Spacing['3'],
        }}
      >
        <TouchableOpacity activeOpacity={0.7} onPress={handleBack} style={{ padding: Spacing['2'] }} accessibilityLabel="Go back" accessibilityRole="button">
          <CaretLeftIcon size={24} color={colors.text} weight="light" />
        </TouchableOpacity>
        <Text
          style={{
            fontFamily: FontFamily.uiSemiBold,
            fontSize: 17,
            color: colors.text,
            marginLeft: Spacing['3'],
          }}
        >
          My Highlights
        </Text>
      </View>

      {totalHighlights === 0 ? (
        // Empty state with breathing icon
        <HighlightsEmptyState colors={colors} />
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing['6'] }}>
          {/* Stats */}
          <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={{ marginBottom: Spacing['6'] }}>
            <Text
              style={{
                ...Typography.cardMeta,
                color: colors.textMuted,
                marginBottom: Spacing['2'],
              }}
            >
              {totalHighlights} highlight{totalHighlights !== 1 ? 's' : ''}
            </Text>
          </Animated.View>

          {/* Highlights by Devotional */}
          {Object.entries(highlightsByDevotional).map(([devotionalId, { devotional, highlights: devHighlights }], index) => (
            <Animated.View
              key={devotionalId}
              entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).delay(index * 100).easing(Ease.out)}
              style={{
                marginBottom: Spacing['6'],
              }}
            >
              {/* Devotional Title */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing['3'], gap: Spacing['2'] }}>
                <BookOpenIcon size={16} color={colors.accent} weight="light" />
                <Text
                  style={{
                    fontFamily: FontFamily.uiSemiBold,
                    fontSize: 15,
                    color: colors.text,
                  }}
                >
                  {devotional?.title || 'Untitled Series'}
                </Text>
              </View>

              {/* Highlights List */}
              {devHighlights.map((highlight) => (
                <TouchableOpacity activeOpacity={0.7}
                  key={highlight.id}
                  onPress={() => handleHighlightPress(highlight)}
                  style={{
                    backgroundColor: colors.inputBackground,
                    borderRadius: Radius.md,
                    padding: Spacing['4'],
                    marginBottom: Spacing['3'],
                  }}
                >
                  {/* Color indicator and day */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing['2'], gap: Spacing['2'] }}>
                    <View
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        backgroundColor: HIGHLIGHT_COLORS[highlight.color || 'yellow'][isDark ? 'dark' : 'light'],
                      }}
                    />
                    <Text
                      style={{
                        fontFamily: FontFamily.uiMedium,
                        fontSize: FontSize.xs,
                        color: colors.textMuted,
                      }}
                    >
                      Day {highlight.dayNumber}
                    </Text>
                    <Text
                      style={{
                        fontFamily: FontFamily.ui,
                        fontSize: 11,
                        color: colors.textHint,
                      }}
                    >
                      {HIGHLIGHT_COLORS[highlight.color || 'yellow'].label}
                    </Text>
                  </View>

                  {/* Highlighted text */}
                  <View style={{ flexDirection: 'row', gap: Spacing['2'] }}>
                    <QuotesIcon size={14} color={colors.accent} weight="light" style={{ marginTop: 2, opacity: 0.6 }} />
                    <Text
                      style={{
                        fontFamily: FontFamily.bodyItalic,
                        fontSize: 15,
                        color: colors.text,
                        lineHeight: 22,
                        flex: 1,
                      }}
                      numberOfLines={3}
                    >
                      "{stripOuterQuotes(highlight.highlightedText)}"
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </Animated.View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function HighlightsEmptyState({ colors }: { colors: ReturnType<typeof useTheme>['colors'] }) {
  const reducedMotion = useReducedMotion();
  const iconPulse = useSharedValue(1);
  useEffect(() => {
    iconPulse.value = withRepeat(
      withTiming(1.1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [iconPulse]);

  const iconPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconPulse.value }],
  }));

  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
      style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing['10'] }}
    >
      <Animated.View style={[{ marginBottom: Spacing['4'] }, iconPulseStyle]}>
        <HighlighterIcon size={48} color={colors.textMuted} weight="light" style={{ opacity: 0.5 }} />
      </Animated.View>
      <Text
        style={{
          fontFamily: FontFamily.display,
          fontSize: FontSize['2xl'],
          color: colors.text,
          textAlign: 'center',
          marginBottom: Spacing['2'],
        }}
      >
        No highlights yet
      </Text>
      <Text
        style={{
          fontFamily: FontFamily.ui,
          fontSize: 15,
          color: colors.textMuted,
          textAlign: 'center',
          lineHeight: 22,
        }}
      >
        While reading, tap and hold on any text to highlight your favorite quotes and verses.
      </Text>
    </Animated.View>
  );
}
