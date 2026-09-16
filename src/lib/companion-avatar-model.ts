/**
 * Warm-pearl Companion geometry. Ported from the approved Experience Studio
 * face. Arrow and hat stay omitted. Halo is an Unfold addition.
 *
 * Eye paths are computed once per expression. Animation uses Reanimated
 * transforms and opacity only — no per-frame path rebuilding.
 */

export const HEAD = { cx: 25.8, cy: 25.8, r: 22.2 } as const;

export const VIEWBOX = { x: -8, y: -18, w: 68, h: 78 } as const;
export const VIEWBOX_ATTR = `${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`;

export const COMPANION_EXPRESSIONS = [
  'gentle',
  'thoughtful',
  'encouraging',
  'welcome',
] as const;

export type CompanionExpression = (typeof COMPANION_EXPRESSIONS)[number];

export const PEARL = {
  lit: '#FFF9F0',
  mid: '#E6D7C2',
  dark: '#9C866D',
  eye: '#493D32',
  eyeDeep: '#211B17',
  halo: '#D0AA5F',
} as const;

/** Approved morph: whole character becomes three equal spheres. */
export const COMPANION_MORPH_MS = 520;
export const COMPANION_IDENTITY_OUT_MS = 140;
/** Center sphere reunion delay in CompanionAvatar — eyes fade in with it. */
export const COMPANION_REUNION_CENTER_DELAY_MS = 75;
export const COMPANION_IDENTITY_IN_MS = COMPANION_MORPH_MS;
export const COMPANION_IDENTITY_IN_DELAY_MS = COMPANION_REUNION_CENTER_DELAY_MS;
export const COMPANION_SPHERE_SCALE = 0.27;
export const COMPANION_OUTER_REST_SCALE = 0.72;
export const COMPANION_SPLIT_X = 17.5;
export const COMPANION_THINKING_MS = 1900;
export const COMPANION_THINKING_DELAYS_MS = [0, 240, 480] as const;
export const COMPANION_THINKING_Y = -3.8;

export type CompanionIdleGestureName =
  | 'curiousPeek'
  | 'softDoubleHop'
  | 'haloGlance'
  | 'uprightSpin';

export type CompanionIdleMotionFrame = {
  readonly timeMs: number;
  readonly bodyX: number;
  readonly bodyY: number;
  readonly bodyScaleX: number;
  readonly bodyScaleY: number;
  readonly faceX: number;
  readonly faceY: number;
  readonly faceScaleX: number;
  readonly faceOpacity: number;
  readonly haloY: number;
  readonly haloRotate: number;
};

export type CompanionIdleMotionCycle = {
  readonly durationMs: number;
  readonly gestures: readonly {
    readonly name: CompanionIdleGestureName;
    readonly startMs: number;
    readonly endMs: number;
  }[];
  readonly frames: readonly CompanionIdleMotionFrame[];
};

export const COMPANION_IDLE_NEUTRAL = {
  bodyX: 0,
  bodyY: 0,
  bodyScaleX: 1,
  bodyScaleY: 1,
  faceX: 0,
  faceY: 0,
  faceScaleX: 1,
  faceOpacity: 1,
  haloY: 0,
  haloRotate: 0,
} as const;

function idleFrame(
  timeMs: number,
  values: Partial<Omit<CompanionIdleMotionFrame, 'timeMs'>> = {},
): CompanionIdleMotionFrame {
  return { timeMs, ...COMPANION_IDLE_NEUTRAL, ...values };
}

/**
 * Authored in VIEWBOX units so native and preview renderers share one motion
 * contract. Gestures start at t=0 with short rests between them so the
 * Companion tab feels alive immediately. The body stays upright; only the
 * halo rotates during the turn.
 */
