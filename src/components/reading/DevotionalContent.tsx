import { View, Text, Pressable } from 'react-native';
import { Quote, BookOpen, Bookmark } from 'lucide-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useReadingFont } from '@/lib/useReadingFont';
import { DevotionalDay, FONT_SIZE_VALUES, FontSize } from '@/lib/store';
import { preventOrphan } from '@/lib/cn';
import { DevotionalWebView } from './DevotionalWebView';

interface DevotionalContentProps {
  day: DevotionalDay;
  fontSize: FontSize;
  titleSharedTransitionTag?: string;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  onQuoteSelected?: (quote: { text: string; context: string }) => void;
}

export function DevotionalContent({ 
  day, 
  fontSize, 
  titleSharedTransitionTag, 
  isBookmarked, 
  onToggleBookmark,
  onQuoteSelected 
}: DevotionalContentProps) {
  const { colors } = useTheme();
  const fontSizes = FONT_SIZE_VALUES[fontSize];
  const readingFont = useReadingFont();

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

      {/* Accent line */}
      <View
        style={{
          width: 36,
          height: 1.5,
          backgroundColor: colors.accent,
          marginBottom: 24,
          borderRadius: 1,
        }}
      />

      {/* Scripture reference */}
      <Text
        style={{
          fontFamily: FontFamily.mono,
          fontSize: 11,
          color: colors.accent,
          textAlign: 'center',
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          marginBottom: 16,
          opacity: 0.8,
        }}
      >
        {day.scriptureReference}
      </Text>

      {/* Scripture text with bookmark - NATIVE (not selectable for quotes) */}
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
        
        {/* Bookmark button - centered at bottom */}
        {onToggleBookmark && (
          <Pressable
            onPress={onToggleBookmark}
            style={{
              alignSelf: 'center',
              marginTop: 16,
              padding: 8,
            }}
          >
            <Bookmark
              size={20}
              color={isBookmarked ? colors.accent : colors.textMuted}
              fill={isBookmarked ? colors.accent : 'transparent'}
              strokeWidth={1.5}
            />
          </Pressable>
        )}
      </View>

      {/* Body text, quotes, and related content - WEBVIEW (selectable for quotes) */}
      <DevotionalWebView 
        day={day} 
        fontSize={fontSize}
        onQuoteSelected={onQuoteSelected}
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
