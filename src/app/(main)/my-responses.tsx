import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, ChevronRight, PenLine } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontFamily } from '@/constants/fonts';
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
      pathname: '/(main)/journal-detail',
      params: { entryId },
    });
  };

  // Gradient colors for fade effect based on theme
  const fadeGradient: [string, string] = isDark
    ? ['transparent', 'rgba(255, 255, 255, 0.05)']
    : ['transparent', 'rgba(26, 22, 18, 0.04)'];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View className="flex-row items-center px-4 py-3">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ padding: 8 }}
          >
            <ChevronLeft size={24} color={colors.textMuted} />
          </Pressable>

          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: 16,
              color: colors.text,
              marginLeft: 8,
            }}
          >
            My Responses
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {journalEntries.length === 0 ? (
            <Animated.View
              entering={FadeIn.duration(400)}
              style={{ alignItems: 'center', paddingTop: 60 }}
            >
              <PenLine size={48} color={colors.textHint} />
              <Text
                style={{
                  fontFamily: FontFamily.body,
                  fontSize: 16,
                  color: colors.textMuted,
                  textAlign: 'center',
                  marginTop: 16,
                }}
              >
                No journal entries yet
              </Text>
              <Text
                style={{
                  fontFamily: FontFamily.body,
                  fontSize: 14,
                  color: colors.textHint,
                  textAlign: 'center',
                  marginTop: 8,
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
                    <Pressable
                      onPress={() => handleEntryPress(entry.id)}
                      style={({ pressed }) => ({
                        transform: [{ scale: pressed ? 0.98 : 1 }],
                      })}
                    >
                      <View
                        style={{
                          backgroundColor: colors.inputBackground,
                          borderRadius: 16,
                          borderWidth: 1,
                          borderColor: colors.border,
                          padding: 20,
                          marginBottom: 12,
                          overflow: 'hidden',
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
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
                            marginBottom: 12,
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
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 8 }}>
                            <Text
                              style={{
                                fontFamily: FontFamily.ui,
                                fontSize: 12,
                                color: colors.textSubtle,
                                marginRight: 4,
                              }}
                            >
                              Read more
                            </Text>
                            <ChevronRight size={14} color={colors.textSubtle} />
                          </View>
                        )}
                      </View>
                    </Pressable>
                  </Animated.View>
                );
              })
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
