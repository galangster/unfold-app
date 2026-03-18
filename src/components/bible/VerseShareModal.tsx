import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Dimensions,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import * as Haptics from 'expo-haptics';
import { XIcon, UploadSimpleIcon, DownloadSimpleIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { logger } from '@/lib/logger';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Card dimensions — 9:16 for Instagram Stories compatibility
const CARD_ASPECT_RATIO = 9 / 16;
const CARD_HEIGHT = Math.min(SCREEN_HEIGHT * 0.62, 560);
const CARD_WIDTH = CARD_HEIGHT * CARD_ASPECT_RATIO;

interface VerseShareModalProps {
  visible: boolean;
  onClose: () => void;
  verseText: string;
  reference: string;       // e.g. "Exodus 5:1" or "Exodus 5:1-3"
  translation: string;     // e.g. "BSB" or "KJV"
}

/**
 * Generates a shareable verse image card and lets the user share or save it.
 * Follows the existing ShareDevotionalModal pattern:
 *   1. Render a styled card in a modal preview
 *   2. Capture with react-native-view-shot
 *   3. Share via expo-sharing / save via expo-media-library
 */
export function VerseShareModal({
  visible,
  onClose,
  verseText,
  reference,
  translation,
}: VerseShareModalProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const cardRef = useRef<View>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Toggle pointer events off/on after native share sheet dismisses to
  // reconnect the touch responder chain (iOS share sheet leaves it stale).
  const [touchActive, setTouchActive] = useState<'auto' | 'none'>('auto');

  // Prevent orphaned words
  const displayText = verseText.replace(/\s+(\S+)$/, '\u00A0$1');

  // Dynamic font size based on text length
  const fontSize = displayText.length > 200 ? 16 : displayText.length > 120 ? 18 : displayText.length > 60 ? 20 : 22;
  const lineHeight = fontSize * 1.65;

  // Card color scheme — matches app theme
  const cardColors = isDark
    ? {
        bg: '#1A1A1A',
        text: 'rgba(245, 240, 235, 0.92)',
        ref: 'rgba(245, 240, 235, 0.50)',
        accent: 'rgba(245, 240, 235, 0.25)',
        divider: 'rgba(245, 240, 235, 0.08)',
      }
    : {
        bg: '#FAF7F2',
        text: 'rgba(28, 23, 16, 0.88)',
        ref: 'rgba(28, 23, 16, 0.50)',
        accent: 'rgba(28, 23, 16, 0.22)',
        divider: 'rgba(28, 23, 16, 0.06)',
      };

  useEffect(() => {
    if (visible) {
      setIsSharing(false);
      setIsSaving(false);
      setSaved(false);
    }
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, [visible]);

  const captureCard = useCallback(async (): Promise<string | null> => {
    if (!cardRef.current) {
      logger.log('[VerseShare] cardRef is null');
      return null;
    }
    // Wait for layout to stabilize
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (!cardRef.current) {
      logger.log('[VerseShare] cardRef became null after delay');
      return null;
    }
    try {
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      logger.log('[VerseShare] Captured image:', uri);
      return uri;
    } catch (err) {
      logger.error('[VerseShare] Capture failed:', err);
      return null;
    }
  }, []);

  const handleShare = useCallback(async () => {
    if (isSharing) return;
    setIsSharing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const uri = await captureCard();
      if (!uri) {
        Alert.alert('Error', 'Could not capture the image. Please try again.');
        setIsSharing(false);
        return;
      }

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Error', 'Sharing is not available on this device');
        setIsSharing(false);
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: reference,
        UTI: 'public.png',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('cancel') && !msg.includes('dismiss')) {
        Alert.alert('Error', 'Could not share the image. Please try again.');
      }
    } finally {
      setIsSharing(false);
      // iOS share sheet leaves RN touch handlers stale — toggle pointer events
      // off then on to force the native touch system to re-register handlers
      setTouchActive('none');
      setTimeout(() => setTouchActive('auto'), 50);
    }
  }, [isSharing, captureCard, reference]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Needed', 'Permission needed to save to your photo library');
        setIsSaving(false);
        return;
      }

      const uri = await captureCard();
      if (!uri) {
        Alert.alert('Error', 'Could not capture the image. Please try again.');
        setIsSaving(false);
        return;
      }

      await MediaLibrary.createAssetAsync(uri);
      setSaved(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    } catch {
      Alert.alert('Error', 'Failed to save. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, captureCard]);

  if (!visible) return null;

  const isBusy = isSharing || isSaving;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <GestureHandlerRootView style={s.flex1} pointerEvents={touchActive}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          style={s.backdrop}
        >
          <View style={[s.flex1, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            {/* Header — close button */}
            <View style={s.header}>
              <TouchableOpacity
                activeOpacity={0.6}
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={s.closeButton}
                accessibilityLabel="Close share modal"
                accessibilityRole="button"
              >
                <XIcon size={22} color="rgba(255,255,255,0.7)" weight="light" />
              </TouchableOpacity>
            </View>

            {/* Card preview — no Animated wrapper (breaks captureRef) */}
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={s.cardWrapper}>
              <View
                ref={cardRef}
                collapsable={false}
                style={[s.card, { backgroundColor: cardColors.bg }]}
              >
                {/* Verse text */}
                <View style={s.verseContainer}>
                  <Text
                    style={{
                      fontFamily: FontFamily.display,
                      fontSize,
                      lineHeight,
                      color: cardColors.text,
                      textAlign: 'center',
                    }}
                  >
                    {displayText}
                  </Text>
                </View>

                {/* Divider */}
                <View style={[s.divider, { backgroundColor: cardColors.divider }]} />

                {/* Reference + translation */}
                <View style={s.refContainer}>
                  <Text
                    style={{
                      fontFamily: FontFamily.uiMedium,
                      fontSize: 12,
                      color: cardColors.ref,
                      letterSpacing: 0.4,
                      textAlign: 'center',
                    }}
                  >
                    {reference}
                  </Text>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 10,
                      color: cardColors.accent,
                      letterSpacing: 0.8,
                      marginTop: 4,
                      textAlign: 'center',
                    }}
                  >
                    {translation}
                  </Text>
                </View>

                {/* Branding */}
                <View style={s.brandRow}>
                  <Text
                    style={{
                      fontFamily: FontFamily.uiMedium,
                      fontSize: 8,
                      color: cardColors.accent,
                      letterSpacing: 3,
                      textAlign: 'center',
                    }}
                  >
                    UNFOLD
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* Action buttons */}
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={s.actionsWrapper}>
              <View style={s.actionsRow}>
                {/* Save */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={handleSave}
                  disabled={isBusy}
                  accessibilityLabel={saved ? 'Saved' : 'Save image'}
                  accessibilityRole="button"
                  style={[s.actionButton, s.saveButton, { opacity: isBusy && !saved ? 0.6 : 1 }]}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <DownloadSimpleIcon size={17} color="#ffffff" weight="light" />
                      <Text style={s.actionText}>{saved ? 'Saved!' : 'Save'}</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Share */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={handleShare}
                  disabled={isBusy}
                  accessibilityLabel="Share verse image"
                  accessibilityRole="button"
                  style={[s.actionButton, s.shareButton, { opacity: isBusy ? 0.6 : 1 }]}
                >
                  {isSharing ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <UploadSimpleIcon size={17} color="#ffffff" weight="light" />
                      <Text style={s.actionText}>Share</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </GestureHandlerRootView>
    </Modal>
  );
}

const s = StyleSheet.create({
  flex1: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  closeButton: {
    padding: 12,
  },
  cardWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    paddingHorizontal: 28,
    paddingTop: 48,
    paddingBottom: 28,
    justifyContent: 'space-between',
  },
  verseContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: 40,
    alignSelf: 'center',
    marginVertical: 16,
  },
  refContainer: {
    alignItems: 'center',
  },
  brandRow: {
    alignItems: 'center',
    marginTop: 20,
  },
  actionsWrapper: {
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    paddingHorizontal: 28,
    borderRadius: 14,
  },
  saveButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.20)',
  },
  shareButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.30)',
  },
  actionText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 15,
    color: '#ffffff',
  },
});
