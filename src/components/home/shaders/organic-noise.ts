import { Skia } from '@shopify/react-native-skia';

/**
 * SkSL shader: domain-warped Fractal Brownian Motion.
 * Creates flowing, cloud-like patterns at 2-3% opacity.
 */
export const organicNoiseSource = Skia.RuntimeEffect.Make(`
  uniform float iTime;
  uniform float2 iResolution;
  uniform half3 accentColor;

  float hash(float2 p) {
    float h = dot(p, float2(127.1, 311.7));
    return fract(sin(h) * 43758.5453);
  }

  float noise(float2 p) {
    float2 i = floor(p);
    float2 f = fract(p);
    float2 u = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + float2(1.0, 0.0));
    float c = hash(i + float2(0.0, 1.0));
    float d = hash(i + float2(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(float2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p);
      p *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  half4 main(float2 fragCoord) {
    float2 uv = fragCoord / iResolution;
    float t = iTime * 0.1;

    // Domain warping — noise fed into itself
    float2 q = float2(fbm(uv * 3.0 + t), fbm(uv * 3.0 + float2(5.2, 1.3) + t));
    float f = fbm(uv * 3.0 + q * 1.5);

    half alpha = half(f * 0.025); // 2.5% max opacity
    return half4(accentColor * alpha, alpha);
  }
`)!;
