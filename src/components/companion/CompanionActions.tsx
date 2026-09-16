/**
 * CompanionActions — post-response action row.
 * Copy and native iOS share only.
 * Staggered 80ms fade-in per Storyboard D.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { BackdropBlur, Canvas, Fill } from '@shopify/react-native-skia';
import Animated, {
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { CheckIcon, CopyIcon } from '@/components/icons';
import { Duration, Ease, Stagger } from '@/constants/animations';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { COMPANION_TEXT_INDENT } from './CompanionMessageContent';

const CONFIRMATION_MS = 2000;
const HIT = 44;
const ICON = 18;
const PRESS_SCALE = 0.96;
/** better-ui/icon-transitions: spring duration 0.3, bounce 0. */
const ICON_SWAP_SPRING = { duration: 300, dampingRatio: 1 } as const;

interface Props {
  content: string;
  motionActive?: boolean;
  reducedMotion?: boolean;
}

function ShareUpFallback({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" pointerEvents="none">
      <Path
        d="M9 8.25H7.5A2.25 2.25 0 0 0 5.25 10.5v9A2.25 2.25 0 0 0 7.5 21.75h9a2.25 2.25 0 0 0 2.25-2.25v-9A2.25 2.25 0 0 0 16.5 8.25H15M9 12l3-3m0 0 3 3m-3-3V2.25"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function NativeShareIcon({ color }: { color: string }) {
  return (
    <SymbolView
      name={{ ios: 'square.and.arrow.up', android: 'ios_share', web: 'ios_share' }}
      size={ICON}
      tintColor={color}
      weight="regular"
      pointerEvents="none"
      fallback={<ShareUpFallback color={color} size={ICON} />}
    />
  );
}

/** RN `filter` blur is Android/web only. iOS applies the same 4px via Skia. */
function IconBlur({ blur }: { blur: SharedValue<number> }) {
  if (Platform.OS !== 'ios') return null;
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <BackdropBlur blur={blur}>
        <Fill color="transparent" />
      </BackdropBlur>
    </Canvas>
  );
}

function CopySwap({
  copied,
  color,
  activeColor,
  reducedMotion,
}: {
  copied: boolean;
  color: string;
  activeColor: string;
  reducedMotion: boolean;
}) {
  const progress = useSharedValue(copied ? 1 : 0);

  useEffect(() => {
    cancelAnimation(progress);
    progress.value = reducedMotion
      ? copied ? 1 : 0
      : withSpring(copied ? 1 : 0, ICON_SWAP_SPRING);
    return () => cancelAnimation(progress);
  }, [copied, progress, reducedMotion]);

  const idleBlur = useDerivedValue(() =>
    interpolate(progress.value, [0, 1], [0, 4]),
  );
  const activeBlur = useDerivedValue(() =>
    interpolate(progress.value, [0, 1], [4, 0]),
  );

  const idleStyle = useAnimatedStyle(() => {
    const blur = interpolate(progress.value, [0, 1], [0, 4]);
    return {
      opacity: 1 - progress.value,
      transform: [{ scale: interpolate(progress.value, [0, 1], [1, 0.25]) }],
      ...(Platform.OS !== 'ios' ? { filter: [{ blur }] } : {}),
    };
  });

  const activeStyle = useAnimatedStyle(() => {
    const blur = interpolate(progress.value, [0, 1], [4, 0]);
    return {
      opacity: progress.value,
      transform: [{ scale: interpolate(progress.value, [0, 1], [0.25, 1]) }],
      ...(Platform.OS !== 'ios' ? { filter: [{ blur }] } : {}),
    };
  });

  return (
    <View style={styles.iconSlot}>
      <Animated.View style={idleStyle}>
        <CopyIcon size={ICON} color={color} weight="regular" />
        <IconBlur blur={idleBlur} />
      </Animated.View>
      <Animated.View style={[styles.iconOverlay, activeStyle]}>
        <CheckIcon size={ICON} color={activeColor} weight="regular" />
        <IconBlur blur={activeBlur} />
      </Animated.View>
    </View>
  );
}

function ActionButton({
  delay,
  onPress,
  accessibilityLabel,
  motionActive,
  reducedMotion,
  children,
}: {
  delay: number;
  onPress: () => void;
  accessibilityLabel: string;
  motionActive: boolean;
  reducedMotion: boolean;
  children: ReactNode;
}) {
  const opacity = useSharedValue(motionActive && !reducedMotion ? 0 : 1);
  const scale = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(opacity);
    opacity.value = motionActive && !reducedMotion
      ? withDelay(delay, withTiming(1, { duration: Duration.fast, easing: Ease.out }))
      : 1;
    if (reducedMotion) {
      cancelAnimation(scale);
      scale.value = 1;
    }
    return () => {
      cancelAnimation(opacity);
      cancelAnimation(scale);
    };
  }, [delay, motionActive, opacity, reducedMotion, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const pressIn = () => {
    if (reducedMotion) return;
    cancelAnimation(scale);
    scale.value = withTiming(PRESS_SCALE, { duration: Duration.fast, easing: Ease.out });
  };

  const pressOut = () => {
    cancelAnimation(scale);
    scale.value = reducedMotion
      ? 1
      : withTiming(1, { duration: Duration.fast, easing: Ease.out });
  };

  return (
    <Animated.View style={style}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        onPressIn={pressIn}
        onPressOut={pressOut}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        android_ripple={{ color: 'transparent' }}
        style={styles.hit}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

export function CompanionActions({
  content,
  motionActive = true,
  reducedMotion = false,
}: Props) {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), CONFIRMATION_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = () => {
    void Clipboard.setStringAsync(content).then(() => {
      setCopied(true);
      AccessibilityInfo.announceForAccessibility('Copied');
    });
  };

  const handleShare = () => {
    void Share.share({ message: content }).catch(() => {
      // Share cancelled or failed
    });
  };

  return (
    <View style={styles.row}>
      <ActionButton
        delay={0}
        onPress={handleCopy}
        accessibilityLabel={copied ? 'Copied' : 'Copy response'}
        motionActive={motionActive}
        reducedMotion={reducedMotion}
      >
        <CopySwap
          copied={copied}
          color={colors.textMuted}
          activeColor={colors.success}
          reducedMotion={reducedMotion}
        />
      </ActionButton>
      <ActionButton
        delay={Stagger.normal}
        onPress={handleShare}
        accessibilityLabel="Share response"
        motionActive={motionActive}
        reducedMotion={reducedMotion}
      >
        <NativeShareIcon color={colors.textMuted} />
      </ActionButton>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing['4'],
    marginTop: Spacing['2'],
    paddingLeft: COMPANION_TEXT_INDENT,
  },
  hit: {
    alignItems: 'center',
    height: HIT,
    justifyContent: 'center',
    width: HIT,
  },
  iconSlot: {
    alignItems: 'center',
    height: ICON,
    justifyContent: 'center',
    width: ICON,
  },
  iconOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
