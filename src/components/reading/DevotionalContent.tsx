import { useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { BookOpenIcon, BookmarkSimpleIcon } from 'phosphor-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useReadingFont } from '@/lib/useReadingFont';
import { DevotionalDay, FONT_SIZE_VALUES, FontSize, Highlight } from '@/lib/store';
import { preventOrphan } from '@/lib/cn';
import { DevotionalWebView } from './DevotionalWebView';
import { InlineReflectionJournal } from './InlineReflectionJournal';

interface DevotionalContentProps {
  day: DevotionalDay;
  fontSize: FontSize;
  titleSharedTransitionTag?: string;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  onQuoteSelected?: (quote: { text: string; context: string }) => void;
  existingHighlights?: Highlight[];
  onScriptureTap?: (reference: string) => void;
  devotionalId?: string;
  dayNumber?: number;
  onOpenJournal?: (focusQuestion?: number) => void;
}

/**
 * Elegant section divider -- three centered dots with fine rules on each side.
 * Used between major content sections for a book-like feel.
 */
function SectionDivider({ color, style }: { color: string; style?: object }) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          marginVertical: 40,
          paddingHorizontal: 40,
        },
        style,
      ]}
    >
      <View style={{ flex: 1, height: 0.5, backgroundColor: color, opacity: 0.2 }} />
      <Text
        style={{
          fontSize: 12,
          color,
          opacity: 0.35,
          letterSpacing: 6,
          marginHorizontal: 16,
        }}
      >
        {'···'}
      </Text>
      <View style={{ flex: 1, height: 0.5, backgroundColor: color, opacity: 0.2 }} />
    </View>
  );
}

/**
 * Ornamental header with decorative lines flanking a centered label.
 * Used for "FOR REFLECTION" and "A PRAYER" section headers.
 */
function OrnamentalHeader({ label, accentColor }: { label: string; accentColor: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 28,
      }}
    >
      <View style={{ width: 32, height: 0.5, backgroundColor: accentColor, opacity: 0.4 }} />
      <Text
        style={{
          fontFamily: FontFamily.uiMedium,
          fontSize: 10,
          color: accentColor,
          letterSpacing: 2.5,
          textTransform: 'uppercase',
          textAlign: 'center',
          marginHorizontal: 14,
          opacity: 0.75,
        }}
      >
        {label}
      </Text>
      <View style={{ width: 32, height: 0.5, backgroundColor: accentColor, opacity: 0.4 }} />
    </View>
  );
}

