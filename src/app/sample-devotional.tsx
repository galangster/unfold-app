import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { useUnfoldStore } from '@/lib/store';
import { ChevronLeft, ArrowRight } from 'lucide-react-native';

interface DevotionalContent {
  title: string;
  scripture: string;
  passage: string;
  reflection: string;
  prayer: string;
}

function generateSampleDevotional(name: string, aboutMe: string): DevotionalContent {
  const lowerAbout = aboutMe.toLowerCase();
  
  if (lowerAbout.includes('stress') || lowerAbout.includes('anxious')) {
    return {
      title: 'An Anchor for Anxious Thoughts',
      scripture: 'Philippians 4:6-7',
      passage: 'Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God. And the peace of God, which transcends all understanding, will guard your hearts and your minds in Christ Jesus.',
      reflection: `${name}, I can hear the weight in your words—the way the mind races when everything feels uncertain. But what if peace isn't the absence of chaos, but a presence that meets you right in the middle of it?\n\nThe peace of God doesn't make sense to the watching world. It doesn't add up on paper. But it guards you—like a sentry standing watch over your heart and mind—when everything else feels unsteady.`,
      prayer: `Lord, ${name} is carrying more than they were meant to hold alone. Teach them to trade their anxious thoughts for Your peace.`,
    };
  }
  
  if (lowerAbout.includes('tired') || lowerAbout.includes('exhausted')) {
    return {
      title: 'The Invitation You Didnt Know You Needed',
      scripture: 'Matthew 11:28-30',
      passage: 'Come to me, all you who are weary and burdened, and I will give you rest. Take my yoke upon you and learn from me, for I am gentle and humble in heart, and you will find rest for your souls.',
      reflection: `${name}, exhaustion isn't a badge of honor—it's a signal that something is out of rhythm. Jesus doesn't offer rest as a reward for productivity; He offers it as a starting point.`,
      prayer: `Jesus, ${name} is weary. Give them the courage to stop, to come, to receive rest not as a luxury but as a gift You died to give.`,
    };
  }
  
  return {
    title: 'Learning to Trust Again',
    scripture: 'Psalm 56:3-4',
    passage: 'When I am afraid, I put my trust in you. In God, whose word I praise—in God I trust and am not afraid. What can mere mortals do to me?',
    reflection: `${name}, trust is a choice we make before we feel it. It's saying, "I don't know what You're doing, God, but I know who You are."\n\nEvery devotional you receive will be an invitation to trust a little more deeply.`,
    prayer: `Lord, ${name} is learning to trust again. Give them small mercies today—tiny confirmations that You see, You know, and You are working.`,
  };
}

export default function SampleDevotionalScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const user = useUnfoldStore((s) => s.user);
  const [showContent, setShowContent] = useState(false);

  const name = user?.name || 'Friend';
  const aboutMe = user?.aboutMe || '';
  const sample = generateSampleDevotional(name, aboutMe);

  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 300);
    return () => clearTimeout(timer);
  }, []);

  const handleContinue = () => {
    // Go back to existing onboarding (don't push new one)
    router.back();
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 16, height: 60 }}>
          <Pressable onPress={handleBack} style={{ padding: 8, marginLeft: -8 }}>
            <ChevronLeft size={24} color={colors.textMuted} />
          </Pressable>
        </View>

        {showContent && (
          <>
            <Animated.View entering={FadeIn.duration(400)} style={{ paddingHorizontal: 32, marginBottom: 16 }}>
              <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 13, color: colors.accent, marginBottom: 8 }}>
                YOUR FIRST DEVOTIONAL
              </Text>
              <Text style={{ fontFamily: FontFamily.display, fontSize: 24, color: colors.text }}>
                This is how Unfold speaks to you.
              </Text>
            </Animated.View>

            <Animated.View
              entering={FadeInUp.duration(500).delay(200)}
              style={{
                flex: 1,
                marginHorizontal: 24,
                backgroundColor: colors.inputBackground,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                overflow: 'hidden',
              }}
            >
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24 }}>
                <Text style={{ fontFamily: FontFamily.display, fontSize: 22, color: colors.text, marginBottom: 12 }}>
                  {sample.title}
                </Text>

                <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 13, color: colors.accent, marginBottom: 8 }}>
                  {sample.scripture}
                </Text>

                <Text
                  style={{
                    fontFamily: FontFamily.mono,
                    fontSize: 14,
                    color: colors.textMuted,
                    lineHeight: 22,
                    marginBottom: 20,
                    fontStyle: 'italic',
                  }}
                >
                  "{sample.passage}"
                </Text>

                <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 20 }} />

                <Text style={{ fontFamily: FontFamily.body, fontSize: 15, color: colors.text, lineHeight: 24, marginBottom: 20 }}>
                  {sample.reflection}
                </Text>

                <View
                  style={{
                    backgroundColor: isDark ? 'rgba(200, 165, 92, 0.08)' : 'rgba(154, 123, 60, 0.05)',
                    borderRadius: 12,
                    padding: 16,
                    borderLeftWidth: 3,
                    borderLeftColor: colors.accent,
                  }}
                >
                  <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 11, color: colors.accent, marginBottom: 8 }}>
                    PRAYER
                  </Text>
                  <Text style={{ fontFamily: FontFamily.bodyItalic, fontSize: 14, color: colors.textMuted, lineHeight: 22 }}>
                    {sample.prayer}
                  </Text>
                </View>

                <View style={{ height: 40 }} />
              </ScrollView>
            </Animated.View>

            <Animated.View entering={FadeIn.duration(400).delay(400)} style={{ paddingHorizontal: 24, paddingBottom: 24, paddingTop: 16 }}>
              <Text
                style={{
                  fontFamily: FontFamily.body,
                  fontSize: 14,
                  color: colors.textMuted,
                  textAlign: 'center',
                  marginBottom: 16,
                }}
              >
                Every devotional is written just for you, based on what you share.
              </Text>

              <Pressable onPress={handleContinue}>
                {({ pressed }) => (
                  <View
                    style={{
                      backgroundColor: colors.accent,
                      paddingVertical: 16,
                      borderRadius: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      opacity: pressed ? 0.9 : 1,
                    }}
                  >
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 16, color: colors.background }}>
                      Continue Setup
                    </Text>
                    <ArrowRight size={18} color={colors.background} />
                  </View>
                )}
              </Pressable>
            </Animated.View>
          </>
        )}
      </SafeAreaView>
    </View>
  );
}
