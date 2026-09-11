import { useEffect, useMemo, useRef } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { trackAutoTrialKeepsakeOpened } from '@/lib/auto-trial-telemetry';
import { buildSeriesKeepsake } from '@/lib/series-keepsake';
import { useUnfoldStore } from '@/lib/store';

export default function KeepsakeScreen() {
  const router = useRouter();
  const { devotionalId, openedFrom } = useLocalSearchParams<{
    devotionalId?: string;
    openedFrom?: string;
  }>();
  const devotionals = useUnfoldStore((state) => state.devotionals);
  const highlights = useUnfoldStore((state) => state.highlights);
  const checkIns = useUnfoldStore((state) => state.checkIns);
  const emittedOpen = useRef(false);
  const keepsake = useMemo(() => {
    const devotional = devotionals.find((item) => item.id === devotionalId);
    return devotional
      ? buildSeriesKeepsake({ devotional, highlights, checkIns })
      : null;
  }, [devotionals, devotionalId, highlights, checkIns]);

  useEffect(() => {
    if (!keepsake || keepsake.daysRead === 0) {
      router.replace('/(tabs)/(today)');
      return;
    }
    if (emittedOpen.current) return;
    emittedOpen.current = true;
    const opened_from = openedFrom === 'celebration' || openedFrom === 'today'
      ? openedFrom
      : 'series_detail';
    trackAutoTrialKeepsakeOpened({
      opened_from,
      completeness: keepsake.completeness,
    });
  }, [keepsake, openedFrom, router]);

  if (!keepsake || keepsake.daysRead === 0) return null;

  // DG-1: visual treatment pending 07-design-final.md
  return (
    <View>
      <Text>{keepsake.seriesTitle}</Text>
      <Text>{`${keepsake.daysRead} of ${keepsake.totalDays} days`}</Text>
      {keepsake.line ? <Text>{keepsake.line.text}</Text> : null}
      {keepsake.words ? <Text>{keepsake.words.text}</Text> : null}
      {keepsake.act ? <Text>{keepsake.act.text}</Text> : null}
      {keepsake.nextPickLine ? <Text>{keepsake.nextPickLine}</Text> : null}
    </View>
  );
}
