/**
 * Debug Light Mode Gallery
 *
 * Renders all 8 components that received light-mode theme fixes in a single
 * scrollable preview screen. Tap the theme toggle at the top to flip between
 * dark and light and verify every component adapts correctly without
 * navigating to each real-world trigger.
 *
 * This is dev-only tooling. Remove the route + the button in (you)/index.tsx
 * before a public App Store release.
 *
 * Components covered (from commit 27d6775):
 *  1. EveningCelebration
 *  2. welcome-celebration (rendered inline, not the full-screen route)
 *  3. CheckInSheet
 *  4. UndoToast
 *  5. CompanionInput
 *  6. SwipeableNoteCard
 *  7. DownloadBibleSheet
 */

import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useRouter } from 'expo-router';
import { CaretLeftIcon, SunIcon, MoonIcon } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';

import { FontFamily } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, type Note, type ThemeMode } from '@/lib/store';

import { EveningCelebration } from '@/components/EveningCelebration';
import { CheckInSheet } from '@/components/CheckInSheet';
import { UndoToast } from '@/components/UndoToast';
import { CompanionInput } from '@/components/companion/CompanionInput';
import { SwipeableNoteCard } from '@/components/notebook/SwipeableNoteCard';
import { DownloadBibleSheet } from '@/components/bible/DownloadBibleSheet';

// Mock note for SwipeableNoteCard preview
const MOCK_NOTE: Note = {
  id: 'debug-note-1',
  title: 'A mock note for preview',
  content:
    'This is a preview note rendered inside the debug gallery to verify that SwipeableNoteCard looks correct in both light and dark themes. Swipe left to see the action icons.',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  category: 'general',
  tags: ['debug', 'light-mode'],
  isFavorite: false,
  scriptureRefs: [],
};

