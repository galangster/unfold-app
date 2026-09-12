import { View } from 'react-native';
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
    <View style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
      <ProfileAvatar
        size={size}
        testID={testID}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/(tabs)/(you)');
        }}
      />
    </View>
  );
}
