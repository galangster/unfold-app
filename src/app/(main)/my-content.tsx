import { View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, BookOpen, Highlighter, Bookmark, PenLine } from 'lucide-react-native';
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

export default function MyContentScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  
  const highlights = useUnfoldStore((s) => s.highlights);
  const bookmarks = useUnfoldStore((s) => s.bookmarks);
  const journalEntries = useUnfoldStore((s) => s.journalEntries);
  const devotionals = useUnfoldStore((s) => s.devotionals);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const totalItems = highlights.length + bookmarks.length + journalEntries.length;

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
        <View style={{ marginLeft: 12 }}>
          <Text
            style={{
              fontFamily: FontFamily.uiSemiBold,
              fontSize: 17,
              color: colors.text,
            }}
          >
            My Content
          </Text>
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: 13,
              color: colors.textMuted,
            }}>
            {totalItems} saved item{totalItems !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }}>
        {/* Journal Section */}
        <Animated.View entering={FadeInDown.delay(100)} style={{ marginBottom: 32 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 }}>
            <PenLine size={18} color={colors.accent} />
            <Text
              style={{
                fontFamily: FontFamily.uiSemiBold,
                fontSize: 16,
                color: colors.text,
              }}
            >
              Journal
            </Text>
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 13,
                color: colors.textMuted,
                marginLeft: 'auto',
              }}
            >
              {journalEntries.length} entr{journalEntries.length === 1 ? 'y' : 'ies'}
            </Text>
          </View>

          {journalEntries.length === 0 ? (
            <Text style={{ fontFamily: FontFamily.ui, fontSize: 14, color: colors.textMuted }}>
              No journal entries yet. Reflect on your readings to capture your thoughts.
            </Text>
          ) : (
            journalEntries.slice(0, 3).map((entry, index) => {
              const devotional = devotionals.find(d => d.id === entry.devotionalId);
              return (
                <Pressable
                  key={entry.id}
                  onPress={() => router.push({
                    pathname: '/(main)/journal-detail',
                    params: { entryId: entry.id }
                  })}
                  style={({ pressed }) => ({
                    backgroundColor: colors.inputBackground,
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 12,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontFamily: FontFamily.uiMedium,
                      fontSize: 14,
                      color: colors.text,
                      marginBottom: 4,
                    }}
                    numberOfLines={1}
                  >
                    {devotional?.title || 'Unknown Journey'} · Day {entry.dayNumber}
                  </Text>
                  <Text
                    style={{
                      fontFamily: FontFamily.body,
                      fontSize: 14,
                      color: colors.textMuted,
                      lineHeight: 20,
                    }}
                    numberOfLines={2}
                  >
                    {entry.content}
                  </Text>
                </Pressable>
              );
            })
          )}
        </Animated.View>

        {/* Highlights Section */}
        <Animated.View entering={FadeInDown.delay(200)} style={{ marginBottom: 32 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 }}>
            <Highlighter size={18} color={colors.accent} />
            <Text
              style={{
                fontFamily: FontFamily.uiSemiBold,
                fontSize: 16,
                color: colors.text,
              }}
            >
              Highlights
            </Text>
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 13,
                color: colors.textMuted,
                marginLeft: 'auto',
              }}
            >
              {highlights.length} saved
            </Text>
          </View>

          {highlights.length === 0 ? (
            <Text style={{ fontFamily: FontFamily.ui, fontSize: 14, color: colors.textMuted }}>
              No highlights yet. Select text while reading to save your favorite quotes.
            </Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {highlights.slice(0, 5).map((highlight) => {
                const devotional = devotionals.find(d => d.id === highlight.devotionalId);
                return (
                  <Pressable
                    key={highlight.id}
                    onPress={() => router.push({
                      pathname: '/(main)/reading',
                      params: { 
                        devotionalId: highlight.devotionalId,
                        dayNumber: highlight.dayNumber.toString(),
                      },
                    })}
                    style={({ pressed }) => ({
                      backgroundColor: colors.inputBackground,
                      borderRadius: 12,
                      padding: 16,
                      marginRight: 12,
                      width: width * 0.7,
                      opacity: pressed ? 0.7 : 1,
                      borderLeftWidth: 3,
                      borderLeftColor: HIGHLIGHT_COLORS[highlight.color || 'yellow'][isDark ? 'dark' : 'light'],
                    })}
                  >
                    <Text
                      style={{
                        fontFamily: FontFamily.bodyItalic,
                        fontSize: 14,
                        color: colors.text,
                        lineHeight: 20,
                        marginBottom: 8,
                      }}
                      numberOfLines={3}
                    >
                      "{highlight.highlightedText}"
                    </Text>
                    <Text
                      style={{
                        fontFamily: FontFamily.ui,
                        fontSize: 12,
                        color: colors.textMuted,
                      }}
                    >
                      {devotional?.title || 'Unknown'} · Day {highlight.dayNumber}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </Animated.View>

        {/* Bookmarks Section */}
        <Animated.View entering={FadeInDown.delay(300)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 }}>
            <Bookmark size={18} color={colors.accent} />
            <Text
              style={{
                fontFamily: FontFamily.uiSemiBold,
                fontSize: 16,
                color: colors.text,
              }}
            >
              Saved Passages
            </Text>
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 13,
                color: colors.textMuted,
                marginLeft: 'auto',
              }}
            >
              {bookmarks.length} saved
            </Text>
          </View>

          {bookmarks.length === 0 ? (
            <Text style={{ fontFamily: FontFamily.ui, fontSize: 14, color: colors.textMuted }}>
              No bookmarks yet. Tap the bookmark icon while reading to save scriptures.
            </Text>
          ) : (
            bookmarks.map((bookmark) => {
              const devotional = devotionals.find(d => d.id === bookmark.devotionalId);
              const day = devotional?.days.find(d => d.dayNumber === bookmark.dayNumber);
              return (
                <Pressable
                  key={bookmark.id}
                  onPress={() => router.push({
                    pathname: '/(main)/reading',
                    params: { 
                      devotionalId: bookmark.devotionalId,
                      dayNumber: bookmark.dayNumber.toString(),
                    },
                  })}
                  style={({ pressed }) => ({
                    backgroundColor: colors.inputBackground,
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 12,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontFamily: FontFamily.mono,
                      fontSize: 12,
                      color: colors.accent,
                      marginBottom: 4,
                    }}
                  >
                    {day?.scriptureReference || 'Unknown Passage'}
                  </Text>
                  <Text
                    style={{
                      fontFamily: FontFamily.bodyItalic,
                      fontSize: 14,
                      color: colors.text,
                      lineHeight: 20,
                    }}
                    numberOfLines={2}
                  >
                    "{day?.scriptureText?.slice(0, 150)}..."
                  </Text>
                </Pressable>
              );
            })
          )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
