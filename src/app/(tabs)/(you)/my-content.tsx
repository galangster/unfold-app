import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInRight,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CaretLeftIcon, BookOpenIcon, HighlighterIcon, BookmarkSimpleIcon, PencilLineIcon, LockIcon } from 'phosphor-react-native';
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
  const [activeTab, setActiveTab] = useState<Tab>('journal');
  
  const highlights = useUnfoldStore((s) => s.highlights);
  const bookmarks = useUnfoldStore((s) => s.bookmarks);
  const journalEntries = useUnfoldStore((s) => s.journalEntries);
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const currentDevotionalId = useUnfoldStore((s) => s.currentDevotionalId);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleTabPress = (tab: Tab) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  };

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'journal', label: 'Journal', count: journalEntries.length },
    { id: 'highlights', label: 'Highlights', count: highlights.length },
    { id: 'bookmarks', label: 'Bookmarks', count: bookmarks.length },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingVertical: 12,
        }}
      >
        <TouchableOpacity activeOpacity={0.7} onPress={handleBack} style={{ padding: 8 }} accessibilityLabel="Go back" accessibilityRole="button">
          <CaretLeftIcon size={24} color={colors.text} weight="light" />
        </TouchableOpacity>
        <View style={{ marginLeft: 12 }}>
          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: 16,
              color: colors.text,
            }}
          >
            My Content
          </Text>
        </View>
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
          return (
            <TouchableOpacity activeOpacity={0.7}
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
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  borderRadius: 20,
                  backgroundColor: isActive ? colors.inputBackground : 'transparent',
                }}
              >
                <Text
                  style={{
                    fontFamily: isActive ? FontFamily.uiSemiBold : FontFamily.ui,
                    fontSize: 13,
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
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Tab Content */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
        {activeTab === 'journal' && (
          <Animated.View entering={FadeInRight.duration(300)}>
            {journalEntries.length === 0 ? (
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
                  <PencilLineIcon size={28} color={colors.textMuted} weight="light" />
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
                  No journal entries yet
                </Text>
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 15,
                    color: colors.textMuted,
                    textAlign: 'center',
                    lineHeight: 22,
                    marginBottom: 24,
                  }}
                >
                  Reflect on your readings to capture your thoughts.
                </Text>
                
                {/* Start Your First Entry CTA */}
                <TouchableOpacity activeOpacity={0.7}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    // Navigate to the current reading day to open journal
                    const currentDevotional = devotionals.find(d => d.id === currentDevotionalId);
                    if (currentDevotional) {
                      router.push({
                        pathname: '/(tabs)/(today)/journal',
                        params: {
                          devotionalId: currentDevotionalId,
                          dayNumber: currentDevotional.currentDay.toString(),
                        },
                      });
                    }
                  }}
                  style={{
                    paddingVertical: 14,
                    paddingHorizontal: 24,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: colors.accent,
                    backgroundColor: 'transparent',
                    opacity: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FontFamily.uiSemiBold,
                      fontSize: 15,
                      color: colors.accent,
                    }}
                  >
                    Start your first entry
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              journalEntries.map((entry, index) => {
                const devotional = devotionals.find(d => d.id === entry.devotionalId);
                return (
                  <TouchableOpacity activeOpacity={0.7}
                    key={entry.id}
                    onPress={() => router.push({
                      pathname: '/(tabs)/(today)/journal-detail',
                      params: { entryId: entry.id }
                    })}
                    style={{
                      backgroundColor: colors.inputBackground,
                      borderRadius: 16,
                      padding: 20,
                      marginBottom: 12,
                      opacity: 1,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                      <BookOpenIcon size={14} color={colors.accent} weight="light" />
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
                  </TouchableOpacity>
                );
              })
            )}
          </Animated.View>
        )}

        {activeTab === 'highlights' && (
          <Animated.View entering={FadeInRight.duration(300)}>
            {highlights.length === 0 ? (
              <EmptyState
                icon={HighlighterIcon}
                title="No highlights yet"
                subtitle="Select text while reading to save your favorite quotes."
              />
            ) : (
              highlights.map((highlight) => {
                const devotional = devotionals.find(d => d.id === highlight.devotionalId);
                return (
                  <TouchableOpacity activeOpacity={0.7}
                    key={highlight.id}
                    onPress={() => router.push({
                      pathname: '/(tabs)/(today)/reading',
                      params: { 
                        devotionalId: highlight.devotionalId,
                        dayNumber: highlight.dayNumber.toString(),
                      },
                    })}
                    style={{
                      backgroundColor: colors.inputBackground,
                      borderRadius: 16,
                      padding: 20,
                      marginBottom: 12,
                      opacity: 1,
                      borderLeftWidth: 4,
                      borderLeftColor: HIGHLIGHT_COLORS[highlight.color || 'yellow'][isDark ? 'dark' : 'light'],
                    }}
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
                  </TouchableOpacity>
                );
              })
            )}
          </Animated.View>
        )}

        {activeTab === 'bookmarks' && (
          <Animated.View entering={FadeInRight.duration(300)}>
            {bookmarks.length === 0 ? (
              <EmptyState
                icon={BookmarkSimpleIcon}
                title="No bookmarks yet"
                subtitle="Tap the bookmark icon while reading to save scriptures."
              />
            ) : (
              bookmarks.map((bookmark) => {
                const devotional = devotionals.find(d => d.id === bookmark.devotionalId);
                const day = devotional?.days.find(d => d.dayNumber === bookmark.dayNumber);
                return (
                  <TouchableOpacity activeOpacity={0.7}
                    key={bookmark.id}
                    onPress={() => router.push({
                      pathname: '/(tabs)/(today)/reading',
                      params: { 
                        devotionalId: bookmark.devotionalId,
                        dayNumber: bookmark.dayNumber.toString(),
                      },
                    })}
                    style={{
                      backgroundColor: colors.inputBackground,
                      borderRadius: 16,
                      padding: 20,
                      marginBottom: 12,
                      opacity: 1,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginBottom: 8,
                        gap: 8,
                      }}
                    >
                      <BookmarkSimpleIcon size={14} color={colors.accent} weight="fill" />
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
                      "{day?.scriptureText}"
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function EmptyState({ icon: Icon, title, subtitle }: { icon: typeof PencilLineIcon; title: string; subtitle: string }) {
  const { colors } = useTheme();

  // Gentle breathing pulse on the icon
  const iconPulse = useSharedValue(1);
  useEffect(() => {
    iconPulse.value = withRepeat(
      withTiming(1.1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [iconPulse]);

  const iconPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconPulse.value }],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(600)}
      style={{ alignItems: 'center', paddingVertical: 60, paddingHorizontal: 40 }}
    >
      <Animated.View
        style={[
          {
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: colors.inputBackground,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
          },
          iconPulseStyle,
        ]}
      >
        <Icon size={28} color={colors.textMuted} />
      </Animated.View>
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
    </Animated.View>
  );
}
