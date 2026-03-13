import { View, Text, TouchableOpacity } from 'react-native';
import { CaretLeftIcon, CaretRightIcon, CaretDownIcon } from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  SharedValue,
} from 'react-native-reanimated';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';

interface ReadingBottomNavProps {
  canGoBack: boolean;
  canGoForward: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onShare: () => void;
  onJournal: () => void;
  showScrollHint?: boolean;
  chevronBounce?: SharedValue<number>;
}

export function ReadingBottomNav({
  canGoBack,
  canGoForward,
  onPrevious,
  onNext,
  onShare,
  onJournal,
  showScrollHint = false,
  chevronBounce,
}: ReadingBottomNavProps) {
  const { colors, isDark } = useTheme();

  const chevronAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: chevronBounce?.value ?? 0 }],
  }));

  return (
    <View
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
      }}
    >
      {/* Gradient fade above the nav */}
      <View style={{ height: 100 }} pointerEvents="none">
        <LinearGradient
          colors={
            isDark
              ? [`${colors.background}00`, `${colors.background}F2`, colors.background]
              : [`${colors.background}00`, `${colors.background}F2`, colors.background]
          }
          locations={[0, 0.5, 1]}
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            alignItems: 'center',
            paddingBottom: 8,
          }}
        >
          {/* Scroll hint chevron */}
          {showScrollHint && (
            <Animated.View
              entering={FadeIn.duration(300)}
              exiting={FadeOut.duration(300)}
              style={chevronAnimatedStyle}
            >
              <CaretDownIcon size={24} color={colors.textSubtle} weight="light" />
            </Animated.View>
          )}
        </LinearGradient>
      </View>

      {/* Solid nav area */}
      <View
        style={{
          paddingHorizontal: 24,
          paddingBottom: 40,
          paddingTop: 12,
          backgroundColor: colors.background,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Previous */}
          <TouchableOpacity activeOpacity={0.7}
            onPress={onPrevious}
            disabled={!canGoBack}
            style={{
              opacity: canGoBack ? 1 : 0.3,
              padding: 12,
            }}
          >
            <CaretLeftIcon size={28} color={colors.text} weight="light" />
          </TouchableOpacity>

          {/* Center actions */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* Share button */}
            <TouchableOpacity activeOpacity={0.7} onPress={onShare} style={{ marginRight: 8 }}>
              <View
                style={{
                  backgroundColor: colors.buttonBackground,
                  paddingVertical: 12,
                  paddingHorizontal: 20,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text
                  style={{
                    fontFamily: FontFamily.uiMedium,
                    fontSize: 14,
                    color: colors.text,
                  }}
                >
                  Share
                </Text>
              </View>
            </TouchableOpacity>

            {/* Journal button */}
            <TouchableOpacity activeOpacity={0.7} onPress={onJournal} style={{ marginLeft: 8 }}>
              <View
                style={{
                  backgroundColor: colors.buttonBackground,
                  paddingVertical: 12,
                  paddingHorizontal: 20,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text
                  style={{
                    fontFamily: FontFamily.uiMedium,
                    fontSize: 14,
                    color: colors.text,
                  }}
                >
                  Journal
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Next */}
          <TouchableOpacity activeOpacity={0.7}
            onPress={onNext}
            disabled={!canGoForward}
            style={{
              opacity: canGoForward ? 1 : 0.3,
              padding: 12,
            }}
          >
            <CaretRightIcon size={28} color={colors.text} weight="light" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
