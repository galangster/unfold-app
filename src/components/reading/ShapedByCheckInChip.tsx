import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { shouldShowShapedByCheckInChip } from '@/lib/auto-trial-series';
import { trackAutoTrialDay2ChipShown } from '@/lib/auto-trial-telemetry';
import type { Devotional, DevotionalDay } from '@/lib/store';

let lastShownLocalDate: string | null = null;

function localDateKey(now: Date): string {
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function ShapedByCheckInChip({
  devotional,
  day,
}: {
  devotional: Devotional;
  day: DevotionalDay;
}) {
  const visible = shouldShowShapedByCheckInChip(devotional, day);

  useEffect(() => {
    if (!visible) return;
    const today = localDateKey(new Date());
    if (lastShownLocalDate === today) return;
    lastShownLocalDate = today;
    trackAutoTrialDay2ChipShown();
  }, [visible]);

  if (!visible) return null;

  // DG-1: visual treatment pending 07-design-final.md
  return (
    <View accessibilityRole="text" accessibilityLabel="Shaped by your check-in">
      <Text>Shaped by your check-in</Text>
    </View>
  );
}
