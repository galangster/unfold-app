import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';
import { BookOpenIcon, BookmarkSimpleIcon, CaretRightIcon } from 'phosphor-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize as FontSizeTokens } from '@/constants/fonts';
import { BIBLE_STUDY_METHODS } from '@/constants/bible-study-methods';
import { useTheme } from '@/lib/theme';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { useReadingFont } from '@/lib/useReadingFont';
import { DevotionalDay, FONT_SIZE_VALUES, FontSize, Highlight } from '@/lib/store';
import { preventOrphan } from '@/lib/cn';
import { fetchVerseLocal, fetchVerse } from '@/lib/bible-api';
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
  onStudyMethodPress?: (methodId: string) => void;
  scrollViewRef?: RefObject<KeyboardAwareScrollViewRef | null>;
}

/**
 * Elegant section divider -- three centered dots with fine rules on each side.
 * Used between major content sections for a book-like feel.
 */
function SectionDivider({ color, style }: { color: string; style?: object }) {
  return (
    <View style={[dcStyles.dividerContainer, style]}>
      <View style={[dcStyles.dividerLine, { backgroundColor: color }]} />
      <Text style={[dcStyles.dividerDots, { color }]}>
        {'···'}
      </Text>
      <View style={[dcStyles.dividerLine, { backgroundColor: color }]} />
    </View>
  );
}

/**
 * Ornamental header with decorative lines flanking a centered label.
 * Used for "FOR REFLECTION" and "A PRAYER" section headers.
 */
