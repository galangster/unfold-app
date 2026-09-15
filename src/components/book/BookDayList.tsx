import { TouchableOpacity, StyleSheet, Text, View } from 'react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { CaretRightIcon, CheckIcon } from '@/components/icons';
import type { ColorTheme } from '@/constants/colors';
import type { Devotional } from '@/lib/store';
import { getDayMenuPresentation, getTodayReaderDayNumber, isDevotionalDaySelectable } from '@/lib/devotional-day-access';
import { getServerOwnedSeriesTotalDays } from '@/lib/devotional-series-boundary';
import { selectRenderableDevotionalDay } from '@/lib/devotional-canonical-days';
import { listDaysInOrder } from '@/lib/book-of-seasons';

/** Older series have no acts. Keep their existing readings within reach. */
export function BookDayList({ devotional, now, colors, onOpenDay }: {
  devotional: Devotional;
  now: Date;
  colors: ColorTheme;
  onOpenDay: (dayNumber: number) => void;
}) {
  const totalDays = getServerOwnedSeriesTotalDays(devotional);
  const dayNumbers = [...new Set(listDaysInOrder(devotional.days)
    .filter((day) => Number.isInteger(day.dayNumber) && day.dayNumber >= 1 && day.dayNumber <= totalDays)
    .map((day) => day.dayNumber))];
  if (dayNumbers.length === 0) return null;

  return (
    <View testID="book-day-list">
      {dayNumbers.map((dayNumber) => {
        const isRead = devotional.days.some((day) => day.dayNumber === dayNumber && day.isRead);
        const ready = selectRenderableDevotionalDay(devotional, dayNumber).status === 'ready';
        const canOpen = isRead || isDevotionalDaySelectable(devotional, dayNumber, now) || dayNumber === getTodayReaderDayNumber(devotional, now);
        const presentation = getDayMenuPresentation(devotional, dayNumber, now);
        const title = ready ? presentation.title : `Day ${dayNumber}`;
        const status = !ready && canOpen
          ? isRead ? 'Tap to restore reading' : 'Being prepared'
          : isRead ? 'Read' : canOpen ? 'Ready to read' : presentation.unlockLabel ?? 'Still to come';
        return (
          <TouchableOpacity
            key={dayNumber}
            testID={`book-day-${dayNumber}`}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canOpen }}
            accessibilityLabel={`Day ${dayNumber}, ${title}, ${status}`}
            disabled={!canOpen}
            onPress={() => { if (canOpen) onOpenDay(dayNumber); }}
            activeOpacity={0.7}
            style={[styles.row, { borderBottomColor: colors.border }]}
          >
            <Text style={[styles.number, { color: colors.textMuted }]}>{String(dayNumber).padStart(2, '0')}</Text>
            <View style={styles.copy}>
              <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
              <Text style={[styles.status, { color: colors.textMuted }]}>{status}</Text>
            </View>
            {isRead ? <CheckIcon size={18} color={colors.accent} /> : canOpen ? <CaretRightIcon size={16} color={colors.textMuted} /> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], minHeight: 60, paddingVertical: Spacing['4'], borderBottomWidth: StyleSheet.hairlineWidth },
  number: { fontFamily: FontFamily.ui, fontSize: FontSize.sm, minWidth: 24, fontVariant: ['tabular-nums'] },
  copy: { flex: 1, minWidth: 0 },
  title: { fontFamily: FontFamily.ui, fontSize: FontSize.base },
  status: { fontFamily: FontFamily.ui, fontSize: FontSize.sm, marginTop: Spacing['1'] },
});
