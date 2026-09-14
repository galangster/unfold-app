/** @jsxImportSource react */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { createAudioPlayer } from 'expo-audio';
import type { AudioStatus } from 'expo-audio/build/Audio.types';
import type { AudioPlayer } from 'expo-audio/build/AudioModule.types';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CompanionOrb } from '@/components/CompanionOrb';
import { BooksIcon, PauseIcon, PlayIcon, XIcon } from '@/components/icons';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { MUSIC_ANNOUNCEMENT } from '@/lib/music-announcement';
import {
  dismissAnnouncementPages,
  recordAnnouncement,
  type FeatureAnnouncementPage,
} from '@/lib/feature-announcements';
import { stopAmbientSound } from '@/lib/ambient-audio';
import { useAmbientAudioState } from '@/lib/ambient-audio-state';
import { acquireAudioSession, retryAudioAfterPermanentInterruption, type AudioSessionLease } from '@/lib/audio-session-registry';
import { AmbientText } from './AmbientText';

type PreviewStatus = 'idle' | 'loading' | 'playing' | 'ended' | 'error';

function CompanionVisual({ accent }: { accent: string }) {
  return (
    <View style={styles.visual} accessibilityElementsHidden importantForAccessibility="no">
      <CompanionOrb accentColor={accent} size={88} expression="gentle" idleStyle="calm" />
    </View>
  );
}

function ReflectionExample({
  text,
  muted,
  border,
}: {
  text: string;
  muted: string;
  border: string;
}) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.example, { borderColor: border }]}
    >
      <AmbientText style={[styles.exampleLabel, { color: muted }]}>Previous</AmbientText>
      <AmbientText style={[styles.exampleLabel, { color: text }]}>Next</AmbientText>
    </View>
  );
}

