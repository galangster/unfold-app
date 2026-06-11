import { View, Text, TouchableOpacity } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';

type AIConsentNoticeColors = {
  accent: string;
  background: string;
  text: string;
  textMuted: string;
};

/**
 * AI CONSENT (PRIV-1 / RV-UI-1): explicit disclosure before first generation.
 *
 * Guideline 5.1.2(i) requires explicit consent before transmitting to
 * 3rd-party AI processors. The 'I understand — continue' CTA is the sole
 * consent action — nothing pre-checked.
 *
 * Shared by:
 *  - the onboarding 'aiConsent' step (initial funnel), and
 *  - /generating, which renders it inline whenever a consent-false user
 *    arrives outside the funnel (returning-user new series, 218-upgrader
 *    migrated stores, deep links) so the screen never dead-ends them.
 *
 * The CTA tap itself is the consent action: callers set hasConsentedToAI(true)
 * inside `onAccept`.
 */
export function AIConsentNotice({
  colors,
  onAccept,
}: {
  colors: AIConsentNoticeColors;
  onAccept: () => void;
}) {
  return (
    <View style={{ flex: 1, justifyContent: 'space-between', paddingHorizontal: Spacing['1'] }}>
      <View style={{ gap: Spacing['4'] }}>
        {/* Gold accent line — matches founderNote visual conventions */}
        <Animated.View
          entering={FadeIn.delay(200).duration(600)}
          style={{
            width: 40,
            height: 1.5,
            backgroundColor: colors.accent,
            opacity: 0.4,
            marginBottom: Spacing['3'],
            borderRadius: 1,
          }}
        />

        <Animated.Text
          entering={FadeIn.delay(400).duration(700)}
          style={{
            fontFamily: FontFamily.display,
            fontSize: 28,
            color: colors.text,
            lineHeight: 36,
          }}
        >
          A note on privacy
        </Animated.Text>

        <Animated.View entering={FadeIn.delay(700).duration(700)} style={{ gap: Spacing['3'] }}>
          <Text style={{
            fontFamily: FontFamily.body,
            fontSize: FontSize.base,
            color: colors.text,
            lineHeight: 26,
          }}>
            To generate your personalized devotionals, Unfold sends the context you've shared — such as what's on your heart and your growth goals — to Anthropic (Claude) and xAI (Grok).
          </Text>
          <Text style={{
            fontFamily: FontFamily.body,
            fontSize: FontSize.base,
            color: colors.textMuted,
            lineHeight: 26,
          }}>
            These services process your reflections to craft content shaped around where you are. Your data is never sold or used for advertising.
          </Text>
          <Text style={{
            fontFamily: FontFamily.body,
            fontSize: FontSize.base,
            color: colors.textMuted,
            lineHeight: 26,
          }}>
            You can review our full privacy practices in Settings at any time.
          </Text>
        </Animated.View>
      </View>

      {/* Explicit consent CTA — the tap itself is the consent action */}
      <Animated.View
        entering={FadeIn.delay(1200).duration(600)}
        style={{ paddingTop: Spacing['6'], paddingBottom: Spacing['4'] }}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onAccept();
          }}
          style={{
            backgroundColor: colors.accent,
            paddingVertical: Spacing['4'],
            borderRadius: Radius.md,
            alignItems: 'center',
          }}
          accessibilityLabel="I understand — continue"
          accessibilityRole="button"
        >
          <Text style={{
            fontFamily: FontFamily.uiMedium,
            fontSize: FontSize.base,
            color: colors.background,
            letterSpacing: 0.3,
          }}>
            I understand — continue
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}
