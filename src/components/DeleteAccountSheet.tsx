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
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { WarningCircleIcon, TrashIcon } from 'phosphor-react-native';
import { MMKV } from 'react-native-mmkv';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { deleteAccount, getCurrentUser } from '@/lib/appleAuth';
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
  const { colors } = useTheme();
  const router = useRouter();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const reset = useUnfoldStore((s) => s.reset);

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
      // Check if user has a Firebase account (not anonymous/local-only)
      const firebaseUser = getCurrentUser();

      if (firebaseUser) {
        // Delete Firebase account
        const result = await deleteAccount();

        if (!result.success) {
          if (result.error?.includes('requires-recent-login')) {
            Alert.alert(
              'Re-authentication required',
              'For security, please sign out and sign back in before deleting your account.',
              [{ text: 'OK' }]
            );
            setIsDeleting(false);
            return;
          }

          // Generic error
          Alert.alert(
            'Deletion failed',
            result.error ?? 'Something went wrong. Please try again.',
            [{ text: 'OK' }]
          );
          setIsDeleting(false);
          return;
        }
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
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
      }}
      handleIndicatorStyle={{
        backgroundColor: colors.border,
        width: 36,
      }}
    >
      <View style={styles.content}>
        {step === 1 ? (
          <Animated.View entering={FadeIn.duration(300)}>
            {/* Warning icon */}
            <View style={styles.iconRow}>
              <View style={[styles.iconContainer, { backgroundColor: `${colors.error}14` }]}>
                <WarningCircleIcon size={28} color={colors.error} weight="light" />
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
                <Text style={styles.deleteButtonText}>
                  Delete my account
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(300)}>
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
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmDeleteButtonText}>
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
    paddingHorizontal: 28,
    paddingTop: 8,
  },
  iconRow: {
    alignItems: 'center',
    marginBottom: 16,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
  },
  itemList: {
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: 10,
  },
  itemText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  permanentWarning: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 20,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 15,
  },
  deleteButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  deleteButtonText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 15,
    color: '#E53935',
  },
  confirmInput: {
    fontFamily: FontFamily.ui,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: 16,
  },
  confirmDeleteButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  confirmDeleteButtonText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  backButtonText: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
  },
});