export const COMPANION_IDLE_CYCLES = {
  calm: {
    durationMs: 11_200,
    gestures: [
      { name: 'curiousPeek', startMs: 0, endMs: 3_000 },
      { name: 'softDoubleHop', startMs: 3_600, endMs: 5_400 },
      { name: 'haloGlance', startMs: 6_000, endMs: 7_600 },
      { name: 'uprightSpin', startMs: 8_200, endMs: 10_600 },
    ],
    frames: [
      idleFrame(0),
      idleFrame(180, { faceX: -0.65 }),
      idleFrame(400, { bodyX: -0.45, faceX: -0.85 }),
      idleFrame(750, { bodyX: -0.45, faceX: -0.85 }),
      idleFrame(1_030, { bodyX: -0.25, faceX: 0.8 }),
      idleFrame(1_280, { bodyX: 0.35, faceX: 0.8 }),
      idleFrame(1_620, { bodyX: 0.35, faceX: 0.8 }),
      idleFrame(1_920, { bodyX: 0.2 }),
      idleFrame(2_220),
      idleFrame(3_000),
      idleFrame(3_600),
      idleFrame(3_780, { bodyY: 0.35, bodyScaleX: 1.014, bodyScaleY: 0.986 }),
      idleFrame(4_040, { bodyY: -2.2, bodyScaleX: 0.995, bodyScaleY: 1.005, haloY: 0.55 }),
      idleFrame(4_280, { bodyY: 0.28, bodyScaleX: 1.018, bodyScaleY: 0.982, haloY: -0.22 }),
      idleFrame(4_520, { bodyY: -0.85, haloY: 0.28 }),
      idleFrame(4_780, { bodyY: 0.18, bodyScaleX: 1.01, bodyScaleY: 0.99, haloY: -0.12 }),
      idleFrame(5_000),
      idleFrame(5_400),
      idleFrame(6_000),
      idleFrame(6_180, { faceY: -0.55 }),
      idleFrame(6_380, { faceY: -0.75, haloY: -0.5, haloRotate: 0.8 }),
      idleFrame(6_750, { faceY: -0.75, haloY: -0.5, haloRotate: 0.8 }),
      idleFrame(7_020, { faceY: -0.65, haloY: 0.08, haloRotate: -0.2 }),
      idleFrame(7_280, { faceY: -0.25 }),
      idleFrame(7_600),
      idleFrame(8_200),
      idleFrame(8_390, { bodyY: 0.45, faceX: -1.5, haloRotate: -1.5 }),
      idleFrame(8_800, { bodyY: -2.1, faceX: 11, faceScaleX: 0.7, haloY: -0.5, haloRotate: -4 }),
      idleFrame(9_220, { bodyY: -3.7, faceX: 20, faceScaleX: 0.08, faceOpacity: 0, haloRotate: 4.5 }),
      idleFrame(9_500, { bodyY: 0.4, faceX: -20, faceScaleX: 0.08, faceOpacity: 0, haloY: 0.2, haloRotate: 3 }),
      idleFrame(9_920, { bodyY: -0.25, faceX: -9, faceScaleX: 0.8, haloRotate: -1.5 }),
      idleFrame(10_600),
      idleFrame(11_200),
    ],
  },
  joyful: {
    durationMs: 9_920,
    gestures: [
      { name: 'curiousPeek', startMs: 0, endMs: 3_000 },
      { name: 'softDoubleHop', startMs: 3_280, endMs: 5_080 },
      { name: 'haloGlance', startMs: 5_360, endMs: 6_960 },
      { name: 'uprightSpin', startMs: 7_240, endMs: 9_640 },
    ],
    frames: [
      idleFrame(0),
      idleFrame(170, { faceX: -1.15 }),
      idleFrame(400, { bodyX: -0.9, faceX: -1.55 }),
      idleFrame(730, { bodyX: -0.9, faceX: -1.55 }),
      idleFrame(1_000, { bodyX: -0.45, faceX: 1.5 }),
      idleFrame(1_250, { bodyX: 0.75, faceX: 1.5 }),
      idleFrame(1_580, { bodyX: 0.75, faceX: 1.5 }),
      idleFrame(1_900, { bodyX: 0.35 }),
      idleFrame(2_200),
      idleFrame(3_000),
      idleFrame(3_280),
      idleFrame(3_460, { bodyY: 0.7, bodyScaleX: 1.03, bodyScaleY: 0.97 }),
      idleFrame(3_740, { bodyY: -4.1, bodyScaleX: 0.99, bodyScaleY: 1.01, haloY: 0.9 }),
      idleFrame(4_000, { bodyY: 0.55, bodyScaleX: 1.035, bodyScaleY: 0.965, haloY: -0.45 }),
      idleFrame(4_260, { bodyY: -1.7, haloY: 0.48 }),
      idleFrame(4_520, { bodyY: 0.28, bodyScaleX: 1.018, bodyScaleY: 0.982, haloY: -0.22 }),
      idleFrame(4_780),
      idleFrame(5_080),
      idleFrame(5_360),
      idleFrame(5_530, { faceY: -0.85 }),
      idleFrame(5_740, { faceY: -1.15, haloY: -1.15, haloRotate: 1.8 }),
      idleFrame(6_110, { faceY: -1.15, haloY: -1.15, haloRotate: 1.8 }),
      idleFrame(6_370, { faceY: -0.95, haloY: 0.16, haloRotate: -0.4 }),
      idleFrame(6_640, { faceY: -0.35 }),
      idleFrame(6_960),
      idleFrame(7_240),
      idleFrame(7_430, { bodyY: 0.8, faceX: -2.2, haloRotate: -2.5 }),
      idleFrame(7_840, { bodyY: -3.6, faceX: 11, faceScaleX: 0.7, haloY: -0.8, haloRotate: -5 }),
      idleFrame(8_260, { bodyY: -6.5, faceX: 20, faceScaleX: 0.08, faceOpacity: 0, haloRotate: 6 }),
      idleFrame(8_540, { bodyY: 0.7, faceX: -20, faceScaleX: 0.08, faceOpacity: 0, haloY: 0.3, haloRotate: 4 }),
      idleFrame(8_960, { bodyY: -0.45, faceX: -9, faceScaleX: 0.8, haloRotate: -2 }),
      idleFrame(9_640),
      idleFrame(9_920),
    ],
  },
} as const satisfies Record<'calm' | 'joyful', CompanionIdleMotionCycle>;

