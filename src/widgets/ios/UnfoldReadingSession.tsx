/**
 * Unfold Reading Session — Live Activity
 * Appears on Lock Screen and Dynamic Island when the user is actively
 * reading or listening to a devotional. Shows title, elapsed time,
 * and progress through the reading.
 */
import { createLiveActivity, type LiveActivityLayout } from 'expo-widgets';
import { Text, VStack, HStack, Image, Spacer, ProgressView } from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  padding,
  frame,
  tint,
  activityBackgroundTint,
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

const ReadingSession = (props: ReadingSessionProps): LiveActivityLayout => {
  'widget';

  // App type, PostScript names (extension bundles these; see ExpoWidgetsTarget
  // Info.plist UIAppFonts). Custom families ignore `weight`, so pick the face.
  const F = {
    display: 'PPEditorialNew-Light',
    ui: 'Inter-Regular',
    uiMedium: 'Inter-Medium',
    uiSemi: 'Inter-SemiBold',
    serif: 'SourceSerifPro-Regular',
  };

  const title = props.devotionalTitle ?? 'Unfold';
  const dayTitle = props.dayTitle ?? 'Reading...';
  const day = props.dayNumber ?? 1;
  const total = props.totalDays ?? 7;
  const elapsed = props.elapsedMinutes ?? 0;
  const totalMin = props.totalMinutes ?? 5;
  const isListening = props.isListening ?? false;
  const streak = props.streakCount ?? 0;

  const progressPercent = totalMin > 0 ? Math.min(Math.round((elapsed / totalMin) * 100), 100) : 0;

  return {
    // Lock Screen banner. The palette is fixed dark ink, so pin the banner
    // background too — the default system material is light on light
    // wallpapers and the text vanished (widget audit 2026-09-09).
    banner: (
      <VStack
        modifiers={[
          padding({ all: 14 }),
          frame({ maxWidth: Infinity }),
          activityBackgroundTint('#0A0A0A'),
        ]}
      >
        <HStack>
          <VStack>
            <Text
              modifiers={[
                font({ family: F.uiSemi, size: 10 }),
                foregroundStyle('#C8A55C'),
              ]}
            >
              {title}
            </Text>
            <Text
              modifiers={[
                font({ family: F.display, size: 15 }),
                foregroundStyle('#F5F0EB'),
              ]}
            >
              {dayTitle}
            </Text>
            <Text
              modifiers={[
                font({ family: F.ui, size: 11 }),
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
                font({ family: F.display, size: 20 }),
                foregroundStyle('#F5F0EB'),
              ]}
            >
              {elapsed}m
            </Text>
          </VStack>
        </HStack>

        {/* Progress indicator */}
        <ProgressView
          value={progressPercent / 100}
          modifiers={[tint('#C8A55C'), padding({ top: 8 })]}
        />
        <HStack modifiers={[padding({ top: 4 })]}>
          <Text
            modifiers={[
              font({ family: F.uiMedium, size: 10 }),
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
                font({ family: F.uiSemi, size: 10 }),
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
          font({ family: F.display, size: 12 }),
          foregroundStyle('#F5F0EB'),
        ]}
      >
        {elapsed}m
      </Text>
    ),

    // Dynamic Island — minimal (when multiple activities active)
    minimal: (
      <Image
        systemName={isListening ? 'waveform' : 'book.fill'}
        size={10}
        color="#C8A55C"
      />
    ),

    // Dynamic Island — expanded center
    expandedCenter: (
      <VStack>
        <Text
          modifiers={[
            font({ family: F.uiSemi, size: 13 }),
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
            font({ family: F.display, size: 18 }),
            foregroundStyle('#F5F0EB'),
          ]}
        >
          {elapsed}m
        </Text>
        <Text
          modifiers={[
            font({ family: F.ui, size: 10 }),
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
            font({ family: F.ui, size: 11 }),
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
              font({ family: F.uiSemi, size: 11 }),
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
