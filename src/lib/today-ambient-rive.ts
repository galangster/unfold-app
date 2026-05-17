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

export interface CompletedBottomGlowInput {
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
  if (hasReadToday && (
    stateType === 'complete-today'
    || stateType === 'tomorrow-locked'
    || stateType === 'journey-complete'
  )) {
    return 'rain-particles';
  }

  return 'none';
}

export function shouldShowCompletedBottomGlow({ hasReadToday }: CompletedBottomGlowInput): boolean {
  return hasReadToday;
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

  // Current bundled .riv files play correctly as self-contained white ambient
  // loops, but their apparent `accentR/G/B` strings are not exposed as runtime
  // state-machine inputs in React Native. Until the animator returns updated
  // files with real color controls, pass no numeric inputs so the runtime stays
  // warning-free and the animation remains intentionally white.
  return {};
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