// ---------------------------------------------------------------------------
// Section wrapper — gives each component a labeled frame
// ---------------------------------------------------------------------------

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: Spacing['8'] }}>
      <Text
        style={{
          fontFamily: FontFamily.uiMedium,
          fontSize: 13,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: colors.textHint,
          marginBottom: Spacing['2'],
          paddingHorizontal: Spacing['4'],
        }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={{
            fontFamily: FontFamily.ui,
            fontSize: 13,
            color: colors.textMuted,
            marginBottom: Spacing['3'],
            paddingHorizontal: Spacing['4'],
          }}
        >
          {subtitle}
        </Text>
      ) : null}
      <View
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radius.lg,
          marginHorizontal: Spacing['4'],
          backgroundColor: colors.inputBackground,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function DebugLightModeScreen() {
  if (!__DEV__) {
    return <Redirect href="/(tabs)/(you)" />;
  }

  const router = useRouter();
  const { colors, isDark } = useTheme();
  const themeMode = useUnfoldStore((s) => s.user?.themeMode ?? 'dark');
  const updateUser = useUnfoldStore((s) => s.updateUser);

  // Each sheet/toast/overlay has its own visibility toggle so previews
  // don't fight each other for the screen. They all default to `false` —
  // only the inline components (CompanionInput, SwipeableNoteCard) render
  // unconditionally. Tap a section's button to open its overlay when
  // you want to inspect it.
  const [showEvening, setShowEvening] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const [showDownloadSheet, setShowDownloadSheet] = useState(false);

  const toggleTheme = () => {
    const next: ThemeMode = themeMode === 'light' ? 'dark' : 'light';
    updateUser({ themeMode: next });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header — back button + theme toggle */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: Spacing['4'],
          paddingBottom: Spacing['3'],
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ padding: Spacing['2'] }}
        >
          <CaretLeftIcon size={22} color={colors.text} weight="regular" />
        </TouchableOpacity>

        <View style={{ flex: 1, marginLeft: Spacing['2'] }}>
          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: 17,
              color: colors.text,
            }}
          >
            Light Mode Gallery
          </Text>
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: 12,
              color: colors.textMuted,
            }}
          >
            Theme: {isDark ? 'dark' : 'light'} — tap to flip
          </Text>
        </View>

        <TouchableOpacity
          onPress={toggleTheme}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: Spacing['2'],
            paddingHorizontal: Spacing['3'],
            borderRadius: Radius.md,
            backgroundColor: 'rgba(200, 165, 92, 0.1)',
            gap: Spacing['2'],
          }}
        >
          {isDark ? (
            <SunIcon size={18} color={colors.accent} weight="regular" />
          ) : (
            <MoonIcon size={18} color={colors.accent} weight="regular" />
          )}
          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: 13,
              color: colors.accent,
            }}
          >
            {isDark ? 'Light' : 'Dark'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingVertical: Spacing['4'] }}
      >
        {/* 1. EveningCelebration — full-screen overlay, toggle to re-show */}
        <Section
          title="1. Evening Celebration"
          subtitle="Full-screen overlay. Tap to re-show if you dismissed it."
        >
          <TouchableOpacity
            onPress={() => setShowEvening(true)}
            style={{ padding: Spacing['4'], alignItems: 'center' }}
          >
            <Text
              style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: 14,
                color: colors.accent,
              }}
            >
              Show EveningCelebration overlay
            </Text>
          </TouchableOpacity>
        </Section>

        {/* 2. welcome-celebration — full route, link to open */}
        <Section
          title="2. Welcome Celebration"
          subtitle="Full screen route. Opens in a modal — press back to return."
        >
          <TouchableOpacity
            onPress={() => router.push('/welcome-celebration')}
            style={{ padding: Spacing['4'], alignItems: 'center' }}
          >
            <Text
              style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: 14,
                color: colors.accent,
              }}
            >
              Open welcome-celebration screen
            </Text>
          </TouchableOpacity>
        </Section>

        {/* 3. CheckInSheet */}
        <Section title="3. Check-In Sheet" subtitle="Bottom sheet. Tap to open.">
          <TouchableOpacity
            onPress={() => setShowCheckIn(true)}
            style={{ padding: Spacing['4'], alignItems: 'center' }}
          >
            <Text
              style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: 14,
                color: colors.accent,
              }}
            >
              Open CheckInSheet
            </Text>
          </TouchableOpacity>
        </Section>

        {/* 4. UndoToast — inline so you can see the colors */}
        <Section
          title="4. Undo Toast"
          subtitle="Renders at the bottom of the screen. Tap to re-show."
        >
          <TouchableOpacity
            onPress={() => setShowUndoToast(true)}
            style={{ padding: Spacing['4'], alignItems: 'center' }}
          >
            <Text
              style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: 14,
                color: colors.accent,
              }}
            >
              Re-show UndoToast
            </Text>
          </TouchableOpacity>
        </Section>

        {/* 6. CompanionInput — inline */}
        <Section
          title="6. Companion Input"
          subtitle="Inline preview — type to see the send button adapt."
        >
          <View style={{ padding: Spacing['3'] }}>
            <CompanionInput
              onSend={(text) => console.log('[DebugGallery] onSend:', text)}
              onStop={() => console.log('[DebugGallery] onStop')}
              isStreaming={false}
            />
          </View>
        </Section>

        {/* 7. SwipeableNoteCard — inline with mock data */}
        <Section
          title="7. Swipeable Note Card"
          subtitle="Swipe left on the card to see action icons."
        >
          <View style={{ padding: Spacing['3'] }}>
            <SwipeableNoteCard
              note={MOCK_NOTE}
              index={0}
              onPress={() => console.log('[DebugGallery] note tapped')}
              onShare={() => console.log('[DebugGallery] note share')}
              onMove={() => console.log('[DebugGallery] note move')}
              onDelete={() => console.log('[DebugGallery] note delete')}
            />
          </View>
        </Section>

        {/* 8. DownloadBibleSheet */}
        <Section
          title="8. Download Bible Sheet"
          subtitle="Fullscreen overlay. Tap to re-show."
        >
          <TouchableOpacity
            onPress={() => setShowDownloadSheet(true)}
            style={{ padding: Spacing['4'], alignItems: 'center' }}
          >
            <Text
              style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: 14,
                color: colors.accent,
              }}
            >
              Show DownloadBibleSheet
            </Text>
          </TouchableOpacity>
        </Section>

        <View style={{ height: Spacing['10'] }} />
      </ScrollView>

      {/* --- Overlays & sheets --- */}

      {/* 1. EveningCelebration */}
      <EveningCelebration
        visible={showEvening}
        onDismiss={() => setShowEvening(false)}
        message="You showed up today. That's what matters."
      />

      {/* 3. CheckInSheet */}
      <CheckInSheet
        visible={showCheckIn}
        onClose={() => setShowCheckIn(false)}
        onComplete={() => setShowCheckIn(false)}
        question="What are you carrying today?"
        chips={['Work stress', 'Relationship', 'Health', 'Anxiety']}
        devotionalId="debug-devotional"
        dayNumber={1}
      />

      {/* 4. UndoToast */}
      <UndoToast
        visible={showUndoToast}
        message="Note moved to folder"
        onUndo={() => {
          console.log('[DebugGallery] UndoToast undo');
          setShowUndoToast(false);
        }}
        onDismiss={() => setShowUndoToast(false)}
        duration={999999}
      />

      {/* 8. DownloadBibleSheet */}
      <DownloadBibleSheet
        visible={showDownloadSheet}
        onComplete={() => setShowDownloadSheet(false)}
        colors={colors}
        isDark={isDark}
        progress={null}
        isDownloading={false}
        error={null}
        onDownload={() => {
          console.log('[DebugGallery] Bible download tapped');
        }}
      />
    </SafeAreaView>
  );
}
