import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { UnfoldEditorView } from 'unfold-editor';

/**
 * Phase B smoke test screen for the unfold-editor Expo Module.
 *
 * Verifies that the module's iOS pod bundles a custom font (Inter_400Regular.ttf)
 * and registers it at view-init time via CTFontManagerRegisterFontsForURL.
 *
 * Expected: "Unfold Editor WIP" renders in Inter-Regular, with a small
 * diagnostic line reading "font: Inter-Regular". If the diagnostic shows
 * "font: SYSTEM FALLBACK", the font bundling path is broken.
 *
 * Route: /__dev__/unfold-editor-test (deep link: unfold://__dev__/unfold-editor-test)
 */
export default function UnfoldEditorTestScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'UnfoldEditor Smoke Test' }} />
      <UnfoldEditorView style={styles.editor} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  editor: {
    flex: 1,
  },
});
