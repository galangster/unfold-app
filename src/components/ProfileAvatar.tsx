import { View, Text, Image, TouchableOpacity, ActionSheetIOS, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { documentDirectory, copyAsync, deleteAsync } from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { CameraIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { useUnfoldStore } from '@/lib/store';
import { useCallback } from 'react';

interface ProfileAvatarProps {
  /** Circle diameter in points */
  size?: number;
  /** Show the camera edit overlay badge */
  editable?: boolean;
  /** Called on tap (if not editable, used for navigation) */
  onPress?: () => void;
}

/**
 * Profile avatar component — shows user photo or initial letter fallback.
 * When `editable`, tapping shows an action sheet to pick a photo.
 */
/**
 * Resolve a stored `profilePicture` value (filename only) to a usable URI.
 *
 * Historical note: earlier versions stored the absolute `${documentDirectory}${fileName}`
 * path. On iOS Simulator every dev-client rebuild reinstalls the app with a
 * fresh sandbox container UUID, so any absolute path persisted in MMKV goes
 * stale on the next launch and the <Image> silently fails. We now store the
 * filename only and reconstruct the absolute path at render time so the
 * reference survives container UUID changes. The v35→v36 migration in
 * store.ts strips any legacy absolute prefix from existing persisted values.
 */
function resolveProfilePictureUri(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith('file://') || value.startsWith('/')) {
    const slash = value.lastIndexOf('/');
    const fileName = slash >= 0 ? value.slice(slash + 1) : value;
    return documentDirectory ? `${documentDirectory}${fileName}` : null;
  }
  return documentDirectory ? `${documentDirectory}${value}` : null;
}

export function ProfileAvatar({ size = 36, editable = false, onPress }: ProfileAvatarProps) {
  const { colors } = useTheme();
  const userName = useUnfoldStore((s) => s.user?.name);
  const profilePicture = useUnfoldStore((s) => s.user?.profilePicture);
  const updateUser = useUnfoldStore((s) => s.updateUser);

  const profilePictureUri = resolveProfilePictureUri(profilePicture);

  const initial = (userName ?? '?')[0].toUpperCase();
  const fontSize = size * 0.42;
  const badgeSize = size * 0.32;
  const badgeIconSize = badgeSize * 0.55;

  const savePhoto = useCallback(async (uri: string) => {
    try {
      const result = await manipulateAsync(
        uri,
        [{ resize: { width: 300, height: 300 } }],
        { compress: 0.85, format: SaveFormat.JPEG },
      );

      const fileName = `profile-avatar-${Date.now()}.jpg`;
      const destPath = `${documentDirectory}${fileName}`;
      await copyAsync({ from: result.uri, to: destPath });

      const previousUri = resolveProfilePictureUri(profilePicture);
      if (previousUri) {
        try {
          await deleteAsync(previousUri, { idempotent: true });
        } catch {
          // ignore cleanup failures
        }
      }

      updateUser({ profilePicture: fileName });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Error', 'Could not save photo. Please try again.');
    }
  }, [profilePicture, updateUser]);

  const pickPhoto = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (!result.canceled && result.assets?.[0]) {
        await savePhoto(result.assets[0].uri);
      }
    } catch {
      Alert.alert('Error', 'Could not pick photo.');
    }
  }, [savePhoto]);

  const removePhoto = useCallback(async () => {
    const previousUri = resolveProfilePictureUri(profilePicture);
    if (previousUri) {
      try {
        await deleteAsync(previousUri, { idempotent: true });
      } catch {
        // ignore
      }
    }
    updateUser({ profilePicture: null });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [profilePicture, updateUser]);

  const showEditOptions = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const options = profilePicture
      ? ['Choose Photo', 'Remove Photo', 'Cancel']
      : ['Choose Photo', 'Cancel'];
    const cancelIndex = options.length - 1;
    const destructiveIndex = profilePicture ? 1 : undefined;

    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: cancelIndex, destructiveButtonIndex: destructiveIndex },
      (buttonIndex) => {
        if (buttonIndex === 0) pickPhoto();
        else if (buttonIndex === 1 && profilePicture) removePhoto();
      },
    );
  }, [profilePicture, pickPhoto, removePhoto]);

  const handlePress = editable ? showEditOptions : onPress;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handlePress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityLabel={editable ? 'Change profile picture' : 'Open profile'}
      accessibilityRole="button"
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: profilePictureUri ? 'transparent' : alpha(colors.accent, 0.13),
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        {profilePictureUri ? (
          <Image
            source={{ uri: profilePictureUri }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
            resizeMode="cover"
          />
        ) : (
          <Text
            style={{
              fontFamily: FontFamily.uiSemiBold,
              fontSize,
              color: colors.accent,
              includeFontPadding: false,
              textAlignVertical: 'center',
            }}
          >
            {initial}
          </Text>
        )}
      </View>

      {/* Edit badge */}
      {editable && (
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: badgeSize,
            height: badgeSize,
            borderRadius: badgeSize / 2,
            backgroundColor: colors.accent,
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 2,
            borderColor: colors.background,
          }}
        >
          <CameraIcon size={badgeIconSize} color={colors.background} weight="fill" />
        </View>
      )}
    </TouchableOpacity>
  );
}
