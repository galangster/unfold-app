import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { useBibleDb } from '@/hooks/useBibleDb';
import { DownloadBibleSheet } from '@/components/bible/DownloadBibleSheet';

/**
 * Bible tab home. Two states:
 *  - Bible DB not ready → show DownloadBibleSheet
 *  - Bible DB ready → render-phase Redirect to the reader at the last
 *    position (or Genesis 1 if no last position).
 *
 * The redirect runs during render, not in a useEffect, so there's no
 * one-frame flash of any intermediate UI on cold start. See
 * ~/vault/standards/navigation-in-render-not-effects.md
 */
export default function BibleHomeScreen() {
  const { colors, isDark } = useTheme();
  const { isReady, isDownloading, progress, download, error } = useBibleDb();
  const getLastBiblePosition = useUnfoldStore((s) => s.getLastBiblePosition);

  const lastPosition = useMemo(() => getLastBiblePosition(), [getLastBiblePosition]);

  if (isReady) {
    const target = lastPosition
      ? `/(tabs)/(bible)/reader?bookId=${lastPosition.bookId}&chapter=${lastPosition.chapter}`
      : '/(tabs)/(bible)/reader?bookId=1&chapter=1';
    return <Redirect href={target as any} />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <DownloadBibleSheet
        visible={true}
        onComplete={() => {}}
        colors={colors}
        isDark={isDark}
        progress={progress}
        isDownloading={isDownloading}
        error={error}
        onDownload={download}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
