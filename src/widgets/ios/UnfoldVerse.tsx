/**
 * Unfold Verse Widget — Lock Screen: accessoryInline, accessoryRectangular,
 * accessoryCircular. Shows one sentence of today's scripture and the series day.
 *
 * WIDGET RUNTIME CONTRACT: see UnfoldStreak.tsx — fonts and URLs must live
 * inside the function body. Keep backslash escapes out of the body too: the
 * serialized body is cooked as a template literal, which rewrites them.
 * The verse line is derived app-side (src/lib/widget-lock-line.ts) and
 * arrives as the lockLine prop.
 *
 * Lock Screen widgets render in the system's vibrant mode, so every style is
 * hierarchical (primary / secondary) instead of a palette color.
 */
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import {
  Text,
  VStack,
  HStack,
  ZStack,
  Image,
  Gauge,
  AccessoryWidgetBackground,
} from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  frame,
  lineLimit,
  lineHeight,
  kerning,
  minimumScaleFactor,
  gaugeStyle,
  accessibilityElement,
  accessibilityLabel,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';

type VerseWidgetProps = {
  lockLine: string;
  lockReference: string;
  lockDayNumber: number;
  lockDaysRead: number;
  lockReadToday: boolean;
  totalDays: number;
};

const VerseWidget = (props: VerseWidgetProps, environment: WidgetEnvironment) => {
  'widget';

  // App type, PostScript names (extension bundles these; see ExpoWidgetsTarget
  // Info.plist UIAppFonts). Custom families ignore `weight`, so pick the face.
  const F = {
    display: 'PPEditorialNew-Light',
    uiMedium: 'Inter-Medium',
    uiSemi: 'Inter-SemiBold',
    serif: 'SourceSerifPro-Regular',
  };
  const primary = foregroundStyle({ type: 'hierarchical', style: 'primary' });
  const secondary = foregroundStyle({ type: 'hierarchical', style: 'secondary' });

  const verse = props.lockLine ?? '';
  const reference = props.lockReference ?? '';
  const day = props.lockDayNumber ?? 0;
  const daysRead = props.lockDaysRead ?? 0;
  const total = props.totalDays ?? 0;
  const hasRead = props.lockReadToday ?? false;
  const hasVerse = verse !== '';
  const hasReference = reference !== '';
  const hasSeries = day > 0;

  // Tap target: Today tab, the same canonical route as the other widgets.
  const deepLink = 'unfold://(tabs)/(today)';

  // A series whose day has no text yet is not the same as no series.
  const emptyText = hasSeries ? "Open Unfold for today's reading" : 'Open Unfold to start a series';
  // No second stop when the line already ends a sentence, a quotation or a bracket.
  const verseStop = '.!?…”’")'.includes(verse.slice(-1)) ? '' : '.';
  const label = hasVerse
    ? `Today's verse: ${verse}${verseStop}${hasReference ? ` ${reference}.` : ''}`
    : `${emptyText}.`;

  if (environment.widgetFamily === 'accessoryInline') {
    // One line in the system font: the book symbol and the reference.
    return (
      <HStack
        modifiers={[accessibilityElement('ignore'), accessibilityLabel(label), widgetURL(deepLink)]}
      >
        <Image systemName="book" size={15} />
        <Text>{hasVerse && hasReference ? reference : 'Unfold'}</Text>
      </HStack>
    );
  }

  if (environment.widgetFamily === 'accessoryRectangular') {
    // The Lock Screen gives this family about 143x56 pt of content (iOS 27,
    // measured), so three lines of 12 pt serif on a 14 pt line height plus the
    // reference fill it (54 pt). Line height needs iOS 26; earlier iOS keeps
    // the serif's taller natural leading, so the verse scales down slightly
    // rather than lose its last line.
    return (
      <VStack
        alignment="leading"
        spacing={2}
        modifiers={[
          frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'leading' }),
          accessibilityElement('ignore'),
          accessibilityLabel(label),
          widgetURL(deepLink),
        ]}
      >
        {hasVerse && (
          <Text
            modifiers={[
              font({ family: F.serif, size: 12 }),
              lineHeight(14),
              primary,
              lineLimit(3),
              minimumScaleFactor(0.8),
            ]}
          >
            {verse}
          </Text>
        )}
        {hasVerse && hasReference && (
          <Text modifiers={[font({ family: F.uiSemi, size: 8.5 }), kerning(0.8), secondary, lineLimit(1)]}>
            {reference.toUpperCase()}
          </Text>
        )}
        {!hasVerse && (
          <Text modifiers={[font({ family: F.uiMedium, size: 11 }), primary, lineLimit(2)]}>
            {emptyText}
          </Text>
        )}
      </VStack>
    );
  }

  // accessoryCircular — the series day inside a capacity ring that fills with
  // the days the reader has finished. The widget runtime drops a Gauge's value
  // label (expo-widgets renders no slots), so the day is an overlay, sized to
  // sit clear of the ring's inner edge.
  const shownDay = total > 0 ? Math.min(day, total) : day;
  const progress = total > 0 ? Math.min(1, Math.max(0, daysRead / total)) : 0;
  return (
    <ZStack
      modifiers={[
        accessibilityElement('ignore'),
        accessibilityLabel(
          hasSeries
            ? `Series day ${shownDay}${total > 0 ? ` of ${total}` : ''}. ${hasRead ? 'Read today.' : 'Not yet read today.'}`
            : label
        ),
        widgetURL(deepLink),
      ]}
    >
      <AccessoryWidgetBackground />
      {hasSeries && total > 0 && (
        <Gauge value={progress} modifiers={[gaugeStyle('circularCapacity')]} />
      )}
      {hasSeries && (
        <VStack spacing={0}>
          <Text
            modifiers={[font({ family: F.display, size: 20 }), primary, lineLimit(1), minimumScaleFactor(0.6)]}
          >
            {shownDay}
          </Text>
          {total > 0 && (
            <Text modifiers={[font({ family: F.uiMedium, size: 7.5 }), secondary, lineLimit(1)]}>
              of {total}
            </Text>
          )}
        </VStack>
      )}
      {!hasSeries && <Image systemName="book" size={20} modifiers={[primary]} />}
    </ZStack>
  );
};

export default createWidget('UnfoldVerse', VerseWidget);
