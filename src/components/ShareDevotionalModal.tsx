import { useRef, useState, useEffect } from 'react';
import { View, Text, Pressable, Dimensions, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { X, Share2 } from 'lucide-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { DevotionalDay } from '@/lib/store';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// iPhone Pro Max / Instagram Stories dimensions (9:19.5 aspect ratio)
const STORY_ASPECT_RATIO = 9 / 19.5;
const CARD_HEIGHT = Math.min(SCREEN_HEIGHT * 0.60, 520);
const CARD_WIDTH = CARD_HEIGHT * STORY_ASPECT_RATIO;

interface ShareDevotionalModalProps {
  visible: boolean;
  onClose: () => void;
  day: DevotionalDay;
  seriesTitle: string;
}

export function ShareDevotionalModal({ visible, onClose, day, seriesTitle }: ShareDevotionalModalProps) {
  const { colors, isDark } = useTheme();
  const cardRef = useRef<View>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);

  // Colors for the share image based on theme
  const shareImageColors = isDark
    ? { gradient: ['#0c1220', '#1a2332', '#2d3a4d'] as const, text: '#ffffff', subtle: 'rgba(255,255,255,0.4)', appName: 'rgba(255,255,255,0.3)' }
    : { gradient: ['#FAF8F5', '#F5F2ED', '#EDE8E0'] as const, text: '#1A1612', subtle: 'rgba(26,22,18,0.45)', appName: 'rgba(26,22,18,0.3)' };

  // Auto-capture when modal opens
  useEffect(() => {
    if (visible && !capturedUri) {
      captureCard().then(uri => {
        if (uri) setCapturedUri(uri);
      });
    }
  }, [visible, capturedUri]);

  // Reset captured URI when modal closes
  useEffect(() => {
    if (!visible) {
      setCapturedUri(null);
      setIsSharing(false);
    }
  }, [visible]);

  const captureCard = async (): Promise<string | null> => {
    if (!cardRef.current) return null;

    try {
      // Small delay to ensure view is fully rendered
      await new Promise(resolve => setTimeout(resolve, 100));

      const uri = await captureRef(cardRef.current, {
        format: 'png',
        quality: 1,
      });

      return uri;
    } catch (error) {
      console.error('Capture error:', error);
      return null;
    }
  };

  const handleShare = async () => {
    if (isSharing) return;

    setIsSharing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const uri = capturedUri || await captureCard();

      if (!uri) {
        alert('Could not capture the image. Please try again.');
        setIsSharing(false);
        return;
      }

      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        alert('Sharing is not available on this device');
        setIsSharing(false);
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: `${seriesTitle} · Day ${day.dayNumber}`,
      });
      
      // Close modal after sharing
      onClose();
    } catch (error) {
      // User cancelled share - don't close modal
      console.log('Share cancelled or failed:', error);
    } finally {
      setIsSharing(false);
    }
  };

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.92)',
      }}
    >
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingVertical: 16 }}>
          <Pressable onPress={onClose} hitSlop={12}>
            <X size={24} color="#ffffff" />
          </Pressable>
        </View>

        {/* Preview Card - Story Format */}
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <View
            ref={cardRef}
            collapsable={false}
            style={{
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
              borderRadius: 16,
              overflow: 'hidden',
            }}
          >
            <LinearGradient
              colors={shareImageColors.gradient}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={{
                flex: 1,
                paddingHorizontal: 32,
                paddingVertical: 48,
                justifyContent: 'center',
              }}
            >
              {/* Quote */}
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <Text style={{
                  fontFamily: FontFamily.display,
                  fontSize: 22,
                  color: shareImageColors.text,
                  lineHeight: 34,
                  textAlign: 'center',
                }}>
                  "{day.quotableLine}"
                </Text>
              </View>

              {/* Bottom info */}
              <View style={{ alignItems: 'center', paddingTop: 20 }}>
                <Text style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 10,
                  color: shareImageColors.subtle,
                  textAlign: 'center',
                  letterSpacing: 0.5,
                }}>
                  {seriesTitle} · Day {day.dayNumber}
                </Text>
                <Text style={{
                  fontFamily: FontFamily.display,
                  fontSize: 12,
                  color: shareImageColors.appName,
                  marginTop: 6,
                }}>
                  Unfold
                </Text>
              </View>
            </LinearGradient>
          </View>
        </View>

        {/* Single Share Button */}
        <View style={{ paddingBottom: 32, paddingHorizontal: 24 }}>
          <Pressable
            onPress={handleShare}
            disabled={isSharing}
          >
            {({ pressed }) => (
              <View
                style={{
                  backgroundColor: pressed ? colors.backgroundPure : colors.glassBackground,
                  paddingVertical: 16,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: pressed ? colors.backgroundPure : colors.glassBorder,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  opacity: isSharing ? 0.6 : 1,
                }}
              >
                {isSharing ? (
                  <ActivityIndicator size="small" color={pressed ? colors.text : colors.backgroundPure} />
                ) : (
                  <>
                    <Share2 size={18} color={pressed ? colors.text : colors.backgroundPure} />
                    <Text
                      style={{
                        fontFamily: FontFamily.uiMedium,
                        fontSize: 16,
                        color: pressed ? colors.text : colors.backgroundPure,
                      }}
                    >
                      Share
                    </Text>
                  </>
                )}
              </View>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}
