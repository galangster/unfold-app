/**
 * Recently Deleted (WR-15) — soft-kept notes, restorable for 30 days.
 * Restore reuses the WR-04 un-tombstone path so the note also returns
 * server-side; entries purge automatically on launch after 30 days.
 */
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CaretLeftIcon, ArrowCounterClockwiseIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { stripHtml, isHtmlContent } from '@/lib/note-html';

const RETENTION_DAYS = 30;

export default function RecentlyDeletedScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const deletedNotes = useUnfoldStore((s) => s.deletedNotes);
  const restoreNote = useUnfoldStore((s) => s.restoreNote);

  const handleRestore = (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    restoreNote(id);
    if (useUnfoldStore.getState().deletedNotes.length === 0) {
      router.back();
    }
  };

  const daysLeft = (deletedAt: string): number => {
    const elapsed = Date.now() - new Date(deletedAt).getTime();
    return Math.max(0, RETENTION_DAYS - Math.floor(elapsed / (24 * 60 * 60 * 1000)));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing['4'], paddingVertical: Spacing['3'] }}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ padding: Spacing['2'] }}
          >
            <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
          </TouchableOpacity>
          <Text style={{ fontFamily: FontFamily.display, fontSize: 20, color: colors.text, marginLeft: Spacing['2'] }}>
            Recently Deleted
          </Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: Spacing['6'], paddingBottom: Spacing['12'] }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={{ fontFamily: FontFamily.body, fontSize: 13, lineHeight: 19, color: colors.textHint, marginBottom: Spacing['5'] }}>
            {`Notes stay here for ${RETENTION_DAYS} days, then are removed from this device.`}
          </Text>

          {deletedNotes.length === 0 ? (
            <Text style={{ fontFamily: FontFamily.body, fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: Spacing['10'] }}>
              Nothing here.
            </Text>
          ) : (
            deletedNotes.map(({ note, deletedAt }, index) => {
              const preview = isHtmlContent(note.content) ? stripHtml(note.content) : note.content;
              const remaining = daysLeft(deletedAt);
              return (
                <Animated.View
                  key={note.id}
                  entering={reducedMotion ? undefined : FadeInDown.duration(Duration.normal).delay(Math.min(index, 6) * 60).easing(Ease.out)}
                >
                  <View
                    style={{
                      backgroundColor: colors.inputBackground,
                      borderRadius: Radius.lg,
                      borderWidth: 1,
                      borderColor: colors.border,
                      padding: Spacing['5'],
                      marginBottom: Spacing['3'],
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing['2'] }}>
                      <Text
                        numberOfLines={1}
                        style={{ flex: 1, fontFamily: FontFamily.uiMedium, fontSize: 15, color: colors.text, marginRight: Spacing['3'] }}
                      >
                        {note.title || 'Untitled note'}
                      </Text>
                      <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 11, color: colors.textHint }}>
                        {remaining === 0 ? 'Expires today' : `${remaining}d left`}
                      </Text>
                    </View>
                    {preview ? (
                      <Text
                        numberOfLines={2}
                        style={{ fontFamily: FontFamily.body, fontSize: 13, lineHeight: 19, color: colors.textMuted, marginBottom: Spacing['3'] }}
                      >
                        {preview.trim()}
                      </Text>
                    ) : null}
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => handleRestore(note.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Restore ${note.title || 'untitled note'}`}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        alignSelf: 'flex-start',
                        gap: Spacing['1.5'],
                        paddingVertical: Spacing['1.5'],
                        paddingHorizontal: Spacing['3'],
                        borderRadius: Radius.md,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <ArrowCounterClockwiseIcon size={14} color={colors.accent} weight="bold" />
                      <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 13, color: colors.accent }}>
                        Restore
                      </Text>
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
