import { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';
import { CaretLeftIcon, BookOpenIcon, MoonIcon, ArrowClockwiseIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { useTheme } from '@/lib/theme';
import { logger } from '@/lib/logger';
import { useUnfoldStore } from '@/lib/store';
import { generateExamen, type ExamenPrayer } from '@/lib/examen-service';
import { fetchVerse } from '@/lib/bible-api';
import { streamDevotionalAudio } from '@/lib/cartesia';
import { EVENING_CELEBRATION_MESSAGES } from '@/constants/check-in-messages';
import { cancelAndRescheduleEveningForTomorrow } from '@/lib/notifications';
import { EveningCelebration } from '@/components/EveningCelebration';

// Single unified flow: prayer + scripture together (no pill toggle)

// Concentric ripple rings behind the moon icon
function MoonRipples({ color }: { color: string }) {
  return (
    <>
      {[0, 600, 1200].map((delay) => (
        <RippleRingEvening key={delay} delay={delay} color={color} />
      ))}
    </>
  );
}

function RippleRingEvening({ delay, color }: { delay: number; color: string }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 3000, easing: Easing.out(Easing.cubic) }),
        -1,
        false
      )
    );
  }, [delay, progress]);

  const style = useAnimatedStyle(() => {
    const scale = interpolate(progress.value, [0, 1], [0.5, 1.5]);
    const opacity = interpolate(progress.value, [0, 0.3, 1], [0.15, 0.08, 0]);
    return {
      position: 'absolute' as const,
      width: 120,
      height: 120,
      borderRadius: 60,
      borderWidth: 1.5,
      borderColor: color,
      opacity,
      transform: [{ scale }],
    };
  });

  return <Animated.View style={style} />;
}

// Staggered movement card with left accent line
function MovementCard({
  movement,
  index,
  accentColor,
  textColor,
  mutedColor,
}: {
  movement: { title: string; prayer: string };
  index: number;
  accentColor: string;
  textColor: string;
  mutedColor: string;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(600).delay(200 + index * 150)}
      style={{
        marginBottom: 32,
        paddingLeft: 20,
        borderLeftWidth: 1.5,
        borderLeftColor: accentColor + '30',
      }}
    >
      <Text
        style={{
          fontFamily: FontFamily.mono,
          fontSize: 10,
          color: accentColor,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          marginBottom: 8,
          opacity: 0.7,
        }}
      >
        {index + 1}. {movement.title}
      </Text>
      <Text
        style={{
          fontFamily: FontFamily.bodyItalic,
          fontSize: 17,
          color: textColor,
          lineHeight: 28,
          opacity: 0.9,
        }}
      >
        {movement.prayer}
      </Text>
    </Animated.View>
  );
}

