import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Vibration,
} from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { Mic } from 'lucide-react-native';

interface SpeechToTextButtonProps {
  onTranscript: (text: string) => void;
  isActive?: boolean;
}

export function SpeechToTextButton({ onTranscript, isActive = true }: SpeechToTextButtonProps) {
  const { colors, isDark } = useTheme();
  const [isRecording, setIsRecording] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [partialResults, setPartialResults] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
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
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.4,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  // Check permissions on mount
  useEffect(() => {
    ExpoSpeechRecognitionModule.getPermissionsAsync().then(({ granted }) => {
      setHasPermission(granted);
    });
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (!isActive) return;

    // Request permissions if not yet granted
    if (!hasPermission) {
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      setHasPermission(granted);
      if (!granted) {
        setErrorMessage('Microphone permission required.');
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
        errorTimerRef.current = setTimeout(() => setErrorMessage(''), 3000);
        return;
      }
    }

    setErrorMessage('');
    Vibration.vibrate(50);

    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
      addsPunctuation: true,
    });
  }, [isActive, hasPermission]);

  const stopRecording = useCallback(() => {
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
        background: isDark ? '#4A4A4A' : '#D0D0D0',
        icon: colors.text,
        border: isDark ? '#666666' : '#CCCCCC',
      };
    }
    return {
      background: isDark ? '#2A2A2A' : '#F0F0F0',
      icon: colors.accent,
      border: isDark ? '#3A3A3A' : '#E0E0E0',
    };
  };

  const buttonColors = getButtonColors();

  return (
    <View style={styles.container}>
      <Text style={[styles.hint, { color: errorMessage ? '#FF6B6B' : colors.textMuted }]}>
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
              {
                backgroundColor: colors.accent,
                opacity: pulseAnim.interpolate({
                  inputRange: [1, 1.4],
                  outputRange: [0.4, 0],
                }),
                transform: [{ scale: pulseAnim }],
              },
            ]}
          />
        )}

        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={!isActive}
          style={[
            styles.button,
            {
              backgroundColor: buttonColors.background,
              borderColor: buttonColors.border,
            },
          ]}
        >
          <View style={styles.iconContainer}>
            <Mic
              size={28}
              color={buttonColors.icon}
              strokeWidth={2}
            />
          </View>
        </Pressable>
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
