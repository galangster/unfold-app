import { useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { CaretLeftIcon, CaretRightIcon } from '@/components/icons';
import { FontFamily } from '@/constants/fonts';
import { useCrossTabBack } from '@/hooks/useCrossTabBack';
import { useCalendarNow } from '@/hooks/useCalendarNow';
import { useAdaptiveLayout } from '@/hooks/useAdaptiveLayout';
import { adaptiveFrameStyle } from '@/lib/adaptive-layout';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { resolveStackRoute, type TabGroup } from '@/lib/tab-stack-routes';
import { ProfileEntryButton } from '@/components/ProfileEntryButton';
import { addAppBreadcrumb } from '@/lib/sentry';
import { BookOfSeasonsView } from '@/components/book/BookOfSeasonsView';
import { markShelfContentsReady } from '@/lib/shelf-opening';
import { getSeriesCover } from '@/lib/series-cover';
import { seriesReadingProgress } from '@/lib/bookshelf';

function PastSeriesLink({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return <TouchableOpacity testID="book-past-series" activeOpacity={0.7} onPress={onPress}
    accessibilityRole="button" accessibilityLabel="Past series"
    accessibilityHint="Opens your library of past and in-progress series" style={styles.pastSeriesLink}>
    <Text style={[styles.pastSeriesLabel, { color: colors.textMuted }]}>Past series</Text>
    <CaretRightIcon size={14} color={colors.textMuted} />
  </TouchableOpacity>;
}
export type SeriesArcChrome = 'stack' | 'tabRoot';
interface SeriesArcScreenProps { hostTab?: TabGroup; chrome?: SeriesArcChrome }

export function SeriesArcScreen({ hostTab, chrome = 'stack' }: SeriesArcScreenProps = {}) {
  const layout = useAdaptiveLayout();
  const frameStyle = adaptiveFrameStyle(layout.clusterMaxWidth);
  const router = useRouter();
  const { id: paramId, shelfOpening } = useLocalSearchParams<{ id?: string; shelfOpening?: string }>();
  const { colors, isDark } = useTheme();
  const { handleBack } = useCrossTabBack();
  const devotionals = useUnfoldStore(s => s.devotionals);
  const currentDevotionalId = useUnfoldStore(s => s.currentDevotionalId);
  const now = useCalendarNow();
  const id = paramId ?? (chrome === 'tabRoot' ? currentDevotionalId : undefined);
  const devotional = useMemo(() => devotionals.find(d => d.id === id) ?? null, [devotionals, id]);
  const paper = isDark ? '#1B1C17' : '#F5EEDF';
  const cover = getSeriesCover(id ?? '');
  const openPastSeries = useCallback(() => {
    router.push({ pathname: resolveStackRoute('(study)', 'past-devotionals'), params: { from: 'study' } });
  }, [router]);
  const handleDayPress = useCallback((dayNumber: number, openingId?: string) => {
    if (!devotional) return;
    addAppBreadcrumb('series', 'opened-day');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: resolveStackRoute(hostTab, 'reading'),
      params: {
        devotionalId: devotional.id, dayNumber: String(dayNumber),
        ...(openingId ? { bookOpening: openingId } : {}),
        ...(chrome !== 'tabRoot' ? { readOnly: '1' } : {}),
      },
    });
  }, [devotional, router, hostTab, chrome]);

  if (!devotional) return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
      <View style={[frameStyle, { flex: 1 }]} onLayout={() => markShelfContentsReady(shelfOpening)}>
        {chrome === 'tabRoot' ? <View style={styles.emptyHeader}><ProfileEntryButton testID="study-profile-button" /></View>
          : <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={handleBack} style={styles.backButton}><CaretLeftIcon size={24} color={colors.textMuted} /></TouchableOpacity>}
        <View style={styles.emptyState}>
          <Text style={[styles.seriesTitle, { color: colors.text }]}>{chrome === 'tabRoot' ? 'No series in progress.' : 'Not Found'}</Text>
          {chrome === 'tabRoot' && <>
            <Text style={[styles.emptyBody, { color: colors.textMuted }]}>Begin a series on Today and its whole arc appears here.</Text>
            <TouchableOpacity onPress={() => router.navigate('/(tabs)/(today)')} accessibilityRole="button" accessibilityLabel="Go to Today" style={[styles.emptyCta, { backgroundColor: colors.accent }]}>
              <Text style={{ fontFamily: FontFamily.uiMedium, color: colors.background }}>Go to Today</Text>
            </TouchableOpacity>
            <PastSeriesLink onPress={openPastSeries} />
          </>}
        </View>
      </View>
    </SafeAreaView>
  </View>;

  const progress = seriesReadingProgress(devotional);
  const begun = new Date(devotional.seriesStartDate || devotional.createdAt);
  const dateLabel = Number.isFinite(begun.getTime()) ? begun.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  return <View style={{ flex: 1, backgroundColor: chrome === 'tabRoot' ? colors.background : paper }}>
    <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
      <View style={[frameStyle, { flex: 1 }]}>
        {chrome !== 'tabRoot' && <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} accessibilityRole="button" accessibilityLabel="Close book" style={styles.backButton}><CaretLeftIcon size={22} color={colors.textMuted} /></TouchableOpacity>
          <Text style={{ fontFamily: FontFamily.ui, fontSize: 13, color: colors.textMuted }}>Your library</Text>
          <Text style={{ marginLeft: 'auto', fontFamily: FontFamily.ui, fontSize: 12, color: colors.textMuted }}>{progress.complete ? `${progress.total} days completed` : `${progress.read} of ${progress.total} completed`}</Text>
        </View>}
        <ScrollView testID="series-detail-scroll" showsVerticalScrollIndicator={false} onContentSizeChange={() => markShelfContentsReady(shelfOpening)}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: chrome === 'tabRoot' ? 24 : 18, paddingBottom: 120 }}>
          {chrome !== 'tabRoot' && <View style={{ borderTopWidth: 1, borderColor: cover.gold + '66', paddingTop: 18, marginBottom: 14 }}>
            {dateLabel ? <Text style={{ fontFamily: FontFamily.ui, fontSize: 12, color: colors.textMuted }}>Begun {dateLabel}</Text> : null}
          </View>}
          <BookOfSeasonsView key={`book-of-seasons-${layout.fontScale}`} devotional={devotional} showAllReadings={chrome !== 'tabRoot'} now={now} colors={colors} isDark={isDark} onOpenDay={handleDayPress}
            headerAccessory={chrome === 'tabRoot' ? <ProfileEntryButton testID="study-profile-button" /> : undefined} />
          {chrome === 'tabRoot' ? <PastSeriesLink key={`book-archive-${layout.fontScale}`} onPress={openPastSeries} /> : <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: cover.gold + '66', marginTop: 24, paddingTop: 20, alignItems: 'center' }}>
            <Text style={{ fontFamily: FontFamily.display, fontSize: 18, color: colors.textMuted }}>Unfold</Text>
          </View>}
        </ScrollView>
      </View>
    </SafeAreaView>
  </View>;
}
export default function SeriesDetailScreen() { return <SeriesArcScreen />; }

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6, gap: 4 },
  backButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  seriesTitle: { fontFamily: FontFamily.display, fontSize: 30, lineHeight: 36 },
  emptyHeader: { alignItems: 'flex-end', paddingHorizontal: 20, paddingTop: 12 },
  emptyState: { flex: 1, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  emptyBody: { fontFamily: FontFamily.ui, fontSize: 15, textAlign: 'center', lineHeight: 23, marginTop: 12 },
  emptyCta: { minHeight: 48, paddingHorizontal: 26, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  pastSeriesLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 44, marginTop: 24, paddingHorizontal: 16 },
  pastSeriesLabel: { fontFamily: FontFamily.ui, fontSize: 13 },
});
