import { forwardRef, memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type ScrollViewProps } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import Animated, { interpolate, runOnJS, runOnUI, scrollTo, useAnimatedRef, useAnimatedReaction, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { SquaresFourIcon } from 'phosphor-react-native/src/icons/SquaresFour';
import { BookOpenIcon, CaretDownIcon, CaretLeftIcon, CaretRightIcon, DotsThreeIcon, MagnifyingGlassIcon, XIcon } from '@/components/icons';
import { SeriesBookCover } from '@/components/bookshelf/SeriesBookCover';
import { SeriesBookShareSheet } from '@/components/bookshelf/SeriesBookShareSheet';
import { ExportIcon } from 'phosphor-react-native/src/icons/Export';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, type Devotional } from '@/lib/store';
import { useCrossTabBack } from '@/hooks/useCrossTabBack';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import { filterShelf, resolveShelfSelection, seriesReadingProgress, type ShelfFilter } from '@/lib/bookshelf';
import { clearShelfOpening, useShelfOpening } from '@/lib/shelf-opening';
import { resolveStackRoute, type TabGroup } from '@/lib/tab-stack-routes';
import { exportDevotionalToPDF, isPDFExportSupported } from '@/lib/pdf-export';
import { mmkvStorage } from '@/lib/mmkv-storage';
import { addAppBreadcrumb } from '@/lib/sentry';

const HINT_KEY = 'unfold.bookshelf-discovered.v1';
const FILTER_LABELS = { all: 'All series', progress: 'In progress', completed: 'Completed' };
type Rect = { x: number; y: number; width: number; height: number };

// Keep the native ref through the inner RN 0.86 function component. The outer
// Animated.ScrollView bypass alone does not bypass NativeWind at that boundary.
const NativeShelfScrollView = forwardRef<ScrollView, ScrollViewProps>((props, ref) =>
  <ScrollView {...props} cssInterop={false} ref={ref} />);
NativeShelfScrollView.displayName = 'NativeShelfScrollView';
const AnimatedShelfScrollView = Animated.createAnimatedComponent(NativeShelfScrollView);

const ShelfBook = memo(function ShelfBook({ book, index, scroll, stride, width, height, selected, reducedMotion, onSelect, onOpen, onOptions }: {
  book: Devotional; index: number; scroll: SharedValue<number>; stride: number; width: number; height: number;
  selected: boolean; reducedMotion: boolean; onSelect: (index: number) => void;
  onOpen: (book: Devotional, rect?: Rect) => void; onOptions: (book: Devotional) => void;
}) {
  const ref = useRef<View>(null);
  const progress = seriesReadingProgress(book);
  const openingThisBook = useShelfOpening(state => state.session?.book.id === book.id);
  const style = useAnimatedStyle(() => {
    const distance = (scroll.value - index * stride) / stride;
    return { opacity: openingThisBook ? 0 : interpolate(Math.abs(distance), [0, 1], [1, 0.75], 'clamp'),
      transform: reducedMotion ? [] : [{ perspective: 1200 },
        { rotateY: `${interpolate(distance, [-1, 0, 1], [-5, 0, 5], 'clamp')}deg` }] };
  });
  return <View style={{ width: stride, height: height + 28, justifyContent: 'flex-end', paddingBottom: 14 }}>
    <Animated.View style={[{ width, transformOrigin: 'center bottom' }, style]}>
      <Pressable onPress={() => {
        if (!selected) { onSelect(index); return; }
        if (!ref.current) { onOpen(book); return; }
        ref.current.measureInWindow((x, y, w, h) => onOpen(book, w > 0 && h > 0 ? { x, y, width: w, height: h } : undefined));
      }} onLongPress={() => onOptions(book)} accessibilityRole="button"
        accessibilityLabel={`${book.title}, book ${index + 1}, ${progress.read} of ${progress.total} readings completed`}
        accessibilityHint={selected ? 'Opens this book' : 'Centers this book on the shelf'}
        accessibilityActions={[{ name: 'options', label: 'Book options' }]} onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'options') onOptions(book); }} accessibilityState={{ selected }} testID={`shelf-book-${index}`}>
        <View ref={ref} cssInterop={false} collapsable={false} style={{ width, height }}>
          <SeriesBookCover devotional={book} width={width} height={height} />
        </View>
      </Pressable>
    </Animated.View>
  </View>;
});

