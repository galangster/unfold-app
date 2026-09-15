// Cylindrical paper fold. All distances use logical points, including the
// snapshot shader. The diagonal normal lifts the lower-right corner first.
export const PAGE_CURL_SHADER = `
uniform shader pageImage;
uniform float2 viewport;
uniform float4 startRect;
uniform float progress;
uniform float curlProgress;
uniform float4 paperColor;

half4 front(float2 p, float2 size) {
  float2 source = p / (size.x / startRect.z);
  // Extend the flat paper's bottom edge as it grows, without embedding a second card.
  source.y = min(source.y, startRect.w - 1.0);
  return pageImage.eval(source);
}

bool insidePage(float2 p, float2 size) {
  return p.x >= 0.0 && p.y >= 0.0 && p.x <= size.x && p.y <= size.y;
}

half4 main(float2 xy) {
  float p = clamp(curlProgress, 0.0, 1.0);
  float expand = smoothstep(0.0, 0.82, progress);
  float2 origin = mix(startRect.xy, float2(0.0), expand);
  float2 size = mix(startRect.zw, viewport, expand);
  float2 q = xy - origin;
  float corner = mix(12.0, 0.0, expand);
  float2 box = abs(q - size * 0.5) - size * 0.5 + corner;
  float edge = length(max(box, 0.0)) + min(max(box.x, box.y), 0.0) - corner;
  if (edge > 0.5) return half4(0.0);
  float2 normal = normalize(float2(1.0, 0.48));
  float radius = max(1.0, min(size.x * 0.13, 65.0) * sin(p * 2.2));
  float reach = dot(size, normal);
  float crease = reach - p * (reach + radius * 3.141593);
  float d = dot(q, normal) - crease;
  if (d <= 0.0) return front(q, size);
  if (d > radius) {
    float shadow = 0.16 * exp(-(d - radius) / (radius * 0.35));
    return half4(0.0, 0.0, 0.0, shadow * (1.0 - smoothstep(0.85, 1.0, p)));
  }
  float theta = asin(clamp(d / radius, 0.0, 1.0));
  float2 backPoint = q + normal * (radius * (3.141593 - theta) - d);
  float light = 0.82 + 0.18 * pow(cos(theta), 0.7);
  if (insidePage(backPoint, size)) {
    return half4(mix(paperColor.rgb, float3(1.0), 0.06) * light, 1.0);
  }
  // A finite sheet can expose the curved front before its reverse reaches this pixel.
  float2 frontPoint = q + normal * (radius * theta - d);
  if (insidePage(frontPoint, size)) {
    half4 face = front(frontPoint, size);
    return half4(face.rgb * light, face.a);
  }
  return half4(0.0);
}
`;
