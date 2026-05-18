import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { requireOptionalNativeModule } from 'expo-modules-core';

import { canonicalGeneratedDayId } from '@/lib/devotional-canonical-days';
import { isQaToolsEnabled } from '@/lib/qa-tools';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, type Devotional, type UserProfile } from '@/lib/store';
import { useUIState } from '@/lib/ui-state';

type DevMenuPreferencesModule = {
  setPreferencesAsync?: (settings: { showFloatingActionButton?: boolean }) => Promise<void>;
};

const QA_DEVOTIONAL_ID = 'qa-library-target-devotional';
const QA_HIGHLIGHT_ID = 'qa-library-target-highlight';
const QA_BOOKMARK_ID = 'qa-library-target-bookmark';

const highlightTargetText =
  'The landing proof phrase sits here so the library tap must bring this exact sentence into view.';

const bookmarkTargetText =
  'The bookmarked quote proof phrase sits here and should become visible after opening it from the library.';

const qaUser: UserProfile = {
  name: 'Nick',
  aboutMe: 'Seeded My Library deep-link QA profile.',
  personaTraits: ['reflective', 'building', 'hopeful'],
  currentSituation: 'Testing whether My Library lands on the exact devotional highlight or bookmark.',
  emotionalState: 'Focused',
  faithImpact: 'Wants the reader to preserve a pure exact-location experience.',
  spiritualSeeking: 'A steady rhythm with God in the middle of work and decisions.',
  readingDuration: 5,
  devotionalLength: 3,
  reminderTime: '08:00',
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

function buildLongBody(): string {
  const intro = [
    'This seeded devotional intentionally starts with several ordinary paragraphs so an exact-location library tap has to move the reader, not just open the right day.',
    'The first few lines should not be confused with the saved target. They exist to make a failed landing visually obvious in simulator screenshots.',
    'A quiet opening paragraph keeps the top of the reader filled with regular devotional copy before the QA marker appears much lower in the body.',
    'Another paragraph adds enough vertical distance for the parent scroll view to need a real scroll command after the WebView reports its located offset.',
    'This paragraph still is not the target. If a screenshot lands here, the route opened the right devotional but failed the exact-location behavior.',
    'The reader should continue past this setup copy automatically when the saved highlight is opened from My Library.',
    'One more setup paragraph gives the test enough height to distinguish a top-of-reader landing from the intended saved-text landing.',
    'The target is now close, but this sentence is still only a spacer for runtime QA.',
  ];

  const target = [
    `Here is the saved highlight target: ${highlightTargetText} It is surrounded by normal devotional prose so fallback text matching has to find the actual paragraph.`,
    'After the highlighted target, the body keeps going so the test can also prove that it did not merely scroll to the bottom by accident.',
    'The closing paragraphs are extra guardrails for visual inspection after the simulator tap completes.',
  ];

  return [...intro, ...target].join('\n\n');
}

function buildDevotional(nowIso: string): Devotional {
  return {
    id: QA_DEVOTIONAL_ID,
    title: 'Library Landing QA Series',
    totalDays: 3,
    currentDay: 3,
    createdAt: nowIso,
    updatedAt: nowIso,
    generationMode: 'progressive',
    userContext: {
      name: 'Nick',
      aboutMe: 'Seeded My Library deep-link QA profile.',
      currentSituation: 'Testing exact library landing.',
      emotionalState: 'Focused',
      faithImpact: 'Wants library taps to land precisely.',
    },
    days: [1, 2, 3].map((dayNumber) => ({
      devotionalId: QA_DEVOTIONAL_ID,
      id: canonicalGeneratedDayId(QA_DEVOTIONAL_ID, dayNumber),
      dayNumber,
      title: dayNumber === 2 ? 'Exact Landing Runtime Proof' : `Library QA Setup Day ${dayNumber}`,
      scriptureReference: dayNumber === 2 ? 'Psalm 119:105' : 'Psalm 46:10',
      scriptureText:
        dayNumber === 2
          ? 'Your word is a lamp to my feet and a light to my path.'
          : 'Be still, and know that I am God.',
      bodyText:
        dayNumber === 2
          ? buildLongBody()
          : 'This setup day exists only so the seeded QA series behaves like a multi-day devotional.',
      quotableLine: dayNumber === 2 ? bookmarkTargetText : 'Stillness is not absence; it is attention.',
      quotes:
        dayNumber === 2
          ? [
              {
                text: bookmarkTargetText,
                author: 'Unfold QA',
              },
            ]
          : undefined,
      isRead: true,
      isRevealed: true,
      readAt: nowIso,
      generatedAt: nowIso,
      updatedAt: nowIso,
    })),
  };
}

function hideExpoDevToolsFabForPreview() {
  if (!__DEV__) return;

  try {
    const preferences = requireOptionalNativeModule<DevMenuPreferencesModule>('DevMenuPreferences');
    void preferences?.setPreferencesAsync?.({ showFloatingActionButton: false });
  } catch {
    // The native DevMenuPreferences module only exists in dev clients.
  }
}

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function DebugSeedLibraryTargetsScreen() {
  const router = useRouter();
  const { target } = useLocalSearchParams<{ target?: string | string[] }>();
  const { colors } = useTheme();

  useEffect(() => {
    if (!isQaToolsEnabled()) return;

    hideExpoDevToolsFabForPreview();

    const nowIso = new Date().toISOString();
    const devotional = buildDevotional(nowIso);
    const store = useUnfoldStore.getState();
    const ui = useUIState.getState();

    ui.setDebugForceTrialExpired(false);
    ui.setQaPremiumOverride(false);
    ui.setRevenueCatResolved();

    store.setUser(qaUser);
    store.clearResumeContext();
    store.removeDevotional(QA_DEVOTIONAL_ID);
    store.addDevotional(devotional);
    store.setCurrentDevotional(QA_DEVOTIONAL_ID);
    store.setHasSeenHomeTooltips(true);
    store.setHasSeenFeatureOnboarding(true);
    store.setHasSeenDay1Review();

    useUnfoldStore.setState({
      highlights: [
        {
          id: QA_HIGHLIGHT_ID,
          devotionalId: QA_DEVOTIONAL_ID,
          devotionalTitle: devotional.title,
          dayNumber: 2,
          dayTitle: 'Exact Landing Runtime Proof',
          highlightedText: highlightTargetText,
          color: 'yellow',
          contextBefore: 'The target is now close, but this sentence is still only a spacer for runtime QA.',
          contextAfter: 'It is surrounded by normal devotional prose so fallback text matching has to find the actual paragraph.',
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      ],
      bookmarks: [
        {
          id: QA_BOOKMARK_ID,
          devotionalId: QA_DEVOTIONAL_ID,
          devotionalTitle: devotional.title,
          dayNumber: 2,
          dayTitle: 'Exact Landing Runtime Proof',
          scriptureReference: 'Quote',
          scriptureText: bookmarkTargetText,
          quotedText: bookmarkTargetText,
          savedAt: nowIso,
          updatedAt: nowIso,
        },
      ],
      journalEntries: [],
      checkIns: [],
      lastMiddayCompletedDate: null,
      lastEveningCompletedDate: null,
      dismissedBridgeCardDate: null,
      dismissedRememberThisCardDate: null,
      nudgeImpressions: [],
      nudgeDismissals: [],
      nudgeShownThisSession: false,
    });

    const selectedTarget = firstString(target);
    router.replace({
      pathname: '/(tabs)/(you)/my-content',
      params: selectedTarget === 'bookmark'
        ? { tab: 'bookmarks', from: 'qa-library-targets' }
        : { tab: 'highlights', source: 'devotional', type: 'highlights', from: 'qa-library-targets' },
    });
  }, [router, target]);

  if (!isQaToolsEnabled()) {
    return <Redirect href="/(tabs)/(you)" />;
  }

  return (
    <View
      style={{
        flex: 1,
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        backgroundColor: colors.background,
      }}
    >
      <ActivityIndicator color={colors.accent} />
      <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center' }}>
        Seeding My Library exact-target QA…
      </Text>
    </View>
  );
}
