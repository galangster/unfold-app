import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';

import { useCompanionChatStore } from '@/lib/companion-chat-store';
import { isQaToolsEnabled } from '@/lib/qa-tools';
import { useUnfoldStore, type UserProfile } from '@/lib/store';
import { useTheme } from '@/lib/theme';

const qaCompanionUser: UserProfile = {
  name: 'Nick',
  aboutMe: 'QA profile for Companion drawer visual verification.',
  personaTraits: ['reflective', 'focused', 'hopeful'],
  currentSituation: 'Reviewing conversation management polish.',
  emotionalState: 'Focused',
  faithImpact: 'Wants the app to feel calm, grounded, and intentional.',
  spiritualSeeking: 'A steady rhythm with God during product decisions.',
  readingDuration: 5,
  devotionalLength: 3,
  reminderTime: '8:00 AM',
  hasCompletedOnboarding: true,
  hasCompletedStyleOnboarding: true,
  isPremium: false,
  fontSize: 'medium',
  writingStyle: {
    tone: 'warm',
    depth: 'balanced',
    faithBackground: 'growing',
    lifeStage: 'building',
  },
  bibleTranslation: 'BSB',
  themeMode: 'dark',
  accentTheme: 'gold',
  readingFont: 'source-serif',
  preferredVoice: 'alloy',
  relationshipWithGod: 'ups-and-downs',
  bibleFrequency: 'few-times-week',
  growthGoals: ['peace', 'discernment', 'consistency'],
  obstacles: ['busyness', 'uncertainty'],
  companionName: 'Companion',
};

export default function DebugSeedCompanionDrawer() {
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    if (!isQaToolsEnabled()) return;

    const now = Date.now();
    useUnfoldStore.getState().setUser(qaCompanionUser);
    const chat = useCompanionChatStore.getState();
    chat.clearAllConversations();
    chat.addMessage({
      id: 'qa-companion-user-1',
      role: 'user',
      content: 'Help me process making product decisions with wisdom.',
      timestamp: now - 90_000,
      status: 'complete',
    });
    useCompanionChatStore.getState().addMessage({
      id: 'qa-companion-assistant-1',
      role: 'companion',
      content: 'Let’s slow down and name what matters most before choosing the next step.',
      timestamp: now - 60_000,
      status: 'complete',
    });
    useCompanionChatStore.getState().updateConversation(
      useCompanionChatStore.getState().activeConversationId ?? '',
      { title: 'Product decisions with wisdom', pinned: true },
    );

    const timeout = setTimeout(() => {
      router.replace('/(tabs)/(ask)');
    }, 50);

    return () => clearTimeout(timeout);
  }, [router]);

  if (!isQaToolsEnabled()) {
    return <Redirect href="/" />;
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.accent} />
      <Text style={{ marginTop: 12, color: colors.textMuted }}>Preparing Companion drawer QA state…</Text>
    </View>
  );
}
