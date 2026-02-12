import { View, Text, Pressable } from 'react-native';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react-native';
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
              ? ['rgba(10, 10, 10, 0)', 'rgba(10, 10, 10, 0.95)', '#0A0A0A']
              : ['rgba(250, 247, 242, 0)', 'rgba(250, 247, 242, 0.95)', '#FAF7F2']
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
              <ChevronDown size={24} color={colors.textSubtle} />
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
          backgroundColor: isDark ? '#0A0A0A' : '#FAF7F2',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Previous */}
          <Pressable
            onPress={onPrevious}
            disabled={!canGoBack}
            style={{
              opacity: canGoBack ? 1 : 0.3,
              padding: 12,
            }}
          >
            <ChevronLeft size={28} color={colors.text} />
          </Pressable>

          {/* Center actions */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* Share button */}
            <Pressable onPress={onShare} style={{ marginRight: 6 }}>
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
            </Pressable>

            {/* Journal button */}
            <Pressable onPress={onJournal} style={{ marginLeft: 6 }}>
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
            </Pressable>
          </View>

          {/* Next */}
          <Pressable
            onPress={onNext}
            disabled={!canGoForward}
            style={{
              opacity: canGoForward ? 1 : 0.3,
              padding: 12,
            }}
          >
            <ChevronRight size={28} color={colors.text} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
