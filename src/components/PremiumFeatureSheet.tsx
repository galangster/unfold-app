/**
 * PremiumFeatureSheet — Contextual upsell bottom sheet (Strava pattern)
 *
 * Shows a small, contextual bottom sheet when a free user taps a premium feature.
 * Less disruptive than a full-screen paywall. Higher trust, better conversion.
 *
 * Uses a plain Modal + Animated.View instead of @gorhom/bottom-sheet to avoid
 * Reanimated v4 worklet freeze on simulator and device.
 */

import { useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, Dimensions } from 'react-native';
import Animated, {
  FadeIn,
  SlideInDown,
  SlideOutDown,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import {
  SpeakerHighIcon,
  PaletteIcon,
  BookOpenTextIcon,
  CrownIcon,
  ShieldCheckIcon,
  FireIcon,
  TextAaIcon,
  ImageIcon,
  ChatCircleIcon,
  HighlighterCircleIcon,
  CalendarIcon,
  HourglassIcon,
} from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';

// ---------------------------------------------------------------------------
// Feature definitions — each gate point maps to contextual copy + icon
// ---------------------------------------------------------------------------

type IconWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';

interface FeatureConfig {
  icon: React.ComponentType<{ size: number; color: string; weight: IconWeight }>;
  headline: string;
  description: string;
  cta: string;
}

const FEATURES: Record<string, FeatureConfig> = {
  voice: {
    icon: SpeakerHighIcon,
    headline: 'Listen your way',
    description: 'Choose from 3 unique voices to narrate your devotional. Find the one that speaks to you.',
    cta: 'Try free for 7 days',
  },
  series: {
    icon: BookOpenTextIcon,
    headline: 'Keep going deeper',
    description: 'Unlock unlimited devotional series, each one personalized to where you are right now.',
    cta: 'Try free for 7 days',
  },
  theme: {
    icon: PaletteIcon,
    headline: 'Make it yours',
    description: 'Custom themes and accent colors to match your style. Your quiet place, your way.',
    cta: 'Try free for 7 days',
  },
  font: {
    icon: TextAaIcon,
    headline: 'Premium reading fonts',
    description: 'Beautiful typefaces designed for long, comfortable reading sessions.',
    cta: 'Try free for 7 days',
  },
  wallpaper: {
    icon: ImageIcon,
    headline: 'More wallpaper styles',
    description: 'Unlock every wallpaper style for your favorite verses and share them beautifully.',
    cta: 'Try free for 7 days',
  },
  streak: {
    icon: FireIcon,
    headline: 'Protect your streak',
    description: 'Unlimited streak freezes so life never gets in the way of your daily practice.',
    cta: 'Try free for 7 days',
  },
  journal: {
    icon: BookOpenTextIcon,
    headline: 'Go deeper',
    description: 'AI-powered reflection prompts that help you process what you just read.',
    cta: 'Try free for 7 days',
  },
  audio: {
    icon: SpeakerHighIcon,
    headline: 'Listen along',
    description: 'AI narration brings your devotional to life. Read or listen — your choice.',
    cta: 'Try free for 7 days',
  },
  translation: {
    icon: BookOpenTextIcon,
    headline: 'More translations',
    description: 'Access premium Bible translations for richer study and deeper understanding.',
    cta: 'Try free for 7 days',
  },
  companion: {
    icon: ChatCircleIcon,
    headline: 'Unlimited conversations',
    description: 'Free users get 5 messages per day. Premium unlocks unlimited companion conversations.',
    cta: 'Try free for 7 days',
  },
  highlight: {
    icon: HighlighterCircleIcon,
    headline: 'More highlight colors',
    description: 'Unlock green, blue, purple, and red highlights. Color-code your Bible study.',
    cta: 'Try free for 7 days',
  },
  devotionalLength: {
    icon: CalendarIcon,
    headline: 'Longer devotional series',
    description: 'Go deeper with 14-day and 30-day series. Free users can create up to 7-day series.',
    cta: 'Try free for 7 days',
  },
  readingDuration: {
    icon: HourglassIcon,
    headline: 'Longer daily readings',
    description: 'Unlock 30-minute devotionals for a deeper daily experience. Free users get up to 15 minutes.',
    cta: 'Try free for 7 days',
  },
  general: {
    icon: CrownIcon,
    headline: 'Unlock the full experience',
    description: 'Get unlimited devotionals, AI narration, custom themes, and more.',
    cta: 'Try free for 7 days',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PremiumFeatureSheetProps {
  visible: boolean;
  onClose: () => void;
  feature: keyof typeof FEATURES;
}

// Dismiss threshold — drag down this many points to close
const DISMISS_THRESHOLD = 100;
// Rubber-band factor for drag up (0–1, lower = more resistance)
const RUBBER_BAND_FACTOR = 0.3;

export function PremiumFeatureSheet({ visible, onClose, feature }: PremiumFeatureSheetProps) {
  const { colors } = useTheme();
  const router = useRouter();

  const config = FEATURES[feature] ?? FEATURES.general;
  const IconComponent = config.icon as React.ComponentType<{ size: number; color: string; weight: IconWeight }>;

  const paywallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shared value for vertical drag translation
  const translateY = useSharedValue(0);

  useEffect(() => {
    // Reset translate when sheet becomes visible
    if (visible) {
      translateY.value = 0;
    }
    return () => {
      if (paywallTimerRef.current) clearTimeout(paywallTimerRef.current);
    };
  }, [visible]);

  const handleStartTrial = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
    // Small delay so the sheet closes before paywall opens
    if (paywallTimerRef.current) clearTimeout(paywallTimerRef.current);
    paywallTimerRef.current = setTimeout(() => {
      router.push('/paywall');
    }, 200);
  };

  const handleMaybeLater = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const dismissSheet = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  // Pan gesture — drag down to dismiss, rubber-band on drag up
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      'worklet';
      if (event.translationY < 0) {
        // Dragging up — rubber-band resistance
        translateY.value = event.translationY * RUBBER_BAND_FACTOR;
      } else {
        // Dragging down — 1:1 tracking
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      'worklet';
      if (event.translationY > DISMISS_THRESHOLD) {
        // Past threshold — dismiss
        runOnJS(dismissSheet)();
      } else {
        // Spring back to rest — critically damped (no bounce)
        translateY.value = withSpring(0, {
          damping: 20,
          stiffness: 300,
          mass: 0.5,
          overshootClamping: true,
        });
      }
    });

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={pfStyles.gestureRoot}>
        {/* Backdrop — tap to dismiss */}
        <Animated.View
          entering={FadeIn.duration(250)}
          exiting={FadeOut.duration(200)}
          style={pfStyles.backdrop}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        {/* Sheet content — draggable */}
        <GestureDetector gesture={panGesture}>
          <Animated.View
            entering={SlideInDown.duration(350).damping(20).stiffness(200)}
            exiting={SlideOutDown.duration(250)}
            style={[
              pfStyles.sheet,
              { backgroundColor: colors.backgroundElevated },
              sheetAnimatedStyle,
            ]}
          >
            {/* Handle indicator */}
            <View style={pfStyles.handleRow}>
              <View style={[pfStyles.handle, { backgroundColor: colors.borderStrong }]} />
            </View>

            <View style={pfStyles.content}>
              {/* Icon + headline */}
              <View style={pfStyles.centerContent}>
                <View style={[pfStyles.iconContainer, { backgroundColor: `${colors.accent}14` }]}>
                  <IconComponent size={28} color={colors.accent} weight="light" />
                </View>

                <Text style={[pfStyles.headline, { color: colors.text }]}>
                  {config.headline}
                </Text>

                <Text style={[pfStyles.description, { color: colors.textMuted }]}>
                  {config.description}
                </Text>
              </View>

              {/* CTA button */}
              <TouchableOpacity activeOpacity={0.7}
                onPress={handleStartTrial}
                accessibilityRole="button"
                accessibilityLabel={config.cta}
                style={[pfStyles.ctaButton, { backgroundColor: colors.accent }]}
              >
                <Text style={[pfStyles.ctaText, { color: colors.background }]}>
                  {config.cta}
                </Text>
              </TouchableOpacity>

              {/* Trial reassurance */}
              <View style={pfStyles.reassuranceRow}>
                <ShieldCheckIcon size={13} color={colors.textSubtle} weight="light" style={pfStyles.shieldIcon} />
                <Text style={[pfStyles.reassuranceText, { color: colors.textSubtle }]}>
                  Cancel anytime. No commitment.
                </Text>
              </View>

              {/* Maybe later */}
              <TouchableOpacity activeOpacity={0.7}
                onPress={handleMaybeLater}
                accessibilityRole="button"
                accessibilityLabel="Maybe later"
                style={pfStyles.maybeLaterButton}
              >
                <Text style={[pfStyles.maybeLaterText, { color: colors.textHint ?? colors.textSubtle }]}>
                  Maybe later
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const pfStyles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    paddingBottom: 34, // Safe area
    maxHeight: '50%',
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: Spacing['3'],
    paddingBottom: Spacing['2'],
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  content: {
    paddingHorizontal: Spacing['7'],
    paddingTop: Spacing['2'],
  },
  centerContent: {
    alignItems: 'center',
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing['4'],
  },
  headline: {
    fontFamily: FontFamily.display,
    fontSize: FontSize['2xl'],
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: Spacing['2'],
  },
  description: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing['6'],
    paddingHorizontal: Spacing['2'],
  },
  ctaButton: {
    paddingVertical: Spacing['4'],
    borderRadius: Radius.card,
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.base,
    letterSpacing: 0.2,
  },
  reassuranceRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing['3'],
  },
  shieldIcon: {
    marginRight: 5,
  },
  reassuranceText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
  },
  maybeLaterButton: {
    alignItems: 'center',
    marginTop: Spacing['3'],
    paddingVertical: Spacing['2'],
  },
  maybeLaterText: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
  },
});
