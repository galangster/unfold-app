import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { BookBookmarkIcon, WifiHighIcon, WarningCircleIcon } from '@/components/icons';
import { FontFamily, FontSize } from '@/constants/fonts';
import type { ColorTheme } from '@/constants/colors';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';

const GENERIC_DOWNLOAD_ERROR = "Something went wrong. Please try again.";

/**
 * Map a raw download error (a thrown Error's message, straight from the
 * network/filesystem layer in bible-db.ts) to short, friendly copy. Falls
 * back to a safe generic message for anything unrecognized.
 */
export function mapBibleDownloadError(rawError: string | null): string {
  if (!rawError) return GENERIC_DOWNLOAD_ERROR;

  const message = rawError.toLowerCase();

  if (
    message.includes('network') ||
    message.includes('offline') ||
    message.includes('internet') ||
    message.includes('fetch') ||
    message.includes('timed out') ||
    message.includes('timeout')
  ) {
    return "You're offline. Check your connection and try again.";
  }

  if (message.includes('status 5') || message.includes('status 4')) {
    return "Our server had a problem. Please try again in a moment.";
  }

  if (
    message.includes('space') ||
    message.includes('storage') ||
    message.includes('too small') ||
    message.includes('corrupt') ||
    message.includes('not found after download') ||
    message.includes('verification failed')
  ) {
    return "Couldn't save the download. Free up storage and try again.";
  }

  return GENERIC_DOWNLOAD_ERROR;
}

interface DownloadBibleSheetProps {
  visible: boolean;
  onComplete: () => void;
  colors: ColorTheme;
  isDark: boolean;
  progress: number | null;
  isDownloading: boolean;
  error: string | null;
  onDownload: () => void;
}

export function DownloadBibleSheet({
  visible,
  colors,
  isDark,
  progress,
  isDownloading,
  error,
  onDownload,
}: DownloadBibleSheetProps) {
  const reducedMotion = useReducedMotion();

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <Animated.View entering={reducedMotion ? undefined : FadeInDown.duration(Duration.normal).easing(Ease.out)} style={styles.content}>
        <BookBookmarkIcon size={56} color={colors.accent} weight="light" />

        <Text style={[styles.title, { color: colors.text, fontFamily: FontFamily.uiSemiBold }]}>
          Set up your Bible
        </Text>

        <Text style={[styles.subtitle, { color: colors.textSubtle }]}>
          Download the Bible for offline reading. This only happens once.
        </Text>

        <View style={styles.sizeRow}>
          <WifiHighIcon size={14} color={colors.textSubtle} weight="light" />
          <Text style={[styles.sizeText, { color: colors.textSubtle }]}>
            ~14 MB — BSB + KJV translations
          </Text>
        </View>

        {error && (
          <View style={styles.errorRow}>
            <WarningCircleIcon size={16} color={colors.error} weight="light" />
            <Text style={[styles.errorText, { color: colors.error }]}>
              {mapBibleDownloadError(error)}
            </Text>
          </View>
        )}

        {isDownloading ? (
          <View style={styles.progressContainer}>
            <View
              style={[styles.progressBar, { backgroundColor: colors.inputBackground }]}
              accessibilityRole="progressbar"
              accessibilityValue={{
                min: 0,
                max: 100,
                now: progress != null && progress >= 0 ? Math.round(progress * 100) : undefined,
              }}
            >
              <View
                style={[
                  styles.progressFill,
                  // progress < 0 means Content-Length is absent (no progress info)
                  // — render full-width bar at 30% opacity as an indeterminate indicator
                  progress != null && progress < 0
                    ? { backgroundColor: colors.accent, width: '100%', opacity: 0.3 }
                    : { backgroundColor: colors.accent, width: `${Math.round((progress ?? 0) * 100)}%` },
                ]}
              />
            </View>
            <Text style={[styles.progressText, { color: colors.textSubtle }]}>
              {progress != null && progress < 0 ? 'Downloading…' : `${Math.round((progress ?? 0) * 100)}%`}
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={onDownload}
            style={[styles.downloadButton, { backgroundColor: colors.accent }]}
            activeOpacity={0.7}
            accessibilityLabel={error ? 'Try again' : 'Download Bible'}
            accessibilityRole="button"
          >
            <Text style={[styles.downloadButtonText, { fontFamily: FontFamily.uiMedium, color: isDark ? '#FFFFFF' : colors.backgroundPure }]}>
              {error ? 'Try again' : 'Download'}
            </Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['10'],
  },
  content: {
    alignItems: 'center',
    gap: Spacing['3'],
  },
  title: {
    fontSize: FontSize['2xl'],
    marginTop: Spacing['2'],
  },
  subtitle: {
    fontFamily: FontFamily.ui,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  sizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  sizeText: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  errorText: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
  },
  progressContainer: {
    width: '100%',
    marginTop: Spacing['4'],
    gap: Spacing['2'],
    alignItems: 'center',
  },
  progressBar: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontFamily: FontFamily.mono,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  downloadButton: {
    paddingHorizontal: Spacing['8'],
    paddingVertical: 14,
    borderRadius: Radius.card,
    marginTop: Spacing['4'],
  },
  downloadButtonText: {
    fontSize: FontSize.base,
  },
});
