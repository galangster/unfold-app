import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, useHasHydrated } from '@/lib/store';
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
 *
 * Navigation/search affordances live in reader.tsx's header (not here):
 *  - MagnifyingGlass icon → /(tabs)/(bible)/search (FTS5)
 *  - Book/chapter tap → BookChapterNavigator (book picker + FTS5)
 *  - TextAa icon → ReadingSettingsSheet
 * Previously this index rendered a book grid with a search button; that
 * surface is now folded into the reader header so tab reselect still
 * opens the reader while search/nav stay one tap away.
 */
export default function BibleHomeScreen() {
  const { colors, isDark } = useTheme();
  const hasHydrated = useHasHydrated();
  const { isReady, isDownloading, progress, download, error } = useBibleDb();
  const getLastBiblePosition = useUnfoldStore((s) => s.getLastBiblePosition);

  // Wait for persisted state before computing lastPosition — otherwise
  // cold-start users land on Genesis 1 regardless of where they left off.
  const lastPosition = useMemo(
    () => (hasHydrated ? getLastBiblePosition() : null),
    [hasHydrated, getLastBiblePosition],
  );

  if (!hasHydrated) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

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
