/**
 * Unfold Streak Widget — systemSmall + accessoryCircular
 * Shows current reading streak with a flame icon.
 * Designed for quick glances that motivate daily reading.
 *
 * WIDGET RUNTIME CONTRACT: the component body is serialized by
 * babel-preset-expo's widgets-plugin and re-evaluated inside the widget
 * extension's JS runtime. Only `props`, `environment`, and locals defined
 * INSIDE the function exist there — module-scope constants are NOT captured.
 * Keep palettes and URLs inside the function body.
 */
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
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
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';

type StreakWidgetProps = {
  streakCount: number;
  streakLongest: number;
  hasReadToday: boolean;
  devotionalTitle: string;
  dayNumber: number;
  totalDays: number;
};

const StreakWidget = (
  props: StreakWidgetProps,
  environment: WidgetEnvironment
) => {
  'widget';

  const streak = props.streakCount ?? 0;
  const hasRead = props.hasReadToday ?? false;
  const title = props.devotionalTitle ?? 'Start your series';
  const day = props.dayNumber ?? 0;
  const total = props.totalDays ?? 0;

  // Tap target: Today tab (no params — bare tab link cannot re-anchor the
  // active series). Matches push-notification-helpers' canonical route.
  const deepLink = 'unfold://(tabs)/(today)';

  // System-appearance palette. Dark = original shipped values; light mirrors
  // src/constants/colors.ts LightColors (keep in sync by hand — module-scope
  // imports are unavailable inside 'widget' functions). Unknown scheme → dark.
  const isLight = environment.colorScheme === 'light';
  const c = isLight
    ? {
        bg: '#FAF7F2',
        text: '#1C1710',
        textMuted: 'rgba(28,23,16,0.68)',
        textSubtle: 'rgba(28,23,16,0.55)',
        accent: '#866B2F',
      }
    : {
        bg: '#0A0A0A',
        text: '#F5F0EB',
        textMuted: 'rgba(245,240,235,0.5)',
        textSubtle: 'rgba(245,240,235,0.35)',
        accent: '#C8A55C',
      };

  if (environment.widgetFamily === 'accessoryCircular') {
    // Lock screen circular — use hierarchical styles for system tinting
    return (
      <ZStack
        modifiers={[
          accessibilityLabel(`${streak} day streak`),
          widgetURL(deepLink),
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
        background(c.bg),
        accessibilityLabel(
          `${streak} day reading streak. ${hasRead ? 'Read today.' : 'Not yet read today.'}`
        ),
        widgetURL(deepLink),
      ]}
    >
      {/* Streak number — hero element */}
      <VStack modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}>
        <HStack>
          <Image
            systemName={hasRead ? 'flame.fill' : 'flame'}
            size={18}
            color={c.accent}
          />
          <Text
            modifiers={[
              font({ size: 11, weight: 'medium' }),
              foregroundStyle(hasRead ? c.accent : c.textMuted),
              padding({ leading: 2 }),
            ]}
          >
            {hasRead ? 'day streak' : 'read today'}
          </Text>
        </HStack>

        <Text
          modifiers={[
            font({ size: 40, weight: 'bold', design: 'rounded' }),
            foregroundStyle(c.text),
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
              foregroundStyle(c.textMuted),
            ]}
          >
            Day {day} of {total}
          </Text>
        )}

        <Text
          modifiers={[
            font({ size: 11, weight: 'regular' }),
            foregroundStyle(c.textSubtle),
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
