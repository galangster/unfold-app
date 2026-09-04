import { useCallback, useEffect, useRef, useState } from 'react';
import * as Brightness from 'expo-brightness';
import { useIsFocused } from 'expo-router';
import { useUnfoldStore } from '@/lib/store';
import { logger } from '@/lib/logger';

export const MIN_READER_BRIGHTNESS = 0.15;
export const MAX_READER_BRIGHTNESS = 1;

export function clampReaderBrightness(value: number): number {
  if (!Number.isFinite(value)) return MIN_READER_BRIGHTNESS;
  return Math.min(MAX_READER_BRIGHTNESS, Math.max(MIN_READER_BRIGHTNESS, value));
}

export function useReaderBrightness() {
  const storedBrightness = useUnfoldStore((state) => state.readerBrightness ?? null);
  const setStoredBrightness = useUnfoldStore((state) => state.setReaderBrightness);
  // The sheet that calls this hook stays mounted (only hidden) while the
  // reader tab is open, so the override must track screen focus rather than
  // mount/unmount — otherwise it leaks into other tabs.
  const isFocused = useIsFocused();
  const [brightnessAvailable, setBrightnessAvailable] = useState(true);
  const [prepared, setPrepared] = useState(false);
  const originalBrightnessRef = useRef<number | null>(null);
  const changedReaderBrightnessRef = useRef(false);
  // Latest persisted value, so the async prepare step can read what hydrated
  // during its awaits without re-running; and the last value this hook applied,
  // so a value it just set (or already applied) is never applied twice.
  const storedBrightnessRef = useRef(storedBrightness);
  storedBrightnessRef.current = storedBrightness;
  const appliedBrightnessRef = useRef<number | null>(null);

  const applyStoredBrightness = useCallback(async (value: number) => {
    const clamped = clampReaderBrightness(value);
    if (appliedBrightnessRef.current === clamped) return;
    appliedBrightnessRef.current = clamped;
    changedReaderBrightnessRef.current = true;
    await Brightness.setBrightnessAsync(clamped);
  }, []);

  // Apply the override only while the reader is focused, and restore the
  // device's original brightness on blur (not just on unmount).
  useEffect(() => {
    if (!isFocused) return;

    let cancelled = false;

    async function prepareBrightness() {
      try {
        const available = await Brightness.isAvailableAsync();
        if (cancelled) return;
        setBrightnessAvailable(available);

        if (!available) return;

        const originalBrightness = await Brightness.getBrightnessAsync();
        if (cancelled) return;
        originalBrightnessRef.current = originalBrightness;

        const stored = storedBrightnessRef.current;
        if (stored != null) {
          await applyStoredBrightness(stored);
        }
        if (!cancelled) setPrepared(true);
      } catch (error) {
        if (!cancelled) {
          setBrightnessAvailable(false);
          logger.warn('[reader-brightness] Unable to prepare reader brightness', error);
        }
      }
    }

    void prepareBrightness();

    return () => {
      cancelled = true;
      setPrepared(false);
      appliedBrightnessRef.current = null;
      if (changedReaderBrightnessRef.current && originalBrightnessRef.current != null) {
        changedReaderBrightnessRef.current = false;
        Brightness.setBrightnessAsync(originalBrightnessRef.current).catch((error) => {
          logger.warn('[reader-brightness] Unable to restore original brightness', error);
        });
      }
    };
  }, [isFocused, applyStoredBrightness]);

  // A value that hydrates after prepare finished (async rehydration, a sync
  // pull) is applied once; values this hook set itself are already recorded
  // as applied, so re-renders never re-apply.
  useEffect(() => {
    if (!isFocused || !prepared || !brightnessAvailable || storedBrightness == null) return;
    applyStoredBrightness(storedBrightness).catch((error) => {
      logger.warn('[reader-brightness] Unable to apply stored reader brightness', error);
    });
  }, [isFocused, prepared, brightnessAvailable, storedBrightness, applyStoredBrightness]);

  const setBrightness = useCallback(
    async (value: number) => {
      const clamped = clampReaderBrightness(value);
      setStoredBrightness(clamped);

      if (!isFocused || !brightnessAvailable) return;

      try {
        appliedBrightnessRef.current = clamped;
        changedReaderBrightnessRef.current = true;
        await Brightness.setBrightnessAsync(clamped);
      } catch (error) {
        logger.warn('[reader-brightness] Unable to set reader brightness', error);
      }
    },
    [isFocused, brightnessAvailable, setStoredBrightness],
  );

  const resetBrightness = useCallback(async () => {
    setStoredBrightness(null);
    appliedBrightnessRef.current = null;

    if (!isFocused || !brightnessAvailable || originalBrightnessRef.current == null) return;

    try {
      changedReaderBrightnessRef.current = false;
      await Brightness.setBrightnessAsync(originalBrightnessRef.current);
    } catch (error) {
      logger.warn('[reader-brightness] Unable to reset reader brightness', error);
    }
  }, [isFocused, brightnessAvailable, setStoredBrightness]);

  return {
    brightness: storedBrightness,
    brightnessAvailable,
    setBrightness,
    resetBrightness,
  };
}
