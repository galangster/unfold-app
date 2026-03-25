import { Skia } from '@shopify/react-native-skia';

/**
 * SkSL shader: concentric rings that breathe and slowly rotate.
 * Uniform inputs: iTime (float), iResolution (float2), accentColor (half3).
 * Output: premultiplied half4 at 2-4% opacity.
 */
export const concentricRingsSource = Skia.RuntimeEffect.Make(`
  uniform float iTime;
  uniform float2 iResolution;
  uniform half3 accentColor;

  half4 main(float2 fragCoord) {
    float2 uv = (fragCoord - iResolution * 0.5) / min(iResolution.x, iResolution.y);
    float dist = length(uv);

    // Multiple ring sets at different scales and speeds
    float ring1 = smoothstep(0.002, 0.0, abs(sin(dist * 20.0 - iTime * 0.3) - 0.7));
    float ring2 = smoothstep(0.003, 0.0, abs(sin(dist * 15.0 + iTime * 0.2) - 0.6));
    float ring3 = smoothstep(0.002, 0.0, abs(sin(dist * 25.0 - iTime * 0.15) - 0.8));

    // Breathing modulation (5-second cycle)
    float breath = sin(iTime * 0.4) * 0.3 + 0.7;

    // Combine with very low opacity
    half alpha = half((ring1 * 0.03 + ring2 * 0.02 + ring3 * 0.015) * breath);
    return half4(accentColor * alpha, alpha);
  }
`)!;
