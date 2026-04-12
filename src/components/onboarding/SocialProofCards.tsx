import { View, Text } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease, Stagger } from '@/constants/animations';
import type { ColorTheme } from '@/constants/colors';

/**
 * Three hardcoded social proof review cards with staggered fade-in animations.
 * Card styling matches the existing choice option cards from onboarding.tsx.
 */

interface Review {
  quote: string;
  author: string;
}

const REVIEWS: Review[] = [
  {
    quote:
      "I've never read a devotional that knew I was a tired mom of three. This one did.",
    author: 'Sarah M.',
  },
  {
    quote:
      'I used to stare at my Bible for 10 minutes and give up. Now I look forward to mornings.',
    author: 'James K.',
  },
  {
    quote:
      "It felt like someone actually listened before writing this. Not a generic template.",
    author: 'David R.',
  },
];

interface SocialProofCardsProps {
  colors: ColorTheme;
}

export function SocialProofCards({ colors }: SocialProofCardsProps) {
  const reducedMotion = useReducedMotion();

  return (
    <View style={{ gap: Spacing['3'], marginTop: Spacing['2'] }}>
      {REVIEWS.map((review, index) => (
        <Animated.View
          key={review.author}
          entering={reducedMotion ? undefined : FadeIn.delay(index * Stagger.slow).duration(Duration.slow).easing(Ease.out)}
        >
          <View
            style={{
              backgroundColor: colors.inputBackground,
              paddingHorizontal: Spacing['5'],
              paddingVertical: 18,
              borderRadius: Radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              style={{
                fontFamily: FontFamily.body,
                fontSize: FontSize.base,
                color: colors.text,
                lineHeight: 24,
                fontStyle: 'italic',
                marginBottom: Spacing['2'],
              }}
            >
              &ldquo;{review.quote}&rdquo;
            </Text>
            <Text
              style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: FontSize.sm,
                color: colors.textMuted,
              }}
            >
              {review.author}
            </Text>
          </View>
        </Animated.View>
      ))}
    </View>
  );
}
