import { View, Text, Pressable } from 'react-native';
import { StreakDisplay, StreakBadge, calculateStreak } from '@/components/StreakDisplay';
import { useUnfoldStore } from '@/lib/store';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';

// EXAMPLE: Updated HomeScreen header with streak
export function HomeHeaderWithStreak() {
  const { colors } = useTheme();
  const user = useUnfoldStore((s) => s.user);
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const journalEntries = useUnfoldStore((s) => s.journalEntries);

  const streak = calculateStreak(devotionals, journalEntries);

  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 16 }}>
      {/* Greeting row with streak badge */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text
            style={{
              fontFamily: FontFamily.body,
              fontSize: 15,
              color: colors.textSubtle,
            }}
          >
            Good morning
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text
              style={{
                fontFamily: FontFamily.display,
                fontSize: 34,
                color: colors.text,
                letterSpacing: -0.5,
              }}
            >
              {user?.name}
            </Text>
            <StreakBadge streak={streak} />
          </View>
        </View>
      </View>

      {/* Full streak card - replaces or supplements the weekly recap */}
      <View style={{ marginTop: 20 }}>
        <StreakDisplay
          streak={streak}
          size="medium"
          onPress={() => {
            // Navigate to detailed streak/stats view
            // router.push('/(main)/stats');
          }}
        />
      </View>
    </View>
  );
}

// EXAMPLE: Contextual CTA based on streak
export function ContextualCTA({ streak, onPress }: { streak: ReturnType<typeof calculateStreak>; onPress: () => void }) {
  const { colors } = useTheme();

  // Dynamic CTA text based on streak state
  const getCTAText = () => {
    if (streak.currentStreak === 0) return 'Begin Your Journey';
    if (streak.currentStreak === 1) return 'Build Your Rhythm';
    if (streak.currentStreak < 3) return 'Keep Going';
    if (streak.currentStreak < 7) return 'Stay Rooted';
    return 'Deepen Your Practice';
  };

  // Subtle encouragement
  const getSubtext = () => {
    if (streak.currentStreak === 0) return 'One step at a time';
    if (streak.currentStreak === 1) return 'Day 2 begins now';
    return `${streak.currentStreak} days of showing up`;
  };

  return (
    <Pressable onPress={onPress}>
      <View
        style={{
          backgroundColor: colors.accent,
          paddingVertical: 16,
          borderRadius: 14,
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            fontFamily: FontFamily.uiMedium,
            fontSize: 16,
            color: colors.background,
            letterSpacing: 0.3,
          }}
        >
          {getCTAText()}
        </Text>
        {streak.currentStreak > 0 && (
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: 13,
              color: `${colors.background}90`,
              marginTop: 4,
            }}
          >
            {getSubtext()}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
