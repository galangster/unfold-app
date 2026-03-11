import { useRef, useState, useEffect } from 'react';
import { View, Text, Pressable, Dimensions, ActivityIndicator, Alert, Modal, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
// ShareQuote kept for potential future carousel expansion
import { XIcon, UploadSimpleIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { DevotionalDay } from '@/lib/store';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Card dimensions
const CARD_ASPECT_RATIO = 9 / 16; // Instagram Stories
const ACTIVE_CARD_HEIGHT = Math.min(SCREEN_HEIGHT * 0.65, 580);
const ACTIVE_CARD_WIDTH = ACTIVE_CARD_HEIGHT * CARD_ASPECT_RATIO;
interface ShareQuote {
  text: string;
  type: 'quotable';
}

interface ShareDevotionalModalProps {
  visible: boolean;
  onClose: () => void;
  day: DevotionalDay;
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
  const rawQuote = day.quotableLine || '';
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
        dialogTitle: `${seriesTitle} · Day ${day.dayNumber}`,
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

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.92)' }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={{ padding: 8 }}
            >
              <XIcon size={22} color="rgba(255,255,255,0.7)" weight="light" />
            </Pressable>
          </View>

          {/* Share Card */}
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <View
              ref={cardRef}
              collapsable={false}
              style={{
                width: ACTIVE_CARD_WIDTH,
                height: ACTIVE_CARD_HEIGHT,
                borderRadius: 16,
                overflow: 'hidden',
              }}
            >
              <LinearGradient
                colors={shareImageColors.gradient as any}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={{
                  flex: 1,
                  paddingHorizontal: 28,
                  paddingTop: 48,
                  paddingBottom: 32,
                  justifyContent: 'space-between',
                }}
              >
                {/* Quote content */}
                <View style={{ flex: 1, justifyContent: 'center' }}>
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
                <View style={{ alignItems: 'center', paddingTop: 16 }}>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 10,
                      color: shareImageColors.subtle,
                      textAlign: 'center',
                      letterSpacing: 0.5,
                    }}>
                    {seriesTitle} · Day {day.dayNumber}
                  </Text>
                  <Image
                    source={require('@/app/icon-paywall-light.png')}
                    style={{
                      width: 12,
                      height: 12,
                      marginTop: 14,
                      tintColor: shareImageColors.subtle,
                      opacity: 0.6,
                    }}
                    resizeMode="contain"
                  />
                </View>
              </LinearGradient>
            </View>
          </View>

          {/* Share Button */}
          <View style={{ paddingBottom: 32, paddingHorizontal: 24 }}>
            <Pressable
              onPress={handleShare}
              disabled={isSharing}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                paddingVertical: 16,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.3)',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                opacity: isSharing ? 0.6 : 1,
              }}
            >
              {isSharing ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <UploadSimpleIcon size={18} color="#ffffff" weight="light" />
                  <Text
                    style={{
                      fontFamily: FontFamily.uiMedium,
                      fontSize: 16,
                      color: '#ffffff',
                    }}
                  >
                    Share
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
