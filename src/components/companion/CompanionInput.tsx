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
import { memo, useState, useRef, useCallback, useMemo, useEffect } from 'react';
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
import { ArrowUpIcon, StopCircleIcon, MicrophoneIcon } from 'phosphor-react-native';
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

interface Props {
  /**
   * Text to drop into the composer from elsewhere (e.g. the completion screen
   * handing off "walk me through today's reading"). Deliberately seeds the
   * input rather than sending: the free tier is 5 messages a day, so spending
   * one without the user pressing send would be taking the choice from them.
   *
   * The nonce makes repeat handoffs of identical text still apply.
   */
  seed?: { text: string; nonce: number };
  onSend: (text: string) => boolean | void;
  onStop: () => void;
  isStreaming: boolean;
}

// Memoized: the companion screen re-renders on every streaming token flush —
// the input bar's props (stable callbacks + isStreaming) only change at
// stream boundaries, so the memo skips ~30 re-renders/sec while streaming.
export const CompanionInput = memo(function CompanionInput({ onSend, onStop, isStreaming, seed }: Props) {
  const { colors, isDark } = useTheme();
  const [text, setText] = useState('');

  // Seeds arrive after mount (this screen is a tab and stays mounted), so this
  // has to be an effect rather than a useState initialiser. Never overwrite
  // something the user has already typed — losing a half-written message to a
  // handoff is worse than not seeding at all.
  useEffect(() => {
    if (!seed?.text) return;
    setText((current) => (current.trim().length > 0 ? current : seed.text));
  }, [seed?.nonce, seed?.text]);
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
          paddingRight: 6,
          paddingVertical: 4,
          minHeight: 44,
        }}
      >
        <TextInput
          ref={inputRef}
          testID="companion-input"
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={colors.textHint}
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
        <Animated.View style={[{ marginBottom: 2 }, sendAnimStyle]}>
          {isStreaming ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleStop}
              accessibilityLabel="Stop generating"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                width: 32,
                height: 32,
                borderRadius: Radius.lg,
                backgroundColor: alpha(colors.error, 0.60),
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <StopCircleIcon size={18} color={isDark ? '#FFFFFF' : colors.backgroundPure} weight="fill" />
            </TouchableOpacity>
          ) : showMic ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleMicPress}
              accessibilityLabel="Voice input"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                width: 32,
                height: 32,
                borderRadius: Radius.lg,
                backgroundColor: colors.buttonBackground,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MicrophoneIcon size={18} color={colors.textMuted} weight="light" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleSend}
              disabled={!canSend}
              testID="companion-send"
              accessibilityLabel="Send message"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                width: 32,
                height: 32,
                borderRadius: Radius.lg,
                backgroundColor: colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ArrowUpIcon
                size={18}
                color={isDark ? '#FFFFFF' : colors.backgroundPure}
                weight="bold"
              />
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    </View>
  );
});
