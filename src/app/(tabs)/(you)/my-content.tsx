import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInRight,
  cancelAnimation,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CaretLeftIcon, HighlighterIcon, BookmarkSimpleIcon, PencilLineIcon, MagnifyingGlassIcon, XIcon } from '@/components/icons';
import { useCrossTabBack } from '@/hooks/useCrossTabBack';
import { useSavedHighlights, SavedItem, SavedItemSource } from '@/hooks/useSavedHighlights';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, BibleHighlight, Devotional, Highlight } from '@/lib/store';
import { BookmarkRow, SavedRow } from '@/components/saved/SavedRows';
import { toBookmarkSavedItem, type SavedBookmarkItem } from '@/lib/saved-items';
import { resolveStackRoute, type TabGroup } from '@/lib/tab-stack-routes';


type Tab = 'highlights' | 'bookmarks';
type HighlightTypeFilter = 'all' | 'notes' | 'highlights';
type HighlightSourceFilter = 'all' | SavedItemSource;
type HighlightChip = 'all' | 'notes' | 'highlights' | 'devotional' | 'bible';

const VALID_TABS: Tab[] = ['highlights', 'bookmarks'];
const VALID_TYPES: HighlightTypeFilter[] = ['all', 'notes', 'highlights'];
const VALID_SOURCES: HighlightSourceFilter[] = ['all', 'devotional', 'bible'];

function getInitialTab(tab?: string): Tab {
  return tab && (VALID_TABS as string[]).includes(tab) ? (tab as Tab) : 'highlights';
}

// ============================================================================
// Virtualized rows
//
// Both tabs feed a single FlashList — saved items and bookmarks are unbounded, and the old `.map`-inside-a-ScrollView mounted every
// row on every render. Rows are discriminated by `kind`, pre-resolved in the
// data memo (no store lookups inside a row), and each row component is
// `memo`'d so recycling actually skips work.
// ============================================================================

type LibraryRow =
  | { kind: 'saved'; key: string; item: SavedItem }
  | { kind: 'bookmark'; key: string; item: SavedBookmarkItem };

const LIST_CONTENT_STYLE = { padding: Spacing['5'] } as const;

