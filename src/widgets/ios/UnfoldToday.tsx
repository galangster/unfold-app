/**
 * Unfold Today Widget — systemMedium
 * Shows today's devotional with scripture reference, title, and streak.
 * Two-column layout: streak/progress left, content right.
 *
 * WIDGET RUNTIME CONTRACT: see UnfoldStreak.tsx — palettes/URLs must live
 * inside the function body.
 */
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import { Text, VStack, HStack, Image, Spacer, Divider } from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  frame,
  padding,
  background,
  opacity,
  lineLimit,
  truncationMode,
  lineSpacing,
  kerning,
  accessibilityLabel,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';

type TodayWidgetProps = {
  streakCount: number;
  hasReadToday: boolean;
  devotionalTitle: string;
  dayTitle: string;
  dayNumber: number;
  totalDays: number;
  scriptureReference: string;
  quotableLine: string;
  readingMinutes: number;
};

const TodayWidget = (
  props: TodayWidgetProps,
  environment: WidgetEnvironment
) => {
  'widget';

  const streak = props.streakCount ?? 0;
  const hasRead = props.hasReadToday ?? false;
  const seriesTitle = props.devotionalTitle ?? 'Unfold';
  const dayTitle = props.dayTitle ?? 'Your daily reading';
  const day = props.dayNumber ?? 0;
  const total = props.totalDays ?? 0;
  const scripture = props.scriptureReference ?? '';
  const quote = props.quotableLine ?? '';
  const minutes = props.readingMinutes ?? 5;

  const deepLink = 'unfold://(tabs)/(today)';

  // Dark = original shipped values; light mirrors src/constants/colors.ts
  // LightColors with ink alphas raised for contrast. Unknown scheme → dark.
  const isLight = environment.colorScheme === 'light';
  const c = isLight
    ? {
        bg: '#FAF7F2',
        text: '#1C1710',
        t55: 'rgba(28,23,16,0.68)',
        t45: 'rgba(28,23,16,0.60)',
        t40: 'rgba(28,23,16,0.55)',
        t35: 'rgba(28,23,16,0.50)',
        t30: 'rgba(28,23,16,0.45)',
        accent: '#866B2F',
        accentSoft: 'rgba(134,107,47,0.85)',
      }
    : {
        bg: '#0A0A0A',
        text: '#F5F0EB',
        t55: 'rgba(245,240,235,0.55)',
        t45: 'rgba(245,240,235,0.45)',
        t40: 'rgba(245,240,235,0.4)',
        t35: 'rgba(245,240,235,0.35)',
        t30: 'rgba(245,240,235,0.3)',
        accent: '#C8A55C',
        accentSoft: 'rgba(200,165,92,0.8)',
      };

  return (
    <HStack
      modifiers={[
        padding({ all: 14 }),
        frame({ maxWidth: Infinity, maxHeight: Infinity }),
        background(c.bg),
        accessibilityLabel(
          `Today's reading: ${dayTitle}. ${scripture !== '' ? scripture + '.' : ''} ${streak} day streak. ${minutes} minute read.`
        ),
        widgetURL(deepLink),
      ]}
    >
      {/* Left column — streak + progress */}
      <VStack
        modifiers={[
          frame({ width: 60, alignment: 'center' }),
          padding({ trailing: 4 }),
        ]}
      >
        <Image
          systemName={hasRead ? 'flame.fill' : 'flame'}
          size={16}
          color={c.accent}
        />
        <Text
          modifiers={[
            font({ size: 30, weight: 'bold', design: 'rounded' }),
            foregroundStyle(c.text),
            kerning(-0.5),
          ]}
        >
          {streak}
        </Text>
        <Text
          modifiers={[
            font({ size: 10, weight: 'medium' }),
            foregroundStyle(hasRead ? c.accentSoft : c.t45),
          ]}
        >
          {hasRead ? 'streak' : 'read today'}
        </Text>

        <Spacer />

        {total > 0 && (
          <Text
            modifiers={[
              font({ size: 10, weight: 'medium' }),
              foregroundStyle(c.t30),
            ]}
          >
            {day}/{total}
          </Text>
        )}
      </VStack>

      {/* Divider — subtle but visible */}
      <Divider modifiers={[opacity(0.12), padding({ top: 2, bottom: 2 })]} />

      {/* Right column — today's reading */}
      <VStack
        modifiers={[
          padding({ leading: 10 }),
          frame({ maxWidth: Infinity, alignment: 'leading' }),
        ]}
      >
        <Text
          modifiers={[
            font({ size: 11, weight: 'semibold' }),
            foregroundStyle(c.accent),
            kerning(1.5),
          ]}
        >
          {seriesTitle.toUpperCase()}
        </Text>

        <Text
          modifiers={[
            font({ size: 15, weight: 'semibold' }),
            foregroundStyle(c.text),
            lineLimit(2),
            truncationMode('tail'),
            padding({ top: 1 }),
          ]}
        >
          {dayTitle}
        </Text>

        {scripture !== '' && (
          <Text
            modifiers={[
              font({ size: 11, weight: 'regular', design: 'serif' }),
              foregroundStyle(c.t55),
              padding({ top: 2 }),
            ]}
          >
            {scripture}
          </Text>
        )}

        <Spacer />

        {quote !== '' && (
          <Text
            modifiers={[
              font({ size: 11, weight: 'regular' }),
              foregroundStyle(c.t40),
              lineLimit(2),
              truncationMode('tail'),
              lineSpacing(2),
            ]}
          >
            {'"'}{quote}{'"'}
          </Text>
        )}

        <HStack modifiers={[padding({ top: 4 })]}>
          <Image
            systemName="clock"
            size={10}
            color={c.t35}
          />
          <Text
            modifiers={[
              font({ size: 10, weight: 'medium' }),
              foregroundStyle(c.t35),
              padding({ leading: 2 }),
            ]}
          >
            {minutes} min
          </Text>
        </HStack>
      </VStack>
    </HStack>
  );
};

export default createWidget('UnfoldToday', TodayWidget);