function OrnamentalHeader({ label, accentColor }: { label: string; accentColor: string }) {
  return (
    <View style={dcStyles.ornamentalRow}>
      <View style={[dcStyles.ornamentalLine, { backgroundColor: accentColor }]} />
      <Text style={[dcStyles.ornamentalLabel, { color: accentColor }]}>
        {label}
      </Text>
      <View style={[dcStyles.ornamentalLine, { backgroundColor: accentColor }]} />
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
  onStudyMethodPress,
  scrollViewRef,
}: DevotionalContentProps) {
  const { colors, isDark } = useTheme();
  const fontSizes = FONT_SIZE_VALUES[fontSize];
  const readingFont = useReadingFont();

  // Fetch scripture with verse numbers from local DB, fallback to remote API
  const [versedScripture, setVersedScripture] = useState<string | null>(null);
  useEffect(() => {
    if (!day.scriptureReference) return;
    fetchVerseLocal(day.scriptureReference).then(async (result) => {
      if (result?.text) {
        setVersedScripture(result.text);
      } else {
        // Fallback to remote API when Bible DB not downloaded
        try {
          const remote = await fetchVerse(day.scriptureReference, 'web');
          if (remote?.text) setVersedScripture(remote.text);
        } catch {
          // Silently fall back to AI text
        }
      }
    }).catch(() => {
      // Silently fall back to AI text
    });
  }, [day.scriptureReference]);

  const displayScripture = versedScripture ?? day.scriptureText;

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

  // Bookmark spring animation — critically-damped scale
  const bookmarkScale = useSharedValue(1);

  const handleBookmarkPress = useCallback(() => {
    bookmarkScale.value = 0.8;
    bookmarkScale.value = withSpring(1, { damping: 20, stiffness: 300 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onToggleBookmark?.();
  }, [onToggleBookmark, bookmarkScale]);

  const bookmarkAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bookmarkScale.value }],
  }));

  // Subtle scripture background tint (accent at 4% opacity)
  const scriptureBgColor = isDark
    ? `${colors.accent}0A`  // ~4% opacity on dark
    : `${colors.accent}08`; // ~3% opacity on light

  return (
    <>
      {/* Day title — fontSize is dynamic so keep inline */}
      <Text
        {...(titleSharedTransitionTag ? { sharedTransitionTag: titleSharedTransitionTag } : {})}
        style={[
          dcStyles.dayTitle,
          {
            fontSize: fontSizes.title,
            color: colors.text,
            lineHeight: fontSizes.title * 1.2,
          },
        ]}
      >
        {day.title}
      </Text>

      {/* Accent line -- grows in from zero */}
      <Animated.View
        style={[
          dcStyles.accentLine,
          {
            backgroundColor: colors.accent,
            marginBottom: day.studyMethod ? 16 : 28,
          },
          accentLineStyle,
        ]}
      />

      {/* Study method row — tappable to open method info sheet */}
      {day.studyMethod && BIBLE_STUDY_METHODS[day.studyMethod] && (
        <TouchableOpacity
          style={[dcStyles.methodRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }]}
          onPress={() => onStudyMethodPress?.(day.studyMethod!)}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={`Study method: ${BIBLE_STUDY_METHODS[day.studyMethod].name}. Tap for details.`}
        >
          <Text style={[dcStyles.methodName, { color: colors.textSubtle }]}>
            {BIBLE_STUDY_METHODS[day.studyMethod].name}
          </Text>
          <CaretRightIcon size={14} color={colors.textMuted} weight="light" />
        </TouchableOpacity>
      )}

      {/* Scripture block */}
      <View
        style={[
          dcStyles.scriptureBlock,
          {
            borderLeftColor: colors.accent,
            backgroundColor: scriptureBgColor,
          },
        ]}
      >
        {/* Reference + bookmark */}
        <View style={dcStyles.scriptureRefRow}>
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onScriptureTap?.(day.scriptureReference);
            }}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Text style={[dcStyles.scriptureRef, { color: colors.accent }]}>
              {day.scriptureReference}
            </Text>
          </TouchableOpacity>

          {onToggleBookmark && (
            <TouchableOpacity activeOpacity={0.7}
              onPress={handleBookmarkPress}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
              style={dcStyles.bookmarkButton}
            >
              <Animated.View style={bookmarkAnimStyle}>
                <BookmarkSimpleIcon
                  size={15}
                  color={isBookmarked ? colors.accent : colors.textSubtle}
                  weight={isBookmarked ? "fill" : "regular"}
                />
              </Animated.View>
            </TouchableOpacity>
          )}
        </View>

        {/* Scripture text — fontSize is dynamic */}
        <Text
          style={{
            fontFamily: readingFont.bodyItalic,
            fontSize: fontSizes.scripture,
            color: colors.textMuted,
            lineHeight: fontSizes.scripture * 1.75,
            textAlign: 'left',
            minHeight: displayScripture ? 'auto' : 60,
          }}
        >
          {displayScripture ? `\u201C${preventOrphan(displayScripture)}\u201D` : `Scripture text not available for ${day.scriptureReference || 'this passage'}.`}
        </Text>
      </View>

      {/* Section divider: scripture -> body */}
      <SectionDivider color={colors.textMuted} style={{ marginTop: 20, marginBottom: 8 }} />

      <DevotionalWebView
        day={day}
        fontSize={fontSize}
        onQuoteSelected={onQuoteSelected}
        existingHighlights={existingHighlights}
        onScriptureTap={onScriptureTap}
        devotionalId={devotionalId}
        dayNumber={dayNumber}
        dayTitle={day.title}
      />

      {/* Cross References Section */}
      {day.crossReferences && day.crossReferences.length > 0 && (
        <View style={dcStyles.crossRefSection}>
          <View style={dcStyles.crossRefHeader}>
            <BookOpenIcon size={15} color={colors.accent} weight="light" />
            <Text style={[dcStyles.crossRefLabel, { color: colors.accent }]}>
              Related Scripture
            </Text>
          </View>
          {day.crossReferences.map((ref) => (
            <View key={ref.reference} style={dcStyles.crossRefItem}>
              <TouchableOpacity
                activeOpacity={0.6}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onScriptureTap?.(ref.reference);
                }}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <Text style={[dcStyles.crossRefReference, { color: colors.accent }]}>
                  {ref.reference}
                </Text>
              </TouchableOpacity>
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

      {/* Reflection Questions Section */}
      {day.reflectionQuestions && day.reflectionQuestions.length > 0 && (
        <>
          <SectionDivider color={colors.textMuted} style={{ marginTop: 48, marginBottom: 32 }} />

          {devotionalId && dayNumber && onOpenJournal ? (
            <InlineReflectionJournal
              questions={day.reflectionQuestions}
              devotionalId={devotionalId}
              dayNumber={dayNumber}
              onOpenFullJournal={onOpenJournal}
              fontSize={fontSize}
              scrollViewRef={scrollViewRef}
            />
          ) : (
            <View>
              <OrnamentalHeader label="For Reflection" accentColor={colors.accent} />
              {day.reflectionQuestions.map((question, index) => (
                <View key={question} style={dcStyles.reflectionItem}>
                  <View style={dcStyles.reflectionRow}>
                    <Text
                      style={[
                        dcStyles.reflectionNumber,
                        {
                          fontSize: fontSizes.body + 2,
                          color: colors.accent,
                        },
                      ]}
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

      {/* Closing Prayer Section */}
      {day.closingPrayer && (
        <View style={dcStyles.prayerSection}>
          <SectionDivider color={colors.textMuted} style={{ marginTop: 0, marginBottom: 32 }} />
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

const dcStyles = StyleSheet.create({
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing['10'],
    paddingHorizontal: Spacing['10'],
  },
  dividerLine: {
    flex: 1,
    height: 0.5,
    opacity: 0.2,
  },
  dividerDots: {
    fontSize: FontSizeTokens.xs,
    opacity: 0.35,
    letterSpacing: 6,
    marginHorizontal: Spacing['4'],
  },
  ornamentalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing['7'],
  },
  ornamentalLine: {
    width: 32,
    height: 0.5,
    opacity: 0.4,
  },
  ornamentalLabel: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 10,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginHorizontal: 14,
    opacity: 0.75,
  },
  dayTitle: {
    fontFamily: FontFamily.display,
    marginBottom: Spacing['5'],
    letterSpacing: -0.5,
  },
  accentLine: {
    height: 1.5,
    borderRadius: 1,
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Radius.sm,
    paddingVertical: 10,
    paddingHorizontal: Spacing['3'],
    marginBottom: Spacing['5'],
  },
  methodName: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    flex: 1,
  },
  scriptureBlock: {
    borderLeftWidth: 2.5,
    paddingLeft: 18,
    paddingRight: 14,
    paddingVertical: Spacing['4'],
    marginBottom: Spacing['2'],
    borderRadius: 4,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  scriptureRefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: Spacing['2.5'],
  },
  scriptureRef: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 10.5,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  bookmarkButton: {
    padding: 4,
  },
  crossRefSection: {
    marginTop: 44,
  },
  crossRefHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing['4'],
  },
  crossRefLabel: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 10.5,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginLeft: 10,
  },
  crossRefItem: {
    marginBottom: Spacing['5'],
    paddingLeft: 4,
  },
  crossRefReference: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 10.5,
    letterSpacing: 1.2,
    marginBottom: 8,
    opacity: 0.7,
  },
  reflectionItem: {
    marginBottom: Spacing['6'],
    paddingLeft: Spacing['5'],
    paddingRight: Spacing['2'],
  },
  reflectionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  reflectionNumber: {
    fontFamily: FontFamily.display,
    opacity: 0.5,
    marginRight: Spacing['3'],
    marginTop: 1,
    minWidth: 16,
  },
  prayerSection: {
    marginTop: Spacing['12'],
  },
});
