/**
 * PremiumFeatureSheet — Contextual upsell bottom sheet (Strava pattern)
 *
 * Shows a small, contextual bottom sheet when a free user taps a premium feature.
 * Less disruptive than a full-screen paywall. Higher trust, better conversion.
 *
 * Usage:
 *   <PremiumFeatureSheet
 *     visible={showSheet}
 *     onClose={() => setShowSheet(false)}
 *     feature="voice"
 *   />
 */

import { useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import BottomSheet, { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import Animated, { FadeIn } from 'react-native-reanimated';
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
} from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';

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
    description: 'Choose from 7 unique voices to narrate your devotional. Find the one that speaks to you.',
    cta: 'Try free for 7 days',
  },
  series: {
    icon: BookOpenTextIcon,
    headline: 'Your journey continues',
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

export function PremiumFeatureSheet({ visible, onClose, feature }: PremiumFeatureSheetProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const tabBarHeight = 90; // Approximate tab bar height — safe fallback

  const config = FEATURES[feature] ?? FEATURES.general;
  const IconComponent = config.icon as React.ComponentType<{ size: number; color: string; weight: IconWeight }>;

  useEffect(() => {
    if (visible) {
      bottomSheetRef.current?.snapToIndex(0);
    } else {
      bottomSheetRef.current?.close();
    }
  }, [visible]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        onClose();
      }
    },
    [onClose]
  );

  const handleStartTrial = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
    // Small delay so the sheet closes before paywall opens
    setTimeout(() => {
      router.push('/paywall');
    }, 200);
  };

  const handleMaybeLater = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
        pressBehavior="close"
      />
    ),
    []
  );

  if (!visible) return null;

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={['42%']}
      enablePanDownToClose
      onChange={handleSheetChanges}
      backdropComponent={renderBackdrop}
      bottomInset={tabBarHeight}
      backgroundStyle={{
        backgroundColor: colors.inputBackground,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
      }}
      handleIndicatorStyle={{
        backgroundColor: colors.border,
        width: 36,
      }}
    >
      <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 8 }}>
        {/* Icon + headline */}
        <Animated.View entering={FadeIn.duration(400)} style={{ alignItems: 'center' }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              backgroundColor: `${colors.accent}14`,
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <IconComponent size={28} color={colors.accent} weight="light" />
          </View>

          <Text
            style={{
              fontFamily: FontFamily.display,
              fontSize: 24,
              color: colors.text,
              textAlign: 'center',
              letterSpacing: -0.5,
              marginBottom: 8,
            }}
          >
            {config.headline}
          </Text>

          <Text
            style={{
              fontFamily: FontFamily.body,
              fontSize: 15,
              color: colors.textMuted,
              textAlign: 'center',
              lineHeight: 22,
              marginBottom: 24,
              paddingHorizontal: 8,
            }}
          >
            {config.description}
          </Text>
        </Animated.View>

        {/* CTA button */}
        <TouchableOpacity activeOpacity={0.7}
          onPress={handleStartTrial}
          style={{
            backgroundColor: colors.accent,
            paddingVertical: 16,
            borderRadius: 14,
            alignItems: 'center',
            opacity: 1,
          }}
        >
          <Text
            style={{
              fontFamily: FontFamily.uiSemiBold,
              fontSize: 16,
              color: colors.background,
              letterSpacing: 0.2,
            }}
          >
            {config.cta}
          </Text>
        </TouchableOpacity>

        {/* Trial reassurance */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 12 }}>
          <ShieldCheckIcon size={13} color={colors.textSubtle} weight="light" style={{ marginRight: 5 }} />
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: 12,
              color: colors.textSubtle,
            }}
          >
            Cancel anytime. No commitment.
          </Text>
        </View>

        {/* Maybe later */}
        <TouchableOpacity activeOpacity={0.7}
          onPress={handleMaybeLater}
          style={{ alignItems: 'center', marginTop: 12, paddingVertical: 8 }}
        >
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: 13,
              color: colors.textHint ?? colors.textSubtle,
            }}
          >
            Maybe later
          </Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}
