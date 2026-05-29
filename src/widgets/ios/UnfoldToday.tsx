/**
 * Unfold Today Widget — systemMedium
 * Shows today's devotional with scripture reference, title, and streak.
 * Two-column layout: streak/progress left, content right.
 */
import { createWidget } from 'expo-widgets';
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

const TodayWidget = (props: TodayWidgetProps) => {
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

  return (
    <HStack
      modifiers={[
        padding({ all: 14 }),
        frame({ maxWidth: Infinity, maxHeight: Infinity }),
        background('#0A0A0A'),
        accessibilityLabel(
          `Today's reading: ${dayTitle}. ${scripture !== '' ? scripture + '.' : ''} ${streak} day streak. ${minutes} minute read.`
        ),
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
          color="#C8A55C"
        />
        <Text
          modifiers={[
            font({ size: 30, weight: 'bold', design: 'rounded' }),
            foregroundStyle('#F5F0EB'),
            kerning(-0.5),
          ]}
        >
          {streak}
        </Text>
        <Text
          modifiers={[
            font({ size: 10, weight: 'medium' }),
            foregroundStyle(hasRead ? 'rgba(200,165,92,0.8)' : 'rgba(245,240,235,0.45)'),
          ]}
        >
          {hasRead ? 'streak' : 'read today'}
        </Text>

        <Spacer />

        {total > 0 && (
          <Text
            modifiers={[
              font({ size: 10, weight: 'medium' }),
              foregroundStyle('rgba(245,240,235,0.3)'),
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
            foregroundStyle('#C8A55C'),
            kerning(1.5),
          ]}
        >
          {seriesTitle.toUpperCase()}
        </Text>

        <Text
          modifiers={[
            font({ size: 15, weight: 'semibold' }),
            foregroundStyle('#F5F0EB'),
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
              foregroundStyle('rgba(245,240,235,0.55)'),
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
              foregroundStyle('rgba(245,240,235,0.4)'),
              lineLimit(2),
              truncationMode('tail'),
              lineSpacing(2),
            ]}
          >
            {'\u201C'}{quote}{'\u201D'}
          </Text>
        )}

        <HStack modifiers={[padding({ top: 4 })]}>
          <Image
            systemName="clock"
            size={10}
            color="rgba(245,240,235,0.35)"
          />
          <Text
            modifiers={[
              font({ size: 10, weight: 'medium' }),
              foregroundStyle('rgba(245,240,235,0.35)'),
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
