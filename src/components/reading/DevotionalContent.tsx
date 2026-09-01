import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type LayoutChangeEvent, type ScrollView } from 'react-native';
import { BookOpenIcon, BookmarkSimpleIcon, CaretRightIcon } from '@/components/icons';
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
import { DevotionalDay, FONT_SIZE_VALUES, FontSize, Highlight, HighlightColor, Bookmark } from '@/lib/store';
import { preventOrphan, stripOuterQuotes } from '@/lib/cn';
import { fetchVerseLocal, fetchVerse } from '@/lib/bible-api';
import { DevotionalWebView } from './DevotionalWebView';
import { InlineReflectionJournal } from './InlineReflectionJournal';
import { getReflectionTypography } from '@/lib/reflection-typography';
import { Typography } from '@/constants/typography';

interface DevotionalContentProps {
  day: DevotionalDay;
  fontSize: FontSize;
  titleSharedTransitionTag?: string;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  onQuoteSelected?: (quote: { text: string; context: string }) => void;
  onHighlightRemoved?: (event: { text: string; color: HighlightColor; context: string }) => void;
  existingHighlights?: Highlight[];
  targetHighlight?: Highlight | null;
  onTargetHighlightLocated?: (contentY: number) => void;
  targetBookmark?: Bookmark | null;
  onTargetBookmarkLocated?: (contentY: number) => void;
  onScriptureTap?: (reference: string) => void;
  devotionalId?: string;
  dayNumber?: number;
  onOpenJournal?: (focusQuestion?: number) => void;
  onStudyMethodPress?: (methodId: string) => void;
  scrollViewRef?: RefObject<ScrollView | null>;
  onReflectionInputFocus?: (contentY: number) => void;
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
 * Section header for reader content blocks.
 */
function ReaderSectionHeader({ label, textColor }: { label: string; textColor: string }) {
  return (
    <View style={dcStyles.ornamentalRow}>
      <Text style={[dcStyles.ornamentalLabel, { color: textColor }]}>
        {label}
      </Text>
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
  onHighlightRemoved,
  existingHighlights,
  targetHighlight,
  onTargetHighlightLocated,
  targetBookmark,
  onTargetBookmarkLocated,
  onScriptureTap,
  devotionalId,
  dayNumber,
  onOpenJournal,
  onStudyMethodPress,
  scrollViewRef,
  onReflectionInputFocus,
}: DevotionalContentProps) {
  const { colors, isDark } = useTheme();
  const fontSizes = FONT_SIZE_VALUES[fontSize];
  const reflectionTypography = getReflectionTypography(fontSize);
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
  const scriptureBlockTopRef = useRef<number | null>(null);
  const devotionalWebViewTopRef = useRef(0);
  const locatedTopBookmarkRef = useRef<string | null>(null);
  const targetBookmarkIsWebViewContent = useMemo(() => {
    const reference = targetBookmark?.scriptureReference?.toLowerCase();
    return reference === 'quote' || reference === 'historical context' || reference === 'word study';
  }, [targetBookmark?.scriptureReference]);

  const handleDevotionalWebViewLayout = useCallback((event: LayoutChangeEvent) => {
    devotionalWebViewTopRef.current = event.nativeEvent.layout.y;
  }, []);

  const locateTopBookmark = useCallback((contentY: number) => {
    if (!targetBookmark || targetBookmarkIsWebViewContent) return;
    if (locatedTopBookmarkRef.current === targetBookmark.id) return;
    locatedTopBookmarkRef.current = targetBookmark.id;
    onTargetBookmarkLocated?.(contentY);
  }, [onTargetBookmarkLocated, targetBookmark, targetBookmarkIsWebViewContent]);

  const handleScriptureBlockLayout = useCallback((event: LayoutChangeEvent) => {
    const y = event.nativeEvent.layout.y;
    scriptureBlockTopRef.current = y;
    locateTopBookmark(y);
  }, [locateTopBookmark]);

  useEffect(() => {
    const scriptureBlockTop = scriptureBlockTopRef.current;
    if (scriptureBlockTop == null) return;
    locateTopBookmark(scriptureBlockTop);
  }, [locateTopBookmark]);

  const handleTargetHighlightLocated = useCallback((webViewY: number) => {
    onTargetHighlightLocated?.(devotionalWebViewTopRef.current + webViewY);
  }, [onTargetHighlightLocated]);

  const handleTargetBookmarkLocated = useCallback((webViewY: number) => {
    onTargetBookmarkLocated?.(devotionalWebViewTopRef.current + webViewY);
  }, [onTargetBookmarkLocated]);

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

  // Bookmark spring animation — clamped scale (damping 20 alone is ζ≈0.58; clamping enforces no-bounce)
  const bookmarkScale = useSharedValue(1);

  const handleBookmarkPress = useCallback(() => {
    bookmarkScale.value = 0.8;
    bookmarkScale.value = withSpring(1, { damping: 20, stiffness: 300, overshootClamping: true });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onToggleBookmark?.();
  }, [onToggleBookmark, bookmarkScale]);

  const bookmarkAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bookmarkScale.value }],
  }));

  // Editorial scripture frame: quiet horizontal rules instead of a side stripe.
  const scriptureRuleColor = isDark
    ? `${colors.accent}2E`  // ~18% opacity on dark
    : `${colors.accent}26`; // ~15% opacity on light

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
          style={[
            dcStyles.methodRow,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.045)',
              borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.08)',
            },
          ]}
          onPress={() => onStudyMethodPress?.(day.studyMethod!)}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={`Study method: ${BIBLE_STUDY_METHODS[day.studyMethod].name}. Tap for details.`}
        >
          <Text style={[dcStyles.methodName, { color: isDark ? colors.text : colors.textSubtle }]}>
            {BIBLE_STUDY_METHODS[day.studyMethod].name}
          </Text>
          <CaretRightIcon size={14} color={isDark ? colors.text : colors.textMuted} weight="light" />
        </TouchableOpacity>
      )}

      {/* Scripture block */}
      <View
        onLayout={handleScriptureBlockLayout}
        style={[
          dcStyles.scriptureBlock,
          {
            borderTopColor: scriptureRuleColor,
            borderBottomColor: scriptureRuleColor,
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
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
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
            color: isDark ? colors.text : colors.textMuted,
            lineHeight: fontSizes.scripture * 1.75,
            textAlign: 'left',
            minHeight: displayScripture ? 'auto' : 60,
          }}
        >
          {displayScripture ? `\u201C${preventOrphan(stripOuterQuotes(displayScripture))}\u201D` : `Scripture text not available for ${day.scriptureReference || 'this passage'}.`}
        </Text>
      </View>

      {/* Section divider: scripture -> body */}
      <SectionDivider color={colors.textMuted} style={{ marginTop: 20, marginBottom: 8 }} />

      <View onLayout={handleDevotionalWebViewLayout}>
        <DevotionalWebView
          day={day}
          fontSize={fontSize}
          onQuoteSelected={onQuoteSelected}
          onHighlightRemoved={onHighlightRemoved}
          existingHighlights={existingHighlights}
          targetHighlight={targetHighlight}
          onTargetHighlightLocated={handleTargetHighlightLocated}
          targetBookmark={targetBookmarkIsWebViewContent ? targetBookmark : null}
          onTargetBookmarkLocated={handleTargetBookmarkLocated}
          onScriptureTap={onScriptureTap}
          devotionalId={devotionalId}
          dayNumber={dayNumber}
          dayTitle={day.title}
        />
      </View>

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
                  fontSize: Math.round(fontSizes.body * 1.15),
                  color: isDark ? colors.text : colors.textMuted,
                  lineHeight: Math.round(fontSizes.body * 1.15) * 1.7,
                }}
              >
                {`\u201C${preventOrphan(stripOuterQuotes(ref.text))}\u201D`}
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
              onFocusInput={onReflectionInputFocus}
            />
          ) : (
            <View>
              <ReaderSectionHeader label="For Reflection" textColor={colors.text} />
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
                        fontFamily: FontFamily.body,
                        fontSize: reflectionTypography.questionFontSize,
                        lineHeight: reflectionTypography.questionLineHeight,
                        color: colors.text,
                        flex: 1,
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

      {/* Act Section — the day's one concrete same-day act */}
      {day.act && (
        <View>
          <SectionDivider color={colors.textMuted} style={{ marginTop: 48, marginBottom: 32 }} />
          <ReaderSectionHeader label="Today" textColor={colors.text} />
          <Text
            style={{
              fontFamily: FontFamily.body,
              fontSize: fontSizes.body,
              color: colors.text,
              lineHeight: fontSizes.body * 1.8,
              textAlign: 'left',
              paddingHorizontal: 16,
            }}
          >
            {preventOrphan(day.act)}
          </Text>
        </View>
      )}

      {/* Closing Prayer Section */}
      {day.closingPrayer && (
        <View style={dcStyles.prayerSection}>
          <SectionDivider color={colors.textMuted} style={{ marginTop: 0, marginBottom: 32 }} />
          <ReaderSectionHeader label="A Prayer" textColor={colors.text} />
          <Text
            style={{
              fontFamily: readingFont.bodyItalic,
              fontSize: fontSizes.body,
              color: colors.text,
              lineHeight: fontSizes.body * 1.8,
              textAlign: 'left',
              paddingHorizontal: 16,
            }}
          >
            {preventOrphan(day.closingPrayer)}
          </Text>
        </View>
      )}

      {/* Carry line — what leaves the page with the reader */}
      {day.carryLine && (
        <Text
          style={{
            fontFamily: readingFont.bodyItalic,
            fontSize: fontSizes.body,
            color: colors.textMuted,
            lineHeight: fontSizes.body * 1.8,
            textAlign: 'center',
            paddingHorizontal: 32,
            marginTop: 40,
          }}
        >
          {preventOrphan(day.carryLine)}
        </Text>
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
  ornamentalLabel: {
    ...Typography.sectionHeader,
    textAlign: 'center',
  },
  dayTitle: {
    fontFamily: FontFamily.display,
    marginBottom: Spacing['5'],
    letterSpacing: -0.15,
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
    ...Typography.cardMeta,
    flex: 1,
  },
  scriptureBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 4,
    paddingVertical: Spacing['5'],
    marginBottom: Spacing['2'],
  },
  scriptureRefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: Spacing['2.5'],
  },
  scriptureRef: {
    ...Typography.cardMeta,
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
    ...Typography.cardMeta,
    marginLeft: 10,
  },
  crossRefItem: {
    marginBottom: Spacing['5'],
    paddingLeft: 4,
  },
  crossRefReference: {
    ...Typography.cardMeta,
    marginBottom: 8,
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
    marginRight: Spacing['3'],
    marginTop: 1,
    minWidth: 16,
  },
  prayerSection: {
    marginTop: Spacing['12'],
  },
});
