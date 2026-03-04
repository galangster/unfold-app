/**
 * Unfold Dashboard Widget — systemLarge
 * Full devotional dashboard: verse of the day, streak, weekly progress,
 * and upcoming readings. For power users who want Unfold front-and-center.
 */
import { createWidget, WidgetBase } from 'expo-widgets';
import { Text, VStack, HStack, Image, Spacer, Divider } from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  frame,
  padding,
  background,
  cornerRadius,
  opacity,
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
  const dayTitle = props.dayTitle ?? 'Start your journey';
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
      ]}
    >
      {/* Header: series title + streak */}
      <HStack>
        <VStack>
          <Text
            modifiers={[
              font({ size: 10, weight: 'semibold' }),
              foregroundStyle('#C8A55C'),
            ]}
          >
            {seriesTitle.toUpperCase()}
          </Text>
          <Text
            modifiers={[
              font({ size: 16, weight: 'semibold' }),
              foregroundStyle('#F5F0EB'),
            ]}
          >
            {dayTitle.length > 32 ? dayTitle.slice(0, 30) + '...' : dayTitle}
          </Text>
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
        </VStack>

        <Spacer />

        <VStack>
          <Image
            systemName={hasRead ? 'flame.fill' : 'flame'}
            size={18}
            color="#C8A55C"
          />
          <Text
            modifiers={[
              font({ size: 22, weight: 'bold', design: 'rounded' }),
              foregroundStyle('#F5F0EB'),
            ]}
          >
            {streak}
          </Text>
        </VStack>
      </HStack>

      <Divider modifiers={[opacity(0.1), padding({ top: 8, bottom: 8 })]} />

      {/* Scripture quote */}
      {verse !== '' ? (
        <VStack modifiers={[padding({ top: 2, bottom: 2 })]}>
          <Text
            modifiers={[
              font({ size: 13, weight: 'regular', design: 'serif' }),
              foregroundStyle('rgba(245,240,235,0.8)'),
            ]}
          >
            {verse.length > 140 ? verse.slice(0, 138) + '...' : verse}
          </Text>
          {scripture !== '' && (
            <Text
              modifiers={[
                font({ size: 10, weight: 'medium' }),
                foregroundStyle('#C8A55C'),
                padding({ top: 4 }),
              ]}
            >
              — {scripture}
            </Text>
          )}
        </VStack>
      ) : quote !== '' ? (
        <Text
          modifiers={[
            font({ size: 13, weight: 'regular', design: 'serif' }),
            foregroundStyle('rgba(245,240,235,0.7)'),
          ]}
        >
          "{quote.length > 120 ? quote.slice(0, 118) + '...' : quote}"
        </Text>
      ) : null}

      <Spacer />

      {/* Weekly progress dots */}
      <HStack modifiers={[padding({ top: 6 })]}>
        {weekDays.map((dayLabel: string, i: number) => (
          <VStack key={dayLabel + i}>
            <Image
              systemName={weekBits[i] ? 'circle.fill' : 'circle'}
              size={10}
              color={weekBits[i] ? '#C8A55C' : 'rgba(245,240,235,0.2)'}
            />
            <Text
              modifiers={[
                font({ size: 8, weight: 'regular' }),
                foregroundStyle('rgba(245,240,235,0.3)'),
              ]}
            >
              {dayLabel}
            </Text>
          </VStack>
        ))}
      </HStack>

      <Divider modifiers={[opacity(0.1), padding({ top: 6, bottom: 6 })]} />

      {/* Footer: reading time + next reading */}
      <HStack>
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

        <Spacer />

        {nextTitle !== '' && (
          <HStack>
            <Text
              modifiers={[
                font({ size: 10, weight: 'regular' }),
                foregroundStyle('rgba(245,240,235,0.3)'),
              ]}
            >
              Next:
            </Text>
            <Text
              modifiers={[
                font({ size: 10, weight: 'medium' }),
                foregroundStyle('rgba(245,240,235,0.45)'),
              ]}
            >
              {nextTitle.length > 20 ? nextTitle.slice(0, 18) + '...' : nextTitle}
            </Text>
          </HStack>
        )}
      </HStack>
    </VStack>
  );
};

export default createWidget('UnfoldDashboard', DashboardWidget);
