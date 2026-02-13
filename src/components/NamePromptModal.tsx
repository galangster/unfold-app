import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  Modal,
  StyleSheet,
} from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { updateUserProfile } from '@/lib/appleAuth';
import { logger } from '@/lib/logger';

interface NamePromptModalProps {
  visible: boolean;
  onComplete: () => void;
}

export function NamePromptModal({ visible, onComplete }: NamePromptModalProps) {
  const { colors, isDark } = useTheme();
  const user = useUnfoldStore((s) => s.user);
  const updateUser = useUnfoldStore((s) => s.updateUser);

  const [name, setName] = useState(user?.authDisplayName || user?.name || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Update Firebase profile
      await updateUserProfile(name.trim());

      // Update local store
      updateUser({
        authDisplayName: name.trim(),
        name: name.trim(),
      });

      logger.log('[NamePrompt] User name set', { name: name.trim() });
      onComplete();
    } catch (error) {
      logger.error('[NamePrompt] Error setting name', { error });
      // Still complete even if Firebase update fails
      updateUser({
        authDisplayName: name.trim(),
        name: name.trim(),
      });
      onComplete();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    logger.log('[NamePrompt] User skipped name prompt');
    onComplete();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleSkip}
    >
      <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
        <Animated.View
          entering={FadeInUp.duration(400)}
          style={[styles.container, { backgroundColor: colors.background }]}
        >
          <Text style={[styles.title, { color: colors.text, fontFamily: FontFamily.display }]}>
            What should we call you?
          </Text>

          <Text style={[styles.subtitle, { color: colors.textMuted, fontFamily: FontFamily.body }]}>
            This helps personalize your devotional experience.
          </Text>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.textHint}
            autoFocus
            autoCapitalize="words"
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBackground,
                color: colors.text,
                borderColor: colors.border,
                fontFamily: FontFamily.ui,
              },
            ]}
          />

          <Pressable
            onPress={handleSubmit}
            disabled={!name.trim() || isSubmitting}
            style={({ pressed }) => ({
              backgroundColor: colors.accent,
              paddingVertical: 16,
              borderRadius: 14,
              alignItems: 'center',
              opacity: !name.trim() || isSubmitting ? 0.5 : pressed ? 0.9 : 1,
              marginTop: 8,
            })}
          >
            <Text style={{ color: isDark ? '#000' : '#fff', fontFamily: FontFamily.uiSemiBold, fontSize: 16 }}>
              {isSubmitting ? 'Saving...' : 'Continue'}
            </Text>
          </Pressable>

          <Pressable onPress={handleSkip} style={{ marginTop: 16, padding: 8 }}>
            <Text style={{ color: colors.textSubtle, fontFamily: FontFamily.ui, fontSize: 14 }}>
              Skip for now
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 24,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 16,
  },
});
