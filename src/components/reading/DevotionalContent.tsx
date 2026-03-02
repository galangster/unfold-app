import { useCallback, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Quote, BookOpen, Bookmark } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
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

interface DevotionalContentProps {
  day: DevotionalDay;
  fontSize: FontSize;
  titleSharedTransitionTag?: string;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  onQuoteSelected?: (quote: { text: string; context: string }) => void;
  existingHighlights?: Highlight[];
}

export function DevotionalContent({ 
  day, 
  fontSize, 
  titleSharedTransitionTag, 
  isBookmarked, 
  onToggleBookmark,
  onQuoteSelected,
  existingHighlights
}: DevotionalContentProps) {
  const { colors } = useTheme();
  const fontSizes = FONT_SIZE_VALUES[fontSize];
  const readingFont = useReadingFont();

  // Accent line grow animation — editorial entrance
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

  // Bookmark bounce animation
  const bookmarkScale = useSharedValue(1);
  const bookmarkAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bookmarkScale.value }],
  }));

  const handleBookmarkPress = useCallback(() => {
    // Spring bounce: scale down then overshoot up
    bookmarkScale.value = withSequence(
      withSpring(0.6, { damping: 10, stiffness: 400 }),
      withSpring(1, { damping: 8, stiffness: 200 })
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggleBookmark?.();
  }, [bookmarkScale, onToggleBookmark]);

  return (
    <>
      {/* Day title */}
      <Text
        {...(titleSharedTransitionTag ? { sharedTransitionTag: titleSharedTransitionTag } : {})}
        style={{
          fontFamily: FontFamily.display,
          fontSize: fontSizes.title,
          color: colors.text,
          lineHeight: fontSizes.title * 1.25,
          marginBottom: 20,
          letterSpacing: -0.5,
        }}
      >
        {day.title}
      </Text>

      {/* Accent line — grows in from zero */}
      <Animated.View
        style={[
          {
            height: 1.5,
            backgroundColor: colors.accent,
            marginBottom: 24,
            borderRadius: 1,
          },
          accentLineStyle,
        ]}
      />

      {/* Scripture reference with bookmark */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16, gap: 8 }}>
        <Text
          style={{
            fontFamily: FontFamily.mono,
            fontSize: 11,
            color: colors.accent,
            textAlign: 'center',
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            opacity: 0.8,
          }}
        >
          {day.scriptureReference}
        </Text>
        
        {/* Bookmark button - inline with reference, with bounce animation */}
        {onToggleBookmark && (
          <Pressable
            onPress={handleBookmarkPress}
            style={{
              padding: 4,
            }}
          >
            <Animated.View style={bookmarkAnimStyle}>
              <Bookmark
                size={14}
                color={isBookmarked ? colors.accent : colors.textMuted}
                fill={isBookmarked ? colors.accent : 'transparent'}
                strokeWidth={1.5}
              />
            </Animated.View>
          </Pressable>
        )}
      </View>

      {/* Scripture text - NATIVE (not selectable for quotes) */}
      <View
        style={{
          paddingHorizontal: 16,
          marginBottom: 36,
        }}
      >
        <Text
          style={{
            fontFamily: readingFont.bodyItalic,
            fontSize: fontSizes.scripture,
            color: colors.textMuted,
            lineHeight: fontSizes.scripture * 1.7,
            textAlign: 'center',
            minHeight: day.scriptureText ? 'auto' : 60,
          }}
        >
          {day.scriptureText ? `"${preventOrphan(day.scriptureText)}"` : `Scripture text not available for ${day.scriptureReference || 'this passage'}.`}
        </Text>
      </View>

      {/* Body text, quotes, and related content - WEBVIEW (selectable for quotes) */}
      <DevotionalWebView 
        day={day} 
        fontSize={fontSize}
        onQuoteSelected={onQuoteSelected}
        existingHighlights={existingHighlights}
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
            <BookOpen size={15} color={colors.accent} strokeWidth={1.5} />
            <Text
              style={{
                fontFamily: FontFamily.mono,
                fontSize: 11,
                color: colors.accent,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                marginLeft: 8,
                opacity: 0.8,
              }}
            >
              Related Scripture
            </Text>
          </View>
          {day.crossReferences.map((ref, index) => (
            <View
              key={index}
              style={{
                backgroundColor: colors.inputBackground,
                borderRadius: 14,
                padding: 18,
                marginBottom: 10,
                borderLeftWidth: 2,
                borderLeftColor: colors.accent,
              }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.mono,
                  fontSize: 11,
                  color: colors.accent,
                  letterSpacing: 0.8,
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
                  lineHeight: (fontSizes.body - 1) * 1.65,
                }}
              >
                "{preventOrphan(ref.text)}"
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Reflection Questions Section - NATIVE (structured) */}
      {day.reflectionQuestions && day.reflectionQuestions.length > 0 && (
        <View style={{ marginTop: 52 }}>
          <View
            style={{
              width: 32,
              height: 1.5,
              backgroundColor: colors.accent,
              alignSelf: 'center',
              marginBottom: 28,
              borderRadius: 1,
            }}
          />
          <Text
            style={{
              fontFamily: FontFamily.mono,
              fontSize: 11,
              color: colors.accent,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              textAlign: 'center',
              marginBottom: 24,
              opacity: 0.8,
            }}
          >
            For Reflection
          </Text>
          {day.reflectionQuestions.map((question, index) => (
            <View
              key={index}
              style={{
                marginBottom: 20,
                paddingLeft: 16,
              }}
            >
              <Text
                style={{
                  fontFamily: readingFont.bodyItalic,
                  fontSize: fontSizes.body,
                  color: colors.text,
                  lineHeight: fontSizes.body * 1.65,
                }}
              >
                {index + 1}. {question}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Closing Prayer Section - NATIVE (structured) */}
      {day.closingPrayer && (
        <View style={{ marginTop: 52 }}>
          <View
            style={{
              width: 32,
              height: 1.5,
              backgroundColor: colors.accent,
              alignSelf: 'center',
              marginBottom: 28,
              borderRadius: 1,
            }}
          />
          <Text
            style={{
              fontFamily: FontFamily.mono,
              fontSize: 11,
              color: colors.accent,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              textAlign: 'center',
              marginBottom: 22,
              opacity: 0.8,
            }}
          >
            A Prayer
          </Text>
          <Text
            style={{
              fontFamily: readingFont.bodyItalic,
              fontSize: fontSizes.body,
              color: colors.text,
              lineHeight: fontSizes.body * 1.8,
              textAlign: 'center',
              paddingHorizontal: 12,
            }}
          >
            {preventOrphan(day.closingPrayer)}
          </Text>
        </View>
      )}
    </>
  );
}
