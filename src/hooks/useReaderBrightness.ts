import { useCallback, useEffect, useRef, useState } from 'react';
import * as Brightness from 'expo-brightness';
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
  const [brightnessAvailable, setBrightnessAvailable] = useState(true);
  const originalBrightnessRef = useRef<number | null>(null);
  const changedReaderBrightnessRef = useRef(false);

  useEffect(() => {
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

        if (storedBrightness != null) {
          const clamped = clampReaderBrightness(storedBrightness);
          changedReaderBrightnessRef.current = true;
          await Brightness.setBrightnessAsync(clamped);
        }
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
      if (changedReaderBrightnessRef.current && originalBrightnessRef.current != null) {
        Brightness.setBrightnessAsync(originalBrightnessRef.current).catch((error) => {
          logger.warn('[reader-brightness] Unable to restore original brightness', error);
        });
      }
    };
  }, []);

  const setBrightness = useCallback(
    async (value: number) => {
      const clamped = clampReaderBrightness(value);
      setStoredBrightness(clamped);

      if (!brightnessAvailable) return;

      try {
        changedReaderBrightnessRef.current = true;
        await Brightness.setBrightnessAsync(clamped);
      } catch (error) {
        logger.warn('[reader-brightness] Unable to set reader brightness', error);
      }
    },
    [brightnessAvailable, setStoredBrightness],
  );

  const resetBrightness = useCallback(async () => {
    setStoredBrightness(null);

    if (!brightnessAvailable || originalBrightnessRef.current == null) return;

    try {
      changedReaderBrightnessRef.current = false;
      await Brightness.setBrightnessAsync(originalBrightnessRef.current);
    } catch (error) {
      logger.warn('[reader-brightness] Unable to reset reader brightness', error);
    }
  }, [brightnessAvailable, setStoredBrightness]);

  return {
    brightness: storedBrightness,
    brightnessAvailable,
    setBrightness,
    resetBrightness,
  };
}