type EyeDials = {
  readonly w: number;
  readonly h: number;
  readonly round: number;
  readonly lean: number;
  readonly lid: number;
  readonly squint: number;
  readonly gap: number;
  readonly asym: number;
  readonly gazeY: number;
  readonly lidAsym: number;
  readonly gazeX: number;
};

type Gaze = {
  readonly yaw: number;
  readonly pitch: number;
};

export type EyePose = {
  readonly visible: boolean;
  readonly matrix: string;
  readonly d: string;
  readonly lidY: number;
  readonly lidH: number;
};

export type EyePlacement = {
  readonly left: EyePose;
  readonly right: EyePose;
};

const STATES = {
  curious: {
    w: 6.6,
    h: 10.2,
    round: 0.52,
    lean: 0.3,
    lid: 0,
    squint: 0,
    gap: 8.6,
    asym: 0.24,
    gazeY: -0.08,
    lidAsym: 0,
    gazeX: 0,
  },
  focused: {
    w: 6.2,
    h: 9.2,
    round: 0.62,
    lean: 0.18,
    lid: 0.06,
    squint: 0.1,
    gap: 7.4,
    asym: 0.12,
    gazeY: 0.04,
    lidAsym: 0.04,
    gazeX: 0,
  },
  happy: {
    w: 7.1,
    h: 9.0,
    round: 1,
    lean: 0,
    lid: 0,
    squint: 0.28,
    gap: 8.8,
    asym: 0,
    gazeY: 0.05,
    lidAsym: 0,
    gazeX: 0,
  },
  delighted: {
    w: 7.6,
    h: 10.8,
    round: 0.9,
    lean: 0.1,
    lid: 0,
    squint: 0.04,
    gap: 9.0,
    asym: 0,
    gazeY: -0.1,
    lidAsym: 0,
    gazeX: 0,
  },
} satisfies Record<string, EyeDials>;

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const rad = (d: number): number => (d * Math.PI) / 180;

type EyeSide = -1 | 1;

export function eyePath(p: EyeDials, dir: EyeSide): string {
  const { w, h } = p;
  const L = -w / 2;
  const R = w / 2;
  const B = h / 2;
  const T = -h / 2;
  const r = Math.min(w, h) * 0.32;
  const k = r * 0.55;
  const ax = dir * p.lean * w * 0.28;
  const pw = mix(0.12, 1, p.round) * w * 0.5;
  const sideY = B - r - (B - r - T) * 0.62;
  return `M${L} ${B - r}C${L} ${B - r + k} ${L + r - k} ${B} ${L + r} ${B}L${R - r} ${B}C${R - r + k} ${B} ${R} ${B - r + k} ${R} ${B - r}C${R} ${sideY} ${ax + pw} ${T} ${ax} ${T}C${ax - pw} ${T} ${L} ${sideY} ${L} ${B - r}Z`;
}

