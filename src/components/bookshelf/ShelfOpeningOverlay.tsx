import { useCallback, useEffect, useRef } from "react";
import {
  AppState,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { FullWindowOverlay } from "react-native-screens";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import {
  clearShelfOpening,
  useShelfOpening,
  type ShelfOpening,
} from "@/lib/shelf-opening";
import { SeriesBookCover } from "./SeriesBookCover";

function Opening({ session }: { session: ShelfOpening }) {
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(0);
  const visibility = useSharedValue(1);
  const navigated = useRef(false);
  const navigate = useRef(session.navigate);
  const cancelled = useRef(false);
  const finish = useCallback(() => clearShelfOpening(session.id), [session.id]);
  const proceed = useCallback(() => {
    if (cancelled.current || navigated.current) return;
    const active = useShelfOpening.getState().session;
    if (active?.id !== session.id) return;
    navigated.current = true;
    useShelfOpening.setState({ session: { ...active, committed: true } });
    navigate.current(session.id);
  }, [session.id]);
  useEffect(() => {
    // Let the native cover mount before the first moving frame.
    const frame = requestAnimationFrame(() => {
      progress.value = withDelay(
        100,
        withTiming(
          1,
          { duration: 620, easing: Easing.bezier(0.22, 0.68, 0.1, 1) },
          (done) => {
            if (done) runOnJS(proceed)();
          },
        ),
      );
    });
    const timeout = setTimeout(() => {
      proceed();
      finish();
    }, 2400);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        cancelled.current = true;
        cancelAnimation(progress);
        finish();
      }
    });
    return () => {
      cancelled.current = true;
      cancelAnimation(progress);
      cancelAnimation(visibility);
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      subscription.remove();
    };
  }, [finish, proceed, progress, visibility]);
  useEffect(() => {
    // Keep the paper still while the destination finishes its initial layout.
    if (session.ready)
      visibility.value = withDelay(
        100,
        withTiming(0, { duration: 180 }, (done) => {
          if (done) runOnJS(finish)();
        }),
      );
  }, [session.ready, visibility, finish]);
  const outer = useAnimatedStyle(() => ({ opacity: visibility.value }));
  const backdrop = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.6], [0, 1], "clamp"),
  }));
  const frame = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      transform: [
        {
          translateX: interpolate(
            p,
            [0, 1],
            [session.rect.x, (width - session.rect.width) / 2],
          ),
        },
        {
          translateY: interpolate(
            p,
            [0, 0.18, 1],
            [
              session.rect.y,
              session.rect.y - 14,
              (height - session.rect.height) / 2,
            ],
          ),
        },
        { scaleX: interpolate(p, [0, 1], [1, width / session.rect.width]) },
        { scaleY: interpolate(p, [0, 1], [1, height / session.rect.height]) },
      ],
    };
  });
  const cover = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.6, 0.85, 1], [1, 0.8, 0], "clamp"),
    transform: [
      { perspective: 1600 },
      {
        rotateY: `${interpolate(progress.value, [0, 0.15, 1], [0, -4, -112], "clamp")}deg`,
      },
    ],
  }));
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, outer]}
      pointerEvents="auto"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: session.background },
          backdrop,
        ]}
      />
      <Animated.View
        style={[
          {
            position: "absolute",
            left: 0,
            top: 0,
            width: session.rect.width,
            height: session.rect.height,
          },
          frame,
        ]}
      >
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: session.paperColor, overflow: "hidden" },
          ]}
        />
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { transformOrigin: "left center", backfaceVisibility: "hidden" },
            cover,
          ]}
        >
          <SeriesBookCover
            devotional={session.book}
            width={session.rect.width}
            height={session.rect.height}
          />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

export function ShelfOpeningOverlay() {
  const session = useShelfOpening((state) => state.session);
  if (!session) return null;
  const content = <Opening key={session.id} session={session} />;
  return Platform.OS === "ios" ? (
    <FullWindowOverlay>{content}</FullWindowOverlay>
  ) : (
    content
  );
}
