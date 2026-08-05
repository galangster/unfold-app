/**
 * CompanionEmptyState — greeting, subtext, and 4 starter cards.
 * Staggered fade-in animation per Storyboard A.
 */
import { useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
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
  ChatCircleDotsIcon,
  BookOpenTextIcon,
  HeartIcon,
  BookIcon,
  LightbulbIcon,
  MagnifyingGlassIcon,
  CrossIcon,
  ClockCounterClockwiseIcon,
  HandsPrayingIcon,
} from 'phosphor-react-native';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Duration, Ease } from '@/constants/animations';
import { Spacing } from '@/constants/spacing';
import { useUnfoldStore } from '@/lib/store';

const EASE_OUT = Easing.out(Easing.cubic);

// ── 50 rotating greetings ──────────────────────────────────────────────────

const GREETINGS_WITH_NAME = [
  (n: string) => `Hey ${n}, what’s on your heart?`,
  (n: string) => `Good to see you, ${n}.`,
  (n: string) => `What are you thinking about, ${n}?`,
  (n: string) => `Hey ${n}. What’s stirring in you?`,
  (n: string) => `${n}, what’s been on your mind?`,
  (n: string) => `Welcome back, ${n}.`,
  (n: string) => `Hey ${n}. Anything weighing on you?`,
  (n: string) => `What’s God been putting on your heart, ${n}?`,
  (n: string) => `${n}, what are you wrestling with?`,
  (n: string) => `Hey ${n}. I’m here whenever you’re ready.`,
  (n: string) => `What brought you here, ${n}?`,
  (n: string) => `${n}, what do you want to explore?`,
  (n: string) => `Hey ${n}. Let’s dig into something.`,
  (n: string) => `What are you curious about, ${n}?`,
  (n: string) => `${n}, what questions are you sitting with?`,
  (n: string) => `Hey ${n}. Where should we start?`,
  (n: string) => `What do you need right now, ${n}?`,
  (n: string) => `${n}, I’m glad you’re here.`,
  (n: string) => `Hey ${n}. What’s pulling at you?`,
  (n: string) => `Talk to me, ${n}. What’s going on?`,
  (n: string) => `${n}, anything on your mind?`,
  (n: string) => `Hey ${n}. What would be helpful right now?`,
  (n: string) => `What’s stirring in your spirit, ${n}?`,
  (n: string) => `${n}, what do you want to talk about?`,
  (n: string) => `Hey ${n}. Ask me anything.`,
];

const GREETINGS_NO_NAME = [
  "What’s on your heart?",
  "What are you thinking about?",
  "What’s been on your mind?",
  "Anything weighing on you?",
  "What brought you here?",
  "What are you curious about?",
  "Where should we start?",
  "What do you need right now?",
  "What’s stirring in you?",
  "What are you wrestling with?",
  "What questions are you sitting with?",
  "What do you want to explore?",
  "What would be helpful right now?",
  "Talk to me. What’s going on?",
  "I’m here. Ask me anything.",
  "What do you want to talk about?",
  "What’s pulling at you?",
  "What’s God been putting on your heart?",
  "Glad you’re here. What’s up?",
  "Let’s dig into something.",
  "I’m here whenever you’re ready.",
  "Anything on your mind?",
  "What’s stirring in your spirit?",
  "What brought you here today?",
  "Ready when you are.",
];

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

  const greeting = useMemo(() => {
    if (userName) {
      const idx = Math.floor(Math.random() * GREETINGS_WITH_NAME.length);
      return GREETINGS_WITH_NAME[idx](userName);
    }
    const idx = Math.floor(Math.random() * GREETINGS_NO_NAME.length);
    return GREETINGS_NO_NAME[idx];
  }, [userName]);

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
      style={{ flex: 1, justifyContent: 'center', paddingHorizontal: Spacing['6'] }}
    >
      {/* Companion icon */}
      <FadeSlideIn delay={0} translateY={0}>
        <View style={{ alignItems: 'center', marginBottom: Spacing['4'] }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: Radius['2xl'],
              backgroundColor: alpha(colors.accent, 0.15),
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChatCircleDotsIcon size={24} color={colors.accent} weight="light" />
          </View>
        </View>
      </FadeSlideIn>

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

      {/* Subtext */}
      <FadeSlideIn delay={350} translateY={6}>
        <Text
          style={{
            fontFamily: FontFamily.body,
            fontSize: FontSize.base,
            color: colors.textMuted,
            textAlign: 'center',
            maxWidth: 300,
            alignSelf: 'center',
            marginTop: Spacing['3'],
            lineHeight: 24,
          }}
        >
          Explore Scripture together, pray, or just talk through what’s on your mind.
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
    </Animated.View>
  );
}
