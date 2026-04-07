/**
 * DevotionalCard — inline tappable card in companion messages.
 * Shows day number, date, title, and scripture.
 * Tapping navigates to the referenced devotional day or journal.
 */
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/theme";
import { alpha } from "@/components/ui";
import { Radius } from "@/constants/radius";
import { Spacing } from "@/constants/spacing";
import { FontFamily, FontSize } from "@/constants/fonts";
import type { DeepLinkData } from "@/lib/parse-deep-links";

interface Props {
  data: DeepLinkData;
}

export function DevotionalCard({ data }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  const handlePress = () => {
    if (data.type === "journal") {
      router.push({
        pathname: "/(tabs)/(today)/journal",
        params: { devotionalId: data.devotionalId, day: data.dayNumber },
      });
    } else {
      router.push({
        pathname: "/(tabs)/(today)/reading",
        params: { devotionalId: data.devotionalId, day: data.dayNumber },
      });
    }
  };

  const dateLabel = data.preview.date !== "unknown"
    ? new Date(data.preview.date + "T12:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => ({
        backgroundColor: alpha(colors.primary, pressed ? 0.12 : 0.06),
        borderRadius: Radius.md,
        paddingHorizontal: Spacing['3'],
        paddingVertical: Spacing['2'],
        marginVertical: Spacing['1'],
        borderLeftWidth: 3,
        borderLeftColor: alpha(colors.primary, 0.4),
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text
          style={{
            fontFamily: FontFamily.bodyMedium,
            fontSize: FontSize.xs,
            color: alpha(colors.text, 0.5),
          }}
        >
          Day {data.dayNumber}
          {dateLabel ? ` \u00B7 ${dateLabel}` : ""}
        </Text>
      </View>

      <Text
        style={{
          fontFamily: FontFamily.uiSemiBold,
          fontSize: FontSize.sm,
          color: colors.text,
          marginTop: 2,
        }}
        numberOfLines={1}
      >
        {data.preview.title}
      </Text>

      {data.preview.scripture && (
        <Text
          style={{
            fontFamily: FontFamily.body,
            fontSize: FontSize.xs,
            color: alpha(colors.text, 0.6),
            marginTop: 1,
          }}
          numberOfLines={1}
        >
          {data.preview.scripture}
        </Text>
      )}
    </Pressable>
  );
}
