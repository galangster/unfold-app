import { Skia } from '@shopify/react-native-skia';
import type { SkRuntimeEffect } from '@shopify/react-native-skia';

import type { RevealGradientVariant } from '@/lib/reveal-gradient-palette';

const UNIFORMS = `
uniform float2 u_res;
uniform float u_t;
layout(color) uniform float4 u_bg;
layout(color) uniform float4 u_low;
layout(color) uniform float4 u_mid;
layout(color) uniform float4 u_high;
layout(color) uniform float4 u_paper;
`;

const NOISE = `
float hash21(float2 p) {
  return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453);
}
float vnoise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + float2(1.0, 0.0));
  float c = hash21(i + float2(0.0, 1.0));
  float d = hash21(i + float2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm3(float2 p) {
  float v = 0.0;
  float a = 0.5;
  v += a * vnoise(p); p = p * 2.03 + float2(17.0, 9.0); a *= 0.5;
  v += a * vnoise(p); p = p * 2.01 + float2(11.0, 23.0); a *= 0.5;
  v += a * vnoise(p);
  return v;
}
`;

// Crest + Up + Expand, 22 strips, blend 65, facets 35. Vertical slats stay
// after 15px softening because the envelope is a wide upward arrowhead.
const PRISM_MAIN = `
half4 main(float2 fragCoord) {
  float2 uv = fragCoord / u_res;
  float count = 22.0;
  float expand = u_t * 0.48;
  float shifted = uv.x * count - expand;
  float strip = floor(shifted);
  float B = (strip + 0.5 + expand) / count;
  float V = (B - 0.5) * 2.0;
  float crest = 0.5 - 0.5 * cos(min(1.0, abs(V)) * 3.14159265);
  float k = 0.28 + crest * 0.42 + 0.015 * sin(u_t * 0.32);
  float facet = (0.025 * sin(strip * 1.8) + 0.012 * sin(strip * 0.73 + u_t * 0.24));
  float P = 0.22 + 65.0 * 0.008;
  float H = clamp((uv.y - k + 0.22) / P, 0.0, 1.0);
  float z = clamp(0.02 + 0.96 * H + facet, 0.0, 1.0);
  float local = fract(shifted);
  float slat = 0.78 + 0.22 * smoothstep(0.0, 0.14, local) * (1.0 - smoothstep(0.86, 1.0, local));
  float ridge = 1.0 - smoothstep(0.0, 0.2, abs(uv.y - (k - 0.06)));
  float3 col = mix(u_bg.rgb, u_low.rgb, z * 0.55);
  col = mix(col, u_mid.rgb, z * 0.72 * slat);
  col = mix(col, u_high.rgb, z * z * 0.5 * slat);
  col = mix(col, u_paper.rgb, ridge * z * 0.16);
  return half4(col, 1.0);
}
`;

const SKY_MAIN = `
half4 main(float2 fragCoord) {
  float2 uv = fragCoord / u_res;
  float t = u_t * 0.085;
  float2 st = uv * float2(1.6, 2.1) + float2(t * 0.55, t * 0.18);
  float field = fbm3(st);
  float drift = 0.08 * sin(uv.x * 3.1 + t * 0.7);
  float boundary = smoothstep(0.34, 0.62, uv.y + field * 0.28 + drift);
  float haze = smoothstep(0.15, 0.85, uv.y);
  float3 col = mix(u_low.rgb, u_bg.rgb, haze);
  col = mix(col, u_mid.rgb, (1.0 - boundary) * 0.7);
  col = mix(col, u_high.rgb, (1.0 - boundary) * field * 0.35);
  col = mix(col, u_paper.rgb, (1.0 - boundary) * field * field * 0.1);
  return half4(col, 1.0);
}
`;

const FLOW_MAIN = `
half4 main(float2 fragCoord) {
  float2 uv = fragCoord / u_res;
  float t = u_t * 0.11;
  float2 p = uv;
  p += float2(sin(p.y * 3.4 + t), cos(p.x * 2.8 - t * 0.8)) * 0.13;
  p += float2(sin(p.y * 6.2 - t * 0.55), cos(p.x * 5.4 + t * 0.7)) * 0.06;
  float a = fbm3(p * 1.8 + float2(t * 0.2, 0.0));
  float b = fbm3(p.yx * 1.5 - float2(0.0, t * 0.16));
  float3 col = mix(u_bg.rgb, u_low.rgb, clamp(a, 0.0, 1.0));
  col = mix(col, u_mid.rgb, clamp(b * 0.85, 0.0, 1.0));
  col = mix(col, u_high.rgb, clamp((a * b) * 0.45, 0.0, 1.0));
  col = mix(col, u_paper.rgb, clamp(a * a * 0.08, 0.0, 1.0));
  return half4(col, 1.0);
}
`;

