import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Button, Sheet } from '@/components/ui';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { APP_FEEDBACK_MAX_LENGTH, getFeedbackProgress } from '@/lib/app-feedback-policy';
import { sendAppFeedback, type AppFeedbackSource } from '@/lib/app-feedback';

export function AppFeedbackSheet({ visible, onClose, source }: {
  visible: boolean;
  onClose: () => void;
  source: AppFeedbackSource;
}) {
  const { colors } = useTheme();
  const draft = useUnfoldStore((state) => state.appFeedbackDraft);
  const setDraft = useUnfoldStore((state) => state.setAppFeedbackDraft);
  const [status, setStatus] = useState<'editing' | 'sending' | 'sent' | 'error'>('editing');
  const sending = useRef(false);
  useEffect(() => {
    if (visible && !sending.current) setStatus('editing');
  }, [visible]);

  const submit = async () => {
    if (sending.current || !draft.trim()) return;
    sending.current = true;
    setStatus('sending');
    try {
      await sendAppFeedback(draft, source);
      const state = useUnfoldStore.getState();
      if (state.appFeedbackDraft === draft) state.setAppFeedbackDraft('');
      const progress = getFeedbackProgress(state.devotionals);
      state.recordAppFeedbackPrompt(progress.readings, progress.series);
      setStatus('sent');
    } catch {
      setStatus('error');
    } finally {
      sending.current = false;
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} bottomPadding={Spacing['6']}>
      <View style={{ gap: Spacing['4'] }}>
        <Text accessibilityRole="header" style={{ fontFamily: FontFamily.display, fontSize: FontSize['2xl'], color: colors.text }}>
          {status === 'sent' ? 'Thank you for helping Unfold grow.' : 'Help shape Unfold'}
        </Text>
        {status === 'sent' ? (
          <>
            <Text style={{ fontFamily: FontFamily.body, fontSize: FontSize.base, color: colors.textMuted }}>
              Your feedback has been sent to the Unfold team.
            </Text>
            <Button label="Done" onPress={onClose} fullWidth />
          </>
        ) : (
          <>
            <Text style={{ fontFamily: FontFamily.body, fontSize: FontSize.base, color: colors.textMuted }}>
              What’s been helpful? What could be better?
            </Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              multiline
              editable={status !== 'sending'}
              maxLength={APP_FEEDBACK_MAX_LENGTH}
              textAlignVertical="top"
              placeholder="Anything you’d like us to know…"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Your feedback"
              accessibilityHint="Your draft is saved if you close this sheet."
              testID="app-feedback-input"
              style={{ minHeight: 140, maxHeight: 220, padding: Spacing['4'], borderRadius: Radius.md, backgroundColor: colors.inputBackground, color: colors.text, fontFamily: FontFamily.ui, fontSize: FontSize.base }}
            />
            <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted }}>
              {draft.length}/{APP_FEEDBACK_MAX_LENGTH} · Sent privately with your app version and Support ID.
            </Text>
            {status === 'error' && (
              <Text accessibilityRole="alert" style={{ fontFamily: FontFamily.ui, fontSize: FontSize.sm, color: colors.text }}>
                We couldn’t send your note. Your draft is saved. Please try again.
              </Text>
            )}
            <Button label={status === 'sending' ? 'Sending…' : 'Send feedback'} onPress={() => { void submit(); }} loading={status === 'sending'} disabled={!draft.trim()} fullWidth />
            <Button label="Not now" variant="ghost" onPress={onClose} fullWidth />
          </>
        )}
      </View>
    </Sheet>
  );
}
