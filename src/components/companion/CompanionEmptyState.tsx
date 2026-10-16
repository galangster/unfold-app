/**
 * CompanionEmptyState — greeting and 4 starter cards.
 * Staggered fade-in animation per Storyboard A.
 */
import { useEffect, useMemo } from 'react';
import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  FadeOut,
  useReducedMotion,
} from 'react-native-reanimated';
import {
  BookOpenTextIcon,
  HeartIcon,
  BookIcon,
  LightbulbIcon,
  MagnifyingGlassIcon,
  CrossIcon,
  ClockCounterClockwiseIcon,
  HandsPrayingIcon,
} from '@/components/icons';
import { useTheme } from '@/lib/theme';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Duration, Ease } from '@/constants/animations';
import { Spacing } from '@/constants/spacing';
import { useUnfoldStore } from '@/lib/store';
import { companionGreeting } from '@/constants/daily-copy';
import { copyVariationFor } from '@/lib/copy-variation';

const EASE_OUT = Easing.out(Easing.cubic);

interface Props {
  onSelectStarter: (text: string) => void;
  todayTheme?: string | null;
}

interface StarterCard {
  icon: React.ComponentType<any>;
  text: string;
}

function FadeSlideIn({
  delay,
  translateY = 12,
  children,
}: {
  delay: number;
  translateY?: number;
  children: React.ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(reducedMotion ? 1 : 0);
  const y = useSharedValue(reducedMotion ? 0 : translateY);

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 1;
      y.value = 0;
      return;
    }
    opacity.value = withDelay(delay, withTiming(1, { duration: Duration.normal, easing: EASE_OUT }));
    y.value = withDelay(delay, withTiming(0, { duration: Duration.normal, easing: EASE_OUT }));
  }, [delay, opacity, y, translateY, reducedMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

export function CompanionEmptyState({ onSelectStarter, todayTheme }: Props) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const userName = useUnfoldStore((s) => s.user?.name ?? null);

  // One greeting per local day from the bag, so it does not come back tomorrow.
  const greeting = useMemo(() => companionGreeting(userName, copyVariationFor(new Date())), [userName]);

  const hasHistory = useUnfoldStore((s) => (s.devotionals?.length ?? 0) > 0);

  const cards: StarterCard[] = useMemo(() => {
    if (todayTheme && hasHistory) {
      // Returning user with active devotional — show memory-aware chips
      return [
        { icon: BookOpenTextIcon, text: `Walk me through today’s reading` },
        { icon: ClockCounterClockwiseIcon, text: 'What have I been learning this week?' },
        { icon: HandsPrayingIcon, text: 'How are my prayer requests going?' },
        { icon: LightbulbIcon, text: 'Help me put my prayer into words' },
      ];
    }
    if (todayTheme) {
      // Active devotional but no history yet
      return [
        { icon: BookOpenTextIcon, text: `Walk me through today’s reading` },
        { icon: HeartIcon, text: 'I need encouragement right now' },
        { icon: BookIcon, text: 'Help me understand a verse' },
        { icon: LightbulbIcon, text: 'Help me put my prayer into words' },
      ];
    }
    return [
      { icon: MagnifyingGlassIcon, text: 'Help me understand a passage' },
      { icon: HeartIcon, text: "I’m going through something hard" },
      { icon: CrossIcon, text: 'I have a question about my faith' },
      { icon: LightbulbIcon, text: 'Help me put my prayer into words' },
    ];
  }, [todayTheme, hasHistory]);

  return (
    <Animated.View
      exiting={reducedMotion ? undefined : FadeOut.duration(Duration.fast).easing(Ease.out)}
      style={{ flex: 1 }}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'flex-start',
          paddingHorizontal: Spacing['6'],
          paddingTop: Spacing['4'],
          paddingBottom: Spacing['6'],
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Greeting */}
        <FadeSlideIn delay={200} translateY={8}>
          <Text
            style={{
              fontFamily: FontFamily.display,
              fontSize: 21,
              color: colors.text,
              textAlign: 'center',
              maxWidth: 280,
              alignSelf: 'center',
            }}
          >
            {greeting}
          </Text>
        </FadeSlideIn>

        {/* Starter cards */}
        <View style={{ marginTop: Spacing['8'], gap: 10 }}>
          {cards.map((card, i) => {
            const Icon = card.icon;
            return (
              <FadeSlideIn key={card.text} delay={500 + i * 80}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => onSelectStarter(card.text)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: colors.inputBackground,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: Radius.card,
                    paddingHorizontal: Spacing['4'],
                    paddingVertical: 14,
                    minHeight: 44,
                  }}
                >
                  <Icon
                    size={20}
                    color={colors.accent}
                    weight="light"
                    style={{ marginRight: Spacing['3'] }}
                  />
                  <Text
                    style={{
                      fontFamily: FontFamily.body,
                      fontSize: FontSize.sm,
                      color: colors.text,
                      flex: 1,
                    }}
                  >
                    {card.text}
                  </Text>
                </TouchableOpacity>
              </FadeSlideIn>
            );
          })}
        </View>
      </ScrollView>
    </Animated.View>
  );
}
