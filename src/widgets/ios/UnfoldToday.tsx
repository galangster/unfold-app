/**
 * Unfold Today Widget — systemMedium
 * Shows today's devotional with scripture reference, title, and streak.
 * Two-column layout: streak/progress left, content right.
 */
import { createWidget, WidgetBase } from 'expo-widgets';
import { Text, VStack, HStack, Image, Spacer, Divider } from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  frame,
  padding,
  background,
  opacity,
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

const TodayWidget = (props: WidgetBase<TodayWidgetProps>) => {
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
      ]}
    >
      {/* Left column — streak + progress */}
      <VStack modifiers={[frame({ width: 72 })]}>
        <Image
          systemName={hasRead ? 'flame.fill' : 'flame'}
          size={20}
          color="#C8A55C"
        />
        <Text
          modifiers={[
            font({ size: 28, weight: 'bold', design: 'rounded' }),
            foregroundStyle('#F5F0EB'),
          ]}
        >
          {streak}
        </Text>
        <Text
          modifiers={[
            font({ size: 10, weight: 'medium' }),
            foregroundStyle('rgba(245,240,235,0.5)'),
          ]}
        >
          {hasRead ? 'streak' : 'read today'}
        </Text>

        <Spacer />

        {total > 0 && (
          <Text
            modifiers={[
              font({ size: 10, weight: 'regular' }),
              foregroundStyle('rgba(245,240,235,0.35)'),
            ]}
          >
            {day}/{total}
          </Text>
        )}
      </VStack>

      {/* Subtle divider */}
      <Divider modifiers={[opacity(0.15), padding({ top: 4, bottom: 4 })]} />

      {/* Right column — today's reading */}
      <VStack modifiers={[padding({ leading: 8 }), frame({ maxWidth: Infinity })]}>
        <Text
          modifiers={[
            font({ size: 9, weight: 'semibold' }),
            foregroundStyle('#C8A55C'),
          ]}
        >
          {seriesTitle.toUpperCase()}
        </Text>

        <Text
          modifiers={[
            font({ size: 14, weight: 'semibold' }),
            foregroundStyle('#F5F0EB'),
          ]}
        >
          {dayTitle.length > 30 ? dayTitle.slice(0, 28) + '...' : dayTitle}
        </Text>

        {scripture !== '' && (
          <Text
            modifiers={[
              font({ size: 11, weight: 'regular', design: 'serif' }),
              foregroundStyle('rgba(245,240,235,0.6)'),
            ]}
          >
            {scripture}
          </Text>
        )}

        <Spacer />

        {quote !== '' && (
          <Text
            modifiers={[
              font({ size: 10, weight: 'regular', design: 'serif' }),
              foregroundStyle('rgba(245,240,235,0.45)'),
            ]}
          >
            "{quote.length > 60 ? quote.slice(0, 58) + '...' : quote}"
          </Text>
        )}

        <HStack>
          <Image
            systemName="clock"
            size={10}
            color="rgba(245,240,235,0.35)"
          />
          <Text
            modifiers={[
              font({ size: 10, weight: 'regular' }),
              foregroundStyle('rgba(245,240,235,0.35)'),
            ]}
          >
            {minutes} min read
          </Text>
        </HStack>
      </VStack>
    </HStack>
  );
};

export default createWidget('UnfoldToday', TodayWidget);
