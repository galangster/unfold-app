import { View, Text, Pressable, ScrollView, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, Flame, Snowflake, Calendar, Info } from 'lucide-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { StreakDisplay } from '@/components/StreakDisplay';

export default function StreakSettingsScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  
  const streak = useUnfoldStore((s) => s.streakCurrent);
  const longestStreak = useUnfoldStore((s) => s.streakLongest);
  const freezes = useUnfoldStore((s) => s.streakFreezes);
  const weekendAmnesty = useUnfoldStore((s) => s.streakWeekendAmnesty);
  const lastReadDate = useUnfoldStore((s) => s.streakLastReadDate);
  const toggleWeekendAmnesty = useUnfoldStore((s) => s.toggleWeekendAmnesty);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleToggleAmnesty = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleWeekendAmnesty();
  };

  // Calculate days until next freeze
  const daysUntilFreeze = streak > 0 ? 7 - (streak % 7) : 7;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <Pressable onPress={handleBack} style={{ padding: 8 }}>
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text
          style={{
            fontFamily: FontFamily.uiSemiBold,
            fontSize: 17,
            color: colors.text,
            marginLeft: 12,
          }}
        >
          Streak Settings
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }}>
        {/* Current Streak Card */}
        <Animated.View
          entering={FadeIn}
          style={{
            backgroundColor: colors.inputBackground,
            borderRadius: 16,
            padding: 24,
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <StreakDisplay size="large" showFreeze={false} />
          
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: 14,
              color: colors.textMuted,
              marginTop: 12,
              textAlign: 'center',
            }}
          >
            {lastReadDate
              ? `Last devotional: ${new Date(lastReadDate).toLocaleDateString()}`
              : 'Start your streak by completing a devotional'}
          </Text>
        </Animated.View>

        {/* Stats Grid */}
        <View
          style={{
            flexDirection: 'row',
            gap: 12,
            marginBottom: 24,
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: colors.inputBackground,
              borderRadius: 12,
              padding: 16,
              alignItems: 'center',
            }}
          >
            <Flame size={24} color="#C8A55C" />
            <Text
              style={{
                fontFamily: FontFamily.uiSemiBold,
                fontSize: 24,
                color: colors.text,
                marginTop: 8,
              }}
            >
              {longestStreak}
            </Text>
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 12,
                color: colors.textMuted,
              }}
            >
              Best Streak
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              backgroundColor: colors.inputBackground,
              borderRadius: 12,
              padding: 16,
              alignItems: 'center',
            }}
          >
            <Snowflake size={24} color={colors.textSubtle} />
            <Text
              style={{
                fontFamily: FontFamily.uiSemiBold,
                fontSize: 24,
                color: colors.text,
                marginTop: 8,
              }}
            >
              {freezes}
            </Text>
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 12,
                color: colors.textMuted,
              }}
            >
              Freezes
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              backgroundColor: colors.inputBackground,
              borderRadius: 12,
              padding: 16,
              alignItems: 'center',
            }}
          >
            <Calendar size={24} color={colors.textSubtle} />
            <Text
              style={{
                fontFamily: FontFamily.uiSemiBold,
                fontSize: 24,
                color: colors.text,
                marginTop: 8,
              }}
            >
              {daysUntilFreeze}
            </Text>
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 12,
                color: colors.textMuted,
              }}
            >
              To Freeze
            </Text>
          </View>
        </View>

        {/* Weekend Amnesty Toggle */}
        <View
          style={{
            backgroundColor: colors.inputBackground,
            borderRadius: 16,
            padding: 20,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: FontFamily.uiSemiBold,
                  fontSize: 16,
                  color: colors.text,
                }}
              >
                Weekend Amnesty
              </Text>
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 13,
                  color: colors.textMuted,
                  marginTop: 4,
                  lineHeight: 18,
                }}
              >
                Saturdays and Sundays won't break your streak
              </Text>
            </View>
            <Switch
              value={weekendAmnesty}
              onValueChange={handleToggleAmnesty}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Info Section */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            marginTop: 24,
            padding: 16,
            backgroundColor: colors.inputBackground,
            borderRadius: 12,
          }}
        >
          <Info size={18} color={colors.textMuted} style={{ marginRight: 12, marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 13,
                color: colors.textMuted,
                lineHeight: 18,
              }}
            >
              Complete a 7-day streak to earn a freeze. Freezes automatically protect your streak if you miss a day.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
