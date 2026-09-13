import { TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ProfileAvatar } from '@/components/ProfileAvatar';

interface ProfileEntryButtonProps {
  testID?: string;
  size?: number;
}

/** Shared Profile control for top-level tab destinations. */
export function ProfileEntryButton({
  testID = 'profile-entry-button',
  size = 36,
}: ProfileEntryButtonProps) {
  const router = useRouter();

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      testID={testID}
      accessibilityLabel="Open profile"
      accessibilityRole="button"
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push('/(tabs)/(you)');
      }}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <ProfileAvatar size={size} />
      </View>
    </TouchableOpacity>
  );
}
