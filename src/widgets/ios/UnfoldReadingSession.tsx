/**
 * Unfold Reading Session — Live Activity
 * Appears on Lock Screen and Dynamic Island when the user is actively
 * reading or listening to a devotional. Shows title, elapsed time,
 * and progress through the reading.
 */
import { createLiveActivity, LiveActivityLayout } from 'expo-widgets';
import { Text, VStack, HStack, Image, Spacer } from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  frame,
  padding,
} from '@expo/ui/swift-ui/modifiers';

type ReadingSessionProps = {
  devotionalTitle: string;
  dayTitle: string;
  dayNumber: number;
  totalDays: number;
  elapsedMinutes: number;
  totalMinutes: number;
  isListening: boolean;
  streakCount: number;
};

const ReadingSession = (props?: ReadingSessionProps): LiveActivityLayout => {
  'widget';

  const title = props?.devotionalTitle ?? 'Unfold';
  const dayTitle = props?.dayTitle ?? 'Reading...';
  const day = props?.dayNumber ?? 1;
  const total = props?.totalDays ?? 7;
  const elapsed = props?.elapsedMinutes ?? 0;
  const totalMin = props?.totalMinutes ?? 5;
  const isListening = props?.isListening ?? false;
  const streak = props?.streakCount ?? 0;

  const progressPercent = totalMin > 0 ? Math.min(Math.round((elapsed / totalMin) * 100), 100) : 0;

  return {
    // Lock Screen banner
    banner: (
      <VStack modifiers={[padding({ all: 14 })]}>
        <HStack>
          <VStack>
            <Text
              modifiers={[
                font({ size: 10, weight: 'semibold' }),
                foregroundStyle('#C8A55C'),
              ]}
            >
              {title.toUpperCase()}
            </Text>
            <Text
              modifiers={[
                font({ size: 15, weight: 'semibold' }),
                foregroundStyle('#F5F0EB'),
              ]}
            >
              {dayTitle}
            </Text>
            <Text
              modifiers={[
                font({ size: 11, weight: 'regular' }),
                foregroundStyle('rgba(245,240,235,0.5)'),
              ]}
            >
              Day {day} of {total}
            </Text>
          </VStack>

          <Spacer />

          <VStack>
            <Image
              systemName={isListening ? 'waveform' : 'book.fill'}
              size={18}
              color="#C8A55C"
            />
            <Text
              modifiers={[
                font({ size: 20, weight: 'bold', design: 'rounded' }),
                foregroundStyle('#F5F0EB'),
              ]}
            >
              {elapsed}m
            </Text>
          </VStack>
        </HStack>

        {/* Progress indicator */}
        <HStack modifiers={[padding({ top: 8 })]}>
          <Text
            modifiers={[
              font({ size: 10, weight: 'medium' }),
              foregroundStyle('rgba(245,240,235,0.4)'),
            ]}
          >
            {progressPercent}%
          </Text>
          <Spacer />
          <HStack>
            <Image
              systemName="flame.fill"
              size={10}
              color="#C8A55C"
            />
            <Text
              modifiers={[
                font({ size: 10, weight: 'semibold' }),
                foregroundStyle('#C8A55C'),
              ]}
            >
              {streak}
            </Text>
          </HStack>
        </HStack>
      </VStack>
    ),

    // Dynamic Island — compact leading (left pill)
    compactLeading: (
      <Image
        systemName={isListening ? 'waveform' : 'book.fill'}
        size={12}
        color="#C8A55C"
      />
    ),

    // Dynamic Island — compact trailing (right pill)
    compactTrailing: (
      <Text
        modifiers={[
          font({ size: 12, weight: 'semibold', design: 'rounded' }),
          foregroundStyle('#F5F0EB'),
        ]}
      >
        {elapsed}m
      </Text>
    ),

    // Dynamic Island — minimal (when multiple activities active)
    minimal: (
      <Image
        systemName="book.fill"
        size={10}
        color="#C8A55C"
      />
    ),

    // Dynamic Island — expanded center
    expandedCenter: (
      <VStack>
        <Text
          modifiers={[
            font({ size: 13, weight: 'semibold' }),
            foregroundStyle('#F5F0EB'),
          ]}
        >
          {dayTitle}
        </Text>
      </VStack>
    ),

    // Dynamic Island — expanded leading
    expandedLeading: (
      <Image
        systemName={isListening ? 'waveform' : 'book.fill'}
        size={22}
        color="#C8A55C"
      />
    ),

    // Dynamic Island — expanded trailing
    expandedTrailing: (
      <VStack>
        <Text
          modifiers={[
            font({ size: 18, weight: 'bold', design: 'rounded' }),
            foregroundStyle('#F5F0EB'),
          ]}
        >
          {elapsed}m
        </Text>
        <Text
          modifiers={[
            font({ size: 10, weight: 'regular' }),
            foregroundStyle('rgba(245,240,235,0.4)'),
          ]}
        >
          of {totalMin}m
        </Text>
      </VStack>
    ),

    // Dynamic Island — expanded bottom
    expandedBottom: (
      <HStack modifiers={[padding({ top: 4 })]}>
        <Text
          modifiers={[
            font({ size: 11, weight: 'regular' }),
            foregroundStyle('rgba(245,240,235,0.5)'),
          ]}
        >
          {title} — Day {day} of {total}
        </Text>
        <Spacer />
        <HStack>
          <Image
            systemName="flame.fill"
            size={10}
            color="#C8A55C"
          />
          <Text
            modifiers={[
              font({ size: 11, weight: 'semibold' }),
              foregroundStyle('#C8A55C'),
            ]}
          >
            {streak}
          </Text>
        </HStack>
      </HStack>
    ),
  };
};

export default createLiveActivity('UnfoldReadingSession', ReadingSession);
