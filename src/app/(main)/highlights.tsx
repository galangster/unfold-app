import { View, Text, Pressable, ScrollView, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, Highlighter, BookOpen, Quote } from 'lucide-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, Highlight, HighlightColor } from '@/lib/store';

const HIGHLIGHT_COLORS: Record<HighlightColor, { label: string; light: string; dark: string }> = {
  yellow: { label: 'General', light: '#FFDC64', dark: '#C8A55C' },
  green: { label: 'Growth', light: '#64C864', dark: '#6DAF7B' },
  blue: { label: 'Prayer', light: '#6496FF', dark: '#5B9BD5' },
  purple: { label: 'Questions', light: '#B464C8', dark: '#9B8EC4' },
  red: { label: 'Important', light: '#FF6464', dark: '#D4828F' },
};

export default function HighlightsScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const highlights = useUnfoldStore((s) => s.highlights);
  const devotionals = useUnfoldStore((s) => s.devotionals);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleHighlightPress = (highlight: Highlight) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Navigate to the specific day with the highlight
    router.push({
      pathname: '/(main)/reading',
      params: { 
        devotionalId: highlight.devotionalId,
        dayNumber: highlight.dayNumber.toString(),
        highlightId: highlight.id,
      },
    });
  };

  // Group highlights by devotional
  const highlightsByDevotional = highlights.reduce((acc, highlight) => {
    const devotional = devotionals.find(d => d.id === highlight.devotionalId);
    const key = highlight.devotionalId;
    if (!acc[key]) {
      acc[key] = {
        devotional,
        highlights: [],
      };
    }
    acc[key].highlights.push(highlight);
    return acc;
  }, {} as Record<string, { devotional: typeof devotionals[0] | undefined; highlights: Highlight[] }>);

  const totalHighlights = highlights.length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <Pressable onPress={handleBack} style={{ padding: 8 }}>
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text
          style={{
            fontFamily: FontFamily.uiSemiBold,
            fontSize: 17,
            color: colors.text,
            marginLeft: 12,
          }}
        >
          My Highlights
        </Text>
      </View>

      {totalHighlights === 0 ? (
        // Empty state
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
          <Highlighter size={48} color={colors.textMuted} style={{ marginBottom: 16, opacity: 0.5 }} />
          <Text
            style={{
              fontFamily: FontFamily.display,
              fontSize: 24,
              color: colors.text,
              textAlign: 'center',
              marginBottom: 8,
            }}
          >
            No highlights yet
          </Text>
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: 15,
              color: colors.textMuted,
              textAlign: 'center',
              lineHeight: 22,
            }}
          >
            While reading, tap and hold on any text to highlight your favorite quotes and verses.
          </Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }}>
          {/* Stats */}
          <Animated.View entering={FadeIn} style={{ marginBottom: 24 }}>
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 13,
                color: colors.textMuted,
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 8,
              }}
            >
              {totalHighlights} highlight{totalHighlights !== 1 ? 's' : ''}
            </Text>
          </Animated.View>

          {/* Highlights by Devotional */}
          {Object.entries(highlightsByDevotional).map(([devotionalId, { devotional, highlights: devHighlights }], index) => (
            <Animated.View
              key={devotionalId}
              entering={FadeIn.delay(index * 100)}
              style={{
                marginBottom: 24,
              }}
            >
              {/* Devotional Title */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
                <BookOpen size={16} color={colors.accent} />
                <Text
                  style={{
                    fontFamily: FontFamily.uiSemiBold,
                    fontSize: 15,
                    color: colors.text,
                  }}
                >
                  {devotional?.title || 'Unknown Journey'}
                </Text>
              </View>

              {/* Highlights List */}
              {devHighlights.map((highlight) => (
                <Pressable
                  key={highlight.id}
                  onPress={() => handleHighlightPress(highlight)}
                  style={({ pressed }) => ({
                    backgroundColor: colors.inputBackground,
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 12,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  {/* Color indicator and day */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                    <View
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        backgroundColor: HIGHLIGHT_COLORS[highlight.color || 'yellow'][isDark ? 'dark' : 'light'],
                      }}
                    />
                    <Text
                      style={{
                        fontFamily: FontFamily.uiMedium,
                        fontSize: 12,
                        color: colors.textMuted,
                      }}
                    >
                      Day {highlight.dayNumber}
                    </Text>
                    <Text
                      style={{
                        fontFamily: FontFamily.ui,
                        fontSize: 11,
                        color: colors.textHint,
                      }}
                    >
                      {HIGHLIGHT_COLORS[highlight.color || 'yellow'].label}
                    </Text>
                  </View>

                  {/* Highlighted text */}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Quote size={14} color={colors.accent} style={{ marginTop: 2, opacity: 0.6 }} />
                    <Text
                      style={{
                        fontFamily: FontFamily.bodyItalic,
                        fontSize: 15,
                        color: colors.text,
                        lineHeight: 22,
                        flex: 1,
                      }}
                      numberOfLines={3}
                    >
                      "{highlight.highlightedText}"
                    </Text>
                  </View>
                </Pressable>
              ))}
            </Animated.View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
