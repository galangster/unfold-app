import { useRef, useState } from 'react';
import { useIsFocused } from 'expo-router';
import { CompanionAvatar } from '@/components/companion/CompanionAvatar';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import { VoiceAnswerButton } from '@/components/onboarding/VoiceAnswerButton';
import { OnboardingVoiceAnswerSheet } from '@/components/onboarding/OnboardingVoiceAnswerSheet';
import { FontFamily } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import type { ColorTheme } from '@/constants/colors';
import { LIFE_CONTEXT_MAX_LENGTH } from '@/lib/life-context';
import { captureSyncSession, isSyncSessionCurrent } from '@/lib/sync-session-fence';

export function LifeContextInput({ value, onChangeText, colors, isDark }: {
  value: string;
  onChangeText: (text: string) => void;
  colors: ColorTheme;
  isDark: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [editing, setEditing] = useState(false);
  const isFocused = useIsFocused();
  const [inputKey, setInputKey] = useState(0);
  const session = useRef(captureSyncSession());
  const overLimit = value.length > LIFE_CONTEXT_MAX_LENGTH;

  return (
    <View style={styles.container}>
      <View style={styles.companion} accessible={false} importantForAccessibility="no-hide-descendants">
        <CompanionAvatar size={120} expression="welcome" idleStyle="inviting" active={isFocused && !recording && !editing} />
      </View>
      <VoiceAnswerButton
        colors={colors}
        label="Record an update"
        onPress={() => { Keyboard.dismiss(); setRecording(true); }}
      />
      <Text style={[styles.label, { color: colors.textMuted }]}>Or write here</Text>
      <TextInput
        key={inputKey}
        defaultValue={value}
        onChangeText={onChangeText}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        accessibilityLabel="Your life update"
        placeholder="A life update, a question, something you're learning…"
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.accent}
        keyboardAppearance={isDark ? 'dark' : 'light'}
        multiline
        scrollEnabled
        style={[styles.input, { color: colors.text, backgroundColor: colors.inputBackground, borderColor: overLimit ? colors.error : colors.border }]}
      />
      {value.length > LIFE_CONTEXT_MAX_LENGTH - 500 && (
        <Text accessibilityRole={overLimit ? 'alert' : 'text'} style={[styles.note, { color: overLimit ? colors.error : colors.textMuted }]}>
          {overLimit ? `Keep your update within ${LIFE_CONTEXT_MAX_LENGTH} characters to save it. ` : ''}{value.length} / {LIFE_CONTEXT_MAX_LENGTH}
        </Text>
      )}
      <Text style={[styles.note, { color: colors.textMuted }]}>
        Your words help shape your devotionals. You can review and edit them before saving.
      </Text>
      {recording && (
        <OnboardingVoiceAnswerSheet
          visible
          autoStart
          companion
          existingText={value}
          maxLength={LIFE_CONTEXT_MAX_LENGTH}
          prompt="Talk about your life, your questions, or what you're learning. You can review the text before adding it."
          acceptHint="Adds the reviewed text to your life update"
          onClose={() => setRecording(false)}
          onAccept={(text) => {
            if (!isSyncSessionCurrent(session.current)) return;
            onChangeText(text);
            setInputKey((key) => key + 1);
          }}
          previewColors={colors}
          previewIsDark={isDark}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  companion: { height: 126, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: FontFamily.ui, fontSize: 14, marginTop: 8 },
  input: { minHeight: 180, maxHeight: 320, padding: 16, borderWidth: 1, borderRadius: Radius.lg, borderCurve: 'continuous', fontFamily: FontFamily.body, fontSize: 17, lineHeight: 25, textAlignVertical: 'top' },
  note: { fontFamily: FontFamily.ui, fontSize: 13, lineHeight: 19 },
});
