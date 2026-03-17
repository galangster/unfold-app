import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { CopyIcon, ShareNetworkIcon, XIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import type { BibleHighlightColor } from '@/lib/store';

const HIGHLIGHT_COLORS: Array<{ key: BibleHighlightColor; color: string; label: string }> = [
  { key: 'yellow', color: '#F0C850', label: 'Yellow' },
  { key: 'green', color: '#6BBF7B', label: 'Green' },
  { key: 'blue', color: '#6BA3D6', label: 'Blue' },
  { key: 'purple', color: '#A874C0', label: 'Purple' },
  { key: 'red', color: '#E87070', label: 'Red' },
];

interface VerseActionSheetProps {
  visible: boolean;
  selectedVerses: Array<{ verse: number; text: string }>;
  bookName: string;
  chapter: number;
  translation: string;
  existingHighlightColor?: BibleHighlightColor;
  onHighlight: (color: BibleHighlightColor) => void;
  onRemoveHighlight: () => void;
  onCopy: () => void;
  onClose: () => void;
}

export function VerseActionSheet({
  visible,
  selectedVerses,
  bookName,
  chapter,
  translation,
  existingHighlightColor,
  onHighlight,
  onRemoveHighlight,
  onCopy,
  onClose,
}: VerseActionSheetProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  if (!visible || selectedVerses.length === 0) return null;

  const sorted = [...selectedVerses].sort((a, b) => a.verse - b.verse);
  const refStr = sorted.length === 1
    ? `${bookName} ${chapter}:${sorted[0].verse}`
    : `${bookName} ${chapter}:${sorted[0].verse}-${sorted[sorted.length - 1].verse}`;

  const verseText = sorted.map((v) => v.text).join(' ');

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({
        message: `${verseText}\n— ${refStr} (${translation})`,
      });
    } catch {
      // User cancelled
    }
  };

  const handleCopy = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCopy();
  };

  const handleHighlightPress = (c: typeof HIGHLIGHT_COLORS[0]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (existingHighlightColor === c.key) {
      onRemoveHighlight();
    } else {
      onHighlight(c.key);
    }
  };

  const actionBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  // Tab bar height: paddingTop(8) + content(~48) + paddingBottom(insets.bottom)
  const tabBarHeight = 56 + insets.bottom;

  return (
    <Animated.View
      entering={FadeIn.duration(150).delay(30)}
      exiting={FadeOut.duration(120)}
      style={[
        styles.container,
        {
          backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
          shadowColor: '#000',
          bottom: tabBarHeight + 16,
          paddingBottom: 16,
        },
      ]}
    >
      {/* Drag handle */}
      <View style={styles.handleRow}>
        <View style={[styles.handle, { backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }]} />
      </View>

      {/* Reference + close */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.reference, { color: colors.text }]}>
            {refStr}
          </Text>
          <Text style={[styles.translationLabel, { color: colors.textHint }]}>
            {translation}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onClose}
          accessibilityLabel="Close"
          accessibilityRole="button"
          style={[styles.closeButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}
          hitSlop={8}
        >
          <XIcon size={14} color={colors.textSubtle} weight="bold" />
        </TouchableOpacity>
      </View>

      {/* Highlight colors + actions */}
      <View style={styles.actionsRow}>
        {HIGHLIGHT_COLORS.map((c) => {
          const isActive = existingHighlightColor === c.key;
          return (
            <TouchableOpacity
              key={c.key}
              onPress={() => handleHighlightPress(c)}
              style={[
                styles.colorCircle,
                { backgroundColor: c.color },
                isActive && styles.colorCircleActive,
              ]}
              accessibilityLabel={`${isActive ? 'Remove' : 'Apply'} ${c.label} highlight`}
              accessibilityRole="button"
            >
              {isActive && (
                <XIcon size={11} color="#FFFFFF" weight="bold" />
              )}
            </TouchableOpacity>
          );
        })}

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]} />

        {/* Copy */}
        <TouchableOpacity
          onPress={handleCopy}
          style={[styles.actionCircle, { backgroundColor: actionBg }]}
          accessibilityLabel="Copy verse"
          accessibilityRole="button"
        >
          <CopyIcon size={18} color={colors.text} weight="light" />
        </TouchableOpacity>

        {/* Share */}
        <TouchableOpacity
          onPress={handleShare}
          style={[styles.actionCircle, { backgroundColor: actionBg }]}
          accessibilityLabel="Share verse"
          accessibilityRole="button"
        >
          <ShareNetworkIcon size={18} color={colors.text} weight="light" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    marginHorizontal: 8,
    paddingHorizontal: 24,
    paddingTop: 0,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reference: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 15,
  },
  translationLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  colorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorCircleActive: {
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  divider: {
    width: 1,
    height: 24,
    marginHorizontal: 4,
  },
  actionCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
