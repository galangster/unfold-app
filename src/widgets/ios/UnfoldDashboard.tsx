/**
 * Unfold Dashboard Widget — systemLarge
 * Full devotional dashboard: verse of the day, streak, weekly progress,
 * and upcoming readings. For power users who want Unfold front-and-center.
 */
import { createWidget, WidgetBase } from 'expo-widgets';
import {
  Text,
  VStack,
  HStack,
  Image,
  Spacer,
  Divider,
} from '@expo/ui/swift-ui';
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
  shapes,
} from '@expo/ui/swift-ui/modifiers';

type DashboardWidgetProps = {
  streakCount: number;
  streakLongest: number;
  hasReadToday: boolean;
  devotionalTitle: string;
  dayTitle: string;
  dayNumber: number;
  totalDays: number;
  scriptureReference: string;
  scriptureText: string;
  quotableLine: string;
  readingMinutes: number;
  /** Comma-separated: 1 = read, 0 = not read, for the 7 days M-Su */
  weeklyProgress: string;
  nextDayTitle: string;
};

const DashboardWidget = (props: WidgetBase<DashboardWidgetProps>) => {
  'widget';

  const streak = props.streakCount ?? 0;
  const hasRead = props.hasReadToday ?? false;
  const seriesTitle = props.devotionalTitle ?? 'Unfold';
  const dayTitle = props.dayTitle ?? 'Start your series';
  const day = props.dayNumber ?? 0;
  const total = props.totalDays ?? 0;
  const scripture = props.scriptureReference ?? '';
  const verse = props.scriptureText ?? '';
  const quote = props.quotableLine ?? '';
  const minutes = props.readingMinutes ?? 5;
  const weekly = props.weeklyProgress ?? '0,0,0,0,0,0,0';
  const nextTitle = props.nextDayTitle ?? '';

  const weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const weekBits = weekly.split(',').map((d: string) => d === '1');

  return (
    <VStack
      modifiers={[
        padding({ all: 16 }),
        frame({ maxWidth: Infinity, maxHeight: Infinity }),
        background('#0A0A0A'),
        accessibilityLabel(
          `Unfold dashboard. ${dayTitle}. Day ${day} of ${total}. ${streak} day streak. ${scripture !== '' ? scripture : ''}`
        ),
      ]}
    >
      {/* Header row: series + day title left, streak right */}
      <HStack modifiers={[frame({ maxWidth: Infinity })]}>
        <VStack modifiers={[frame({ alignment: 'leading' })]}>
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
              font({ size: 17, weight: 'semibold' }),
              foregroundStyle('#F5F0EB'),
              lineLimit(1),
              truncationMode('tail'),
              padding({ top: 1 }),
            ]}
          >
            {dayTitle}
          </Text>
          {total > 0 && (
            <Text
              modifiers={[
                font({ size: 11, weight: 'regular' }),
                foregroundStyle('rgba(245,240,235,0.4)'),
                padding({ top: 2 }),
              ]}
            >
              Day {day} of {total}
            </Text>
          )}
        </VStack>

        <Spacer />

        {/* Streak badge */}
        <VStack
          modifiers={[
            padding({ all: 8 }),
            background('rgba(200,165,92,0.1)', shapes.roundedRectangle({ cornerRadius: 10 })),
          ]}
        >
          <Image
            systemName={hasRead ? 'flame.fill' : 'flame'}
            size={16}
            color="#C8A55C"
          />
          <Text
            modifiers={[
              font({ size: 22, weight: 'bold', design: 'rounded' }),
              foregroundStyle('#F5F0EB'),
              kerning(-0.5),
            ]}
          >
            {streak}
          </Text>
        </VStack>
      </HStack>

      <Divider modifiers={[opacity(0.08), padding({ top: 10, bottom: 10 })]} />

      {/* Scripture quote — the centerpiece */}
      {verse !== '' ? (
        <VStack
          modifiers={[
            frame({ maxWidth: Infinity, alignment: 'leading' }),
            padding({ top: 2, bottom: 4 }),
          ]}
        >
          <Text
            modifiers={[
              font({ size: 14, weight: 'regular', design: 'serif' }),
              foregroundStyle('rgba(245,240,235,0.75)'),
              lineLimit(4),
              truncationMode('tail'),
              lineSpacing(3),
            ]}
          >
            {verse}
          </Text>
          {scripture !== '' && (
            <Text
              modifiers={[
                font({ size: 11, weight: 'semibold' }),
                foregroundStyle('#C8A55C'),
                padding({ top: 6 }),
              ]}
            >
              {scripture}
            </Text>
          )}
        </VStack>
      ) : quote !== '' ? (
        <VStack
          modifiers={[
            frame({ maxWidth: Infinity, alignment: 'leading' }),
            padding({ top: 2, bottom: 4 }),
          ]}
        >
          <Text
            modifiers={[
              font({ size: 14, weight: 'regular', design: 'serif' }),
              foregroundStyle('rgba(245,240,235,0.65)'),
              lineLimit(3),
              truncationMode('tail'),
              lineSpacing(3),
            ]}
          >
            {'\u201C'}{quote}{'\u201D'}
          </Text>
        </VStack>
      ) : null}

      <Spacer />

      {/* Weekly progress — evenly distributed */}
      <HStack
        modifiers={[
          frame({ maxWidth: Infinity }),
          padding({ top: 4, bottom: 4 }),
        ]}
      >
        {weekDays.map((dayLabel: string, i: number) => (
          <VStack
            key={dayLabel + i}
            modifiers={[
              frame({ maxWidth: Infinity }),
            ]}
          >
            <Image
              systemName={weekBits[i] ? 'checkmark.circle.fill' : 'circle'}
              size={14}
              color={weekBits[i] ? '#C8A55C' : 'rgba(245,240,235,0.15)'}
            />
            <Text
              modifiers={[
                font({ size: 10, weight: weekBits[i] ? 'medium' : 'regular' }),
                foregroundStyle(
                  weekBits[i] ? 'rgba(200,165,92,0.7)' : 'rgba(245,240,235,0.25)'
                ),
                padding({ top: 2 }),
              ]}
            >
              {dayLabel}
            </Text>
          </VStack>
        ))}
      </HStack>

      <Divider modifiers={[opacity(0.08), padding({ top: 6, bottom: 8 })]} />

      {/* Footer: reading time + next reading */}
      <HStack modifiers={[frame({ maxWidth: Infinity })]}>
        <HStack>
          <Image
            systemName="clock"
            size={11}
            color="rgba(245,240,235,0.35)"
          />
          <Text
            modifiers={[
              font({ size: 11, weight: 'medium' }),
              foregroundStyle('rgba(245,240,235,0.35)'),
              padding({ leading: 2 }),
            ]}
          >
            {minutes} min
          </Text>
        </HStack>

        <Spacer />

        {nextTitle !== '' && (
          <HStack>
            <Text
              modifiers={[
                font({ size: 11, weight: 'regular' }),
                foregroundStyle('rgba(245,240,235,0.3)'),
              ]}
            >
              Next:{' '}
            </Text>
            <Text
              modifiers={[
                font({ size: 11, weight: 'medium' }),
                foregroundStyle('rgba(245,240,235,0.45)'),
                lineLimit(1),
                truncationMode('tail'),
              ]}
            >
              {nextTitle}
            </Text>
          </HStack>
        )}
      </HStack>
    </VStack>
  );
};

export default createWidget('UnfoldDashboard', DashboardWidget);
