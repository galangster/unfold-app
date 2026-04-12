import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInRight,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CaretLeftIcon, BookOpenIcon, HighlighterIcon, BookmarkSimpleIcon, PencilLineIcon, LockIcon, MagnifyingGlassIcon, XIcon } from 'phosphor-react-native';
import { useCrossTabBack } from '@/hooks/useCrossTabBack';
import { useSavedHighlights, SavedItem, SavedItemSource } from '@/hooks/useSavedHighlights';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, BibleHighlight, Highlight, HighlightColor, BibleHighlightColor } from '@/lib/store';

type HighlightKey = HighlightColor | BibleHighlightColor;

const HIGHLIGHT_COLORS: Record<HighlightKey, { label: string; light: string; dark: string }> = {
  yellow: { label: 'General', light: '#FFDC64', dark: '#C8A55C' },
  green: { label: 'Growth', light: '#64C864', dark: '#6DAF7B' },
  blue: { label: 'Prayer', light: '#6496FF', dark: '#5B9BD5' },
  purple: { label: 'Questions', light: '#B464C8', dark: '#9B8EC4' },
  red: { label: 'Important', light: '#FF6464', dark: '#D4828F' },
};

type Tab = 'journal' | 'highlights' | 'bookmarks';
type HighlightFilter = 'all' | SavedItemSource;

const VALID_TABS: Tab[] = ['journal', 'highlights', 'bookmarks'];
const VALID_SOURCES: HighlightFilter[] = ['all', 'devotional', 'bible'];

