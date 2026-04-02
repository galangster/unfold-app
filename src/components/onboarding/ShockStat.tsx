import { View, Text } from 'react-native';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import type { ColorTheme } from '@/constants/colors';
import type { BibleFrequency } from '@/lib/store';

/**
 * Displays a "shock stat" based on the user's bible reading frequency,
 * followed by a gap statement about the disconnect between desire and habit.
 *
 * Uses staggered fade-in animations for emotional impact.
 */

const STAT_TEXT: Record<string, string> = {
  'few-times-week': "that's about 150 hours with God's word this year.",
  weekly: "that's about 50 hours with God's word this year.",
  'couple-times-month': "that's about 20 hours this year.",
  rarely: 'the average person spends 1,300 hours on their phone this year.',
  never: 'the average person spends 1,300 hours on their phone this year.',
};

const GAP_TEXT =
  '93% of Christians say they want a deeper relationship with God. Only 11% read the Bible daily. The gap isn\'t desire \u2014 it\'s having something that meets you where you are.';

/**
 * Returns true when the shock stat screen should be skipped entirely.
 * Daily readers already have a strong habit -- no need to show them stats.
 */
export function shouldSkipShockStat(frequency: BibleFrequency): boolean {
  return frequency === 'daily';
}

interface ShockStatProps {
  bibleFrequency: BibleFrequency;
  colors: ColorTheme;
}

export function ShockStat({ bibleFrequency, colors }: ShockStatProps) {
  const statText = STAT_TEXT[bibleFrequency];

  // Gap text fades in after the stat
  const gapOpacity = useSharedValue(0);

  useEffect(() => {
    gapOpacity.value = withDelay(1600, withTiming(1, { duration: 600 }));
  }, [gapOpacity]);

  const gapAnimatedStyle = useAnimatedStyle(() => ({
    opacity: gapOpacity.value,
  }));

  if (!statText) {
    return null;
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: Spacing['2'] }}>
      {/* Stat text -- fades in first */}
      <Animated.Text
        entering={FadeIn.delay(400).duration(800)}
        style={{
          fontFamily: FontFamily.display,
          fontSize: FontSize['3xl'],
          color: colors.text,
          lineHeight: 40,
          marginBottom: Spacing['8'],
        }}
      >
        {statText}
      </Animated.Text>

      {/* Gap text -- fades in after */}
      <Animated.Text
        style={[
          {
            fontFamily: FontFamily.body,
            fontSize: FontSize.base,
            color: colors.textMuted,
            lineHeight: 26,
          },
          gapAnimatedStyle,
        ]}
      >
        {GAP_TEXT}
      </Animated.Text>
    </View>
  );
}
