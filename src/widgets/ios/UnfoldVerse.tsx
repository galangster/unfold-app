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
  scriptureReference: string;
  dayNumber: number;
  totalDays: number;
  hasReadToday: boolean;
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

  const verse = props.lockLine ?? '';
  const reference = props.scriptureReference ?? '';
  const day = props.dayNumber ?? 0;
  const total = props.totalDays ?? 0;
  const hasRead = props.hasReadToday ?? false;
  const hasVerse = verse !== '';

  // Tap target: Today tab, the same canonical route as the other widgets.
  const deepLink = 'unfold://(tabs)/(today)';

  const emptyLabel = 'Open Unfold to start a series.';
  // No second stop when the line already ends a sentence or with an ellipsis.
  const verseStop = '.!?…”’'.includes(verse.slice(-1)) ? '' : '.';
  const verseLabel = `Today's verse: ${verse}${verseStop}${reference !== '' ? ` ${reference}.` : ''}`;

  if (environment.widgetFamily === 'accessoryInline') {
    // One line in the system font: the book symbol and the reference.
    return (
      <HStack
        modifiers={[
          accessibilityElement('ignore'),
          accessibilityLabel(hasVerse ? verseLabel : emptyLabel),
          widgetURL(deepLink),
        ]}
      >
        <Image systemName="book" size={15} />
        <Text>{hasVerse && reference !== '' ? reference : 'Unfold'}</Text>
      </HStack>
    );
  }

  if (environment.widgetFamily === 'accessoryRectangular') {
    // The Lock Screen gives this family about 143×56 pt of content (iOS 27,
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
          accessibilityLabel(hasVerse ? verseLabel : emptyLabel),
          widgetURL(deepLink),
        ]}
      >
        {hasVerse && (
          <Text
            modifiers={[
              font({ family: F.serif, size: 12 }),
              lineHeight(14),
              foregroundStyle({ type: 'hierarchical', style: 'primary' }),
              lineLimit(3),
              minimumScaleFactor(0.8),
            ]}
          >
            {verse}
          </Text>
        )}
        {hasVerse && reference !== '' && (
          <Text
            modifiers={[
              font({ family: F.uiSemi, size: 8.5 }),
              kerning(0.8),
              foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
              lineLimit(1),
            ]}
          >
            {reference.toUpperCase()}
          </Text>
        )}
        {!hasVerse && (
          <Text
            modifiers={[
              font({ family: F.uiMedium, size: 11 }),
              foregroundStyle({ type: 'hierarchical', style: 'primary' }),
              lineLimit(2),
            ]}
          >
            Open Unfold to start a series
          </Text>
        )}
      </VStack>
    );
  }

  // accessoryCircular — the series day inside a capacity ring. The ring counts
  // finished days: the days before today, plus today once it is read. The
  // widget runtime drops a Gauge's value label (expo-widgets renders no slots),
  // so the day is an overlay, sized to sit clear of the ring's inner edge.
  const hasSeries = day > 0;
  const shownDay = total > 0 ? Math.min(day, total) : day;
  const progress =
    total > 0 ? Math.min(1, Math.max(0, (day - 1 + (hasRead ? 1 : 0)) / total)) : 0;
  return (
    <ZStack
      modifiers={[
        accessibilityElement('ignore'),
        accessibilityLabel(
          hasSeries
            ? `Series day ${shownDay}${total > 0 ? ` of ${total}` : ''}. ${hasRead ? 'Read today.' : 'Not yet read today.'}`
            : emptyLabel
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
            modifiers={[
              font({ family: F.display, size: 20 }),
              foregroundStyle({ type: 'hierarchical', style: 'primary' }),
              lineLimit(1),
              minimumScaleFactor(0.6),
            ]}
          >
            {shownDay}
          </Text>
          {total > 0 && (
            <Text
              modifiers={[
                font({ family: F.uiMedium, size: 7.5 }),
                foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                lineLimit(1),
              ]}
            >
              of {total}
            </Text>
          )}
        </VStack>
      )}
      {!hasSeries && (
        <Image
          systemName="book"
          size={20}
          modifiers={[foregroundStyle({ type: 'hierarchical', style: 'primary' })]}
        />
      )}
    </ZStack>
  );
};

export default createWidget('UnfoldVerse', VerseWidget);