export default function MyContentScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const { handleBack } = useCrossTabBack();
  const params = useLocalSearchParams<{ tab?: string; source?: string; from?: string }>();

  const [activeTab, setActiveTab] = useState<Tab>('journal');
  const [highlightFilter, setHighlightFilter] = useState<HighlightFilter>('all');

  // Re-sync param-driven state on every focus so repeat pushes with different
  // ?tab=… or ?source=… values actually take effect (useState initializer
  // only fires once).
  useFocusEffect(
    useCallback(() => {
      if (params.tab && (VALID_TABS as string[]).includes(params.tab)) {
        setActiveTab(params.tab as Tab);
      }
      if (params.source && (VALID_SOURCES as string[]).includes(params.source)) {
        setHighlightFilter(params.source as HighlightFilter);
      }
    }, [params.tab, params.source]),
  );

  const bookmarks = useUnfoldStore((s) => s.bookmarks);
  const journalEntries = useUnfoldStore((s) => s.journalEntries);
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const currentDevotionalId = useUnfoldStore((s) => s.currentDevotionalId);

  const saved = useSavedHighlights();

  // Search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredJournal = useMemo(() => {
    if (!searchQuery.trim()) return journalEntries;
    const q = searchQuery.toLowerCase();
    return journalEntries.filter(e =>
      e.content?.toLowerCase().includes(q)
    );
  }, [journalEntries, searchQuery]);

  const highlightsForFilter = useMemo(() => {
    switch (highlightFilter) {
      case 'devotional': return saved.devotional;
      case 'bible': return saved.bible;
      case 'all':
      default: return saved.all;
    }
  }, [highlightFilter, saved.all, saved.devotional, saved.bible]);

  const filteredHighlights = useMemo(() => {
    if (!searchQuery.trim()) return highlightsForFilter;
    const q = searchQuery.toLowerCase();
    return highlightsForFilter.filter(item =>
      item.text.toLowerCase().includes(q) ||
      item.contextLabel.toLowerCase().includes(q),
    );
  }, [highlightsForFilter, searchQuery]);

  const filteredBookmarks = useMemo(() => {
    if (!searchQuery.trim()) return bookmarks;
    const q = searchQuery.toLowerCase();
    return bookmarks.filter(b =>
      b.dayTitle?.toLowerCase().includes(q) || b.devotionalTitle?.toLowerCase().includes(q)
    );
  }, [bookmarks, searchQuery]);

  const handleTabPress = (tab: Tab) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  };

  const handleFilterPress = (filter: HighlightFilter) => {
    Haptics.selectionAsync();
    setHighlightFilter(filter);
  };

  const handleHighlightPress = (item: SavedItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (item.source === 'devotional') {
      const h = item.raw as Highlight;
      router.push({
        pathname: '/(tabs)/(today)/reading',
        params: {
          devotionalId: h.devotionalId,
          dayNumber: h.dayNumber.toString(),
        },
      });
      return;
    }
    const b = item.raw as BibleHighlight;
    router.push({
      pathname: '/(tabs)/(bible)/reader',
      params: {
        bookId: b.bookId.toString(),
        chapter: b.chapter.toString(),
        verse: b.verseStart.toString(),
      },
    });
  };

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'journal', label: 'Journal', count: journalEntries.length },
    { id: 'highlights', label: 'Highlights', count: saved.count.all },
    { id: 'bookmarks', label: 'Bookmarks', count: bookmarks.length },
  ];

  const highlightFilters: { id: HighlightFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: saved.count.all },
    { id: 'devotional', label: 'Devotional', count: saved.count.devotional },
    { id: 'bible', label: 'Bible', count: saved.count.bible },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: Spacing['5'],
          paddingVertical: Spacing['3'],
        }}
      >
        <TouchableOpacity activeOpacity={0.7} onPress={handleBack} style={{ padding: Spacing['2'] }} accessibilityLabel="Go back" accessibilityRole="button">
          <CaretLeftIcon size={24} color={colors.text} weight="light" />
        </TouchableOpacity>
        <View style={{ marginLeft: Spacing['3'], flex: 1 }}>
          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: FontSize.base,
              color: colors.text,
            }}
          >
            My Library
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowSearch(!showSearch);
            if (showSearch) setSearchQuery('');
          }}
          style={{ padding: Spacing['2'] }}
          accessibilityLabel={showSearch ? 'Close search' : 'Search library'}
          accessibilityRole="button"
        >
          {showSearch ? (
            <XIcon size={20} color={colors.textMuted} weight="light" />
          ) : (
            <MagnifyingGlassIcon size={20} color={colors.textMuted} weight="light" />
          )}
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      {showSearch && (
        <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.fast).easing(Ease.out)} style={{ paddingHorizontal: Spacing['5'], paddingBottom: Spacing['3'] }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: colors.inputBackground,
              borderRadius: Radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: Spacing['3'],
              paddingVertical: Spacing['2.5'],
            }}
          >
            <MagnifyingGlassIcon size={16} color={colors.textSubtle} weight="light" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search your library..."
              placeholderTextColor={colors.textHint}
              autoFocus
              style={{
                flex: 1,
                fontFamily: FontFamily.body,
                fontSize: FontSize.base,
                color: colors.text,
                padding: 0,
              }}
            />
          </View>
        </Animated.View>
      )}

      {/* Elegant Tab Bar */}
      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal: Spacing['5'],
          paddingBottom: Spacing['4'],
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
                paddingVertical: Spacing['3'],
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 10,
                  paddingVertical: Spacing['2'],
                  borderRadius: Radius.xl,
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
                    paddingHorizontal: Spacing['1'],
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
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing['5'] }}>
        {activeTab === 'journal' && (
          <Animated.View entering={reducedMotion ? undefined : FadeInRight.duration(Duration.slow).easing(Ease.out)}>
            {filteredJournal.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 60, paddingHorizontal: Spacing['10'] }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    backgroundColor: colors.inputBackground,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: Spacing['5'],
                  }}
                >
                  <PencilLineIcon size={28} color={colors.textMuted} weight="light" />
                </View>
                <Text
                  style={{
                    fontFamily: FontFamily.display,
                    fontSize: 22,
                    color: colors.text,
                    marginBottom: Spacing['2'],
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
                    marginBottom: Spacing['6'],
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
                          dayNumber: (currentDevotional.days.filter(d => d.isRead).sort((a, b) => b.dayNumber - a.dayNumber)[0]?.dayNumber ?? currentDevotional.currentDay).toString(),
                        },
                      });
                    }
                  }}
                  style={{
                    paddingVertical: 14,
                    paddingHorizontal: 24,
                    borderRadius: Radius.md,
                    borderWidth: 1.5,
                    borderColor: colors.accent,
                    backgroundColor: 'transparent',
                    opacity: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: Spacing['2'],
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
              filteredJournal.map((entry, index) => {
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
                      borderRadius: Radius.lg,
                      padding: Spacing['5'],
                      marginBottom: Spacing['3'],
                      opacity: 1,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing['2'], gap: Spacing['2'] }}>
                      <BookOpenIcon size={14} color={colors.accent} weight="light" />
                      <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 13, color: colors.text }}>
                        {devotional?.title || 'Untitled Series'}
                      </Text>
                      <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted }}>
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
          <Animated.View entering={reducedMotion ? undefined : FadeInRight.duration(Duration.slow).easing(Ease.out)}>
            {/* Source filter chips */}
            <View
              style={{
                flexDirection: 'row',
                gap: Spacing['2'],
                marginBottom: Spacing['4'],
              }}
            >
              {highlightFilters.map((f) => {
                const isActive = highlightFilter === f.id;
                return (
                  <TouchableOpacity
                    key={f.id}
                    activeOpacity={0.7}
                    onPress={() => handleFilterPress(f.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: Spacing['3'],
                      paddingVertical: Spacing['2'],
                      borderRadius: Radius.xl,
                      borderWidth: 1,
                      borderColor: isActive ? colors.accent : colors.border,
                      backgroundColor: isActive ? colors.accent : 'transparent',
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Filter highlights: ${f.label}`}
                    accessibilityState={{ selected: isActive }}
                  >
                    <Text
                      style={{
                        fontFamily: isActive ? FontFamily.uiSemiBold : FontFamily.ui,
                        fontSize: 12,
                        color: isActive ? colors.background : colors.textMuted,
                      }}
                    >
                      {f.label}
                    </Text>
                    <Text
                      style={{
                        fontFamily: FontFamily.uiMedium,
                        fontSize: 11,
                        color: isActive ? colors.background : colors.textSubtle,
                      }}
                    >
                      {f.count}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {filteredHighlights.length === 0 ? (
              <EmptyState
                icon={HighlighterIcon}
                title="No highlights yet"
                subtitle={
                  highlightFilter === 'bible'
                    ? 'Tap a verse in the Bible reader to save it here.'
                    : highlightFilter === 'devotional'
                      ? 'Select text while reading a devotional to save it here.'
                      : 'Select text in a devotional or Bible verse to save it here.'
                }
              />
            ) : (
              filteredHighlights.map((item) => {
                const colorKey: HighlightKey = item.color ?? 'yellow';
                const accent = HIGHLIGHT_COLORS[colorKey][isDark ? 'dark' : 'light'];
                return (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    key={`${item.source}:${item.id}`}
                    onPress={() => handleHighlightPress(item)}
                    style={{
                      backgroundColor: colors.inputBackground,
                      borderRadius: Radius.lg,
                      padding: 20,
                      marginBottom: 12,
                      opacity: 1,
                      borderLeftWidth: 4,
                      borderLeftColor: accent,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.source === 'bible' ? 'Bible' : 'Devotional'} highlight: ${item.text}`}
                  >
                    <Text
                      style={{
                        fontFamily: FontFamily.bodyItalic,
                        fontSize: FontSize.base,
                        color: colors.text,
                        lineHeight: 24,
                        marginBottom: Spacing['3'],
                      }}
                    >
                      "{item.text}"
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing['2'] }}>
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: accent,
                        }}
                      />
                      <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted }}>
                        {item.contextLabel}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </Animated.View>
        )}

        {activeTab === 'bookmarks' && (
          <Animated.View entering={reducedMotion ? undefined : FadeInRight.duration(Duration.slow).easing(Ease.out)}>
            {filteredBookmarks.length === 0 ? (
              <EmptyState
                icon={BookmarkSimpleIcon}
                title="No bookmarks yet"
                subtitle="Tap the bookmark icon while reading to save scriptures."
              />
            ) : (
              filteredBookmarks.map((bookmark) => {
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
                      borderRadius: Radius.lg,
                      padding: Spacing['5'],
                      marginBottom: Spacing['3'],
                      opacity: 1,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginBottom: Spacing['2'],
                        gap: Spacing['2'],
                      }}
                    >
                      <BookmarkSimpleIcon size={14} color={colors.accent} weight="fill" />
                      <Text
                        style={{
                          fontFamily: FontFamily.mono,
                          fontSize: FontSize.xs,
                          color: colors.accent,
                          letterSpacing: 0.5,
                        }}
                      >
                        {bookmark.dayTitle || day?.title || 'Saved Passage'}
                      </Text>
                      <Text
                        style={{
                          fontFamily: FontFamily.mono,
                          fontSize: FontSize.xs,
                          color: colors.textSubtle,
                          letterSpacing: 0.5,
                        }}
                      >
                        · {day?.scriptureReference || bookmark.scriptureReference}
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
                      "{bookmark.quotedText || (['Quote', 'Historical Context', 'Word Study'].includes(bookmark.scriptureReference) ? bookmark.scriptureText : null) || day?.quotableLine || day?.scriptureText || bookmark.scriptureText}"
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
  const reducedMotion = useReducedMotion();

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
      entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
      style={{ alignItems: 'center', paddingVertical: 60, paddingHorizontal: Spacing['10'] }}
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
            marginBottom: Spacing['5'],
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
          marginBottom: Spacing['2'],
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
