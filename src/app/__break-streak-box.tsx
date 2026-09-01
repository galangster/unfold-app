// Throwaway /break harness — the real StreakBox across every count and
// container production can hand it. Not committed; delete on request.
import { ScrollView, Text, View } from 'react-native';
import { StreakBox } from '@/components/StreakBox';
import { useTheme } from '@/lib/theme';

const scenarios: { label: string; width?: number; count: number; hasReadToday?: boolean }[] = [
  { label: 'Zero (new user)', count: 0 },
  { label: 'One day — singular label', count: 1 },
  { label: 'Typical — 12 days, read today', count: 12, hasReadToday: true },
  { label: '12 days, NOT read today', count: 12 },
  { label: 'Tier boundary — 6 (Spark) vs next', count: 6 },
  { label: 'Tier boundary — 7 (Glow)', count: 7 },
  { label: 'Tier boundary — 30 (Shine)', count: 30 },
  { label: 'Tier boundary — 90 (Radiance)', count: 90 },
  { label: 'Three digits — 365', count: 365, hasReadToday: true },
  { label: 'Four digits — 3650 (ten years)', count: 3650, hasReadToday: true },
  { label: '320px container — 3650', width: 320, count: 3650, hasReadToday: true },
  { label: '320px container — 0', width: 320, count: 0 },
  { label: 'Very wide container (700px) — 12', width: 700, count: 12, hasReadToday: true },
];

export default function BreakStreakBox() {
  const { colors } = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 4 }}>/break — StreakBox</Text>
      <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 24 }}>
        Real component, fixture counts. Axes dropped: Content shape (all copy is authored, numbers only vary), Quantity (single
        box), State (no loading/error/disabled props), Environment (toggle theme in You → Preferences).
      </Text>
      {scenarios.map((s) => (
        <View key={s.label} style={{ marginBottom: 32 }}>
          <Text style={{ color: colors.accent, fontSize: 13, marginBottom: 10 }}>{s.label}</Text>
          <View style={s.width ? { width: s.width, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' } : undefined}>
            <StreakBox streakCount={s.count} hasReadToday={s.hasReadToday} onPress={() => {}} />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