export function DevotionalContent({
  day,
  fontSize,
  titleSharedTransitionTag,
  isBookmarked,
  onToggleBookmark,
  onQuoteSelected,
  existingHighlights,
  onScriptureTap,
  devotionalId,
  dayNumber,
  onOpenJournal,
}: DevotionalContentProps) {
  const { colors, isDark } = useTheme();
  const fontSizes = FONT_SIZE_VALUES[fontSize];
  const readingFont = useReadingFont();

  // Accent line grow animation -- editorial entrance
  const accentLineWidth = useSharedValue(0);
  useEffect(() => {
    accentLineWidth.value = withDelay(
      200,
      withTiming(36, { duration: 600, easing: Easing.out(Easing.cubic) })
    );
  }, [accentLineWidth]);

  const accentLineStyle = useAnimatedStyle(() => ({
    width: accentLineWidth.value,
  }));

  const handleBookmarkPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggleBookmark?.();
  }, [onToggleBookmark]);

  // Subtle scripture background tint (accent at 4% opacity)
  const scriptureBgColor = isDark
    ? `${colors.accent}0A`  // ~4% opacity on dark
    : `${colors.accent}08`; // ~3% opacity on light

  return (
    <>
      {/* Day title */}
      <Text
        {...(titleSharedTransitionTag ? { sharedTransitionTag: titleSharedTransitionTag } : {})}
        style={{
          fontFamily: FontFamily.display,
          fontSize: fontSizes.title,
          color: colors.text,
          lineHeight: fontSizes.title * 1.2,
          marginBottom: 20,
          letterSpacing: -0.5,
        }}
      >
        {day.title}
      </Text>

      {/* Accent line -- grows in from zero */}
      <Animated.View
        style={[
          {
            height: 1.5,
            backgroundColor: colors.accent,
            marginBottom: 28,
            borderRadius: 1,
          },
          accentLineStyle,
        ]}
      />

      {/* Scripture block -- accent border + subtle background tint */}
      <View
        style={{
          borderLeftWidth: 2.5,
          borderLeftColor: colors.accent,
          paddingLeft: 18,
          paddingRight: 14,
          paddingVertical: 16,
          marginBottom: 8,
          backgroundColor: scriptureBgColor,
          borderRadius: 4,
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
        }}
      >
        {/* Reference + bookmark -- refined small-caps style */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 }}>
          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: 10.5,
              color: colors.accent,
              letterSpacing: 2,
              textTransform: 'uppercase',
            }}
          >
            {day.scriptureReference}
          </Text>

          {onToggleBookmark && (
            <TouchableOpacity activeOpacity={0.7}
              onPress={handleBookmarkPress}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
              style={{ padding: 4 }}
            >
              <BookmarkSimpleIcon
                size={15}
                color={isBookmarked ? colors.accent : colors.textSubtle}
                weight={isBookmarked ? "fill" : "regular"}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Scripture text -- generous line-height for readability */}
        <Text
          style={{
            fontFamily: readingFont.bodyItalic,
            fontSize: fontSizes.scripture,
            color: colors.textMuted,
            lineHeight: fontSizes.scripture * 1.75,
            textAlign: 'left',
            minHeight: day.scriptureText ? 'auto' : 60,
          }}
        >
          {day.scriptureText ? `\u201C${preventOrphan(day.scriptureText)}\u201D` : `Scripture text not available for ${day.scriptureReference || 'this passage'}.`}
        </Text>
      </View>

      {/* Section divider: scripture -> body */}
      <SectionDivider color={colors.textMuted} style={{ marginTop: 20, marginBottom: 8 }} />

      {/* Body text, quotes, and related content - WEBVIEW (selectable for quotes) */}
      <DevotionalWebView
        day={day}
        fontSize={fontSize}
        onQuoteSelected={onQuoteSelected}
        existingHighlights={existingHighlights}
        onScriptureTap={onScriptureTap}
      />

      {/* Cross References Section - NATIVE (structured) */}
      {day.crossReferences && day.crossReferences.length > 0 && (
        <View style={{ marginTop: 44 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <BookOpenIcon size={15} color={colors.accent} weight="light" />
            <Text
              style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: 10.5,
                color: colors.accent,
                letterSpacing: 1.8,
                textTransform: 'uppercase',
                marginLeft: 10,
              }}
            >
              Related Scripture
            </Text>
          </View>
          {day.crossReferences.map((ref, index) => (
            <View
              key={index}
              style={{
                marginBottom: 20,
                paddingLeft: 4,
              }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.uiMedium,
                  fontSize: 10.5,
                  color: colors.accent,
                  letterSpacing: 1.2,
                  marginBottom: 8,
                  opacity: 0.7,
                }}
              >
                {ref.reference}
              </Text>
              <Text
                style={{
                  fontFamily: readingFont.bodyItalic,
                  fontSize: fontSizes.body - 1,
                  color: colors.textMuted,
                  lineHeight: (fontSizes.body - 1) * 1.7,
                }}
              >
                {`\u201C${preventOrphan(ref.text)}\u201D`}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Reflection Questions Section — Interactive inline journal */}
      {day.reflectionQuestions && day.reflectionQuestions.length > 0 && (
        <>
          {/* Section divider */}
          <SectionDivider color={colors.textMuted} style={{ marginTop: 48, marginBottom: 32 }} />

          {devotionalId && dayNumber && onOpenJournal ? (
            <InlineReflectionJournal
              questions={day.reflectionQuestions}
              devotionalId={devotionalId}
              dayNumber={dayNumber}
              onOpenFullJournal={onOpenJournal}
            />
          ) : (
            /* Fallback: static display if no journal context */
            <View style={{ marginTop: 0 }}>
              <OrnamentalHeader label="For Reflection" accentColor={colors.accent} />
              {day.reflectionQuestions.map((question, index) => (
                <View
                  key={index}
                  style={{ marginBottom: 24, paddingLeft: 20, paddingRight: 8 }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <Text
                      style={{
                        fontFamily: FontFamily.display,
                        fontSize: fontSizes.body + 2,
                        color: colors.accent,
                        opacity: 0.5,
                        marginRight: 12,
                        marginTop: 1,
                        minWidth: 16,
                      }}
                    >
                      {index + 1}
                    </Text>
                    <Text
                      style={{
                        fontFamily: readingFont.bodyItalic,
                        fontSize: fontSizes.body,
                        color: colors.text,
                        lineHeight: fontSizes.body * 1.7,
                        flex: 1,
                        opacity: 0.9,
                      }}
                    >
                      {preventOrphan(question)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {/* Closing Prayer Section - NATIVE (structured) */}
      {day.closingPrayer && (
        <View style={{ marginTop: 48 }}>
          {/* Section divider */}
          <SectionDivider color={colors.textMuted} style={{ marginTop: 0, marginBottom: 32 }} />

          {/* Ornamental header: --- A PRAYER --- */}
          <OrnamentalHeader label="A Prayer" accentColor={colors.accent} />

          <Text
            style={{
              fontFamily: readingFont.bodyItalic,
              fontSize: fontSizes.body,
              color: colors.text,
              lineHeight: fontSizes.body * 1.8,
              textAlign: 'center',
              paddingHorizontal: 16,
              opacity: 0.9,
            }}
          >
            {preventOrphan(day.closingPrayer)}
          </Text>
        </View>
      )}
    </>
  );
}
