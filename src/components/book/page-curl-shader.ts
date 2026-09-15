// Cylindrical paper fold. All distances use logical points, including the
// snapshot shader. The diagonal normal lifts the lower-right corner first.
// Hardcover interiors never curl: the cover is the only turning plane, and the
// sheet under it shows the paper capture, then the reader snapshot.
export const PAGE_CURL_SHADER = `
uniform shader pageImage;
uniform shader coverImage;
uniform shader readerImage;
uniform float2 viewport;
uniform float4 startRect;
uniform float expansion;
uniform float hardcover;
uniform float hingeDegrees;
uniform float curlProgress;
uniform float4 paperColor;
uniform float backgroundOpacity;
uniform float coverBoardRight;
uniform float readerFade;
uniform float readerWidth;

// The sheet grows from the book rect to the viewport. Every pass shares this geometry.
float2 sheetOrigin() {
  return mix(startRect.xy, float2(0.0), expansion);
}

float2 sheetSize() {
  return mix(startRect.zw, viewport, expansion);
}

// Signed distance to the rounded sheet edge; positive is outside.
float sheetEdge(float2 q, float2 size) {
  float corner = mix(12.0, 0.0, expansion);
  float2 box = abs(q - size * 0.5) - size * 0.5 + corner;
  return length(max(box, 0.0)) + min(max(box.x, box.y), 0.0) - corner;
}

half4 front(float2 p, float2 size) {
  float2 source = p / (size.x / startRect.z);
  // Extend the flat paper's bottom edge as it grows, without embedding a second card.
  source.y = min(source.y, startRect.w - 1.0);
  return pageImage.eval(source);
}

bool insidePage(float2 p, float2 size) {
  return p.x >= 0.0 && p.y >= 0.0 && p.x <= size.x && p.y <= size.y;
}

half4 paper(float2 xy) {
  float p = clamp(curlProgress, 0.0, 1.0);
  float2 size = sheetSize();
  float2 q = xy - sheetOrigin();
  if (sheetEdge(q, size) > 0.5) return half4(0.0);
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

// The reader snapshot is width-scaled and top-aligned, so the small book shows the
// top of the real page and grows into it. Uniform branches skip the unused sample.
half4 hardcoverInterior(float2 xy) {
  float2 size = sheetSize();
  float2 q = xy - sheetOrigin();
  if (sheetEdge(q, size) > 0.5) return half4(0.0);
  float fade = clamp(readerFade, 0.0, 1.0);
  if (fade <= 0.0) return front(q, size);
  half4 reader = readerImage.eval(q * (readerWidth / max(size.x, 1.0)));
  if (fade >= 1.0) return reader;
  return mix(front(q, size), reader, half(fade));
}

// The sheet expands into the reader. The cover keeps its proportions around the left hinge.
half4 main(float2 xy) {
  half4 underneath = hardcover > 0.5 ? hardcoverInterior(xy) : paper(xy);
  if (hardcover < 0.5) return underneath;
  half paperCoverage = underneath.a;
  // The backdrop and book must arrive in the same onscreen frame.
  half4 background = half4(paperColor.rgb * backgroundOpacity, backgroundOpacity);
  underneath = underneath + background * (1.0 - underneath.a);
  float angle = hingeDegrees * 0.0174532925;
  float c = cos(angle);
  if (c <= 0.0) return underneath;
  float s = sin(angle);
  float2 origin = sheetOrigin();
  float2 size = sheetSize();
  float scale = size.x / startRect.z;
  float coverHeight = startRect.w * scale;
  float2 coverOrigin = origin + float2(0.0, (size.y - coverHeight) * 0.5);
  // The exposed page edges belong to the stationary book, never to the turning board.
  float2 flatSource = (xy - coverOrigin) / scale;
  if (flatSource.x >= coverBoardRight && insidePage(flatSource, startRect.zw)) {
    half4 pages = coverImage.eval(flatSource) * paperCoverage * c;
    underneath = pages + underneath * (1.0 - pages.a);
  }
  float2 q = xy - origin;
  float perspective = 1600.0;
  float denominator = scale * (c - q.x * s / perspective);
  if (denominator <= 0.0) return underneath;
  float u = q.x / denominator;
  float depth = 1.0 + u * scale * s / perspective;
  float v = startRect.w * 0.5 + (q.y - size.y * 0.5) * depth / scale;
  if (u < 0.0 || u > coverBoardRight || v < 0.0 || v > startRect.w) return underneath;
  half4 cover = coverImage.eval(float2(u, v));
  return cover + underneath * (1.0 - cover.a);
}
`;
