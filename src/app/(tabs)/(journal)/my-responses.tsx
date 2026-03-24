import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CaretLeftIcon, CaretRightIcon, PencilLineIcon } from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { format } from 'date-fns';

const MAX_CONTENT_HEIGHT = 100; // Max height for content preview

export default function MyResponsesScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const journalEntries = useUnfoldStore((s) => s.journalEntries);
  const devotionals = useUnfoldStore((s) => s.devotionals);

  // Get devotional title for an entry
  const getDevotionalTitle = (devotionalId: string) => {
    const devotional = devotionals.find((d) => d.id === devotionalId);
    return devotional?.title ?? 'Unknown';
  };

  const handleEntryPress = (entryId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: '/(tabs)/(today)/journal-detail',
      params: { entryId },
    });
  };

  // Gradient colors for fade effect based on theme
  const fadeGradient: [string, string] = [
    'transparent',
    `${colors.inputBackground}`,
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing['4'], paddingVertical: Spacing['3'] }}>
          <TouchableOpacity activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ padding: Spacing['2'] }}
          >
            <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
          </TouchableOpacity>

          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: FontSize.base,
              color: colors.text,
              marginLeft: Spacing['2'],
            }}
          >
            My Responses
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: Spacing['6'], paddingTop: Spacing['4'], paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {journalEntries.length === 0 ? (
            <Animated.View
              entering={FadeIn.duration(400)}
              style={{ alignItems: 'center', paddingTop: 60 }}
            >
              <PencilLineIcon size={48} color={colors.textHint} weight="light" />
              <Text
                style={{
                  fontFamily: FontFamily.body,
                  fontSize: FontSize.base,
                  color: colors.textMuted,
                  textAlign: 'center',
                  marginTop: Spacing['4'],
                }}
              >
                No journal entries yet
              </Text>
              <Text
                style={{
                  fontFamily: FontFamily.body,
                  fontSize: FontSize.sm,
                  color: colors.textHint,
                  textAlign: 'center',
                  marginTop: Spacing['2'],
                }}
              >
                Your reflections will appear here
              </Text>
            </Animated.View>
          ) : (
            journalEntries
              .slice()
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((entry, index) => {
                const entryDate = format(new Date(entry.createdAt), 'MMM d, yyyy');
                const devotionalTitle = getDevotionalTitle(entry.devotionalId);
                const isLongContent = entry.content.length > 150;

                return (
                  <Animated.View
                    key={entry.id}
                    entering={FadeInDown.duration(400).delay(index * 100)}
                  >
                    <TouchableOpacity activeOpacity={0.7}
                      onPress={() => handleEntryPress(entry.id)}
                    >
                      <View
                        style={{
                          backgroundColor: colors.inputBackground,
                          borderRadius: Radius.lg,
                          borderWidth: 1,
                          borderColor: colors.border,
                          padding: Spacing['5'],
                          marginBottom: Spacing['3'],
                          overflow: 'hidden',
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing['3'] }}>
                          <Text
                            style={{
                              fontFamily: FontFamily.mono,
                              fontSize: 11,
                              color: colors.textHint,
                              letterSpacing: 1,
                              textTransform: 'uppercase',
                            }}
                          >
                            Day {entry.dayNumber}
                          </Text>
                          <Text
                            style={{
                              fontFamily: FontFamily.mono,
                              fontSize: 11,
                              color: colors.textHint,
                            }}
                          >
                            {entryDate}
                          </Text>
                        </View>

                        <Text
                          style={{
                            fontFamily: FontFamily.ui,
                            fontSize: 13,
                            color: colors.textSubtle,
                            marginBottom: Spacing['3'],
                          }}
                          numberOfLines={1}
                        >
                          {devotionalTitle}
                        </Text>

                        <View style={{ maxHeight: MAX_CONTENT_HEIGHT, overflow: 'hidden' }}>
                          <Text
                            style={{
                              fontFamily: FontFamily.body,
                              fontSize: 15,
                              color: colors.text,
                              lineHeight: 24,
                            }}
                          >
                            {entry.content}
                          </Text>

                          {/* Fade overlay for long content */}
                          {isLongContent && (
                            <LinearGradient
                              colors={fadeGradient}
                              style={{
                                position: 'absolute',
                                bottom: 0,
                                left: 0,
                                right: 0,
                                height: 50,
                              }}
                            />
                          )}
                        </View>

                        {/* Tap to read more indicator */}
                        {isLongContent && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: Spacing['2'] }}>
                            <Text
                              style={{
                                fontFamily: FontFamily.ui,
                                fontSize: FontSize.xs,
                                color: colors.textSubtle,
                                marginRight: 4,
                              }}
                            >
                              Read more
                            </Text>
                            <CaretRightIcon size={14} color={colors.textSubtle} weight="light" />
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
