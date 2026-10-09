import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { CaretDownIcon, PencilSimpleIcon } from '@/components/icons';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { syncUserProfileToBackend } from '@/lib/user-profile-sync';
import {
  COMPANION_NAME_MAX_LENGTH,
  PERSONAL_CONTEXT_FUTURE_DAYS_COPY,
  PERSONAL_CONTEXT_MAX_LENGTH,
  createPersonalContextDraft,
  personalContextDraftHasChanges,
  savePersonalContextDraft,
  type PersonalContextDraft,
} from '@/lib/support-clarity';
import { SettingsSectionHeader, getSettingsCardStyle } from './SettingsSectionHeader';

function previewAboutMe(aboutMe: string): string {
  const trimmed = aboutMe.trim();
  if (!trimmed) return 'Add another focus to what you first shared';
  return trimmed.length > 90 ? `${trimmed.slice(0, 87).trimEnd()}…` : trimmed;
}

export function PersonalContextSection() {
  const { colors } = useTheme();
  const user = useUnfoldStore((s) => s.user);
  const storeCompanionName = useUnfoldStore((s) => s.companionName);
  const updateUser = useUnfoldStore((s) => s.updateUser);
  const setCompanionName = useUnfoldStore((s) => s.setCompanionName);

  const original = useMemo(
    () => createPersonalContextDraft(user, storeCompanionName),
    [user, storeCompanionName],
  );
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<PersonalContextDraft>(original);
  const [isSaving, setIsSaving] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const openEditor = useCallback(() => {
    if (isSaving) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDraft(createPersonalContextDraft(user, storeCompanionName));
    setSyncNotice(null);
    setExpanded(true);
  }, [isSaving, storeCompanionName, user]);

  const handleCancel = useCallback(() => {
    if (isSaving) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDraft(createPersonalContextDraft(user, storeCompanionName));
    setExpanded(false);
  }, [isSaving, storeCompanionName, user]);

  const handleSave = useCallback(async () => {
    if (!user || isSaving) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsSaving(true);
    const result = await savePersonalContextDraft({
      draft,
      currentUser: user,
      sync: (nextUser) => syncUserProfileToBackend(nextUser),
      updateUser,
      setCompanionName,
    });
    setIsSaving(false);
    setExpanded(false);
    setSyncNotice(result.status === 'pending-sync' ? result.message : null);
  }, [draft, isSaving, setCompanionName, updateUser, user]);

  const dirty = personalContextDraftHasChanges(draft, original);

  return (
    <>
      <SettingsSectionHeader label="What you shared" />

      <Text
        style={{
          fontFamily: FontFamily.ui,
          fontSize: FontSize.xs,
          lineHeight: 18,
          color: colors.textMuted,
          marginBottom: Spacing['3'],
        }}
      >
        {PERSONAL_CONTEXT_FUTURE_DAYS_COPY}
      </Text>

      <View style={getSettingsCardStyle(colors)}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            if (isSaving) return;
            if (expanded) {
              handleCancel();
              return;
            }
            openEditor();
          }}
          disabled={isSaving}
          accessibilityRole="button"
          accessibilityLabel="What you shared"
          accessibilityHint="Opens the words you shared during setup so you can add another focus"
          accessibilityState={{ expanded, disabled: isSaving }}
          testID="personal-context-toggle"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: Spacing['4'],
            borderBottomWidth: expanded ? 1 : 0,
            borderBottomColor: colors.border,
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: Radius.chip,
              backgroundColor: colors.buttonBackground,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <PencilSimpleIcon size={18} color={colors.text} weight="light" />
          </View>
          <View style={{ marginLeft: Spacing['3.5'], flex: 1, minWidth: 0 }}>
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 15,
                lineHeight: 20,
                color: colors.text,
                flexShrink: 1,
              }}
            >
              Your words
            </Text>
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: FontSize.xs,
                lineHeight: 18,
                color: colors.textMuted,
                marginTop: Spacing['0.5'],
                flexShrink: 1,
              }}
            >
              {previewAboutMe(user?.aboutMe ?? '')}
            </Text>
            {syncNotice ? (
              <Text
                testID="personal-context-pending-sync"
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: FontSize.xs,
                  lineHeight: 18,
                  color: colors.textMuted,
                  marginTop: Spacing['1'],
                  flexShrink: 1,
                }}
              >
                {syncNotice}
              </Text>
            ) : null}
          </View>
          <CaretDownIcon
            size={20}
            color={colors.textMuted}
            weight="light"
            style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
          />
        </TouchableOpacity>

        {expanded ? (
          <View style={{ padding: Spacing['4'], gap: Spacing['4'] }}>
            <View>
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: FontSize.xs,
                  lineHeight: 18,
                  color: colors.textMuted,
                  marginBottom: Spacing['2'],
                }}
              >
                Companion name
              </Text>
              <TextInput
                value={draft.companionName}
                editable={!isSaving}
                onChangeText={(companionName) => {
                  if (isSaving) return;
                  setDraft((prev) => ({ ...prev, companionName }));
                }}
                placeholder="e.g. Grace"
                placeholderTextColor={colors.textMuted}
                selectionColor={colors.accent}
                cursorColor={colors.accent}
                maxLength={COMPANION_NAME_MAX_LENGTH}
                autoCapitalize="words"
                returnKeyType="next"
                testID="personal-context-companion-name"
                accessibilityLabel="Companion name"
                accessibilityState={{ disabled: isSaving }}
                style={{
                  fontFamily: FontFamily.body,
                  fontSize: FontSize.base,
                  color: colors.text,
                  minHeight: 48,
                  paddingHorizontal: Spacing['4'],
                  paddingVertical: Spacing['3'],
                  backgroundColor: colors.background,
                  borderRadius: Radius.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            </View>

            <View>
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: FontSize.xs,
                  lineHeight: 18,
                  color: colors.textMuted,
                  marginBottom: Spacing['2'],
                }}
              >
                What you first shared
              </Text>
              <TextInput
                value={draft.aboutMe}
                editable={!isSaving}
                onChangeText={(aboutMe) => {
                  if (isSaving) return;
                  setDraft((prev) => ({ ...prev, aboutMe }));
                }}
                placeholder="Add another focus, or a word about where you are now."
                placeholderTextColor={colors.textMuted}
                selectionColor={colors.accent}
                cursorColor={colors.accent}
                maxLength={PERSONAL_CONTEXT_MAX_LENGTH}
                multiline
                textAlignVertical="top"
                testID="personal-context-about-me"
                accessibilityLabel="What you first shared"
                accessibilityState={{ disabled: isSaving }}
                style={{
                  fontFamily: FontFamily.body,
                  fontSize: FontSize.base,
                  lineHeight: 22,
                  color: colors.text,
                  minHeight: 140,
                  paddingHorizontal: Spacing['4'],
                  paddingVertical: Spacing['3'],
                  backgroundColor: colors.background,
                  borderRadius: Radius.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing['3'] }}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleCancel}
                disabled={isSaving}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                accessibilityState={{ disabled: isSaving }}
                testID="personal-context-cancel"
                style={{
                  paddingVertical: Spacing['3'],
                  paddingHorizontal: Spacing['4'],
                  borderRadius: Radius.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  opacity: isSaving ? 0.6 : 1,
                }}
              >
                <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: FontSize.sm, color: colors.text }}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => handleSave()}
                disabled={isSaving || !dirty}
                accessibilityRole="button"
                accessibilityLabel="Save"
                accessibilityState={{ disabled: isSaving || !dirty }}
                testID="personal-context-save"
                style={{
                  paddingVertical: Spacing['3'],
                  paddingHorizontal: Spacing['4'],
                  borderRadius: Radius.md,
                  backgroundColor: colors.accent,
                  opacity: isSaving || !dirty ? 0.6 : 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: Spacing['2'],
                }}
              >
                {isSaving ? <ActivityIndicator size="small" color={colors.background} /> : null}
                <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: FontSize.sm, color: colors.background }}>
                  {isSaving ? 'Saving…' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    </>
  );
}
