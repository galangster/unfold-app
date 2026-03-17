import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  interpolate,
} from 'react-native-reanimated';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { MicrophoneIcon } from 'phosphor-react-native';

interface SpeechToTextButtonProps {
  onTranscript: (text: string) => void;
  isActive?: boolean;
}

export function SpeechToTextButton({ onTranscript, isActive = true }: SpeechToTextButtonProps) {
  const { colors } = useTheme();
  const [isRecording, setIsRecording] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [partialResults, setPartialResults] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const pulseScale = useSharedValue(1);
  const transcriptRef = useRef('');
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Speech recognition event listeners
  useSpeechRecognitionEvent('start', () => {
    setIsRecording(true);
    setPartialResults('');
    transcriptRef.current = '';
  });

  useSpeechRecognitionEvent('end', () => {
    setIsRecording(false);
    if (transcriptRef.current) {
      onTranscript(transcriptRef.current);
    }
  });

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript ?? '';
    transcriptRef.current = transcript;
    setPartialResults(transcript);
  });

  useSpeechRecognitionEvent('error', (event) => {
    setIsRecording(false);
    const friendlyMessages: Record<string, string> = {
      'no-speech': 'No speech detected. Try again.',
      'audio-capture': 'Microphone unavailable.',
      'not-allowed': 'Microphone permission denied.',
      'network': 'Network error. Try again.',
    };
    const msg = friendlyMessages[event.error] ?? 'Voice input unavailable.';
    setErrorMessage(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setErrorMessage(''), 3000);
  });

  // Pulse animation while recording
  useEffect(() => {
    if (isRecording) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.4, { duration: 600 }),
          withTiming(1, { duration: 600 }),
        ),
        -1,
      );
    } else {
      cancelAnimation(pulseScale);
      pulseScale.value = 1;
    }
  }, [isRecording]);

  const pulseRingStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulseScale.value, [1, 1.4], [0.4, 0]),
    transform: [{ scale: pulseScale.value }],
  }));

  // Check permissions on mount, cleanup on unmount
  useEffect(() => {
    ExpoSpeechRecognitionModule.getPermissionsAsync().then(({ granted }) => {
      setHasPermission(granted);
    }).catch(() => {
      // Module may not be available
      setHasPermission(false);
    });
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      // Stop any active recording when component unmounts
      try { ExpoSpeechRecognitionModule.stop(); } catch (e) { /* cleanup on unmount — safe to ignore */ }
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (!isActive) return;

    // Request permissions if not yet granted
    if (!hasPermission) {
      try {
        const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        setHasPermission(granted);
        if (!granted) {
          setErrorMessage('Microphone permission required.');
          if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
          errorTimerRef.current = setTimeout(() => setErrorMessage(''), 3000);
          return;
        }
      } catch {
        setErrorMessage('Could not request microphone permission.');
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
        errorTimerRef.current = setTimeout(() => setErrorMessage(''), 3000);
        return;
      }
    }

    setErrorMessage('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
      });

      // Safety timeout — if 'start' event never fires within 5s, reset state
      const safetyTimeout = setTimeout(() => {
        if (!transcriptRef.current && isRecording) {
          setIsRecording(false);
          setErrorMessage('Voice input timed out. Try again.');
          if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
          errorTimerRef.current = setTimeout(() => setErrorMessage(''), 3000);
          try { ExpoSpeechRecognitionModule.stop(); } catch (e) { /* timeout stop — safe to ignore */ }
        }
      }, 5000);

      // Clear safety timeout if recording starts successfully
      const clearSafety = () => clearTimeout(safetyTimeout);
      // Store for cleanup
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = safetyTimeout;
    } catch (err) {
      setIsRecording(false);
      setErrorMessage('Voice input unavailable on this device.');
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => setErrorMessage(''), 3000);
    }
  }, [isActive, hasPermission, isRecording]);

  const stopRecording = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    ExpoSpeechRecognitionModule.stop();
  }, []);

  const handlePressIn = () => {
    setIsPressed(true);
    startRecording();
  };

  const handlePressOut = () => {
    setIsPressed(false);
    stopRecording();
  };

  // Visual state colors
  const getButtonColors = () => {
    if (isRecording) {
      return {
        background: colors.accent,
        icon: colors.background,
        border: colors.accent,
      };
    }
    if (isPressed) {
      return {
        background: colors.buttonBackgroundPressed,
        icon: colors.text,
        border: colors.border,
      };
    }
    return {
      background: colors.inputBackground,
      icon: colors.accent,
      border: colors.border,
    };
  };

  const buttonColors = getButtonColors();

  return (
    <View style={styles.container}>
      <Text style={[styles.hint, { color: errorMessage ? colors.error : colors.textMuted }]}>
        {errorMessage
          ? errorMessage
          : isRecording
            ? (partialResults ? partialResults : 'Listening...')
            : 'Tap and hold to speak'
        }
      </Text>

      <View style={styles.buttonContainer}>
        {/* Pulse ring animation - only visible when recording */}
        {isRecording && (
          <Animated.View
            style={[
              styles.pulseRing,
              { backgroundColor: colors.accent },
              pulseRingStyle,
            ]}
          />
        )}

        <TouchableOpacity activeOpacity={0.7}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={!isActive}
          accessibilityLabel="Hold to speak"
          accessibilityRole="button"
          accessibilityState={{ disabled: !isActive }}
          style={[
            styles.button,
            {
              backgroundColor: buttonColors.background,
              borderColor: buttonColors.border,
              opacity: isActive ? 1 : 0.5,
            },
          ]}
        >
          <View style={styles.iconContainer}>
            <MicrophoneIcon
              size={28}
              color={buttonColors.icon}
              weight="light"
            />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  hint: {
    fontFamily: FontFamily.ui,
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  buttonContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  button: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