export function placeEyes(p: EyeDials, gaze: Gaze): EyePlacement {
  const { cx, cy, r } = HEAD;
  const lon0 = Math.asin(Math.min(0.9, (p.gap / 2 + p.w / 2) / r));
  const lat0 = -0.02 + p.gazeY * 0.35;
  const yaw = rad(gaze.yaw + p.gazeX * 35);
  const pitch = rad(gaze.pitch);
  const lidL = clamp(p.lid + p.lidAsym * 0.35, 0, 1);
  const lidR = clamp(p.lid - p.lidAsym * 0.35, 0, 1);
  const one = (sign: EyeSide, lid: number, hScale: number): EyePose => {
    const lon = sign * lon0 + yaw;
    const lat = lat0 + pitch;
    const x = Math.sin(lon) * Math.cos(lat);
    const y = Math.sin(lat);
    const z = Math.cos(lon) * Math.cos(lat);
    const q: EyeDials = { ...p, h: p.h * hScale };
    return {
      visible: z >= 0.02,
      matrix: `matrix(${Math.cos(lon).toFixed(3)} 0 ${(-Math.sin(lat) * Math.sin(lon)).toFixed(3)} ${Math.cos(lat).toFixed(3)} ${(cx + r * x).toFixed(3)} ${(cy + r * y).toFixed(3)})`,
      d: eyePath(q, sign),
      lidY: -q.h / 2 + q.h * lid,
      lidH: Math.max(0, q.h * (1 - lid - p.squint)),
    };
  };
  return {
    left: one(-1, lidL, 1 + 0.12 * p.asym),
    right: one(1, lidR, 1 - 0.12 * p.asym),
  };
}

export function placeHalo(yaw: number): string {
  const tilt = yaw * 0.12;
  return `translate(${tilt.toFixed(2)} ${(-2.4).toFixed(2)}) rotate(${tilt.toFixed(2)} ${HEAD.cx} ${HEAD.cy - HEAD.r - 6})`;
}

export const HALO = {
  cx: HEAD.cx,
  cy: HEAD.cy - HEAD.r - 6.2,
  rx: 15.4,
  ry: 4.1,
  strokeWidth: 1.15,
  opacity: 0.96,
  transform: placeHalo(0),
} as const;

const EXPRESSION_DIALS: Record<CompanionExpression, { dials: EyeDials; gaze: Gaze }> = {
  gentle: { dials: STATES.curious, gaze: { yaw: 0, pitch: 0 } },
  thoughtful: { dials: STATES.focused, gaze: { yaw: 0, pitch: 0 } },
  encouraging: { dials: STATES.happy, gaze: { yaw: 0, pitch: 0 } },
  welcome: { dials: STATES.delighted, gaze: { yaw: 0, pitch: -4 } },
};

export const COMPANION_EYES: Record<CompanionExpression, EyePlacement> = {
  gentle: placeEyes(EXPRESSION_DIALS.gentle.dials, EXPRESSION_DIALS.gentle.gaze),
  thoughtful: placeEyes(EXPRESSION_DIALS.thoughtful.dials, EXPRESSION_DIALS.thoughtful.gaze),
  encouraging: placeEyes(EXPRESSION_DIALS.encouraging.dials, EXPRESSION_DIALS.encouraging.gaze),
  welcome: placeEyes(EXPRESSION_DIALS.welcome.dials, EXPRESSION_DIALS.welcome.gaze),
};

export type CompanionLayout = {
  size: number;
  viewScale: number;
  stageWidth: number;
  stageLeft: number;
  headCenterX: number;
  headCenterY: number;
  sphereDiameter: number;
  splitPx: number;
};

export function companionLayout(size: number): CompanionLayout {
  const viewScale = size / VIEWBOX.h;
  const stageWidth = VIEWBOX.w * viewScale;
  return {
    size,
    viewScale,
    stageWidth,
    stageLeft: (size - stageWidth) / 2,
    headCenterX: (HEAD.cx - VIEWBOX.x) * viewScale,
    headCenterY: (HEAD.cy - VIEWBOX.y) * viewScale,
    sphereDiameter: HEAD.r * 2 * viewScale,
    splitPx: COMPANION_SPLIT_X * viewScale,
  };
}
