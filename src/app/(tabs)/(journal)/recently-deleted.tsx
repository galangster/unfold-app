/**
 * Recently Deleted (WR-15) — soft-kept notes, restorable for 30 days.
 * Restore reuses the WR-04 un-tombstone path so the note also returns
 * server-side; entries purge automatically on launch after 30 days.
 */
import { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CaretLeftIcon, ArrowCounterClockwiseIcon } from '@/components/icons';
import { FontFamily } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { goBackOr } from '@/lib/navigation';
import { useUnfoldStore } from '@/lib/store';
import { stripHtml, isHtmlContent } from '@/lib/note-html';
import { buildJournalMonthMarkers, formatJournalDay, sortJournalItemsByDateDescending } from '@/lib/journal-month-groups';

const RETENTION_DAYS = 30;

export default function RecentlyDeletedScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const deletedNotes = useUnfoldStore((s) => s.deletedNotes);
  const restoreNote = useUnfoldStore((s) => s.restoreNote);
  const orderedDeletedNotes = useMemo(
    () => sortJournalItemsByDateDescending(deletedNotes, ({ note }) => note.updatedAt),
    [deletedNotes],
  );
  const monthMarkers = useMemo(
    () => buildJournalMonthMarkers(orderedDeletedNotes, ({ note }) => note.updatedAt),
    [orderedDeletedNotes],
  );

  const handleRestore = (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    restoreNote(id);
    if (useUnfoldStore.getState().deletedNotes.length === 0) {
      goBackOr(router, '/(tabs)/(journal)');
    }
  };

  const daysLeft = (deletedAt: string): number => {
    const elapsed = Date.now() - new Date(deletedAt).getTime();
    return Math.max(0, RETENTION_DAYS - Math.floor(elapsed / (24 * 60 * 60 * 1000)));
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              goBackOr(router, '/(tabs)/(journal)');
            }}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.headerAction}
          >
            <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Recently Deleted</Text>
        </View>

        <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.retention, { color: colors.textMuted }]}>
            {`Notes stay here for ${RETENTION_DAYS} days, then are removed from this device.`}
          </Text>

          {orderedDeletedNotes.length === 0 ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Nothing here.</Text>
              <Text style={[styles.emptyBody, { color: colors.textMuted }]}>Deleted notes will appear here until their retention period ends.</Text>
            </View>
          ) : (
            orderedDeletedNotes.map(({ note, deletedAt }, index) => {
              const preview = isHtmlContent(note.content) ? stripHtml(note.content) : note.content;
              const remaining = daysLeft(deletedAt);
              const marker = monthMarkers[index];
              return (
                <Animated.View
                  key={note.id}
                  entering={reducedMotion ? undefined : FadeInDown.duration(Duration.normal).delay(Math.min(index, 6) * 60).easing(Ease.out)}
                >
                  {marker ? (
                    <View style={styles.monthHeader} accessibilityRole="header">
                      <Text style={[styles.monthTitle, { color: colors.text }]}>{marker.label}</Text>
                      <Text style={[styles.monthCount, { color: colors.textSubtle }]}>{marker.countLabel}</Text>
                    </View>
                  ) : null}
                  <View style={[styles.noteRow, { borderBottomColor: colors.border }]}>
                    <View style={styles.dateColumn}>
                      <Text style={[styles.day, { color: colors.text }]}>{formatJournalDay(note.updatedAt)}</Text>
                    </View>
                    <View style={styles.noteContent}>
                      <Text numberOfLines={2} style={[styles.noteTitle, { color: colors.text }]}>{note.title || 'Untitled note'}</Text>
                      {preview ? <Text numberOfLines={2} style={[styles.preview, { color: colors.textMuted }]}>{preview.trim()}</Text> : null}
                      <Text style={[styles.expiry, { color: colors.textSubtle }]}>{remaining === 0 ? 'Expires today' : `${remaining} days left`}</Text>
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => handleRestore(note.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Restore ${note.title || 'untitled note'}`}
                      style={[styles.restoreAction, { borderColor: colors.border }]}
                    >
                      <ArrowCounterClockwiseIcon size={15} color={colors.accent} weight="bold" />
                      <Text style={[styles.restoreText, { color: colors.accent }]}>Restore</Text>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing['4'] },
  headerAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontFamily: FontFamily.display, fontSize: 24, lineHeight: 30, marginLeft: Spacing['1'] },
  content: { paddingHorizontal: Spacing['6'], paddingBottom: Spacing['12'] },
  retention: { fontFamily: FontFamily.body, fontSize: 14, lineHeight: 21, marginTop: Spacing['2'], marginBottom: Spacing['3'] },
  empty: { alignItems: 'center', paddingTop: Spacing['12'], paddingHorizontal: Spacing['6'] },
  emptyTitle: { fontFamily: FontFamily.display, fontSize: 24, lineHeight: 30, marginBottom: Spacing['2'] },
  emptyBody: { fontFamily: FontFamily.body, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  monthHeader: { minHeight: 48, paddingTop: Spacing['5'], paddingBottom: Spacing['2'], flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  monthTitle: { flex: 1, fontFamily: FontFamily.display, fontSize: 22, lineHeight: 28 },
  monthCount: { fontFamily: FontFamily.uiMedium, fontSize: 11, lineHeight: 18, letterSpacing: 0.35, textTransform: 'uppercase' },
  noteRow: { minHeight: 122, paddingVertical: Spacing['4'], borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'flex-start', gap: Spacing['3'] },
  dateColumn: { minWidth: 34, alignItems: 'center' },
  day: { fontFamily: FontFamily.display, fontSize: 23, lineHeight: 28 },
  noteContent: { flex: 1, minWidth: 0 },
  noteTitle: { fontFamily: FontFamily.display, fontSize: 18, lineHeight: 23, marginBottom: Spacing['1'] },
  preview: { fontFamily: FontFamily.body, fontSize: 14, lineHeight: 20, marginBottom: Spacing['1.5'] },
  expiry: { fontFamily: FontFamily.ui, fontSize: 12, lineHeight: 18 },
  restoreAction: { minWidth: 44, minHeight: 44, paddingHorizontal: Spacing['2'], borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing['1'] },
  restoreText: { fontFamily: FontFamily.uiMedium, fontSize: 12 },
});
