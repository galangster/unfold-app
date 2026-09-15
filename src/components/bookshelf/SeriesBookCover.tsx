import {
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { FontFamily } from "@/constants/fonts";
import { getSeriesCover } from "@/lib/series-cover";
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

function LeafSprig({
  wheat = false,
  fern = false,
  curved = false,
}: {
  wheat?: boolean;
  fern?: boolean;
  curved?: boolean;
}) {
  const count = fern ? 10 : wheat ? 9 : 5;
  return (
    <G>
      <Path d={curved ? "M0 47 Q2 12 42 0" : "M0 47 Q3 17 28 0"} />
      {Array.from({ length: count }, (_, i) => {
        const y = 40 - i * (36 / count);
        const x = curved ? i * i * 0.85 : i * 2.8;
        const length = fern ? 9 : wheat ? 6 : 12;
        return (
          <G key={i}>
            <Path
              d={`M${x} ${y} Q${x - 7} ${y - 4} ${x - 3} ${y - length} Q${x + 1} ${y - 5} ${x} ${y}`}
            />
            <Path
              d={`M${x + 1} ${y - 2} Q${x + 8} ${y - 9} ${x + length} ${y - 5} Q${x + 7} ${y + 1} ${x + 1} ${y - 2}`}
            />
          </G>
        );
      })}
    </G>
  );
}

function CornerOrnament({ variant }: { variant: number }) {
  switch (variant) {
    case 0:
      return <LeafSprig />;
    case 1:
      return (
        <G transform="translate(0 0) scale(.7 1.15)">
          <LeafSprig wheat />
        </G>
      );
    case 2:
      return <LeafSprig curved />;
    case 3:
      return (
        <G>
          <Path d="M0 58 C14 43 -12 35 1 24 C14 13 8 -8 42 0 M0 24 C18 32 24 15 16 12 C5 6 5 25 16 21 M12 3 C7 -8 18 -10 20 -2 M30 0 C31 -10 41 -10 41 -3" />
          <Path d="M3 48 q10 -8 10 -2 q-2 8 -10 2 M29 0 q-4 12 3 10 q8 -4 -3 -10" />
        </G>
      );
    case 4:
      return <LeafSprig fern curved />;
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
    case 10:
      return (
        <G>
          {[0, 1, 2].map((i) => (
            <Path
              key={i}
              d={`M${i * 3} 17 Q${i * 3 - 5} ${i * 3 - 5} 17 ${i * 3}`}
            />
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
    case 12:
      return (
        <G>
          {[0, 5, 10].map((x) => (
            <Path key={x} d={`M${x} 32 Q-7 19 6 9 Q19 -7 32 ${x}`} />
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
    case 15:
      return (
        <G>
          {[3, 6, 9, 12].map((r) => (
            <Path key={r} d={`M0 ${r} A${r} ${r} 0 0 0 ${r} 0`} />
          ))}
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
  if (variant === 10 || variant === 12 || variant === 15) {
    const step = variant === 15 ? 16 : 20;
    const path =
      variant === 12
        ? "M0 0 Q10 -10 20 0 Q10 10 0 0 M0 0 Q10 10 20 0"
        : variant === 15
          ? "M0 0 Q8 17 16 0 M2 0 Q8 12 14 0 M4 0 Q8 8 12 0"
          : "M0 0 Q10 -14 20 0 M0 0 Q10 14 20 0";
    return (
      <G>
        {[false, true].map((bottom) => (
          <G
            key={String(bottom)}
            transform={bottom ? "translate(0 280) scale(1 -1)" : undefined}
          >
            {Array.from({ length: Math.floor(160 / step) }, (_, i) => (
              <Path
                key={i}
                transform={`translate(${20 + i * step} 14)`}
                d={path}
              />
            ))}
          </G>
        ))}
        {[false, true].map((right) => (
          <G
            key={String(right)}
            transform={right ? "translate(200 0) scale(-1 1)" : undefined}
          >
            {Array.from({ length: Math.floor(240 / step) }, (_, i) => (
              <Path
                key={i}
                transform={`translate(14 ${20 + i * step}) rotate(90)`}
                d={path}
              />
            ))}
          </G>
        ))}
      </G>
    );
  }
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
  const inset = variant === 10 || variant === 12 || variant === 15 ? 25 : 14;
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
  const paperWidth = width * 0.032;
  const faceWidth = width - spineWidth - paperWidth;
  const titleWidth = faceWidth * 0.75;
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
                  left: faceWidth * 0.125,
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
                  { color: cover.gold, fontSize: width * 0.035, maxHeight: height * 0.1 },
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
