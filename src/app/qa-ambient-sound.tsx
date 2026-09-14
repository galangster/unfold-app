import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { isAmbientAudioEnabled } from '@/lib/ambient-audio-feature';
import { isQaToolsEnabled } from '@/lib/qa-tools';
import { stopAmbientSound } from '@/lib/ambient-audio';
import { AmbientQuietEnding } from '@/components/ambient/AmbientQuietEnding';
import {
  beginAmbientVoiceInterruption,
  endAmbientVoiceInterruption,
  notifyNarrationPlayback,
} from '@/lib/ambient-audio-coordination';

function AmbientSoundQaScreen() {
  const { colors } = useTheme();
  const [journal, setJournal] = useState(false);
  const [draft, setDraft] = useState('');
  const [ending, setEnding] = useState(false);
  const [recording, setRecording] = useState(false);
  useEffect(() => () => endAmbientVoiceInterruption(), []);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.textMuted }]}>Sound QA</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setJournal(!journal)}
          style={styles.button}
        >
          <Text style={[styles.label, { color: colors.accent }]}>
            {journal ? 'Read' : 'Journal'}
          </Text>
        </Pressable>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>
          {journal ? 'A place for what stays with you' : 'A prayer for the close of day'}
        </Text>
        <Text
          accessibilityRole="header"
          style={[styles.heading, { color: colors.text }]}
        >
          {journal ? 'What are you\ncarrying tonight?' : 'You can leave\nthis day here.'}
        </Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          Before you close the day, take a breath. You do not have to put everything right.
        </Text>
        {journal ? (
          <TextInput
            accessibilityLabel="Your reflection"
            multiline
            value={draft}
            onChangeText={setDraft}
            placeholder="Begin wherever you are."
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
          />
        ) : (
          <>
            <View style={[styles.scripture, { borderColor: colors.accent }]}>
              <Text style={[styles.verse, { color: colors.text }]}>
                “I will both lay me down in peace, and sleep: for thou, LORD, only makest me dwell in safety.”
              </Text>
              <Text style={[styles.eyebrow, { color: colors.textMuted, marginTop: 18 }]}>
                PSALM 4:8 · KJV
              </Text>
            </View>
            <Text style={[styles.subheading, { color: colors.text }]}>Notice what remains.</Text>
            <Text style={[styles.body, { color: colors.textMuted }]}>
              Let the day return gently. A conversation. Something unfinished. A moment you wish you could hold a little longer.
            </Text>
            <Text style={[styles.body, { color: colors.textMuted }]}>
              Bring what is here to God, without asking it to become something else.
            </Text>
            <Text style={[styles.subheading, { color: colors.text }]}>A prayer for tonight.</Text>
            <Text style={[styles.body, { color: colors.textMuted }]}>
              God, receive this day as it is. Hold what I cannot resolve. Help me rest in your care.
            </Text>
          </>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            stopAmbientSound();
            endAmbientVoiceInterruption();
            setRecording(false);
            setEnding(true);
          }}
          style={[styles.primary, { backgroundColor: colors.accent }]}
        >
          <Text style={[styles.label, { color: colors.background }]}>Finish for tonight</Text>
        </Pressable>
        <View style={styles.qaControls}>
          <Pressable
            accessibilityRole="button"
            style={styles.button}
            onPress={() => {
              if (recording) endAmbientVoiceInterruption();
              else beginAmbientVoiceInterruption();
              setRecording(!recording);
            }}
          >
            <Text style={[styles.label, { color: colors.textMuted }]}>
              {recording ? 'End' : 'Simulate'} voice input
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.button}
            onPress={notifyNarrationPlayback}
          >
            <Text style={[styles.label, { color: colors.textMuted }]}>Simulate narration</Text>
          </Pressable>
        </View>
      </ScrollView>
      <AmbientQuietEnding visible={ending} onClose={() => setEnding(false)} />
    </SafeAreaView>
  );
}

export default function QaAmbientSoundRoute() {
  return isAmbientAudioEnabled() && isQaToolsEnabled() ? (
    <AmbientSoundQaScreen />
  ) : (
    <Redirect href="/(tabs)/(today)" />
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    paddingHorizontal: 24,
  },
  button: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  label: { fontFamily: FontFamily.ui, fontSize: 13 },
  content: {
    padding: 27,
    paddingBottom: 130,
    maxWidth: 620,
    width: '100%',
    alignSelf: 'center',
  },
  eyebrow: { fontFamily: FontFamily.ui, fontSize: 11, marginBottom: 20 },
  heading: { fontFamily: FontFamily.display, fontSize: 44, lineHeight: 48 },
  body: { fontFamily: FontFamily.body, fontSize: 16, lineHeight: 29, marginTop: 21 },
  scripture: { borderLeftWidth: 1, paddingLeft: 19, marginVertical: 31 },
  verse: { fontFamily: FontFamily.display, fontSize: 24, lineHeight: 35 },
  subheading: { fontFamily: FontFamily.display, fontSize: 29, marginTop: 18 },
  input: {
    fontFamily: FontFamily.body,
    fontSize: 17,
    lineHeight: 29,
    minHeight: 240,
    textAlignVertical: 'top',
    marginVertical: 24,
    borderBottomWidth: 1,
  },
  primary: {
    borderRadius: 14,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 30,
  },
  qaControls: { marginTop: 22 },
});
