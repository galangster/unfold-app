import { Image, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { FontFamily } from "@/constants/fonts";
import { getSeriesCover } from "@/lib/series-cover";
import { SERIES_BOOK_PAPER_FRACTION } from "@/lib/series-book-geometry";
import type { Devotional } from "@/lib/store";

export interface SeriesBookCoverProps {
  devotional: Pick<
    Devotional,
    "id" | "title" | "createdAt" | "seriesStartDate"
  >;
  width: number;
  height: number;
  compact?: boolean;
  showTitle?: boolean;
  allowFontScaling?: boolean;
  onTextureLoad?: () => void;
}

const CORNERS = [
  "translate(14 14)",
  "translate(186 14) scale(-1 1)",
  "translate(14 266) scale(1 -1)",
  "translate(186 266) scale(-1 -1)",
];

const BOTANICAL_RADIUS = 44;

function BotanicalFrame({ variant }: { variant: number }) {
  const radius = BOTANICAL_RADIUS;
  const wheat = variant === 1;
  const olive = variant === 2;
  const fern = variant === 4;
  const count = variant === 3 ? 0 : wheat ? 7 : olive ? 4 : fern ? 9 : 7;
  const length = wheat ? 4 : olive ? 8 : fern ? 3 : 8;
  const breadth = wheat ? 1.3 : olive ? 2.6 : fern ? 1.6 : 3;
  const paired = wheat || olive || fern;
  const leaves = Array.from({ length: count }, (_, index) => {
    const t = 0.23 + (index / (count - 1)) * 0.51;
    // Positions and tangents come from the same quadratic as the frame.
    const x = radius * t * t;
    const y = radius * (1 - t) * (1 - t);
    const magnitude = Math.hypot(t, 1 - t);
    const tx = t / magnitude;
    const ty = (t - 1) / magnitude;
    return (paired ? [-1, 1] : [index % 2 === 0 ? 1 : -1]).map((side) => {
      const vector = (along: number, across: number) => [
        tx * length * along - ty * breadth * across * side,
        ty * length * along + tx * breadth * across * side,
      ];
      const vectors = [vector(0.2, 1.3), vector(1, 1.4), vector(0.8, 0.45)];
      // Taper terminal leaves to keep the entire ornament inside its corner cell.
      let scale = 1;
      for (const [dx, dy] of vectors) {
        if (dx < 0) scale = Math.min(scale, (x - 1) / -dx);
        if (dx > 0) scale = Math.min(scale, (radius - 1 - x) / dx);
        if (dy < 0) scale = Math.min(scale, (y - 1) / -dy);
        if (dy > 0) scale = Math.min(scale, (radius - 1 - y) / dy);
      }
      const [first, tip, second] = vectors.map(
        ([dx, dy]) => `${x + dx * scale} ${y + dy * scale}`,
      );
      return (
        <Path
          key={`${index}-${side}`}
          d={`M${x} ${y} Q${first} ${tip} Q${second} ${x} ${y}Z`}
        />
      );
    });
  });
  return (
    <G>
      <Path d="M58 14 H142 Q186 14 186 58 V222 Q186 266 142 266 H58 Q14 266 14 222 V58 Q14 14 58 14Z" />
      {CORNERS.map((transform) => (
        <G key={transform} transform={transform}>
          {variant === 3 ? (
            <G transform={`translate(${radius / 4} ${radius / 4}) rotate(-45)`}>
              <Path d="M0 0 C0 5 4 10 9 10 C14 10 15 5 11 5 C8 5 7 8 10 8" />
            </G>
          ) : (
            leaves
          )}
        </G>
      ))}
    </G>
  );
}

const BORDER_RADIUS = 14;
const BORDER_HORIZONTAL = 68;
const BORDER_VERTICAL = 108;
const BORDER_QUARTER =
  BORDER_HORIZONTAL + (Math.PI * BORDER_RADIUS) / 2 + BORDER_VERTICAL;
const BORDER_LENGTH = BORDER_QUARTER * 4;

/** Closed rounded frame, parameterized by distance so corner joins share one rhythm. */
function borderPoint(distance: number, inset: number) {
  const wrapped = ((distance % BORDER_LENGTH) + BORDER_LENGTH) % BORDER_LENGTH;
  const quarter = Math.floor(wrapped / BORDER_QUARTER);
  let progress = wrapped - quarter * BORDER_QUARTER;
  if (quarter % 2 === 1) progress = BORDER_QUARTER - progress;
  let x: number;
  let y: number;
  let tx: number;
  let ty: number;
  if (progress <= BORDER_HORIZONTAL) {
    x = 100 + progress;
    y = 18;
    tx = 1;
    ty = 0;
  } else if (progress < BORDER_HORIZONTAL + (Math.PI * BORDER_RADIUS) / 2) {
    const angle = -Math.PI / 2 + (progress - BORDER_HORIZONTAL) / BORDER_RADIUS;
    x = 168 + BORDER_RADIUS * Math.cos(angle);
    y = 32 + BORDER_RADIUS * Math.sin(angle);
    tx = -Math.sin(angle);
    ty = Math.cos(angle);
  } else {
    x = 182;
    y = 32 + progress - BORDER_HORIZONTAL - (Math.PI * BORDER_RADIUS) / 2;
    tx = 0;
    ty = 1;
  }
  if (quarter === 1) {
    y = 280 - y;
    tx = -tx;
  }
  if (quarter === 2) {
    x = 200 - x;
    y = 280 - y;
    tx = -tx;
    ty = -ty;
  }
  if (quarter === 3) {
    x = 200 - x;
    ty = -ty;
  }
  return `${(x - ty * inset).toFixed(3)} ${(y + tx * inset).toFixed(3)}`;
}

function scallopedBorderPaths() {
  const cornerLength = (Math.PI * BORDER_RADIUS) / 2;
  const bottomCenter = BORDER_LENGTH / 2;
  // The opening ends at whole scallops, with matching space around the imprint.
  const opening = BORDER_HORIZONTAL / 2;
  return [0, 1, 2].map((layer) =>
    [
      [0, bottomCenter - opening],
      [bottomCenter + opening, BORDER_LENGTH],
    ]
      .map(([start, end]) => {
        const samples = Math.ceil(end - start);
        return Array.from({ length: samples + 1 }, (_, index) => {
          const distance = start + ((end - start) * index) / samples;
          const quarter = Math.min(3, Math.floor(distance / BORDER_QUARTER));
          let progress = distance - quarter * BORDER_QUARTER;
          if (quarter % 2 === 1) progress = BORDER_QUARTER - progress;
          const phase =
            progress <= BORDER_HORIZONTAL
              ? progress / (BORDER_HORIZONTAL / 4)
              : progress >= BORDER_HORIZONTAL + cornerLength
                ? (progress - BORDER_HORIZONTAL - cornerLength) /
                  (BORDER_VERTICAL / 6)
                : 0;
          const depth = Math.sin(phase * Math.PI) ** 2;
          return `${index === 0 ? "M" : "L"}${borderPoint(distance, layer * 2 + (6 - layer) * depth)}`;
        }).join(" ");
      })
      .join(" "),
  );
}

function repeatedBorderPaths(variant: number) {
  const count = variant === 10 ? 44 : 32;
  const step = BORDER_LENGTH / count;
  const gap = Math.ceil(22 / step);
  const segments = Array.from({ length: count }, (_, index) => index).filter(
    (index) => index < count / 2 - gap || index >= count / 2 + gap,
  );
  if (variant === 10) {
    return [
      segments
        .map(
          (index) =>
            Array.from({ length: 33 }, (_, sample) => {
              const angle = (sample / 32) * Math.PI * 2;
              const distance = (index + (1 - Math.cos(angle)) / 2) * step;
              return `${sample === 0 ? "M" : "L"}${borderPoint(distance, Math.sin(angle) * 3)}`;
            }).join(" ") + "Z",
        )
        .join(" "),
    ];
  }
  return [-1, 1].map((layer) =>
    segments
      .map((index) => {
        return Array.from({ length: 25 }, (_, sample) => {
          const fraction = sample / 24;
          const offset = layer * 2.5 * Math.sin(fraction * Math.PI * 2);
          return `${sample === 0 ? "M" : "L"}${borderPoint((index + fraction) * step, offset)}`;
        }).join(" ");
      })
      .join(" "),
  );
}

// Generate repeated borders once, outside render and animation callbacks.
const REPEATED_BORDERS: Partial<Record<number, string[]>> = {
  10: repeatedBorderPaths(10),
  12: repeatedBorderPaths(12),
  15: scallopedBorderPaths(),
};

function CornerOrnament({ variant }: { variant: number }) {
  switch (variant) {
    case 5:
      return (
        <G>
          {[5, 9, 13, 17].map((r) => (
            <Path key={r} d={`M0 ${r} A${r} ${r} 0 0 0 ${r} 0`} />
          ))}
          {Array.from({ length: 11 }, (_, i) => {
            const angle = ((i / 10) * Math.PI) / 2;
            return (
              <Path
                key={i}
                d={`M${Math.cos(angle) * 19} ${Math.sin(angle) * 19} L${Math.cos(angle) * 38} ${Math.sin(angle) * 38}`}
              />
            );
          })}
        </G>
      );
    case 6:
      return (
        <G>
          {Array.from({ length: 10 }, (_, i) => (
            <Path
              key={i}
              d={`M0 0 L${38 * Math.cos((i * Math.PI) / 18)} ${38 * Math.sin((i * Math.PI) / 18)}`}
            />
          ))}
        </G>
      );
    case 7:
      return (
        <G>
          {[0, 4, 8, 12, 16, 20, 24, 28, 32].map((y, i) => (
            <Path
              key={y}
              d={`M0 ${y} H${i % 3 === 0 ? 42 : i % 3 === 1 ? 31 : 21}`}
            />
          ))}
        </G>
      );
    case 8:
      return (
        <G>
          {[0, 7, 14, 21, 28].map((y) => (
            <Path
              key={y}
              d={`M0 ${y + 4} C7 ${y + 9} 9 ${y - 5} 18 ${y} S29 ${y + 5} 42 ${y}`}
            />
          ))}
        </G>
      );
    case 9:
      return (
        <G>
          {Array.from({ length: 8 }, (_, i) => (
            <Path key={i} strokeDasharray="4 3" d={`M${i * 6} 0 L0 ${i * 6}`} />
          ))}
        </G>
      );
    case 11:
      return (
        <G>
          {[14, 18, 22].map((r) => (
            <Path key={r} d={`M0 ${r} Q${r} ${r} ${r} 0`} />
          ))}
        </G>
      );
    case 13:
      return (
        <G>
          {[0, 5, 10].map((n) => (
            <Path
              key={n}
              d={`M${n} 39 H${25 + n} V${25 + n} H39 V${n} H${n} Z`}
            />
          ))}
          <Rect x="5" y="5" width="9" height="9" />
          <Circle cx="9.5" cy="9.5" r="1" />
        </G>
      );
    case 14:
      return (
        <G>
          <Path d="M0 10 L10 0 20 10 10 20 Z M5 10 L10 5 15 10 10 15 Z" />
          <Circle cx="10" cy="10" r="1" />
        </G>
      );
    case 16:
      return (
        <G>
          <Circle cx="12" cy="12" r="11" />
          <Circle cx="12" cy="12" r="3" />
          {Array.from({ length: 12 }, (_, i) => (
            <Path
              key={i}
              transform={`rotate(${i * 30} 12 12)`}
              d="M12 3 L13.5 8 10.5 8 Z"
            />
          ))}
        </G>
      );
    case 17:
      return (
        <G>
          {[0, 5, 10].flatMap((x) =>
            [0, 5, 10].map((y) => (
              <Circle
                key={`${x}-${y}`}
                cx={x}
                cy={y}
                r=".7"
                fill="currentColor"
              />
            )),
          )}
        </G>
      );
    case 18:
      return (
        <G>
          {[0, 5, 10, 15].map((n) => (
            <G key={n}>
              <Path d={`M${n} 26 V0 H26 M0 ${n} H26 V26`} />
            </G>
          ))}
        </G>
      );
    case 19:
      return (
        <G>
          <Path d="M12 0 V24 M0 12 H24 M3.5 3.5 L20.5 20.5 M3.5 20.5 L20.5 3.5" />
          <Path d="M12 6 L14 10 18 12 14 14 12 18 10 14 6 12 10 10 Z" />
          <Circle cx="27" cy="12" r=".6" fill="currentColor" />
          <Circle cx="12" cy="27" r=".6" fill="currentColor" />
        </G>
      );
    default:
      return null;
  }
}

function EdgeOrnaments({ variant }: { variant: number }) {
  if (variant === 14)
    return (
      <G>
        {[false, true].map((right) => (
          <G
            key={String(right)}
            transform={right ? "translate(200 0) scale(-1 1)" : undefined}
          >
            {Array.from({ length: 10 }, (_, i) => (
              <Path key={i} d={`M20 ${36 + i * 21} l3 3 -3 3 -3 -3 Z`} />
            ))}
          </G>
        ))}
        {[false, true].map((bottom) => (
          <G
            key={String(bottom)}
            transform={bottom ? "translate(0 280) scale(1 -1)" : undefined}
          >
            {Array.from({ length: 6 }, (_, i) => (
              <Path
                key={i}
                d={`M40 ${20} l3 3 -3 3 -3 -3 Z`}
                transform={`translate(${i * 23} 0)`}
              />
            ))}
          </G>
        ))}
      </G>
    );
  return null;
}

function CoverFoil({ variant, gold }: { variant: number; gold: string }) {
  const cornerSpace = variant <= 9 ? 45 : variant === 13 ? 39 : 25;
  const inset = 14;
  const repeatedBorder = REPEATED_BORDERS[variant];
  return (
    <Svg
      pointerEvents="none"
      width="100%"
      height="100%"
      viewBox="0 0 200 280"
      preserveAspectRatio="none"
      style={StyleSheet.absoluteFill}
    >
      <G
        stroke={gold}
        color={gold}
        fill="none"
        strokeWidth=".65"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity=".9"
      >
        <Rect
          x="9"
          y="9"
          width="182"
          height="262"
          strokeWidth=".5"
          opacity=".65"
        />
        {variant <= 4 ? (
          <BotanicalFrame variant={variant} />
        ) : repeatedBorder ? (
          repeatedBorder.map((path, index) => <Path key={index} d={path} />)
        ) : (
          <>
            {variant === 17 ? (
              <Rect
                x="14"
                y="14"
                width="172"
                height="252"
                strokeDasharray=".1 4.5"
                strokeWidth="1.5"
              />
            ) : (
              <Path
                d={`M${14 + cornerSpace} ${inset} H${186 - cornerSpace} M${14 + cornerSpace} ${280 - inset} H${186 - cornerSpace} M${inset} ${14 + cornerSpace} V${266 - cornerSpace} M${200 - inset} ${14 + cornerSpace} V${266 - cornerSpace}`}
              />
            )}
            {CORNERS.map((transform) => (
              <G key={transform} transform={transform}>
                <CornerOrnament variant={variant} />
              </G>
            ))}
            <EdgeOrnaments variant={variant} />
          </>
        )}
      </G>
    </Svg>
  );
}

function getBegunDate(
  devotional: SeriesBookCoverProps["devotional"],
  compact: boolean,
) {
  const date = new Date(devotional.seriesStartDate || devotional.createdAt);
  if (!Number.isFinite(date.getTime())) return "";
  return `Begun ${date.toLocaleDateString("en-US", { month: compact ? "short" : "long", day: "numeric", year: "numeric" })}`;
}

/** A decorative book only. Its containing pressable owns the accessible label and action. */
export function SeriesBookCover({
  devotional,
  width,
  height,
  compact = false,
  showTitle = true,
  allowFontScaling = true,
  onTextureLoad,
}: SeriesBookCoverProps) {
  const cover = getSeriesCover(devotional.id);
  const spineWidth = width * 0.065;
  const paperWidth = width * SERIES_BOOK_PAPER_FRACTION;
  const faceWidth = width - spineWidth - paperWidth;
  const titleWidth = faceWidth * (REPEATED_BORDERS[cover.variant] ? 0.7 : 0.75);
  const titleHeight = height * (compact ? 0.5 : 0.43);
  const fontSize = Math.min(
    width * 0.14,
    Math.sqrt(
      (titleWidth * titleHeight) / Math.max(1, devotional.title.length) / 0.68,
    ),
  );
  const date = getBegunDate(devotional, compact);

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        styles.root,
        {
          width,
          height,
          shadowRadius: width * 0.055,
          shadowOffset: { width: width * 0.025, height: height * 0.015 },
        },
      ]}
    >
      <View
        style={[
          styles.paper,
          {
            backgroundColor: cover.paper,
            width: paperWidth + 2,
            right: 0,
            top: height * 0.015,
            bottom: height * 0.008,
          },
        ]}
      >
        <LinearGradient
          colors={["#72654D", cover.paper, "#A4977F", cover.paper, "#786F5D"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        {[0.25, 0.5, 0.75].map((x) => (
          <View key={x} style={[styles.paperLine, { left: `${x * 100}%` }]} />
        ))}
      </View>
      <View
        style={[
          styles.binding,
          {
            backgroundColor: cover.cloth,
            right: paperWidth,
            borderRadius: width * 0.014,
          },
        ]}
      >
        <Image
          source={require("../../../assets/bookshelf/cloth-neutral-v1.png")}
          resizeMode="repeat"
          onLoad={onTextureLoad}
          style={[StyleSheet.absoluteFill, { opacity: 0.19 }]}
        />
        <LinearGradient
          colors={["#00000030", "#FFFFFF0A", "#00000008", "#00000040"]}
          locations={[0, 0.2, 0.8, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.spine, { width: spineWidth }]}>
          <LinearGradient
            colors={[
              "#00000055",
              "#FFFFFF20",
              "#0000000A",
              "#00000050",
              "#FFFFFF0C",
            ]}
            locations={[0, 0.35, 0.65, 0.88, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
        <View style={[styles.face, { left: spineWidth }]}>
          <CoverFoil variant={cover.variant} gold={cover.gold} />
          {showTitle && (
            <View
              style={[
                styles.titleArea,
                {
                  left: (faceWidth - titleWidth) / 2,
                  width: titleWidth,
                  top: height * (compact ? 0.23 : 0.25),
                  height: titleHeight,
                },
              ]}
            >
              <Text
                accessible={false}
                allowFontScaling={allowFontScaling}
                adjustsFontSizeToFit
                minimumFontScale={0.25}
                numberOfLines={8}
                style={[
                  styles.title,
                  {
                    color: cover.gold,
                    fontSize,
                    maxHeight: titleHeight,
                  },
                ]}
              >
                {devotional.title}
              </Text>
            </View>
          )}
          {showTitle && !compact && date !== "" && (
            <View
              style={[
                styles.dateArea,
                {
                  top: height * 0.72,
                  height: height * 0.14,
                  left: faceWidth * 0.12,
                  right: faceWidth * 0.12,
                },
              ]}
            >
              <View
                style={{
                  width: faceWidth * 0.1,
                  height: 0.6,
                  backgroundColor: cover.gold,
                  marginBottom: height * 0.018,
                }}
              />
              <Text
                accessible={false}
                allowFontScaling={allowFontScaling}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
                numberOfLines={2}
                style={[
                  styles.date,
                  {
                    color: cover.gold,
                    fontSize: width * 0.035,
                    maxHeight: height * 0.1,
                  },
                ]}
              >
                {date}
              </Text>
            </View>
          )}
          <Text
            accessible={false}
            allowFontScaling={allowFontScaling}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
            numberOfLines={1}
            style={[
              styles.imprint,
              {
                color: cover.gold,
                fontSize: width * 0.037,
                maxHeight: height * 0.055,
                bottom: height * 0.075,
              },
            ]}
          >
            {"Unfold"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { shadowColor: "#000000", shadowOpacity: 0.35 },
  binding: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: "#FFFFFF14",
  },
  paper: {
    position: "absolute",
    borderTopRightRadius: 1,
    borderBottomRightRadius: 1,
    overflow: "hidden",
  },
  paperLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 0.5,
    backgroundColor: "#544A352D",
  },
  spine: { position: "absolute", left: 0, top: 0, bottom: 0 },
  face: { position: "absolute", right: 0, top: 0, bottom: 0 },
  titleArea: { position: "absolute", justifyContent: "center" },
  title: { fontFamily: FontFamily.display, textAlign: "center", flexShrink: 0 },
  dateArea: { position: "absolute", alignItems: "center" },
  date: { fontFamily: FontFamily.ui, textAlign: "center", opacity: 0.9 },
  imprint: {
    position: "absolute",
    left: "20%",
    right: "20%",
    fontFamily: FontFamily.display,
    textAlign: "center",
    letterSpacing: 0.5,
  },
});
