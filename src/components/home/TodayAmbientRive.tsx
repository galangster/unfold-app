import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  Alignment,
  Fit,
  RiveView,
  useRive,
  useRiveFile,
  type RiveFileInput,
  type RiveViewRef,
} from '@rive-app/react-native';
import type { TodayAmbientMode, TodayAmbientRiveInputs } from '@/lib/today-ambient-rive';

interface TodayAmbientRiveProps {
  source?: RiveFileInput;
  active: boolean;
  inputs: TodayAmbientRiveInputs | null;
  mode: Exclude<TodayAmbientMode, 'none'>;
  style?: StyleProp<ViewStyle>;
  artboardName?: string;
  stateMachineName?: string;
}

function applyNumberInputs(view: RiveViewRef, inputs: TodayAmbientRiveInputs, logPrefix: string): void {
  for (const [name, value] of Object.entries(inputs)) {
    if (typeof value !== 'number') continue;

    try {
      view.setNumberInputValue(name, value);
    } catch (error) {
      // Generated Rive files can differ slightly. Keep rendering if an optional
      // tuning input is missing, but leave a searchable log for device diagnosis.
      console.warn(
        `[${logPrefix}] Failed to set Rive input "${name}":`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}

function getMotionStyle(mode: Exclude<TodayAmbientMode, 'none'>, loopProgress: Animated.Value) {
  const horizontalDrift = mode === 'rain-particles' ? 8 : 18;
  const verticalStart = mode === 'rain-particles' ? -10 : 14;
  const verticalPeak = mode === 'rain-particles' ? 16 : -18;
  const peakScale = mode === 'light-rays' ? 1.05 : 1.035;
  const minOpacity = mode === 'rain-particles' ? 0.68 : 0.74;

  return {
    opacity: loopProgress.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [minOpacity, 1, minOpacity],
    }),
    transform: [
      {
        translateX: loopProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [-horizontalDrift, horizontalDrift],
        }),
      },
      {
        translateY: loopProgress.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [verticalStart, verticalPeak, verticalStart],
        }),
      },
      {
        scale: loopProgress.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [1.01, peakScale, 1.01],
        }),
      },
    ],
  };
}

export function TodayAmbientRive({
  source,
  active,
  inputs,
  mode,
  style,
  artboardName = 'Artboard',
  stateMachineName = 'State Machine 1',
}: TodayAmbientRiveProps) {
  const { riveFile, error: riveFileError } = useRiveFile(source);
  const { riveViewRef, setHybridRef } = useRive();
  const loopProgress = useRef(new Animated.Value(0)).current;
  const logPrefix = `today-${mode}-rive`;

  const inputSignature = useMemo(() => (
    inputs
      ? Object.entries(inputs)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, value]) => `${name}:${value}`)
        .join('|')
      : 'none'
  ), [inputs]);

  useEffect(() => {
    if (riveFileError) {
      console.warn(`[${logPrefix}] Failed to load Rive file:`, riveFileError.message);
    }
  }, [logPrefix, riveFileError]);

  useEffect(() => {
    if (!active || !inputs) {
      loopProgress.stopAnimation();
      loopProgress.setValue(0);
      return;
    }

    const duration = mode === 'rain-particles' ? 8500 : 7000;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(loopProgress, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(loopProgress, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();

    return () => {
      loop.stop();
    };
  }, [active, inputs, loopProgress, mode]);

  useEffect(() => {
    if (!riveViewRef || !inputs) return;

    let cancelled = false;

    const syncRive = async () => {
      try {
        await riveViewRef.awaitViewReady();
        if (cancelled) return;

        applyNumberInputs(riveViewRef, inputs, logPrefix);

        if (active) {
          riveViewRef.playIfNeeded();
          await riveViewRef.play();
        } else {
          await riveViewRef.pause();
        }
      } catch (error) {
        if (!cancelled) {
          console.warn(
            `[${logPrefix}] Failed to sync Rive playback:`,
            error instanceof Error ? error.message : error,
          );
        }
      }
    };

    void syncRive();

    return () => {
      cancelled = true;
    };
  }, [active, inputSignature, inputs, logPrefix, riveViewRef]);

  if (!source || !riveFile || !active || !inputs) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`today-${mode}-rive-root`}
      style={[StyleSheet.absoluteFill, styles.container, style]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, getMotionStyle(mode, loopProgress)]}>
        <RiveView
          file={riveFile}
          artboardName={artboardName}
          stateMachineName={stateMachineName}
          autoPlay={active}
          fit={Fit.Cover}
          alignment={Alignment.Center}
          hybridRef={setHybridRef}
          onError={(error) => {
            console.warn(`[${logPrefix}] Rive render error:`, error.message);
          }}
          style={[StyleSheet.absoluteFill, styles.riveSurface]}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  riveSurface: {
    backgroundColor: 'transparent',
  },
});
