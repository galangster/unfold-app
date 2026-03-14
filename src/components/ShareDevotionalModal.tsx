import { useRef, useState, useEffect } from 'react';
import { View, Text, Dimensions, ActivityIndicator, Alert, Modal, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { XIcon, UploadSimpleIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { DevotionalDay } from '@/lib/store';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Card dimensions
const CARD_ASPECT_RATIO = 9 / 16; // Instagram Stories
const ACTIVE_CARD_HEIGHT = Math.min(SCREEN_HEIGHT * 0.72, 640);
const ACTIVE_CARD_WIDTH = ACTIVE_CARD_HEIGHT * CARD_ASPECT_RATIO;

interface ShareDevotionalModalProps {
  visible: boolean;
  onClose: () => void;
  day: DevotionalDay | undefined;
  seriesTitle: string;
}

export function ShareDevotionalModal({ visible, onClose, day, seriesTitle }: ShareDevotionalModalProps) {
  const { isDark } = useTheme();
  const cardRef = useRef<View>(null);
  const [isSharing, setIsSharing] = useState(false);

  const shareImageColors = isDark
    ? { gradient: ['#000000', '#1a1a1a', '#2d2d2d'] as const, text: '#ffffff', subtle: 'rgba(255,255,255,0.4)' }
    : { gradient: ['#FFFFFF', '#F5F5F5', '#E8E8E8'] as const, text: '#000000', subtle: 'rgba(0,0,0,0.45)' };

  // Prevent orphaned words by replacing the last space with a non-breaking space
  // Fall back to the day title if quotableLine is empty
  const rawQuote = day?.quotableLine || day?.title || '';
  const quote = rawQuote.replace(/\s+(\S+)$/, '\u00A0$1');

  useEffect(() => {
    if (visible) {
      setIsSharing(false);
    }
  }, [visible]);

  const handleShare = async () => {
    if (isSharing) return;
    setIsSharing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Wait for layout to stabilize
      await new Promise(resolve => setTimeout(resolve, 300));

      if (!cardRef.current) {
        console.log('[Share] cardRef is null, retrying after delay...');
        await new Promise(resolve => setTimeout(resolve, 500));
        if (!cardRef.current) {
          Alert.alert('Error', 'Could not capture the image. Please try again.');
          setIsSharing(false);
          return;
        }
      }

      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });

      console.log('[Share] Captured image:', uri);

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Error', 'Sharing is not available on this device');
        setIsSharing(false);
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: `${seriesTitle} · Day ${day?.dayNumber ?? ''}`,
        UTI: 'public.png',
      });

      onClose();
    } catch (err) {
      console.log('[Share] Error:', err instanceof Error ? err.message : String(err));
      // Only alert on actual errors, not user cancellation
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('cancel') && !msg.includes('dismiss')) {
        Alert.alert('Error', 'Could not share the image. Please try again.');
      }
    } finally {
      setIsSharing(false);
    }
  };

  if (!visible || !day) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <GestureHandlerRootView style={sdStyles.flex1}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          style={sdStyles.backdrop}
        >
          <SafeAreaView style={sdStyles.flex1} edges={['top', 'bottom']}>
            {/* Header */}
            <View style={sdStyles.header}>
              <TouchableOpacity
                activeOpacity={0.6}
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={sdStyles.closeButton}
                accessibilityLabel="Close share modal"
                accessibilityRole="button"
              >
                <XIcon size={22} color="rgba(255,255,255,0.7)" weight="light" />
              </TouchableOpacity>
            </View>

            {/* Share Card */}
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={sdStyles.cardWrapper}>
              <View
                ref={cardRef}
                collapsable={false}
                style={sdStyles.card}
              >
                {/* LinearGradient needs inline style for dynamic colors */}
                <LinearGradient
                  colors={shareImageColors.gradient as any}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={sdStyles.gradientContent}
                >
                  {/* Quote content */}
                  <View style={sdStyles.quoteContainer}>
                    <Text style={{
                      fontFamily: FontFamily.display,
                      fontSize: quote.length > 80 ? 18 : 22,
                      color: shareImageColors.text,
                      lineHeight: quote.length > 80 ? 28 : 34,
                      textAlign: 'center',
                    }}>
                      {quote}
                    </Text>
                  </View>

                  {/* Bottom info */}
                  <View style={sdStyles.bottomInfo}>
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                      style={[sdStyles.seriesLabel, { color: shareImageColors.subtle }]}>
                      {seriesTitle} · Day {day.dayNumber}
                    </Text>
                    <View style={sdStyles.brandRow}>
                      <Image
                        source={require('@/app/icon-paywall-light.png')}
                        style={[sdStyles.brandIcon, { tintColor: shareImageColors.subtle }]}
                        resizeMode="contain"
                      />
                      <Text style={[sdStyles.brandLabel, { color: shareImageColors.subtle }]}>
                        Unfold
                      </Text>
                    </View>
                  </View>
                </LinearGradient>
              </View>
            </TouchableOpacity>

            {/* Share Button */}
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={sdStyles.shareButtonWrapper}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleShare}
                disabled={isSharing}
                accessibilityLabel={isSharing ? 'Sharing' : 'Share devotional'}
                accessibilityRole="button"
                accessibilityState={{ disabled: isSharing }}
                style={[sdStyles.shareButton, { opacity: isSharing ? 0.6 : 1 }]}
              >
                {isSharing ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <UploadSimpleIcon size={18} color="#ffffff" weight="light" />
                    <Text style={sdStyles.shareButtonText}>
                      Share
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </TouchableOpacity>
          </SafeAreaView>
        </TouchableOpacity>
      </GestureHandlerRootView>
    </Modal>
  );
}

const sdStyles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 4,
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
    width: ACTIVE_CARD_WIDTH,
    height: ACTIVE_CARD_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
  },
  gradientContent: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 48,
    paddingBottom: 32,
    justifyContent: 'space-between',
  },
  quoteContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  bottomInfo: {
    alignItems: 'center',
    paddingTop: 16,
  },
  seriesLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 10,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    gap: 6,
  },
  brandIcon: {
    width: 12,
    height: 12,
    opacity: 0.6,
  },
  brandLabel: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 10,
    opacity: 0.6,
    letterSpacing: 0.3,
  },
  shareButtonWrapper: {
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
  shareButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  shareButtonText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 16,
    color: '#ffffff',
  },
});
