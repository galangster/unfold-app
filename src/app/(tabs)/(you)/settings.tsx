import { View, Text, ScrollView, useWindowDimensions, StyleSheet } from 'react-native';
import { useAdaptiveLayout } from '@/hooks/useAdaptiveLayout';
import { adaptiveFrameStyle } from '@/lib/adaptive-layout';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CaretLeftIcon } from '@/components/icons';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { useCrossTabBack } from '@/hooks/useCrossTabBack';
import {
  ProfileSettingsSections,
  useSettingsSectionScroll,
} from '@/components/settings/ProfileSettingsSections';

/**
 * Compatibility path for old settings links and section parameters.
 * Profile now shows the same sections; this screen keeps a back caret for
 * deep links and cross-tab pushes.
 */
export default function SettingsScreen() {
  const { fontScale } = useWindowDimensions();
  const adaptiveLayout = useAdaptiveLayout();
  const settingsFrameStyle = adaptiveFrameStyle(adaptiveLayout.clusterMaxWidth);
  const { colors } = useTheme();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const { handleBack } = useCrossTabBack();
  const { scrollViewRef, handleScrollLayout, handleSectionLayout } = useSettingsSectionScroll(section);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} testID="settings-screen">
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleBack}
            style={styles.backButton}
            testID="settings-back-button"
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <CaretLeftIcon size={24} color={colors.text} weight="light" />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        </View>

        <ScrollView
          key={fontScale}
          ref={scrollViewRef}
          onLayout={handleScrollLayout}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={settingsFrameStyle}>
            <ProfileSettingsSections onSectionLayout={handleSectionLayout} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
  },
  backButton: {
    padding: Spacing['2'],
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.base,
    marginLeft: Spacing['3'],
  },
});