export function FeatureAnnouncement({
  visible,
  pages,
  actionLabel,
  previewAllowed,
  onClose,
  onTry,
}: {
  visible: boolean;
  pages: readonly FeatureAnnouncementPage[];
  actionLabel: string;
  previewAllowed: boolean;
  onClose: () => void;
  onTry: (songId: typeof MUSIC_ANNOUNCEMENT.songId) => boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const timerStatus = useAmbientAudioState((state) => state.timerStatus);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<PreviewStatus>('idle');
  const [elapsed, setElapsed] = useState(0);
  const revision = useRef(0);
  const playerRef = useRef<AudioPlayer | null>(null);
  const leaseRef = useRef<AudioSessionLease | null>(null);
  const statusSubscription = useRef<{ remove: () => void } | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const headingRef = useRef<React.ElementRef<typeof AmbientText>>(null);
  const page = pages[Math.min(index, Math.max(pages.length - 1, 0))];
  const last = pages.length === 0 || index >= pages.length - 1;
  const onMusicPage = page?.kind === 'music';

  const stopPreview = useCallback(() => {
    revision.current += 1;
    if (watchdog.current) clearTimeout(watchdog.current);
    if (ticker.current) clearInterval(ticker.current);
    watchdog.current = null;
    ticker.current = null;
    statusSubscription.current?.remove();
    statusSubscription.current = null;
    const current = playerRef.current;
    playerRef.current = null;
    if (current) {
      try {
        current.pause();
      } catch {
        // Preview player may already be invalid.
      }
      try {
        current.remove();
      } catch {
        // Preview player may already be invalid.
      }
    }
    leaseRef.current?.release();
    leaseRef.current = null;
    setStatus('idle');
    setElapsed(0);
  }, []);

  useEffect(() => {
    if (visible) setIndex(0);
  }, [visible, pages]);

  useEffect(() => {
    if (visible && page) {
      recordAnnouncement(page.id, 'seen');
      const frame = requestAnimationFrame(() => {
        const handle = findNodeHandle(headingRef.current);
        if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
      });
      return () => cancelAnimationFrame(frame);
    }
    stopPreview();
  }, [page, stopPreview, visible]);

  useEffect(() => {
    if (!onMusicPage) stopPreview();
  }, [onMusicPage, stopPreview]);

  useEffect(() => {
    if (!previewAllowed) stopPreview();
  }, [previewAllowed, stopPreview]);

  useEffect(() => {
    if (timerStatus === 'ended') stopPreview();
  }, [stopPreview, timerStatus]);

  useEffect(() => () => stopPreview(), [stopPreview]);

  const fail = useCallback(() => {
    stopPreview();
    setStatus('error');
  }, [stopPreview]);

  const togglePreview = useCallback(async () => {
    if (!previewAllowed || !onMusicPage) return;
    if (status === 'playing' || status === 'loading') {
      stopPreview();
      return;
    }
    retryAudioAfterPermanentInterruption();
    stopPreview();
    stopAmbientSound();
    const attempt = ++revision.current;
    setStatus('loading');
    setElapsed(0);
    watchdog.current = setTimeout(() => {
      if (attempt === revision.current) fail();
    }, 8_000);
    try {
      const lease = acquireAudioSession({
        owner: 'ambient',
        mode: {
          playsInSilentMode: true,
          shouldPlayInBackground: false,
          allowsRecording: false,
          allowsBackgroundRecording: false,
          shouldRouteThroughEarpiece: false,
          interruptionMode: 'doNotMix',
        },
        onInvalidated: () => {
          if (attempt === revision.current) stopPreview();
        },
      });
      if (!lease) {
        fail();
        return;
      }
      leaseRef.current = lease;
      const configured = await lease.configure();
      if (!configured || attempt !== revision.current || !lease.isActive()) return;
      let sawPlaying = false;
      const player = createAudioPlayer(MUSIC_ANNOUNCEMENT.previewSource, {
        updateInterval: 250,
        downloadFirst: false,
        keepAudioSessionActive: true,
        autoResumeOnInterruption: false,
      });
      playerRef.current = player;
      player.volume = 0.25;
      player.loop = false;
      statusSubscription.current = player.addListener('playbackStatusUpdate', (native: AudioStatus) => {
        if (attempt !== revision.current || !lease.isActive()) return;
        if (native.error || native.mediaServicesDidReset) {
          fail();
          return;
        }
        if (native.playing) {
          sawPlaying = true;
          setStatus('playing');
          if (watchdog.current) clearTimeout(watchdog.current);
          watchdog.current = null;
        }
        if (sawPlaying && !native.playing && !native.didJustFinish) {
          stopPreview();
          return;
        }
        if (native.didJustFinish) {
          stopPreview();
          setStatus('ended');
          setElapsed(MUSIC_ANNOUNCEMENT.previewSeconds);
        }
      });
      player.play();
      ticker.current = setInterval(() => {
        if (attempt !== revision.current) return;
        const currentTime = player.currentTime ?? 0;
        setElapsed(currentTime);
        if (currentTime >= MUSIC_ANNOUNCEMENT.previewSeconds) {
          stopPreview();
          setStatus('ended');
          setElapsed(MUSIC_ANNOUNCEMENT.previewSeconds);
        }
      }, 250);
    } catch {
      if (attempt === revision.current) fail();
    }
  }, [fail, onMusicPage, previewAllowed, status, stopPreview]);

  const finish = (outcome: 'dismissed' | 'tried' = 'dismissed') => {
    stopPreview();
    if (page && outcome === 'tried') recordAnnouncement(page.id, outcome);
    dismissAnnouncementPages(pages.slice(index + 1).map((item) => item.id));
    onClose();
  };

  const goNext = () => {
    if (last) {
      finish();
      return;
    }
    stopPreview();
    setIndex((current) => current + 1);
  };

  const progress = Math.min(1, elapsed / MUSIC_ANNOUNCEMENT.previewSeconds);
  const previewLabel =
    status === 'loading'
      ? 'Cancel preview'
      : status === 'playing'
        ? 'Stop preview'
        : status === 'error'
          ? 'Retry preview'
          : 'Play music preview';
  const statusText =
    status === 'error'
      ? 'Could not play. Try again.'
      : status === 'loading'
        ? 'Starting…'
        : status === 'playing'
          ? 'Take a moment and listen.'
          : status === 'ended'
            ? 'Listen again, if you like.'
            : 'Press play for a little taste.';

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={() => finish()}
    >
      <View style={styles.backdrop}>
        <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={() => finish()} />
        <View
          accessible={false}
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors.backgroundElevated,
              paddingBottom: Math.max(insets.bottom, 20),
              maxHeight: height - insets.top - 16,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close announcement"
            onPress={() => finish()}
            style={styles.close}
          >
            <XIcon size={19} color={colors.textMuted} />
          </Pressable>
          {pages.length > 0 ? (
            <AmbientText
              accessibilityRole="text"
              accessibilityLabel={`Page ${index + 1} of ${pages.length}`}
              style={[styles.count, { color: colors.textMuted }]}
            >
              {index + 1} of {pages.length}
            </AmbientText>
          ) : null}
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: Math.max(160, height - insets.top - insets.bottom - 120), flexShrink: 1 }}
          >
          {page ? (
            <>
              {page.kind === 'bookshelf' ? (
                <View style={styles.visual} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <BooksIcon size={88} color={colors.accent} weight="light" />
                </View>
              ) : null}
              {page.kind === 'companion' ? <CompanionVisual accent={colors.accent} /> : null}
              <AmbientText
                ref={headingRef}
                accessibilityRole="header"
                style={[styles.heading, { color: colors.text }]}
              >
                {page.title}
              </AmbientText>
              <AmbientText style={[styles.body, { color: colors.textMuted }]}>
                {page.body}
              </AmbientText>
              {page.kind === 'music' ? (
                <View style={[styles.taste, { borderColor: colors.border }]}>
                  <View style={styles.tasteTop}>
                    <AmbientText style={[styles.meta, { color: colors.text }]}>
                      {MUSIC_ANNOUNCEMENT.songName}
                    </AmbientText>
                    <AmbientText style={[styles.meta, { color: colors.textMuted }]}>
                      {MUSIC_ANNOUNCEMENT.previewSeconds}-second preview
                    </AmbientText>
                  </View>
                  <View style={styles.tasteControls}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={previewLabel}
                      accessibilityState={{ busy: status === 'loading' }}
                      onPress={togglePreview}
                      style={[styles.play, { backgroundColor: colors.accent }]}
                    >
                      {status === 'playing' ? (
                        <PauseIcon size={23} color={colors.background} />
                      ) : (
                        <PlayIcon size={23} color={colors.background} />
                      )}
                    </Pressable>
                    <View style={styles.waveform} accessibilityElementsHidden>
                      {MUSIC_ANNOUNCEMENT.waveform.map((height, waveIndex) => {
                        const heard = waveIndex / MUSIC_ANNOUNCEMENT.waveform.length < progress;
                        return (
                          <View
                            key={`${height}-${waveIndex}`}
                            style={{
                              width: 2,
                              height,
                              borderRadius: 2,
                              backgroundColor: heard ? colors.accent : colors.textMuted,
                              opacity: heard ? 1 : 0.45,
                            }}
                          />
                        );
                      })}
                    </View>
                  </View>
                  <View style={styles.tasteStatus}>
                    <AmbientText accessibilityRole="text" style={[styles.meta, { color: colors.textMuted }]}>
                      {statusText}
                    </AmbientText>
                    <View style={styles.elapsedSlot}>
                      <AmbientText
                        style={[styles.meta, styles.elapsedReserve]}
                        importantForAccessibility="no"
                        accessibilityElementsHidden
                      >
                        0:{String(MUSIC_ANNOUNCEMENT.previewSeconds).padStart(2, '0')}
                      </AmbientText>
                      <AmbientText style={[styles.meta, styles.elapsedValue, { color: colors.textMuted }]}>
                        0:{String(Math.floor(elapsed)).padStart(2, '0')}
                      </AmbientText>
                    </View>
                  </View>
                </View>
              ) : null}
              {page.kind === 'reflection' ? (
                <ReflectionExample text={colors.text} muted={colors.textMuted} border={colors.border} />
              ) : null}
              {onMusicPage ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    stopPreview();
                    if (onTry(MUSIC_ANNOUNCEMENT.songId)) finish('tried');
                  }}
                  style={[styles.primary, { backgroundColor: colors.accent }]}
                >
                  <AmbientText style={[styles.action, { color: colors.background }]}>
                    {actionLabel}
                  </AmbientText>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={last ? 'Done' : 'Next'}
                onPress={goNext}
                style={onMusicPage ? styles.later : [styles.primary, styles.next, { backgroundColor: colors.accent }]}
              >
                <AmbientText
                  style={[styles.action, { color: onMusicPage ? colors.text : colors.background }]}
                >
                  {last ? 'Done' : 'Next'}
                </AmbientText>
              </Pressable>
            </>
          ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 36,
  },
  close: {
    position: 'absolute',
    zIndex: 1,
    right: 12,
    top: 16,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    paddingRight: 48,
    fontFamily: FontFamily.ui,
    fontSize: 12,
    marginBottom: 14,
  },
  visual: { alignItems: 'center', marginBottom: 20 },
  heading: {
    fontFamily: FontFamily.display,
    fontSize: 34,
    lineHeight: 38,
    maxWidth: 280,
    marginBottom: 16,
  },
  body: { fontFamily: FontFamily.body, fontSize: 15, lineHeight: 25 },
  example: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 28,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  exampleLabel: { fontFamily: FontFamily.ui, fontSize: 15 },
  taste: { marginVertical: 28, paddingVertical: 18, borderTopWidth: 1, borderBottomWidth: 1 },
  tasteTop: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  tasteControls: { flexDirection: 'row', alignItems: 'center', gap: 18, marginVertical: 16 },
  play: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveform: { flex: 1, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 3 },
  tasteStatus: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  meta: { fontFamily: FontFamily.ui, fontSize: 12 },
  elapsedSlot: { alignItems: 'flex-end', justifyContent: 'center' },
  elapsedReserve: { fontVariant: ['tabular-nums'], color: 'transparent' },
  elapsedValue: { fontVariant: ['tabular-nums'], position: 'absolute', right: 0 },
  primary: {
    minHeight: 50,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  next: { marginTop: 28 },
  later: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  action: { fontFamily: FontFamily.ui, fontSize: 15, textAlign: 'center' },
});
