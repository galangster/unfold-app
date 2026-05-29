/**
 * StudyMethodSheet — Opaque popover showing study method details.
 *
 * Fades in as a centered card with X close button.
 * Displays method name, difficulty, description, "What to Expect",
 * and a "How This Method Works" section derived from promptModifier.
 * Supports horizontal swipe to dismiss.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { XIcon } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Duration } from '@/constants/animations';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { Radius } from '@/constants/radius';
import { BIBLE_STUDY_METHODS, type BibleStudyMethodCard } from '@/constants/bible-study-methods';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 80;
const DISMISS_DURATION = 150;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StudyMethodSheetProps {
  methodId?: string;
  visible: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// promptModifier → user-facing content
// ---------------------------------------------------------------------------

interface MethodGuide {
  /** Short label like "Guided" or "Contemplative" */
  style: string;
  /** Plain-language summary of the approach */
  summary: string;
  /** Numbered steps extracted from the prompt modifier */
  steps: string[];
}

/**
 * Parse a promptModifier (written for AI) into user-facing guide content.
 * Extracts bullet/numbered items as steps, and classifies the method style.
 */
function parseMethodGuide(method: BibleStudyMethodCard): MethodGuide {
  const text = method.promptModifier;

  // --- Classify style ---
  const lowerText = text.toLowerCase();
  let style = 'Guided';
  if (
    lowerText.includes('contemplat') ||
    lowerText.includes('silence') ||
    lowerText.includes('breath') ||
    lowerText.includes('rest in')
  ) {
    style = 'Contemplative';
  } else if (
    lowerText.includes('narrative') ||
    lowerText.includes('story') ||
    lowerText.includes('retell') ||
    lowerText.includes('scene')
  ) {
    style = 'Narrative';
  } else if (
    lowerText.includes('journal') ||
    lowerText.includes('writing') ||
    lowerText.includes('write')
  ) {
    style = 'Interactive';
  } else if (
    lowerText.includes('discover') ||
    lowerText.includes('detective') ||
    lowerText.includes('observe')
  ) {
    style = 'Discovery';
  } else if (
    lowerText.includes('analyze') ||
    lowerText.includes('analysis') ||
    lowerText.includes('structure') ||
    lowerText.includes('literary')
  ) {
    style = 'Analytical';
  }

  // --- Extract steps ---
  // Look for numbered items (1. 2. 3.) or bullet items (- text)
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const steps: string[] = [];
  for (const line of lines) {
    // Skip the first header line (e.g. "STUDY METHOD: EXPOSITORY")
    if (line.startsWith('STUDY METHOD:')) continue;

    // Numbered step: "1. LECTIO: ..." or "1. Address..."
    const numberedMatch = line.match(/^\d+\.\s*(.+)/);
    if (numberedMatch) {
      let step = numberedMatch[1];
      // Clean up AI-facing language
      step = step
        .replace(/^([A-Z]+):\s*/, (_, label) => `${label[0]}${label.slice(1).toLowerCase()}: `)
        .replace(/["']/g, '')
        .replace(/\bthe reader\b/gi, 'you')
        .replace(/\bthe reader's\b/gi, 'your')
        .replace(/Guide the reader/gi, 'You are guided');
      steps.push(step);
      continue;
    }

    // Bullet item: "- Surface what the original audience..."
    const bulletMatch = line.match(/^-\s+(.+)/);
    if (bulletMatch) {
      let step = bulletMatch[1];
      step = step
        .replace(/["']/g, '')
        .replace(/\bthe reader\b/gi, 'you')
        .replace(/\bthe reader's\b/gi, 'your')
        .replace(/Guide the reader/gi, 'You are guided');
      steps.push(step);
      continue;
    }
  }

  // --- Build summary ---
  // Take the first non-header, non-list sentence as a summary
  let summary = '';
  for (const line of lines) {
    if (line.startsWith('STUDY METHOD:')) continue;
    if (line.startsWith('-') || /^\d+\./.test(line)) continue;
    // Clean up AI directives into user-facing language
    const cleaned = line
      .replace(/\bthe reader\b/gi, 'you')
      .replace(/\bthe reader's\b/gi, 'your')
      .replace(/Guide the reader/gi, 'You are guided')
      .replace(/\bShould feel\b/gi, 'will feel');
    if (cleaned.length > 20) {
      summary = cleaned;
      break;
    }
  }

  // Fallback summary from method description
  if (!summary) {
    summary = method.description;
  }

  return { style, summary, steps: steps.slice(0, 6) };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DifficultyDots({ difficulty }: { difficulty: BibleStudyMethodCard['difficulty'] }) {
  const { colors } = useTheme();
  const level = difficulty === 'accessible' ? 1 : difficulty === 'intermediate' ? 2 : 3;

  return (
    <View style={smStyles.dotsRow}>
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          style={[
            smStyles.dot,
            {
              backgroundColor: i <= level ? colors.accent : `${colors.textMuted}30`,
            },
          ]}
        />
      ))}
      <Text style={[smStyles.difficultyLabel, { color: colors.textMuted }]}>
        {difficulty}
      </Text>
    </View>
  );
}

function timeEstimate(difficulty: BibleStudyMethodCard['difficulty']): string {
  switch (difficulty) {
    case 'accessible':
      return '5-10 minutes';
    case 'intermediate':
      return '10-20 minutes';
    case 'advanced':
      return '20-30 minutes';
  }
}

function formatGenres(genres: string[]): string {
  const display = genres
    .filter((g) => g !== 'any' && g !== 'cross_genre')
    .slice(0, 3)
    .map((g) => g.replace(/_/g, ' '));

  if (display.length === 0) return 'any passage type';
  if (display.length === 1) return `${display[0]} passages`;
  if (display.length === 2) return `${display[0]} and ${display[1]} passages`;
  return `${display[0]}, ${display[1]}, and ${display[2]} passages`;
}

function BulletItem({
  text,
  color,
  bulletColor,
}: {
  text: string;
  color: string;
  bulletColor: string;
}) {
  return (
    <View style={smStyles.bulletRow}>
      <View style={[smStyles.bullet, { backgroundColor: bulletColor }]} />
      <Text style={[smStyles.bulletText, { color }]}>{text}</Text>
    </View>
  );
}

function NumberedStep({
  index,
  text,
  textColor,
  accentColor,
}: {
  index: number;
  text: string;
  textColor: string;
  accentColor: string;
}) {
  return (
    <View style={smStyles.numberedRow}>
      <View style={[smStyles.stepNumber, { backgroundColor: `${accentColor}18` }]}>
        <Text style={[smStyles.stepNumberText, { color: accentColor }]}>{index + 1}</Text>
      </View>
      <Text style={[smStyles.stepText, { color: textColor }]}>{text}</Text>
    </View>
  );
}

function StyleBadge({ style, accentColor }: { style: string; accentColor: string }) {
  return (
    <View style={[smStyles.styleBadge, { backgroundColor: `${accentColor}15` }]}>
      <Text style={[smStyles.styleBadgeText, { color: accentColor }]}>{style}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function StudyMethodSheet({ methodId, visible, onClose }: StudyMethodSheetProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const method = methodId ? BIBLE_STUDY_METHODS[methodId] : undefined;
  const guide = useMemo(() => (method ? parseMethodGuide(method) : null), [method]);

  // --- Fade/scale animation ---
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.95);

  // --- Horizontal swipe ---
  const translateX = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateX.value = 0;
      opacity.value = withTiming(1, { duration: Duration.normal });
      scale.value = withTiming(1, { duration: Duration.normal });
    }
  }, [visible, opacity, scale, translateX]);

  const handleClose = useCallback(() => {
    opacity.value = withTiming(0, { duration: DISMISS_DURATION });
    scale.value = withTiming(0.95, { duration: DISMISS_DURATION }, () => {
      runOnJS(onClose)();
    });
  }, [onClose, opacity, scale]);

  const dismissWithSwipe = useCallback(
    (direction: number) => {
      'worklet';
      const target = direction > 0 ? SCREEN_WIDTH : -SCREEN_WIDTH;
      translateX.value = withTiming(target, { duration: DISMISS_DURATION });
      opacity.value = withTiming(0, { duration: DISMISS_DURATION }, () => {
        runOnJS(onClose)();
      });
    },
    [onClose, translateX, opacity],
  );

  // --- Gesture: horizontal pan to dismiss ---
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-20, 20])
        .failOffsetY([-10, 10])
        .onUpdate((e) => {
          translateX.value = e.translationX;
        })
        .onEnd((e) => {
          if (Math.abs(e.translationX) > SWIPE_THRESHOLD) {
            dismissWithSwipe(e.translationX);
          } else {
            translateX.value = withTiming(0, { duration: Duration.fast });
          }
        }),
    [translateX, dismissWithSwipe],
  );

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { translateX: translateX.value }],
  }));

  if (!method || !guide) return null;

  const cardBg = isDark ? '#1C1A17' : '#FAFAF8';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        {/* Backdrop */}
        <Animated.View style={[smStyles.backdrop, backdropStyle]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={handleClose}
          />
        </Animated.View>

        {/* Card */}
        <View
          style={[
            smStyles.cardContainer,
            { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 },
          ]}
          pointerEvents="box-none"
        >
          <GestureDetector gesture={panGesture}>
            <Animated.View
              style={[smStyles.card, { backgroundColor: cardBg }, cardStyle]}
            >
              {/* Close button */}
              <TouchableOpacity
                style={[
                  smStyles.closeButton,
                  { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' },
                ]}
                onPress={handleClose}
                activeOpacity={0.6}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <XIcon
                  size={14}
                  color={isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)'}
                  weight="bold"
                />
              </TouchableOpacity>

              <ScrollView
                showsVerticalScrollIndicator={false}
                bounces={false}
                contentContainerStyle={smStyles.scrollContent}
              >
                {/* Method name */}
                <Text style={[smStyles.methodTitle, { color: colors.text }]}>
                  {method.name}
                </Text>

                {/* Difficulty + style badge row */}
                <View style={smStyles.metaRow}>
                  <DifficultyDots difficulty={method.difficulty} />
                  <StyleBadge style={guide.style} accentColor={colors.accent} />
                </View>

                {/* Description */}
                <Text style={[smStyles.description, { color: isDark ? colors.text : colors.textMuted }]}>
                  {method.description}
                </Text>

                {/* Divider */}
                <View style={[smStyles.divider, { backgroundColor: `${colors.border}40` }]} />

                {/* What to Expect */}
                <Text style={[smStyles.sectionLabel, { color: colors.accent }]}>
                  WHAT TO EXPECT
                </Text>

                <View style={smStyles.bulletList}>
                  <BulletItem
                    text={`About ${timeEstimate(method.difficulty)} of focused reading`}
                    color={colors.text}
                    bulletColor={colors.accent}
                  />
                  <BulletItem
                    text={`Best for ${formatGenres(method.idealGenres)}`}
                    color={colors.text}
                    bulletColor={colors.accent}
                  />
                  <BulletItem
                    text={method.emotionalTexture}
                    color={colors.text}
                    bulletColor={colors.accent}
                  />
                </View>

                {/* How This Method Works */}
                {guide.steps.length > 0 && (
                  <>
                    <View
                      style={[smStyles.divider, { backgroundColor: `${colors.border}40`, marginTop: 20 }]}
                    />

                    <Text style={[smStyles.sectionLabel, { color: colors.accent }]}>
                      HOW THIS METHOD WORKS
                    </Text>

                    {guide.summary ? (
                      <Text style={[smStyles.guideSummary, { color: isDark ? colors.text : colors.textMuted }]}>
                        {guide.summary}
                      </Text>
                    ) : null}

                    <View style={smStyles.stepsList}>
                      {guide.steps.map((step, i) => (
                        <NumberedStep
                          key={i}
                          index={i}
                          text={step}
                          textColor={colors.text}
                          accentColor={colors.accent}
                        />
                      ))}
                    </View>
                  </>
                )}
              </ScrollView>
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const smStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  cardContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing['6'],
  },
  card: {
    borderRadius: Radius.xl,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 28,
    height: 28,
    borderRadius: Radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  scrollContent: {
    paddingHorizontal: Spacing['7'],
    paddingTop: Spacing['7'],
    paddingBottom: Spacing['8'],
  },
  methodTitle: {
    fontFamily: FontFamily.display,
    fontSize: FontSize['2xl'],
    letterSpacing: -0.5,
    marginBottom: 10,
    paddingRight: Spacing['8'],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing['4'],
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  difficultyLabel: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
    textTransform: 'capitalize',
    marginLeft: 6,
  },
  styleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  styleBadgeText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  description: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 23,
    marginBottom: Spacing['5'],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: Spacing['5'],
  },
  sectionLabel: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 14,
  },
  bulletList: {
    gap: 10,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 7,
  },
  bulletText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 20,
    flex: 1,
  },
  guideSummary: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 21,
    marginBottom: Spacing['4'],
  },
  stepsList: {
    gap: Spacing['3'],
  },
  numberedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing['3'],
  },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumberText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 11,
  },
  stepText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 20,
    flex: 1,
  },
});
