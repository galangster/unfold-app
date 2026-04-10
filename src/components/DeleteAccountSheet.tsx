/**
 * DeleteAccountSheet — Two-step account deletion flow
 *
 * Required by App Store Guideline 5.1.1: apps with account creation
 * must offer account deletion.
 *
 * Step 1: Warning with list of data that will be deleted
 * Step 2: Type "DELETE" to confirm
 *
 * Handles both Firebase-authenticated and anonymous (local-only) users.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import BottomSheet, { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Duration } from '@/constants/animations';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { WarningCircleIcon, TrashIcon } from 'phosphor-react-native';
import { MMKV } from 'react-native-mmkv';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { useUser, useClerk } from '@clerk/clerk-expo';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeleteAccountSheetProps {
  visible: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Data that will be deleted
// ---------------------------------------------------------------------------

const DELETION_ITEMS = [
  'Your devotional series and reading progress',
  'Your journal entries and reflections',
  'Your streak history and achievements',
  'Your Bible highlights and reading history',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeleteAccountSheet({ visible, onClose }: DeleteAccountSheetProps) {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const reset = useUnfoldStore((s) => s.reset);
  const { user: clerkUser } = useUser();
  const { signOut } = useClerk();

  const [step, setStep] = useState<1 | 2>(1);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const isConfirmEnabled = confirmText === 'DELETE';

  // Open/close the sheet based on visibility prop
  useEffect(() => {
    if (visible) {
      setStep(1);
      setConfirmText('');
      setIsDeleting(false);
      bottomSheetRef.current?.snapToIndex(0);
    } else {
      bottomSheetRef.current?.close();
    }
  }, [visible]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        // Reset state when sheet is dismissed
        setStep(1);
        setConfirmText('');
        setIsDeleting(false);
        onClose();
      }
    },
    [onClose]
  );

  const handleCancel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const handleProceedToConfirm = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep(2);
  };

  const handleConfirmDeletion = async () => {
    if (!isConfirmEnabled || isDeleting) return;

    setIsDeleting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    try {
      // Delete Clerk account if user is signed in
      if (clerkUser) {
        try {
          await clerkUser.delete();
        } catch (clerkErr: any) {
          Alert.alert(
            'Deletion failed',
            clerkErr?.errors?.[0]?.longMessage ?? 'Something went wrong. Please try again.',
            [{ text: 'OK' }]
          );
          setIsDeleting(false);
          return;
        }
        await signOut();
      }

      // Clear Zustand store
      reset();

      // Clear MMKV storage
      try {
        const mmkv = new MMKV({ id: 'unfold-store' });
        mmkv.clearAll();
        logger.log('[DeleteAccount] MMKV storage cleared');
      } catch (mmkvError) {
        logger.error('[DeleteAccount] Failed to clear MMKV', mmkvError);
      }

      logger.log('[DeleteAccount] Account deletion complete');

      // Close sheet and navigate to root
      onClose();
      router.replace('/');
    } catch (error) {
      logger.error('[DeleteAccount] Unexpected error during deletion', error);
      Alert.alert(
        'Something went wrong',
        'Please try again later.',
        [{ text: 'OK' }]
      );
      setIsDeleting(false);
    }
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
        pressBehavior="close"
      />
    ),
    []
  );

  if (!visible) return null;

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={[step === 1 ? '52%' : '46%']}
      enablePanDownToClose
      onChange={handleSheetChanges}
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: colors.inputBackground,
        borderTopLeftRadius: Radius['2xl'],
        borderTopRightRadius: Radius['2xl'],
      }}
      handleIndicatorStyle={{
        backgroundColor: colors.borderStrong,
        width: 36,
        height: 4,
        borderRadius: 2,
      }}
    >
      <View style={styles.content}>
        {step === 1 ? (
          <Animated.View entering={FadeIn.duration(Duration.slow)}>
            {/* Warning icon — solid red background with white glyph so the
                icon stays visible against the circle regardless of theme. */}
            <View style={styles.iconRow}>
              <View style={[styles.iconContainer, { backgroundColor: colors.error }]}>
                <WarningCircleIcon size={28} color="#FFFFFF" weight="regular" />
              </View>
            </View>

            {/* Title */}
            <Text style={[styles.title, { color: colors.text }]}>
              Delete your account?
            </Text>

            {/* Warning text */}
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              This will permanently delete:
            </Text>

            {/* Deletion items list */}
            <View style={styles.itemList}>
              {DELETION_ITEMS.map((item) => (
                <View key={item} style={styles.itemRow}>
                  <View style={[styles.bullet, { backgroundColor: colors.error }]} />
                  <Text style={[styles.itemText, { color: colors.textMuted }]}>
                    {item}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={[styles.permanentWarning, { color: colors.textSubtle }]}>
              This action cannot be undone.
            </Text>

            {/* Buttons */}
            <View style={styles.buttonGroup}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleCancel}
                style={[styles.cancelButton, { backgroundColor: colors.inputBackground, borderColor: colors.border, borderWidth: 1 }]}
              >
                <Text style={[styles.cancelButtonText, { color: colors.text }]}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleProceedToConfirm}
                style={styles.deleteButton}
              >
                <Text style={[styles.deleteButtonText, { color: colors.error }]}>
                  Delete my account
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(Duration.slow)}>
            {/* Title */}
            <Text style={[styles.title, { color: colors.text }]}>
              Type "DELETE" to confirm
            </Text>

            <Text style={[styles.subtitle, { color: colors.textMuted, marginBottom: 20 }]}>
              This is your last chance to turn back.
            </Text>

            {/* Text input */}
            <TextInput
              style={[
                styles.confirmInput,
                {
                  color: colors.text,
                  backgroundColor: colors.background,
                  borderColor: isConfirmEnabled ? colors.error : colors.border,
                  borderWidth: 1,
                },
              ]}
              placeholder='Type "DELETE"'
              placeholderTextColor={colors.textHint}
              value={confirmText}
              onChangeText={setConfirmText}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              editable={!isDeleting}
            />

            {/* Confirm button */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleConfirmDeletion}
              disabled={!isConfirmEnabled || isDeleting}
              style={[
                styles.confirmDeleteButton,
                {
                  backgroundColor: isConfirmEnabled ? colors.error : colors.border,
                  opacity: isConfirmEnabled && !isDeleting ? 1 : 0.5,
                },
              ]}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color={isDark ? '#FFFFFF' : colors.backgroundPure} />
              ) : (
                <Text style={[styles.confirmDeleteButtonText, { color: isDark ? '#FFFFFF' : colors.backgroundPure }]}>
                  Confirm deletion
                </Text>
              )}
            </TouchableOpacity>

            {/* Back button */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                setStep(1);
                setConfirmText('');
              }}
              disabled={isDeleting}
              style={styles.backButton}
            >
              <Text style={[styles.backButtonText, { color: colors.textSubtle }]}>
                Go back
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: Spacing['7'],
    paddingTop: Spacing['2'],
  },
  iconRow: {
    alignItems: 'center',
    marginBottom: Spacing['4'],
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: Spacing['2'],
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing['3'],
  },
  itemList: {
    marginBottom: Spacing['3'],
    paddingHorizontal: Spacing['2'],
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing['2'],
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: 10,
  },
  itemText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 20,
    flex: 1,
  },
  permanentWarning: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginBottom: Spacing['5'],
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: Spacing['3'],
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.card,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 15,
  },
  deleteButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.card,
    alignItems: 'center',
  },
  deleteButtonText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 15,
  },
  confirmInput: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.base,
    paddingHorizontal: Spacing['4'],
    paddingVertical: 14,
    borderRadius: Radius.md,
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: Spacing['4'],
  },
  confirmDeleteButton: {
    paddingVertical: Spacing['4'],
    borderRadius: Radius.card,
    alignItems: 'center',
    marginBottom: Spacing['3'],
  },
  confirmDeleteButtonText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.base,
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: Spacing['2'],
  },
  backButtonText: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
  },
});
