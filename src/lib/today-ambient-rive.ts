export type TodayAmbientMode = 'none' | 'wind-particles' | 'light-rays' | 'rain-particles';

export type TodayAmbientStateType =
  | 'empty'
  | 'preparing'
  | 'premium-paused'
  | 'unread'
  | 'complete-today'
  | 'tomorrow-locked'
  | 'reveal-ready'
  | 'journey-complete';

export interface TodayAmbientModeInput {
  stateType: TodayAmbientStateType;
  hasReadToday: boolean;
}

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface TodayAmbientRiveInputs {
  lineThickness?: number;
  opacity?: number;
  particleCount?: number;
  spawnRate?: number;
  accentR?: number;
  accentG?: number;
  accentB?: number;
  width?: number;
  height?: number;
  centerMaskRadius?: number;
  centerMaskSoftness?: number;
}

export function getTodayAmbientMode({
  stateType,
  hasReadToday,
}: TodayAmbientModeInput): TodayAmbientMode {
  if (hasReadToday && (stateType === 'complete-today' || stateType === 'tomorrow-locked')) {
    return 'rain-particles';
  }

  return 'none';
}

export function hexToRiveRgb(hex: string): RgbColor {
  const normalized = hex.replace('#', '').trim();
  const full = normalized.length === 3
    ? normalized.split('').map((part) => `${part}${part}`).join('')
    : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return { r: 1, g: 199 / 255, b: 92 / 255 };
  }

  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  };
}

export function getTodayAmbientRiveInputs({
  mode,
  stateType,
  accent,
  width,
  height,
}: {
  mode: TodayAmbientMode;
  stateType: TodayAmbientStateType;
  accent: string;
  width: number;
  height: number;
}): TodayAmbientRiveInputs | null {
  if (mode === 'none') {
    return null;
  }

  const accentRgb = hexToRiveRgb(accent);
  const base = {
    accentR: accentRgb.r,
    accentG: accentRgb.g,
    accentB: accentRgb.b,
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };

  if (mode === 'light-rays') {
    return {
      ...base,
      lineThickness: 1.05,
      opacity: 0.18,
      particleCount: 22,
      // Rive contract from asset handoff: higher value = slower spawning.
      // Keep this quiet enough to feel ambient, not like a foreground effect.
      spawnRate: 0.9,
      centerMaskRadius: 0.2,
      centerMaskSoftness: 0.32,
    };
  }

  if (mode === 'rain-particles') {
    const isTomorrowLocked = stateType === 'tomorrow-locked';

    return {
      ...base,
      lineThickness: isTomorrowLocked ? 0.55 : 0.65,
      opacity: isTomorrowLocked ? 0.065 : 0.085,
      particleCount: isTomorrowLocked ? 8 : 10,
      // Higher value = slower spawning. Keep fewer elements on-screen so the
      // native text and frosted cards read as the foreground.
      spawnRate: isTomorrowLocked ? 2.05 : 1.85,
    };
  }

  return base;
}

export function getTodayLightRayInputs({
  stateType,
  accent,
  width,
  height,
}: {
  stateType: TodayAmbientStateType;
  accent: string;
  width: number;
  height: number;
}): TodayAmbientRiveInputs | null {
  const mode = getTodayAmbientMode({ stateType, hasReadToday: false });
  if (mode !== 'light-rays') return null;

  return getTodayAmbientRiveInputs({ mode, stateType, accent, width, height });
}
