/**
 * Unfold Streak Widget — systemSmall + accessoryCircular
 * Shows current reading streak with a flame icon.
 * Designed for quick glances that motivate daily reading.
 */
import { createWidget, WidgetBase } from 'expo-widgets';
import { Text, VStack, HStack, ZStack, Image, Spacer } from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  frame,
  padding,
  cornerRadius,
  background,
  opacity,
} from '@expo/ui/swift-ui/modifiers';

type StreakWidgetProps = {
  streakCount: number;
  streakLongest: number;
  hasReadToday: boolean;
  devotionalTitle: string;
  dayNumber: number;
  totalDays: number;
};

const StreakWidget = (props: WidgetBase<StreakWidgetProps>) => {
  'widget';

  const streak = props.streakCount ?? 0;
  const hasRead = props.hasReadToday ?? false;
  const longest = props.streakLongest ?? 0;
  const title = props.devotionalTitle ?? 'Start your journey';
  const day = props.dayNumber ?? 0;
  const total = props.totalDays ?? 0;

  if (props.family === 'accessoryCircular') {
    // Lock screen circular — just flame + number
    return (
      <VStack modifiers={[frame({ width: 50, height: 50 })]}>
        <Image
          systemName={hasRead ? 'flame.fill' : 'flame'}
          size={16}
          color="#C8A55C"
        />
        <Text modifiers={[font({ size: 14, weight: 'bold' })]}>
          {streak}
        </Text>
      </VStack>
    );
  }

  // systemSmall — full widget
  return (
    <VStack
      modifiers={[
        padding({ all: 16 }),
        frame({ maxWidth: Infinity, maxHeight: Infinity }),
        background('#0A0A0A'),
      ]}
    >
      {/* Flame + streak count */}
      <HStack>
        <Image
          systemName={hasRead ? 'flame.fill' : 'flame'}
          size={22}
          color="#C8A55C"
        />
        <Text
          modifiers={[
            font({ size: 36, weight: 'bold', design: 'rounded' }),
            foregroundStyle('#F5F0EB'),
          ]}
        >
          {streak}
        </Text>
      </HStack>

      <Text
        modifiers={[
          font({ size: 12, weight: 'medium' }),
          foregroundStyle(hasRead ? '#C8A55C' : 'rgba(245,240,235,0.6)'),
        ]}
      >
        {hasRead ? 'day streak' : 'Read today!'}
      </Text>

      <Spacer />

      {/* Series progress */}
      {total > 0 && (
        <Text
          modifiers={[
            font({ size: 11, weight: 'regular' }),
            foregroundStyle('rgba(245,240,235,0.4)'),
          ]}
        >
          Day {day} of {total}
        </Text>
      )}

      {/* Truncated title */}
      <Text
        modifiers={[
          font({ size: 11, weight: 'regular' }),
          foregroundStyle('rgba(245,240,235,0.5)'),
        ]}
      >
        {title.length > 24 ? title.slice(0, 22) + '...' : title}
      </Text>
    </VStack>
  );
};

export default createWidget('UnfoldStreak', StreakWidget);