export default function MyContentScreen({ hostTab }: { hostTab?: TabGroup } = {}) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const { handleBack } = useCrossTabBack();
  const params = useLocalSearchParams<{ tab?: string; source?: string; type?: string; from?: string }>();
  const isHomeEntry = params.from === 'home';

  const [activeTab, setActiveTab] = useState<Tab>(() => getInitialTab(params.tab));
  const tabBarRef = useRef<ScrollView>(null);
  const tabOffsets = useRef<Partial<Record<Tab, number>>>({});
  const [highlightTypeFilter, setHighlightTypeFilter] = useState<HighlightTypeFilter>('all');
  const [highlightSourceFilter, setHighlightSourceFilter] = useState<HighlightSourceFilter>('all');
  const [suppressInitialContentMotion, setSuppressInitialContentMotion] = useState(isHomeEntry);

  const revealTab = useCallback((tab: Tab, animated: boolean) => {
    const offset = tabOffsets.current[tab];
    if (offset !== undefined) {
      tabBarRef.current?.scrollTo({ x: Math.max(0, offset - Spacing['5']), animated });
    }
  }, []);

  useEffect(() => {
    revealTab(activeTab, !reducedMotion);
  }, [activeTab, reducedMotion, revealTab]);

  useEffect(() => {
    if (!isHomeEntry) return;
    setSuppressInitialContentMotion(false);
  }, [isHomeEntry]);

  const libraryContentEntering = suppressInitialContentMotion || reducedMotion
    ? undefined
    : FadeInRight.duration(Duration.normal).easing(Ease.out);

  // Re-sync param-driven state on every focus so repeat pushes with different
  // ?tab=… or ?source=… values actually take effect (useState initializer
  // only fires once).
  useFocusEffect(
    useCallback(() => {
      if (params.tab && (VALID_TABS as string[]).includes(params.tab)) {
        setActiveTab(params.tab as Tab);
      }
      if (params.type && (VALID_TYPES as string[]).includes(params.type)) {
        setHighlightTypeFilter(params.type as HighlightTypeFilter);
      }
      if (params.source && (VALID_SOURCES as string[]).includes(params.source)) {
        setHighlightSourceFilter(params.source as HighlightSourceFilter);
      }
    }, [params.tab, params.type, params.source]),
  );

  const bookmarks = useUnfoldStore((s) => s.bookmarks);
  const devotionals = useUnfoldStore((s) => s.devotionals);

  const saved = useSavedHighlights();

  // Search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const highlightsForFilter = useMemo(() => {
    const byType =
      highlightTypeFilter === 'notes'
        ? saved.notes
        : highlightTypeFilter === 'highlights'
          ? saved.highlights
          : saved.all;

    if (highlightSourceFilter === 'all') return byType;
    return byType.filter((item) => item.source === highlightSourceFilter);
  }, [highlightTypeFilter, highlightSourceFilter, saved.all, saved.highlights, saved.notes]);

  const filteredHighlights = useMemo(() => {
    if (!searchQuery.trim()) return highlightsForFilter;
    const q = searchQuery.toLowerCase();
    return highlightsForFilter.filter(item =>
      item.text.toLowerCase().includes(q) ||
      item.note?.toLowerCase().includes(q) ||
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

  const handleTabPress = useCallback((tab: Tab) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  }, []);

  const handleFilterPress = useCallback((filter: HighlightChip) => {
    Haptics.selectionAsync();
    if (filter === 'all') {
      setHighlightTypeFilter('all');
      setHighlightSourceFilter('all');
    } else if (filter === 'notes' || filter === 'highlights') {
      setHighlightTypeFilter(filter);
      setHighlightSourceFilter('all');
    } else {
      setHighlightTypeFilter('all');
      setHighlightSourceFilter(filter);
    }
  }, []);

  const handleHighlightPress = useCallback((item: SavedItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (item.source === 'devotional') {
      const h = item.raw as Highlight;
      router.push({
        pathname: resolveStackRoute(hostTab, 'reading'),
        params: {
          devotionalId: h.devotionalId,
          dayNumber: h.dayNumber.toString(),
          highlightId: h.id,
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
        ...(item.kind === 'note' ? { openNote: 'true', noteId: b.id } : {}),
      },
    });
  }, [hostTab, router]);

  const handleBookmarkPress = useCallback((item: SavedBookmarkItem) => {
    router.push({
      pathname: resolveStackRoute(hostTab, 'reading'),
      params: {
        devotionalId: item.raw.devotionalId,
        dayNumber: item.raw.dayNumber.toString(),
        bookmarkId: item.raw.id,
      },
    });
  }, [hostTab, router]);

  const devotionalById = useMemo(() => {
    const map = new Map<string, Devotional>();
    for (const d of devotionals) map.set(d.id, d);
    return map;
  }, [devotionals]);

  // Single virtualized data source for whichever tab is active. All per-row
  // store lookups (series title, day metadata, quote fallbacks) are resolved
  // here so row components stay pure and memo-friendly.
  const rows = useMemo<LibraryRow[]>(() => {
    if (activeTab === 'highlights') {
      return filteredHighlights.map((item) => ({
        kind: 'saved' as const,
        key: `${item.source}:${item.id}`,
        item,
      }));
    }
    return filteredBookmarks.map((bookmark) => ({
      kind: 'bookmark' as const,
      key: bookmark.id,
      item: toBookmarkSavedItem(bookmark, devotionalById.get(bookmark.devotionalId)),
    }));
  }, [activeTab, filteredHighlights, filteredBookmarks, devotionalById]);

  const renderRow = useCallback<ListRenderItem<LibraryRow>>(({ item }) => {
    switch (item.kind) {
      case 'saved':
        return <SavedRow item={item.item} colors={colors} isDark={isDark} onPress={handleHighlightPress} />;
      case 'bookmark':
        return <BookmarkRow item={item.item} colors={colors} onPress={handleBookmarkPress} />;
    }
  }, [colors, isDark, handleHighlightPress, handleBookmarkPress]);

  const keyExtractor = useCallback((item: LibraryRow) => item.key, []);

  // Notes and highlights have very different heights — separate recycle pools.
  const getItemType = useCallback(
    (item: LibraryRow) => (item.kind === 'saved' ? `saved:${item.item.kind}` : item.kind),
    [],
  );

  // The 'highlights' tab holds BOTH saved highlights and notes (saved.count.all),
  // so labeling it "Highlights" both mislabels the mixed collection and collides
  // with the in-tab "Highlights" filter chip below — a duplicated taxonomy
  // (brief §3 #28). Display it as "Saved"; the chip keeps the only "Highlights"
  // label, now meaning highlight-type items only. The tab `id` stays
  // 'highlights' so deep-link routing (?tab=highlights) is unchanged.
  // Reflections live on the Journal tab (Journal › Reflections); Library keeps
  // only the reading-derived collections.
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'highlights', label: 'Saved', count: saved.count.all },
    { id: 'bookmarks', label: 'Bookmarks', count: bookmarks.length },
  ];

  const highlightFilters: { id: HighlightChip; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: saved.count.all },
    { id: 'notes', label: 'Notes', count: saved.count.notes },
    { id: 'highlights', label: 'Highlights', count: saved.count.highlights },
    { id: 'devotional', label: 'Devotional', count: saved.count.devotional },
    { id: 'bible', label: 'Bible', count: saved.count.bible },
  ];

  const activeHighlightChip: HighlightChip =
    highlightSourceFilter !== 'all'
      ? highlightSourceFilter
      : highlightTypeFilter === 'notes' || highlightTypeFilter === 'highlights'
        ? highlightTypeFilter
        : 'all';

  // Filter chips ride above the rows as the list header so they scroll with the
  // Saved tab exactly like they did inside the old ScrollView.
  const listHeader = activeTab === 'highlights' ? (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing['2'],
        marginBottom: Spacing['4'],
      }}
    >
      {highlightFilters.map((f) => {
        const isActive = activeHighlightChip === f.id;
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
  ) : null;

  const listEmpty =
    activeTab === 'highlights' ? (
      <EmptyState
        icon={HighlighterIcon}
        title="No highlights yet."
        subtitle={
          activeHighlightChip === 'bible'
            ? 'Tap a verse in the Bible reader to save it here.'
            : activeHighlightChip === 'devotional'
              ? 'Select text while reading a devotional to save it here.'
              : activeHighlightChip === 'notes'
                ? 'Add a note to a Bible verse to save it here.'
                : activeHighlightChip === 'highlights'
                  ? 'Highlight a devotional or Bible verse to save it here.'
                  : 'Select text in a devotional or Bible verse to save it here.'
        }
      />
    ) : (
      <EmptyState
        icon={BookmarkSimpleIcon}
        title="No bookmarks yet."
        subtitle="Tap the bookmark icon while reading to save scriptures."
      />
    );

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
              selectionColor={colors.accent}
              cursorColor={colors.accent}
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

      {/* Preserve the native scroll ref; these tabs use only inline styles. */}
      <ScrollView
        cssInterop={false}
        ref={tabBarRef}
        horizontal
        onContentSizeChange={() => revealTab(activeTab, false)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: 'center',
          paddingHorizontal: Spacing['5'],
          paddingBottom: Spacing['4'],
          gap: Spacing['2'],
        }}
        style={{
          flexGrow: 0,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        {tabs.map((tab, index) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity activeOpacity={0.7}
              key={tab.id}
              onPress={() => handleTabPress(tab.id)}
              onLayout={({ nativeEvent }) => {
                tabOffsets.current[tab.id] = nativeEvent.layout.x;
                if (isActive) revealTab(tab.id, false);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${tab.label}, ${tab.count} ${tab.count === 1 ? 'item' : 'items'}, ${index + 1} of ${tabs.length}`}
              style={{
                flexShrink: 0,
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 44,
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
                    flexShrink: 0,
                  }}
                >
                  {tab.label}
                </Text>
                <View
                  style={{
                    minWidth: 18,
                    minHeight: 18,
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
      </ScrollView>

      {/* Tab Content — one FlashList over the active tab's rows. */}
      <Animated.View key={activeTab} entering={libraryContentEntering} style={{ flex: 1 }}>
        <FlashList
          data={rows}
          renderItem={renderRow}
          keyExtractor={keyExtractor}
          getItemType={getItemType}
          extraData={colors}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
          contentContainerStyle={LIST_CONTENT_STYLE}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      </Animated.View>
    </SafeAreaView>
  );
}

/** Optional primary action for an empty state — rendered with the same
 *  filled-accent-pill anatomy as the Notebook ghost-note CTA (the quality bar
 *  this surface unifies toward, brief §3 #28 / §4 #3). */
type EmptyStateCta = {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
};

function EmptyState({
  icon: Icon,
  title,
  subtitle,
  cta,
}: {
  icon: typeof PencilLineIcon;
  title: string;
  subtitle: string;
  cta?: EmptyStateCta;
}) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();

  // Gentle breathing pulse on the icon
  const iconPulse = useSharedValue(1);
  useEffect(() => {
    if (reducedMotion) {
      iconPulse.value = 1;
      return () => cancelAnimation(iconPulse);
    }

    iconPulse.value = withRepeat(
      withTiming(1.1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    return () => cancelAnimation(iconPulse);
  }, [iconPulse, reducedMotion]);

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
        {/* Accent icon at the quality-bar weight/opacity (matches Notebook). */}
        <Icon size={28} color={colors.accent} weight="light" style={{ opacity: 0.5 }} />
      </Animated.View>
      <Text
        style={{
          fontFamily: FontFamily.display,
          fontSize: 20,
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
          marginBottom: cta ? Spacing['6'] : 0,
        }}
      >
        {subtitle}
      </Text>
      {cta && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={cta.onPress}
          accessibilityRole="button"
          accessibilityLabel={cta.accessibilityLabel ?? cta.label}
          style={{
            backgroundColor: colors.accent,
            borderRadius: Radius.md,
            paddingVertical: 14,
            paddingHorizontal: 24,
            shadowColor: colors.accent,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 12,
            elevation: 4,
          }}
        >
          <Text
            style={{
              fontFamily: FontFamily.uiSemiBold,
              fontSize: 15,
              color: colors.background,
            }}
          >
            {cta.label}
          </Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}