export default function EveningWindDownScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const user = useUnfoldStore((s) => s.user);
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const currentDevotionalId = useUnfoldStore((s) => s.currentDevotionalId);
  const getCheckIn = useUnfoldStore((s) => s.getCheckIn);
  const addCheckIn = useUnfoldStore((s) => s.addCheckIn);

  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationMessage, setCelebrationMessage] = useState('');

  const player = useAudioPlayer(audioUri);

  const currentDevotional = devotionals.find((d) => d.id === currentDevotionalId);
  // Evening wind-down is for the day just completed, which may be currentDay - 1
  // if the reading screen already advanced the day counter
  const eveningDayNumber = (currentDevotional?.currentDay ?? 1) > 1
    ? (currentDevotional?.currentDay ?? 1) - 1
    : (currentDevotional?.currentDay ?? 1);
  const currentDay = currentDevotional?.days.find(
    (d) => d.dayNumber === eveningDayNumber
  );

  const middayCheckIn = useMemo(() => {
    if (!currentDevotional || !currentDay) return undefined;
    return getCheckIn(currentDevotional.id, currentDay.dayNumber, 'midday');
  }, [currentDevotional, currentDay, getCheckIn]);

  // Rule 2 fix: useQuery replaces manual useEffect + setState data fetching
  const {
    data: examen,
    isLoading: loading,
    isError: error,
    refetch: refetchExamen,
  } = useQuery({
    queryKey: ['examen', currentDevotional?.id, currentDay?.dayNumber, middayCheckIn?.mood],
    queryFn: async () => {
      const result = await generateExamen(
        {
          userName: user!.name,
          todayTheme: currentDay!.title,
          todayScripture: currentDay!.scriptureReference,
          middayCheckIn: middayCheckIn
            ? {
                mood: middayCheckIn.mood,
                moodLabel: middayCheckIn.moodLabel,
                chipAnswer: middayCheckIn.chipAnswer,
                freeText: middayCheckIn.freeText,
              }
            : undefined,
          currentSituation: user!.currentSituation,
        },
        {
          devotionalId: currentDevotional!.id,
          dayNumber: currentDay!.dayNumber,
        }
      );
      if (!result) throw new Error('Failed to generate examen');
      return result;
    },
    enabled: !!currentDay && !!user && !!currentDevotional,
    staleTime: Infinity,
    retry: 1,
  });

  const {
    data: scriptureResult,
    isLoading: scriptureLoading,
  } = useQuery({
    queryKey: ['evening-scripture', currentDay?.eveningScriptureRef],
    queryFn: async () => {
      const result = await fetchVerse(currentDay!.eveningScriptureRef!);
      if (!result) throw new Error('Failed to fetch verse');
      return result;
    },
    enabled: !!currentDay?.eveningScriptureRef,
    staleTime: Infinity,
    retry: 1,
  });

  const scriptureText = scriptureResult?.text ?? null;

  const handlePlayScripture = useCallback(async () => {
    if (!scriptureText) return;

    if (audioUri && player) {
      if (isPlaying) {
        player.pause();
        setIsPlaying(false);
      } else {
        player.play();
        setIsPlaying(true);
      }
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAudioLoading(true);
    try {
      const result = await streamDevotionalAudio(scriptureText);
      setAudioUri(result.audioUrl);
    } catch (e) {
      logger.error('[EveningWindDown] Failed to load audio:', e);
    } finally {
      setAudioLoading(false);
    }
  }, [scriptureText, audioUri, player, isPlaying]);

  // Auto-play when player initializes after audioUri is set
  // useAudioPlayer creates the player on re-render — this bridges the async gap
  useEffect(() => {
    if (audioUri && player) {
      player.play();
      setIsPlaying(true);
    }
  }, [audioUri, player]);

  const handleShowCelebration = useCallback(() => {
    // Record evening check-in so the home card knows it's done
    if (currentDevotional && currentDay) {
      addCheckIn({
        devotionalId: currentDevotional.id,
        dayNumber: currentDay.dayNumber,
        timeOfDay: 'evening',
        mood: 3 as const,
        moodLabel: 'completed',
      });
      // Cancel today's evening notification and reschedule for tomorrow
      cancelAndRescheduleEveningForTomorrow();
    }
    const msg = EVENING_CELEBRATION_MESSAGES[Math.floor(Math.random() * EVENING_CELEBRATION_MESSAGES.length)];
    setCelebrationMessage(msg);
    setShowCelebration(true);
  }, [currentDevotional, currentDay, addCheckIn]);

  const handleDismissCelebration = useCallback(() => {
    setShowCelebration(false);
    router.back();
  }, [router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header — minimal */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <TouchableOpacity activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ padding: 8 }}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <CaretLeftIcon size={22} color={colors.text} weight="light" />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero — Moon + title */}
          <Animated.View
            entering={FadeIn.duration(1000)}
            style={{
              alignItems: 'center',
              paddingTop: 24,
              paddingBottom: 32,
            }}
          >
            <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
              <MoonRipples color={colors.accent} />
              <MoonIcon size={40} color={colors.accent} weight="light" />
            </View>

            <Text
              style={{
                fontFamily: FontFamily.display,
                fontSize: 32,
                color: colors.text,
                letterSpacing: -0.5,
                marginBottom: 8,
              }}
            >
              Evening Wind-Down
            </Text>
            <Text
              style={{
                fontFamily: FontFamily.bodyItalic,
                fontSize: 15,
                color: colors.textMuted,
                opacity: 0.7,
              }}
            >
              {currentDay?.title ? `Reflecting on "${currentDay.title}"` : 'A moment of peace before rest'}
            </Text>
          </Animated.View>

          {/* Unified content: Prayer → Scripture → Done */}
          <View style={{ paddingHorizontal: 28 }}>
            {/* === EVENING PRAYER SECTION === */}
            {loading ? (
              <Animated.View
                entering={FadeIn.duration(400)}
                style={{ alignItems: 'center', paddingTop: 40 }}
              >
                <ActivityIndicator size="small" color={colors.accent} />
                <Text
                  style={{
                    fontFamily: FontFamily.bodyItalic,
                    fontSize: FontSize.sm,
                    color: colors.textSubtle,
                    marginTop: 16,
                    opacity: 0.7,
                  }}
                >
                  Preparing your evening prayer...
                </Text>
              </Animated.View>
            ) : error ? (
              <Animated.View
                entering={FadeIn.duration(400)}
                style={{ alignItems: 'center', paddingTop: 40 }}
              >
                <Text
                  style={{
                    fontFamily: FontFamily.body,
                    fontSize: 15,
                    color: colors.textMuted,
                    textAlign: 'center',
                    lineHeight: 23,
                    marginBottom: 20,
                  }}
                >
                  Couldn't prepare your prayer right now.{'\n'}Check your connection and try again.
                </Text>
                <TouchableOpacity activeOpacity={0.7}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    refetchExamen();
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingVertical: 12,
                    paddingHorizontal: 24,
                    borderRadius: Radius.md,
                    borderWidth: 1,
                    borderColor: colors.accent,
                  }}
                >
                  <View style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
                    <ArrowClockwiseIcon size={16} color={colors.accent} weight="light" />
                  </View>
                  <Text
                    style={{
                      fontFamily: FontFamily.uiMedium,
                      fontSize: FontSize.sm,
                      color: colors.accent,
                      lineHeight: 16,
                    }}
                  >
                    Try Again
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            ) : examen ? (
              <>
                {/* Thin divider */}
                <Animated.View
                  entering={FadeIn.duration(600).delay(100)}
                  style={{
                    width: 24,
                    height: 1,
                    backgroundColor: colors.accent,
                    marginBottom: 32,
                    opacity: 0.4,
                    borderRadius: 1,
                  }}
                />
                {examen.movements.map((movement, index) => (
                  <MovementCard
                    key={movement.title}
                    movement={movement}
                    index={index}
                    accentColor={colors.accent}
                    textColor={colors.text}
                    mutedColor={colors.textMuted}
                  />
                ))}
                {/* Closing ornament */}
                <Animated.View
                  entering={FadeIn.duration(600).delay(1000)}
                  style={{
                    alignItems: 'center',
                    paddingTop: 8,
                    paddingBottom: 16,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FontFamily.bodyItalic,
                      fontSize: 13,
                      color: colors.textSubtle,
                      opacity: 0.5,
                    }}
                  >
                    Amen.
                  </Text>
                </Animated.View>
              </>
            ) : (
              <View style={{ alignItems: 'center', paddingTop: 40, paddingBottom: 20 }}>
                <Text
                  style={{
                    fontFamily: FontFamily.bodyItalic,
                    fontSize: 15,
                    color: colors.textMuted,
                    textAlign: 'center',
                    lineHeight: 23,
                  }}
                >
                  Start a devotional to unlock{'\n'}personalized evening prayers.
                </Text>
              </View>
            )}

            {/* === EVENING SCRIPTURE SECTION === */}
            {currentDay?.eveningScriptureRef && (
              <Animated.View entering={FadeInDown.duration(600).delay(examen ? 800 : 200)}>
                {/* Section divider */}
                <View
                  style={{
                    height: 1,
                    backgroundColor: colors.border,
                    marginVertical: 28,
                    opacity: 0.5,
                  }}
                />

                <Text
                  style={{
                    fontFamily: FontFamily.mono,
                    fontSize: 10,
                    color: colors.accent,
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    marginBottom: 20,
                    opacity: 0.7,
                  }}
                >
                  {currentDay.eveningScriptureRef}
                </Text>

                {scriptureLoading ? (
                  <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 20 }}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text
                      style={{
                        fontFamily: FontFamily.bodyItalic,
                        fontSize: FontSize.sm,
                        color: colors.textSubtle,
                        marginTop: 12,
                        opacity: 0.7,
                      }}
                    >
                      Loading passage...
                    </Text>
                  </View>
                ) : scriptureText ? (
                  <Text
                    style={{
                      fontFamily: FontFamily.bodyItalic,
                      fontSize: 19,
                      color: colors.text,
                      lineHeight: 32,
                      marginBottom: 24,
                      opacity: 0.9,
                    }}
                  >
                    {scriptureText}
                  </Text>
                ) : null}
              </Animated.View>
            )}

            {/* === DONE BUTTON === */}
            {(examen || scriptureText) && (
              <Animated.View entering={FadeIn.duration(400).delay(1200)} style={{ marginTop: 16, marginBottom: 8 }}>
                <TouchableOpacity activeOpacity={0.7}
                  onPress={handleShowCelebration}
                >
                  <View
                    style={{
                      backgroundColor: colors.accent,
                      borderRadius: Radius.card,
                      paddingVertical: 16,
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: FontFamily.uiMedium,
                        fontSize: 15,
                        color: colors.background,
                      }}
                    >
                      Goodnight
                    </Text>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
      <EveningCelebration
        visible={showCelebration}
        onDismiss={handleDismissCelebration}
        message={celebrationMessage}
      />
    </View>
  );
}
