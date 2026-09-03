/**
 * Shown when the app started while the phone was locked and could not open the
 * store it keeps everything in, so this session runs on an empty throwaway
 * namespace (see mmkv-storage.ts / mmkv-open-mode.ts).
 *
 * Without this screen the session is indistinguishable from a fresh install:
 * an onboarded person is dropped back into onboarding with an empty library and
 * nothing on screen explains why. Their data is untouched on disk — the app
 * simply could not read the key that opens it — so the copy says exactly that
 * and asks for the one action that fixes it.
 *
 * COPY RULES: never name the storage internals (Keychain, MMKV, encryption,
 * recovery, namespace) and never imply the data is gone. The person needs to
 * unlock their phone and reopen Unfold, nothing more.
 *
 * Visual language matches ErrorBoundary's fallback (same logo, icon medallion,
 * title/message rhythm and button) so the two calm full-screen states read as
 * one family.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ColorTheme } from '@/constants/colors';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';


export interface RecoveryScreenProps {
  /** Theme colours, same shape the rest of the app renders against. */
  colors: ColorTheme;
  /**
   * 'locked' is the state the session actually booted in. 'ready' is shown
   * after the retry proves the Keychain reads again: the open plan is fixed at
   * module init, so this session still cannot recover and the only honest
   * instruction is to relaunch.
   */
  variant?: 'locked' | 'ready';
  /** Re-run the boot path. The caller decides how (reload, remount, exit). */
  onRetry: () => void;
}

export function RecoveryScreen({ colors, variant = 'locked', onRetry }: RecoveryScreenProps) {
  const isReady = variant === 'ready';
  return (
    <View
      style={[styles.container, { backgroundColor: colors.background }]}
      testID="storage-locked-screen"
    >
      <View style={styles.content}>
        <Text style={[styles.logo, { color: colors.accent }]}>Unfold</Text>
        <View style={[styles.iconContainer, { backgroundColor: colors.inputBackground }]}>
          <Text style={[styles.icon, { color: colors.textMuted }]}>✦</Text>
        </View>
        <Text style={[styles.title, { color: colors.text }]}>
          {isReady ? 'Your phone is unlocked' : 'Your reading is safe'}
        </Text>
        <Text style={[styles.message, { color: colors.textMuted }]}>
          {isReady
            ? 'Close Unfold completely and open it again. Everything will be where you left it.'
            : 'Everything you have read, written and saved is still on this device. Unfold could not open it just now, because your phone was locked when the app started.'}
        </Text>
        {!isReady && (
          <Text style={[styles.message, { color: colors.textMuted }]}>
            Unlock your phone, then open Unfold again.
          </Text>
        )}
        {!isReady && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={onRetry}
          testID="storage-locked-retry"
          hitSlop={8}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: pressed ? colors.buttonBackgroundPressed : colors.buttonBackground,
              borderColor: colors.accent,
            },
          ]}
        >
          <Text style={[styles.buttonText, { color: colors.accent }]}>Try again</Text>
        </Pressable>
        )}
      </View>
    </View>
  );
}

// Mirrors ErrorBoundary's fallback styles so both full-screen calm states share
// one visual language.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing['6'],
  },
  content: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  logo: {
    fontFamily: FontFamily.display,
    fontSize: 21,
    marginBottom: Spacing['8'],
    letterSpacing: 2,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing['6'],
  },
  icon: {
    fontSize: 28,
  },
  title: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.xl,
    marginBottom: Spacing['3'],
    textAlign: 'center',
  },
  message: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing['4'],
  },
  button: {
    minWidth: 220,
    alignItems: 'center',
    paddingVertical: Spacing['4'],
    paddingHorizontal: Spacing['8'],
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: Spacing['3'],
  },
  buttonText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.base,
  },
});

export default RecoveryScreen;
