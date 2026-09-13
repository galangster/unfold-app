/**
 * CompanionInput — pill-shaped input bar with send/stop + voice input.
 *
 * BEHAVIOR:
 *   - Empty field, not streaming → show mic button (STT)
 *   - Text entered, not streaming → show send arrow (accent)
 *   - Streaming → show stop button (red)
 *   - Multiline: grows up to 5 lines (~120px), then scrolls internally
 *   - Voice recording replaces the entire input bar with waveform UI
 */
import { memo, useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
} from 'react-native-reanimated';
import { ArrowUpIcon, StopCircleIcon, MicrophoneIcon } from '@/components/icons';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { Radius } from '@/constants/radius';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Duration } from '@/constants/animations';
import { VoiceInputBar } from '@/components/VoiceInputBar';
import { COMPANION_MESSAGE_MAX_CHARS } from '@/lib/companion-limits';

const PLACEHOLDERS = [
  'What’s on your mind?',
  'Ask me anything…',
  'What are you thinking about?',
  'How can I help today?',
];

const COMPANION_MESSAGE_COUNTER_THRESHOLD = 3500;
const MAX_APP_FONT_SCALE = 1.8;

const styles = StyleSheet.create({
  actionFrame: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionVisual: {
    width: 32,
    height: 32,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

interface Props {
  onSend: (text: string) => boolean | void;
  onStop: () => void;
  isStreaming: boolean;
  fontScale?: number;
}

// Memoized: the companion screen re-renders on every streaming token flush —
// the input bar's props (stable callbacks + isStreaming/fontScale) only change
// at stream or text-size boundaries, so the memo skips token-flush rerenders.
export const CompanionInput = memo(function CompanionInput({ onSend, onStop, isStreaming, fontScale = 1 }: Props) {
  const { colors, isDark } = useTheme();
  const [text, setText] = useState('');
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const sendScale = useSharedValue(1);

  const placeholder = useMemo(
    () => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)],
    []
  );

  const canSend = text.trim().length > 0 && !isStreaming;
  const showMic = !canSend && !isStreaming;
  const messageLength = text.trim().length;
  const showCharacterCounter = messageLength > COMPANION_MESSAGE_COUNTER_THRESHOLD;
  const isOverMessageLimit = messageLength > COMPANION_MESSAGE_MAX_CHARS;

  const handleSend = useCallback(() => {
    if (!canSend) return;

    const trimmed = text.trim();
    if (onSend(trimmed) === false) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    sendScale.value = withTiming(0.9, { duration: 50 }, () => {
      sendScale.value = withTiming(1, { duration: Duration.instant });
    });

    setText('');
  }, [canSend, text, onSend, sendScale]);

  const handleStop = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onStop();
  }, [onStop]);

  const handleMicPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Re-tapping the mic after a permission denial retries the request
    // (iOS won't re-prompt, but the user may have flipped it in Settings).
    setMicPermissionDenied(false);
    setIsVoiceMode(true);
  }, []);

  const handleMicPermissionDenied = useCallback(() => {
    setIsVoiceMode(false);
    setMicPermissionDenied(true);
  }, []);

  // When voice input changes text, auto-send or update field
  const handleVoiceText = useCallback((newText: string) => {
    setText(newText);
    setIsVoiceMode(false);
    // Focus the text input so user can edit before sending
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const sendAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sendScale.value }],
  }));

  return (
    <View
      style={{
        backgroundColor: colors.backgroundElevated,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        paddingHorizontal: Spacing['2'],
        paddingVertical: Spacing['2'],
      }}
    >
      {/* Voice recording bar — shown above the text input, not replacing it */}
      {isVoiceMode && (
        <View style={{ marginBottom: Spacing['2'] }}>
          <VoiceInputBar
            value={text}
            onChangeText={handleVoiceText}
            accentColor={colors.accent}
            autoStart
            onCancel={() => setIsVoiceMode(false)}
            onPermissionDenied={handleMicPermissionDenied}
          />
        </View>
      )}

      {/* Mic permission denied — explain instead of silently doing nothing */}
      {micPermissionDenied && !isVoiceMode && (
        <Text
          key={`permission-font-scale-${fontScale}`}
          accessibilityRole="alert"
          style={{
            fontFamily: FontFamily.ui,
            fontSize: FontSize.xs,
            color: colors.textMuted,
            textAlign: 'center',
            marginBottom: Spacing['2'],
            paddingHorizontal: Spacing['2'],
          }}
        >
          Microphone access is off. Allow it in Settings, then tap the mic to try again.
        </Text>
      )}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          backgroundColor: colors.inputBackground,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 22,
          paddingLeft: Spacing['4'],
          paddingRight: 2,
          minHeight: 44,
        }}
      >
        <TextInput
          ref={inputRef}
          testID="companion-input"
          value={text}
          maxFontSizeMultiplier={Math.min(MAX_APP_FONT_SCALE, Math.max(1, fontScale))}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          multiline
          scrollEnabled
          // No maxLength: voice input appends programmatically and can pass
          // the cap regardless — the counter + over-limit send guard (which
          // preserves the draft) are the single enforcement path.
          textAlignVertical="center"
          keyboardAppearance={isDark ? 'dark' : 'light'}
          returnKeyType="default"
          blurOnSubmit={false}
          onSubmitEditing={handleSend}
          style={{
            flex: 1,
            fontFamily: FontFamily.body,
            fontSize: FontSize.base,
            color: colors.text,
            paddingTop: Spacing['2'],
            paddingBottom: Spacing['2'],
            maxHeight: 120,
          }}
        />

        {showCharacterCounter && (
          <Text
            key={`counter-font-scale-${fontScale}`}
            style={{
              fontFamily: FontFamily.ui,
              fontSize: FontSize.xs,
              color: isOverMessageLimit ? colors.error : colors.textHint,
              marginBottom: 9,
              marginLeft: Spacing['1.5'],
              minWidth: 74,
              textAlign: 'right',
              fontVariant: ['tabular-nums'],
            }}
          >
            {`${messageLength.toLocaleString()} / ${COMPANION_MESSAGE_MAX_CHARS.toLocaleString()}`}
          </Text>
        )}

        {/* Action button: mic / send / stop */}
        <Animated.View style={[styles.actionFrame, sendAnimStyle]}>
          {isStreaming ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleStop}
              accessibilityLabel="Stop generating"
              accessibilityRole="button"
              style={styles.actionFrame}
            >
              <View style={[styles.actionVisual, { backgroundColor: alpha(colors.error, 0.60) }]}>
                <StopCircleIcon size={18} color={isDark ? '#FFFFFF' : colors.backgroundPure} weight="fill" />
              </View>
            </TouchableOpacity>
          ) : showMic ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleMicPress}
              accessibilityLabel="Voice input"
              accessibilityRole="button"
              style={styles.actionFrame}
            >
              <View style={[styles.actionVisual, { backgroundColor: colors.buttonBackground }]}>
                <MicrophoneIcon size={18} color={colors.textMuted} weight="light" />
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleSend}
              disabled={!canSend}
              testID="companion-send"
              accessibilityLabel="Send message"
              accessibilityRole="button"
              style={styles.actionFrame}
            >
              <View style={[styles.actionVisual, { backgroundColor: colors.accent }]}>
                <ArrowUpIcon
                  size={18}
                  color={isDark ? '#FFFFFF' : colors.backgroundPure}
                  weight="bold"
                />
              </View>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    </View>
  );
});