const AURORA_MAIN = `
half4 main(float2 fragCoord) {
  float2 uv = fragCoord / u_res;
  float t = u_t * 0.2;
  float fold = 0.16 * sin(uv.x * 3.2 + t) + 0.07 * sin(uv.x * 7.1 - t * 0.65);
  float spine = 0.4 + fold;
  float d = uv.y - spine;
  float widen = 0.045 + abs(fold) * 0.12;
  float beam = exp(-(d * d) / (2.0 * widen));
  float curtain = beam * (0.55 + 0.45 * vnoise(float2(uv.x * 8.0 + t * 1.1, uv.y * 2.2)));
  float foot = 1.0 - smoothstep(0.0, 0.28, uv.y);
  float3 col = mix(u_bg.rgb, u_low.rgb, foot * 0.22);
  col = mix(col, u_mid.rgb, curtain * 0.7);
  col = mix(col, u_high.rgb, curtain * curtain * 0.45);
  col = mix(col, u_paper.rgb, beam * beam * 0.12);
  return half4(col, 1.0);
}
`;

const MESH_MAIN = `
half4 main(float2 fragCoord) {
  float2 uv = fragCoord / u_res;
  float t = u_t * 0.09;
  float2 c0 = float2(0.28 + 0.08 * sin(t), 0.32 + 0.07 * cos(t * 0.8));
  float2 c1 = float2(0.72 + 0.07 * cos(t * 0.9), 0.3 + 0.08 * sin(t * 0.7));
  float2 c2 = float2(0.5 + 0.1 * sin(t * 0.6), 0.68 + 0.06 * cos(t * 1.1));
  float2 c3 = float2(0.22 + 0.06 * cos(t * 1.2), 0.74 + 0.05 * sin(t * 0.5));
  float w0 = 1.0 / (dot(uv - c0, uv - c0) + 0.06);
  float w1 = 1.0 / (dot(uv - c1, uv - c1) + 0.07);
  float w2 = 1.0 / (dot(uv - c2, uv - c2) + 0.08);
  float w3 = 1.0 / (dot(uv - c3, uv - c3) + 0.09);
  float w = w0 + w1 + w2 + w3;
  float3 col = (u_low.rgb * w0 + u_mid.rgb * w1 + u_high.rgb * w2 + mix(u_bg.rgb, u_paper.rgb, 0.2) * w3) / w;
  col = mix(u_bg.rgb, col, 0.78);
  return half4(col, 1.0);
}
`;

const GLOW_MAIN = `
half4 main(float2 fragCoord) {
  float2 uv = fragCoord / u_res;
  float t = u_t * 0.1;
  float edge = 0.22 + 0.16 * sin(uv.x * 2.4 + t) + 0.06 * sin(uv.x * 5.6 - t * 0.7);
  float d = abs(uv.y - (0.78 - edge * 0.55));
  float band = exp(-(d * d) / 0.018);
  float wash = smoothstep(0.15, 0.9, uv.y);
  float3 col = mix(u_bg.rgb, u_low.rgb, wash * 0.45);
  col = mix(col, u_mid.rgb, band * 0.65);
  col = mix(col, u_high.rgb, band * band * 0.4);
  col = mix(col, u_paper.rgb, band * band * 0.12);
  return half4(col, 1.0);
}
`;

const BARS_MAIN = `
half4 main(float2 fragCoord) {
  float2 uv = fragCoord / u_res;
  float n = 9.0;
  float idx = floor(uv.x * n);
  float env = 0.32 + 0.4 * (0.5 + 0.5 * sin(u_t * 0.16 + idx * 0.62));
  env += 0.08 * sin(u_t * 0.09 + idx * 1.3);
  env = floor(env * 7.0) / 7.0;
  float top = 0.18 + env * 0.58;
  float bar = 1.0 - smoothstep(top, top + 0.08, uv.y);
  float gap = step(0.12, fract(uv.x * n));
  float3 col = mix(u_bg.rgb, u_low.rgb, 0.35);
  col = mix(col, u_mid.rgb, bar * gap * 0.7);
  col = mix(col, u_high.rgb, bar * bar * gap * 0.28);
  col = mix(col, u_paper.rgb, bar * gap * 0.08 * (1.0 - uv.y));
  return half4(col, 1.0);
}
`;

function wrap(main: string, withNoise = false): string {
  return `${UNIFORMS}${withNoise ? NOISE : ''}${main}`;
}

export const REVEAL_SHADER_SOURCES: Record<RevealGradientVariant, string> = {
  prism: wrap(PRISM_MAIN),
  sky: wrap(SKY_MAIN, true),
  flow: wrap(FLOW_MAIN, true),
  aurora: wrap(AURORA_MAIN, true),
  mesh: wrap(MESH_MAIN),
  glow: wrap(GLOW_MAIN),
  bars: wrap(BARS_MAIN),
};

const compiled = new Map<RevealGradientVariant, SkRuntimeEffect | null>();

export function resetRevealShaderCache(): void {
  compiled.clear();
}

export function getRevealShaderSource(variant: RevealGradientVariant): string {
  return REVEAL_SHADER_SOURCES[variant];
}

export function getRevealRuntimeEffect(variant: RevealGradientVariant): SkRuntimeEffect | null {
  if (compiled.has(variant)) {
    return compiled.get(variant) ?? null;
  }
  try {
    const effect = Skia.RuntimeEffect.Make(REVEAL_SHADER_SOURCES[variant]);
    compiled.set(variant, effect ?? null);
    return effect ?? null;
  } catch {
    compiled.set(variant, null);
    return null;
  }
}