export function PastSeriesLibraryScreen({ hostTab }: { hostTab?: TabGroup } = {}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { handleBack, isFromHome } = useCrossTabBack();
  const { colors, isDark } = useTheme();
  const { width: windowWidth, height: windowHeight, fontScale } = useWindowDimensions();
  const { reducedMotion } = useAccessibleAnimation();
  const devotionals = useUnfoldStore(s => s.devotionals);
  const currentDevotionalId = useUnfoldStore(s => s.currentDevotionalId);
  const removeDevotional = useUnfoldStore(s => s.removeDevotional);
  const premiumPolicy = usePremiumAccessPolicy();
  const [filter, setFilter] = useState<ShelfFilter>('all');
  const [query, setQuery] = useState('');
  const search = useDeferredValue(query);
  const [searchVisible, setSearchVisible] = useState(false);
  const [grid, setGrid] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewportIndex, setViewportIndex] = useState(0);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [sharingBook, setSharingBook] = useState<Devotional | null>(null);
  const exporting = useRef(false);
  const [hint, setHint] = useState(() => mmkvStorage.getItem(HINT_KEY) !== '1');
  const [areaHeight, setAreaHeight] = useState(windowHeight - 260);
  const previousIndex = useRef(0);
  const selection = useRef<string | null>(null);
  const list = useAnimatedRef<ScrollView>();
  const searchInput = useRef<TextInput>(null);
  const selectedCover = useRef<View>(null);
  const opening = useRef(false);
  const scroll = useSharedValue(0);
  const books = useMemo(() => filterShelf(devotionals, filter, search), [devotionals, filter, search]);
  const index = resolveShelfSelection(books, selectedId, previousIndex.current);
  const selected = books[index];
  // Follow the viewport during a drag, before the selected book settles.
  const bookCount = books.length;
  const windowCenter = Math.min(viewportIndex, Math.max(0, bookCount - 1));
  const firstVisible = Math.max(0, windowCenter - 2);
  const lastVisible = Math.min(bookCount, windowCenter + 3);
  const width = Math.min(windowWidth, 600);
  const coverWidth = Math.round(width * 0.81);
  const stride = coverWidth + 22;
  const coverHeight = Math.round(Math.min(coverWidth * 1.4, Math.max(240, areaHeight - 200 * Math.min(fontScale, 1.35))));
  useAnimatedReaction(
    () => Math.max(0, Math.min(bookCount - 1, Math.round(scroll.value / stride))),
    (next, previous) => {
      if (next !== previous) runOnJS(setViewportIndex)(next);
    },
  );
  const textColor = isDark ? '#D5C6AC' : colors.text;
  const quietColor = isDark ? '#AEA596' : colors.textMuted;
  const background = isDark ? '#11120F' : '#F5F0E7';
  const moveShelf = useCallback((x: number, animated: boolean) => {
    if (!list.current) return;
    runOnUI((offset: number, shouldAnimate: boolean) => {
      'worklet';
      scrollTo(list, offset, 0, shouldAnimate);
    })(x, animated);
  }, [list]);
  const dismissHint = useCallback(() => { setHint(false); mmkvStorage.setItem(HINT_KEY, '1'); }, []);
  const selectIndex = useCallback((next: number, animated = true) => {
    const target = Math.max(0, Math.min(next, books.length - 1));
    if (!books[target]) return;
    previousIndex.current = target;
    selection.current = books[target].id;
    setSelectedId(books[target].id);
    requestAnimationFrame(() => moveShelf(target * stride, animated && !reducedMotion));
  }, [books, moveShelf, reducedMotion, stride]);
  useEffect(() => {
    const next = resolveShelfSelection(books, selection.current, previousIndex.current);
    previousIndex.current = next;
    selection.current = books[next]?.id ?? null;
    setSelectedId(selection.current);
    setViewportIndex(next);
    scroll.value = next * stride;
    const frame = requestAnimationFrame(() => moveShelf(next * stride, false));
    return () => cancelAnimationFrame(frame);
  }, [books, stride, grid, scroll, fontScale, moveShelf]);
  useEffect(() => useShelfOpening.subscribe(state => { if (!state.session) opening.current = false; }), []);
  useFocusEffect(useCallback(() => {
    opening.current = false;
    scroll.value = previousIndex.current * stride;
    const frame = requestAnimationFrame(() => moveShelf(previousIndex.current * stride, false));
    return () => {
      cancelAnimationFrame(frame);
      const session = useShelfOpening.getState().session;
      if (session && !session.committed) clearShelfOpening(session.id);
    };
  }, [moveShelf, scroll, stride]));
  const onScroll = useAnimatedScrollHandler({
    onScroll: event => {
      'worklet';
      scroll.value = Math.abs(event.contentOffset.x);
    },
  });
  const openBook = useCallback((book: Devotional, rect?: Rect) => {
    if (opening.current || useShelfOpening.getState().session) return;
    opening.current = true;
    dismissHint(); Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const navigate = (shelfOpening?: string) => {
      addAppBreadcrumb('history', 'opened-series');
      router.push({
        pathname: hostTab ? resolveStackRoute(hostTab, 'series-detail') : isFromHome ? '/(tabs)/(today)/series-detail' : '/(tabs)/(you)/series-detail',
        params: { id: book.id, ...(shelfOpening ? { shelfOpening } : {}) },
      });
    };
    if (!rect || reducedMotion) { navigate(); return; }
    useShelfOpening.setState({ session: {
      id: `shelf-${Date.now()}`, book, rect, background, ready: false, committed: false, navigate,
      paperColor: isDark ? '#1B1C17' : '#F5EEDF', inkColor: isDark ? '#E6DCC9' : '#302C22',
    } });
  }, [background, dismissHint, hostTab, isDark, isFromHome, reducedMotion, router]);
  const exportBook = useCallback(async (book: Devotional) => {
    if (exporting.current) return;
    if (premiumPolicy !== 'granted') { router.push('/paywall'); return; }
    if (!isPDFExportSupported()) return;
    exporting.current = true; setExportingId(book.id);
    try {
      const state = useUnfoldStore.getState();
      await exportDevotionalToPDF(book, {
        accentColor: colors.accent,
        journalEntries: state.journalEntries.filter(j => j.devotionalId === book.id).map(j => ({ dayNumber: j.dayNumber, content: j.content, questionResponses: j.questionResponses })),
        checkIns: state.checkIns.filter(c => c.devotionalId === book.id).map(c => ({ dayNumber: c.dayNumber, mood: c.mood, moodLabel: c.moodLabel })),
      });
    } catch { Alert.alert('Could not export this book', 'Please try again.'); }
    finally { exporting.current = false; setExportingId(null); }
  }, [colors.accent, premiumPolicy, router]);
  const deleteBook = useCallback((book: Devotional) => {
    Alert.alert('Delete this series?', `${book.id === currentDevotionalId ? 'This is your current series on Today. ' : ''}Its readings, journal entries, check-ins, highlights, and bookmarks will be removed. This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeDevotional(book.id) },
    ]);
  }, [currentDevotionalId, removeDevotional]);
  const options = useCallback((book: Devotional) => {
    Alert.alert(book.title, undefined, [
      { text: 'Share cover', onPress: () => setSharingBook(book) },
      ...(isPDFExportSupported() ? [{ text: exportingId === book.id ? 'Exporting…' : 'Export PDF', onPress: () => { void exportBook(book); } }] : []),
      { text: 'Delete series', style: 'destructive', onPress: () => deleteBook(book) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [deleteBook, exportBook, exportingId]);
  const filterMenu = () => Alert.alert('Show series', undefined, [
    ...(['all', 'progress', 'completed'] as const).map(value => ({ text: FILTER_LABELS[value], onPress: () => setFilter(value) })),
    { text: 'Cancel', style: 'cancel' },
  ]);
  const progress = selected ? seriesReadingProgress(selected) : null;
  const stateLabel = progress ? [
    selected.id === currentDevotionalId ? 'Current series' : progress.complete ? 'Completed' : 'Paused',
    `${progress.read} of ${progress.total} readings`,
  ].join(' · ') : '';
  const navigateSelected = () => {
    if (!selected) return;
    if (!selectedCover.current) { openBook(selected); return; }
    selectedCover.current.measureInWindow((x, y) => openBook(selected, { x: x + 24, y: y + 14, width: coverWidth, height: coverHeight }));
  };
  const empty = devotionals.length === 0 ? 'Your collection begins here.' : query.trim() ? 'No books found.' : filter === 'completed' ? 'No completed series yet.' : 'No series in progress.';
  return <View style={{ flex: 1, backgroundColor: background }}>
    <SafeAreaView key={fontScale} edges={['top', 'left', 'right']} style={{ flex: 1, paddingBottom: Math.max(insets.bottom, 8) + 52 }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 600, alignSelf: 'center' }}>
        <View style={styles.header}>
          <Pressable onPress={handleBack} accessibilityRole="button" accessibilityLabel="Go back" style={styles.icon}><CaretLeftIcon size={23} color={quietColor} /></Pressable>
          <Text accessibilityRole="header" style={[styles.heading, { color: textColor }]}>Your library</Text>
          <Pressable onPress={() => { setSearchVisible(v => !v); if (!searchVisible) setGrid(true); else { setQuery(''); Keyboard.dismiss(); } }} accessibilityRole="button" accessibilityLabel={searchVisible ? 'Close search' : 'Search series'} style={styles.icon}><MagnifyingGlassIcon size={23} color={quietColor} /></Pressable>
          <Pressable onPress={() => setGrid(v => !v)} accessibilityRole="button" accessibilityLabel={grid ? 'Show bookshelf' : 'Show grid'} style={styles.icon}>{grid ? <BookOpenIcon size={24} color={quietColor} /> : <SquaresFourIcon size={24} color={quietColor} />}</Pressable>
        </View>
        <View style={styles.filterRow}>
          <Pressable onPress={filterMenu} style={styles.filter} accessibilityRole="button" accessibilityLabel={`Filter: ${FILTER_LABELS[filter]}`}>
            <Text style={[styles.meta, { color: quietColor }]}>{FILTER_LABELS[filter]}</Text><CaretDownIcon size={13} color={quietColor} />
          </Pressable>
          {selected && <Pressable onPress={() => options(selected)} accessibilityRole="button" accessibilityLabel="Book options" style={styles.icon}><DotsThreeIcon size={24} color={quietColor} /></Pressable>}
        </View>
        {searchVisible && <View style={[styles.search, { borderColor: colors.border }]}>
          <TextInput autoFocus ref={searchInput} defaultValue={query} onChangeText={setQuery} placeholder="Title, reading, or scripture" placeholderTextColor={quietColor} style={[styles.input, { color: textColor }]} accessibilityLabel="Search series" autoCorrect={false} autoCapitalize="none" returnKeyType="search" onSubmitEditing={Keyboard.dismiss} />
          {query ? <Pressable onPress={() => { searchInput.current?.clear(); setQuery(''); }} accessibilityRole="button" accessibilityLabel="Clear search" style={styles.icon}><XIcon size={19} color={quietColor} /></Pressable> : null}
        </View>}
        {books.length === 0 ? <View style={styles.empty}>
          <BookOpenIcon size={40} color={quietColor} weight="light" /><Text style={[styles.emptyTitle, { color: textColor }]}>{empty}</Text>
          <Pressable style={styles.action} onPress={() => { if (!devotionals.length) router.navigate('/(tabs)/(today)'); else { searchInput.current?.clear(); setQuery(''); setFilter('all'); } }} accessibilityRole="button">
            <Text style={[styles.actionText, { color: colors.accent }]}>{devotionals.length ? 'Show all series' : 'Go to Today'}</Text>
          </Pressable>
        </View> : grid ? <FlashList key="grid" numColumns={2} data={books} keyExtractor={book => book.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24 }} renderItem={({ item, index: bookIndex }) => <Pressable accessibilityRole="button" accessibilityLabel={`View ${item.title} on shelf`} onPress={() => { Keyboard.dismiss(); selectIndex(bookIndex, false); setGrid(false); }} onLongPress={() => options(item)} accessibilityActions={[{ name: 'options', label: 'Book options' }]} onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'options') options(item); }} style={{ padding: 8 }}>
          <SeriesBookCover devotional={item} width={(width - 68) / 2} height={(width - 68) / 2 * 1.4} compact />
        </Pressable>} /> : <View style={{ flex: 1 }} onLayout={event => setAreaHeight(event.nativeEvent.layout.height)}>
          <View ref={selectedCover} cssInterop={false} collapsable={false} style={{ height: coverHeight + 28, marginTop: 8 }}>
            <AnimatedShelfScrollView ref={list} horizontal
              showsHorizontalScrollIndicator={false} snapToInterval={stride} decelerationRate="fast" disableIntervalMomentum
              contentContainerStyle={{ paddingLeft: 24, paddingRight: Math.max(0, width - stride - 24) }}
              onScroll={onScroll} scrollEventThrottle={16} onScrollBeginDrag={dismissHint}
              onMomentumScrollEnd={event => {
                if (opening.current) return;
                const next = Math.max(0, Math.min(books.length - 1, Math.round(Math.abs(event.nativeEvent.contentOffset.x) / stride)));
                if (next !== previousIndex.current) Haptics.selectionAsync();
                previousIndex.current = next; selection.current = books[next]?.id ?? null; setSelectedId(selection.current);
              }}
            >
              <View style={{ width: firstVisible * stride }} />
              {books.slice(firstVisible, lastVisible).map((book, offset) => <ShelfBook key={book.id} book={book} index={firstVisible + offset} scroll={scroll} stride={stride} width={coverWidth} height={coverHeight}
                selected={book.id === selected?.id} reducedMotion={reducedMotion} onSelect={selectIndex} onOpen={openBook} onOptions={options} />)}
              <View style={{ width: (books.length - lastVisible) * stride }} />
            </AnimatedShelfScrollView>
          </View>
          <View pointerEvents="none" style={{ height: 24, marginTop: -14 }}>
            <LinearGradient colors={isDark ? ['#B18C482A', '#66512C44', '#17181100'] : ['#B18C483A', '#AE936431', '#F5F0E700']} locations={[0, 0.3, 1]} style={StyleSheet.absoluteFill} />
            <View style={{ height: 1, backgroundColor: isDark ? '#B2985D70' : '#B29C6C80' }} />
          </View>
          <View style={styles.caption}>
            <Text style={[styles.status, { color: quietColor }]}>{stateLabel}</Text>
            <View style={styles.actions}>
              <Pressable onPress={navigateSelected} accessibilityRole="button" accessibilityLabel="Open book" testID="shelf-open-book" style={styles.action}>
                <Text style={[styles.actionText, { color: colors.accent }]}>Open book</Text><CaretRightIcon size={20} color={colors.accent} weight="light" />
              </Pressable>
              <Pressable cssInterop={false} onPress={() => setSharingBook(selected)} accessibilityRole="button" accessibilityLabel="Share cover" accessibilityHint="Previews an image of this book" testID="shelf-share-cover" style={({ pressed }) => [styles.share, { opacity: pressed ? 0.6 : 1 }]}>
                <ExportIcon size={18} color={quietColor} /><Text style={[styles.meta, { color: quietColor }]}>Share cover</Text>
              </Pressable>
            </View>
            {exportingId && <ActivityIndicator color={colors.accent} size="small" accessibilityLabel="Exporting book" />}
            {hint && <Text style={[styles.hint, { color: quietColor }]}>{books.length > 1 ? 'Swipe to browse. Tap to open.' : 'Tap the cover to open your book.'}</Text>}
            {books.length > 1 && <View style={styles.pagination}>
              <Pressable onPress={() => selectIndex(index - 1)} disabled={index === 0} accessibilityRole="button" accessibilityLabel="Previous book" style={[styles.icon, { opacity: index === 0 ? 0.2 : 0.8 }]}><CaretLeftIcon size={15} color={quietColor} /></Pressable>
              <Text style={[styles.position, { color: quietColor }]} accessibilityLiveRegion="polite">{index + 1} of {books.length}</Text>
              <Pressable onPress={() => selectIndex(index + 1)} disabled={index === books.length - 1} accessibilityRole="button" accessibilityLabel="Next book" style={[styles.icon, { opacity: index === books.length - 1 ? 0.2 : 0.8 }]}><CaretRightIcon size={15} color={quietColor} /></Pressable>
            </View>}
          </View>
        </View>}
      </View>
    </SafeAreaView>
    {sharingBook && <SeriesBookShareSheet book={sharingBook} onClose={() => setSharingBook(null)} />}
  </View>;
}
export default function PastDevotionalsScreen() { return <PastSeriesLibraryScreen />; }
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  icon: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  heading: { flex: 1, fontFamily: FontFamily.display, fontSize: 27, paddingLeft: 4 },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, minHeight: 44 },
  filter: { flexDirection: 'row', gap: 9, alignItems: 'center', minHeight: 44 },
  meta: { fontFamily: FontFamily.ui, fontSize: 13 },
  search: { marginHorizontal: 24, marginBottom: 8, flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minWidth: 0, fontFamily: FontFamily.ui, fontSize: 16, paddingVertical: 12 },
  caption: { alignItems: 'center', paddingHorizontal: 24, flex: 1, paddingTop: 8 },
  status: { fontFamily: FontFamily.ui, fontSize: 12, textAlign: 'center', lineHeight: 19 },
  action: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 14 },
  actionText: { fontFamily: FontFamily.display, fontSize: 28 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 8 },
  share: { minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12 },
  hint: { fontFamily: FontFamily.ui, fontSize: 11, textAlign: 'center', marginTop: 2 },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginTop: 'auto' },
  position: { fontFamily: FontFamily.ui, fontSize: 12, fontVariant: ['tabular-nums'] },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, padding: 28 },
  emptyTitle: { fontFamily: FontFamily.display, fontSize: 30, textAlign: 'center' },
});
