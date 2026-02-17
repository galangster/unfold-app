import { useState } from 'react';
import { View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';
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

type Tab = 'journal' | 'highlights' | 'bookmarks';

export default function MyContentScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<Tab>('journal');
  
  const highlights = useUnfoldStore((s) => s.highlights);
  const bookmarks = useUnfoldStore((s) => s.bookmarks);
  const journalEntries = useUnfoldStore((s) => s.journalEntries);
  const devotionals = useUnfoldStore((s) => s.devotionals);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleTabPress = (tab: Tab) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  };

  const tabs: { id: Tab; label: string; icon: typeof PenLine; count: number }[] = [
    { id: 'journal', label: 'Journal', icon: PenLine, count: journalEntries.length },
    { id: 'highlights', label: 'Highlights', icon: Highlighter, count: highlights.length },
    { id: 'bookmarks', label: 'Bookmarks', icon: Bookmark, count: bookmarks.length },
  ];

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
          My Content
        </Text>
      </View>

      {/* Elegant Tab Bar */}
      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal: 20,
          paddingBottom: 16,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <Pressable
              key={tab.id}
              onPress={() => handleTabPress(tab.id)}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 12,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 20,
                  backgroundColor: isActive ? colors.inputBackground : 'transparent',
                }}
              >
                <Icon size={16} color={isActive ? colors.text : colors.textMuted} />
                <Text
                  style={{
                    fontFamily: isActive ? FontFamily.uiSemiBold : FontFamily.ui,
                    fontSize: 14,
                    color: isActive ? colors.text : colors.textMuted,
                  }}
                >
                  {tab.label}
                </Text>
                <View
                  style={{
                    minWidth: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: isActive ? colors.accent : colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 4,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FontFamily.uiMedium,
                      fontSize: 10,
                      color: isActive ? colors.background : colors.textMuted,
                    }}
                  >
                    {tab.count}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Tab Content */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
        {activeTab === 'journal' && (
          <Animated.View entering={FadeInRight.duration(300)}>
            {journalEntries.length === 0 ? (
              <EmptyState
                icon={PenLine}
                title="No journal entries"
                subtitle="Reflect on your readings to capture your thoughts."
              />
            ) : (
              journalEntries.map((entry, index) => {
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
                      borderRadius: 16,
                      padding: 20,
                      marginBottom: 12,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                      <BookOpen size={14} color={colors.accent} />
                      <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 13, color: colors.text }}>
                        {devotional?.title || 'Unknown Journey'}
                      </Text>
                      <Text style={{ fontFamily: FontFamily.ui, fontSize: 12, color: colors.textMuted }}>
                        · Day {entry.dayNumber}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontFamily: FontFamily.body,
                        fontSize: 15,
                        color: colors.textMuted,
                        lineHeight: 22,
                      }}
                      numberOfLines={3}
                    >
                      {entry.content}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </Animated.View>
        )}

        {activeTab === 'highlights' && (
          <Animated.View entering={FadeInRight.duration(300)}>
            {highlights.length === 0 ? (
              <EmptyState
                icon={Highlighter}
                title="No highlights yet"
                subtitle="Select text while reading to save your favorite quotes."
              />
            ) : (
              highlights.map((highlight) => {
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
                      borderRadius: 16,
                      padding: 20,
                      marginBottom: 12,
                      opacity: pressed ? 0.7 : 1,
                      borderLeftWidth: 4,
                      borderLeftColor: HIGHLIGHT_COLORS[highlight.color || 'yellow'][isDark ? 'dark' : 'light'],
                    })}
                  >
                    <Text
                      style={{
                        fontFamily: FontFamily.bodyItalic,
                        fontSize: 16,
                        color: colors.text,
                        lineHeight: 24,
                        marginBottom: 12,
                      }}
                    >
                      "{highlight.highlightedText}"
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: HIGHLIGHT_COLORS[highlight.color || 'yellow'][isDark ? 'dark' : 'light'],
                        }}
                      />
                      <Text style={{ fontFamily: FontFamily.ui, fontSize: 12, color: colors.textMuted }}>
                        {devotional?.title} · Day {highlight.dayNumber}
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            )}
          </Animated.View>
        )}

        {activeTab === 'bookmarks' && (
          <Animated.View entering={FadeInRight.duration(300)}>
            {bookmarks.length === 0 ? (
              <EmptyState
                icon={Bookmark}
                title="No bookmarks yet"
                subtitle="Tap the bookmark icon while reading to save scriptures."
              />
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
                      borderRadius: 16,
                      padding: 20,
                      marginBottom: 12,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginBottom: 8,
                        gap: 8,
                      }}
                    >
                      <Bookmark size={14} color={colors.accent} fill={colors.accent} />
                      <Text
                        style={{
                          fontFamily: FontFamily.mono,
                          fontSize: 12,
                          color: colors.accent,
                          letterSpacing: 0.5,
                        }}
                      >
                        {day?.scriptureReference || 'Unknown Passage'}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontFamily: FontFamily.bodyItalic,
                        fontSize: 15,
                        color: colors.text,
                        lineHeight: 22,
                      }}
                      numberOfLines={3}
                    >
                      "{day?.scriptureText?.slice(0, 200)}..."
                    </Text>
                  </Pressable>
                );
              })
            )}
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function EmptyState({ icon: Icon, title, subtitle }: { icon: typeof PenLine; title: string; subtitle: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 60, paddingHorizontal: 40 }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: colors.inputBackground,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 20,
        }}
      >
        <Icon size={28} color={colors.textMuted} />
      </View>
      <Text
        style={{
          fontFamily: FontFamily.display,
          fontSize: 22,
          color: colors.text,
          marginBottom: 8,
          textAlign: 'center',
        }}
      >
        {title}
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
        {subtitle}
      </Text>
    </View>
  );
}
