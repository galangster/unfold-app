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
  background,
  lineLimit,
  truncationMode,
  kerning,
  accessibilityLabel,
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
  const title = props.devotionalTitle ?? 'Start your series';
  const day = props.dayNumber ?? 0;
  const total = props.totalDays ?? 0;

  if (props.family === 'accessoryCircular') {
    // Lock screen circular — use hierarchical styles for system tinting
    return (
      <ZStack
        modifiers={[
          accessibilityLabel(`${streak} day streak`),
        ]}
      >
        <Image
          systemName={hasRead ? 'flame.fill' : 'flame'}
          size={18}
          modifiers={[
            foregroundStyle({ type: 'hierarchical', style: 'primary' }),
          ]}
        />
        <Text
          modifiers={[
            font({ size: 9, weight: 'semibold' }),
            foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
            padding({ top: 24 }),
          ]}
        >
          {streak}
        </Text>
      </ZStack>
    );
  }

  // systemSmall — full widget
  return (
    <VStack
      modifiers={[
        padding({ all: 14 }),
        frame({ maxWidth: Infinity, maxHeight: Infinity }),
        background('#0A0A0A'),
        accessibilityLabel(
          `${streak} day reading streak. ${hasRead ? 'Read today.' : 'Not yet read today.'}`
        ),
      ]}
    >
      {/* Streak number — hero element */}
      <VStack modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}>
        <HStack>
          <Image
            systemName={hasRead ? 'flame.fill' : 'flame'}
            size={18}
            color="#C8A55C"
          />
          <Text
            modifiers={[
              font({ size: 11, weight: 'medium' }),
              foregroundStyle(hasRead ? '#C8A55C' : 'rgba(245,240,235,0.5)'),
              padding({ leading: 2 }),
            ]}
          >
            {hasRead ? 'day streak' : 'read today'}
          </Text>
        </HStack>

        <Text
          modifiers={[
            font({ size: 40, weight: 'bold', design: 'rounded' }),
            foregroundStyle('#F5F0EB'),
            kerning(-1),
          ]}
        >
          {streak}
        </Text>
      </VStack>

      <Spacer />

      {/* Series progress — bottom section */}
      <VStack modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}>
        {total > 0 && (
          <Text
            modifiers={[
              font({ size: 12, weight: 'medium' }),
              foregroundStyle('rgba(245,240,235,0.5)'),
            ]}
          >
            Day {day} of {total}
          </Text>
        )}

        <Text
          modifiers={[
            font({ size: 11, weight: 'regular' }),
            foregroundStyle('rgba(245,240,235,0.35)'),
            lineLimit(1),
            truncationMode('tail'),
          ]}
        >
          {title}
        </Text>
      </VStack>
    </VStack>
  );
};

export default createWidget('UnfoldStreak', StreakWidget);
