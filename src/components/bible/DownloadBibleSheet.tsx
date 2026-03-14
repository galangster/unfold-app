import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BookBookmarkIcon, WifiHighIcon, WarningCircleIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import type { ColorTheme } from '@/constants/colors';

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
  if (!visible) return null;

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeInDown.duration(500)} style={styles.content}>
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
              {error}
            </Text>
          </View>
        )}

        {isDownloading ? (
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { backgroundColor: colors.inputBackground }]}>
              <View
                style={[
                  styles.progressFill,
                  { backgroundColor: colors.accent, width: `${Math.round((progress ?? 0) * 100)}%` },
                ]}
              />
            </View>
            <Text style={[styles.progressText, { color: colors.textSubtle }]}>
              {Math.round((progress ?? 0) * 100)}%
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={onDownload}
            style={[styles.downloadButton, { backgroundColor: colors.accent }]}
            activeOpacity={0.7}
            accessibilityLabel="Download Bible"
            accessibilityRole="button"
          >
            <Text style={[styles.downloadButtonText, { fontFamily: FontFamily.uiMedium }]}>
              Download
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
    paddingHorizontal: 40,
  },
  content: {
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 24,
    marginTop: 8,
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
    marginTop: 16,
    gap: 8,
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
  },
  downloadButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 16,
  },
  downloadButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
});
