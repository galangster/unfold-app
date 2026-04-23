import { View, Text, Image, TouchableOpacity, ActionSheetIOS, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { documentDirectory, copyAsync, deleteAsync, getInfoAsync } from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { CameraIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { useUnfoldStore } from '@/lib/store';
import { useCallback, useEffect, useState } from 'react';

interface ProfileAvatarProps {
  /** Circle diameter in points */
  size?: number;
  /** Show the camera edit overlay badge */
  editable?: boolean;
  /** Called on tap (if not editable, used for navigation) */
  onPress?: () => void;
}

function getProfileAvatarFileName(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const segments = trimmed.split('/').filter(Boolean);
  return segments.length ? segments[segments.length - 1] : null;
}

function toDocumentAvatarUri(fileName: string | null): string | null {
  if (!fileName || !documentDirectory) return null;
  return `${documentDirectory}${fileName}`;
}

/**
 * Profile avatar component — shows user photo or initial letter fallback.
 * When `editable`, tapping shows an action sheet to pick a photo.
 */
export function ProfileAvatar({ size = 36, editable = false, onPress }: ProfileAvatarProps) {
  const { colors } = useTheme();
  const userName = useUnfoldStore((s) => s.user?.name);
  const profilePicture = useUnfoldStore((s) => s.user?.profilePicture);
  const updateUser = useUnfoldStore((s) => s.updateUser);

  const initial = (userName || '?')[0].toUpperCase();
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [resolvedProfilePicture, setResolvedProfilePicture] = useState<string | null>(null);
  const hasRenderableProfilePicture = Boolean(resolvedProfilePicture) && !imageLoadFailed;
  const fontSize = size * 0.42;
  const badgeSize = size * 0.32;
  const badgeIconSize = badgeSize * 0.55;

  useEffect(() => {
    let cancelled = false;

    const reconcileProfilePicture = async () => {
      setImageLoadFailed(false);
      if (!profilePicture) {
        setResolvedProfilePicture(null);
        return;
      }

      const fileName = getProfileAvatarFileName(profilePicture);
      const canonicalUri = toDocumentAvatarUri(fileName);
      const candidates = [profilePicture, canonicalUri].filter(
        (value, index, array): value is string => Boolean(value) && array.indexOf(value) === index,
      );

      for (const candidate of candidates) {
        try {
          const info = await getInfoAsync(candidate);
          if (info.exists) {
            if (cancelled) return;
            setResolvedProfilePicture(candidate);
            if (fileName && profilePicture !== fileName) {
              updateUser({ profilePicture: fileName });
            }
            return;
          }
        } catch {
          // try the next candidate
        }
      }

      if (cancelled) return;
      setResolvedProfilePicture(null);
      updateUser({ profilePicture: null });
    };

    reconcileProfilePicture().catch(() => {
      if (!cancelled) {
        setResolvedProfilePicture(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [profilePicture, updateUser]);

  const savePhoto = useCallback(async (uri: string) => {
    try {
      // Resize to 300x300 for efficient storage
      const result = await manipulateAsync(
        uri,
        [{ resize: { width: 300, height: 300 } }],
        { compress: 0.85, format: SaveFormat.JPEG },
      );

      // Copy to persistent documentDirectory
      const fileName = `profile-avatar-${Date.now()}.jpg`;
      const destPath = `${documentDirectory}${fileName}`;
      await copyAsync({ from: result.uri, to: destPath });

      // Delete old photo if exists
      if (profilePicture) {
        try {
          const existingPath = toDocumentAvatarUri(getProfileAvatarFileName(profilePicture)) ?? profilePicture;
          await deleteAsync(existingPath, { idempotent: true });
        } catch {
          // ignore cleanup failures
        }
      }

      updateUser({ profilePicture: fileName });
      setResolvedProfilePicture(destPath);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Error', 'Could not save photo. Please try again.');
    }
  }, [profilePicture, updateUser]);

  const pickPhoto = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
    if (profilePicture) {
      try {
        const existingPath = toDocumentAvatarUri(getProfileAvatarFileName(profilePicture)) ?? profilePicture;
        await deleteAsync(existingPath, { idempotent: true });
      } catch {
        // ignore
      }
    }
    updateUser({ profilePicture: null });
    setResolvedProfilePicture(null);
    setImageLoadFailed(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [profilePicture, updateUser]);

  const handleImageError = useCallback(() => {
    setImageLoadFailed(true);
    if (profilePicture) {
      updateUser({ profilePicture: null });
    }
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
          backgroundColor: hasRenderableProfilePicture ? 'transparent' : alpha(colors.accent, 0.13),
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        {hasRenderableProfilePicture ? (
          <Image
            source={{ uri: resolvedProfilePicture! }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
            resizeMode="cover"
            onError={handleImageError}
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
