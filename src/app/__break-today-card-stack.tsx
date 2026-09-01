// Throwaway /break harness — renders the real TodayCardStack under every
// scenario that can reach it in production. Not committed; delete on request.
import { ScrollView, Text, View } from 'react-native';
import { TodayCardStack, type TodayCardStackCard } from '@/components/home/TodayCardStack';
import { useTheme } from '@/lib/theme';

const noop = () => {};

function card(partial: Partial<TodayCardStackCard> & { id: string; title: string }): TodayCardStackCard {
  return {
    kind: 'midday',
    priority: 300,
    accessibilityLabel: partial.title || 'Card',
    actions: [{ label: 'Reflect', onPress: noop, accessibilityLabel: 'Reflect' }],
    onDismiss: noop,
    ...partial,
  } as TodayCardStackCard;
}

const LONG_BODY =
  'Today I noticed that the reading about stillness kept coming back to me during the afternoon, especially the part about attention being a form of prayer, and I want to remember that the next time the day gets loud, because it changed how I handled the meeting and the drive home and even the conversation at dinner.';
const UNBREAKABLE = 'Donaudampfschiffahrtselektrizitaetenhauptbetriebswerkbauunterbeamtengesellschaft';

const scenarios: { label: string; width?: number; squeeze?: boolean; cards: TodayCardStackCard[] }[] = [
  {
    label: 'Typical — 3 cards (realistic stack)',
    cards: [
      card({ id: 't1', title: 'Check in with today’s reading', eyebrow: 'Companion note', body: 'Anything from “When the Path Is Quiet” worth revisiting?' }),
      card({ id: 't2', kind: 'evening', priority: 400, title: 'Evening wind-down', body: 'Close the day with a short examen.' }),
      card({ id: 't3', kind: 'resume', priority: 500, title: 'Quiet Path Series · Day 2', eyebrow: 'Resume where you left off', body: 'Saved just now.' }),
    ],
  },
  { label: 'Zero cards', cards: [] },
  { label: 'One card', cards: [card({ id: 'o1', title: 'Evening wind-down', body: 'Close the day with a short examen.' })] },
  {
    label: '30 cards (10× realistic)',
    cards: Array.from({ length: 30 }, (_, i) =>
      card({ id: `m${i}`, title: `Card number ${i + 1}`, body: 'A body line for a deep stack.', priority: 500 - i }),
    ),
  },
  { label: 'Empty title', cards: [card({ id: 'e1', title: '', body: 'Body under an empty title.' })] },
  { label: 'One-word title, no body, no actions', cards: [{ ...card({ id: 'w1', title: 'Reflect' }), actions: undefined, body: undefined }] },
  {
    label: 'Several sentences in body (unclamped quote card)',
    cards: [card({ id: 'l1', title: 'Remember this', eyebrow: 'From your highlight', body: LONG_BODY })],
  },
  {
    label: 'Clamped body (bodyNumberOfLines=3) with same long quote',
    cards: [card({ id: 'l2', title: 'Remember this', eyebrow: 'From your highlight', body: LONG_BODY, bodyNumberOfLines: 3 })],
  },
  { label: 'Unbreakable 78-char string in title and body', cards: [card({ id: 'u1', title: UNBREAKABLE, body: UNBREAKABLE })] },
  {
    label: 'Emoji mixed into title and body',
    cards: [card({ id: 'em1', title: '🙏 Grateful tonight ✨', body: 'Prayed about 🕊️ peace and it helped 🌙 more than expected.' })],
  },
  {
    label: 'RTL text (Arabic) in title and body',
    cards: [card({ id: 'r1', title: 'كن ساكنًا واعلم أني أنا الله', body: 'هذه الآية رافقتني طوال اليوم وأعادت لي الهدوء.' })],
  },
  {
    label: 'Mixed direction — LTR name inside RTL sentence',
    cards: [card({ id: 'r2', title: 'قرأت في Unfold عن السكينة', body: 'الجزء عن Psalm 46:10 لمسني كثيرًا.' })],
  },
  {
    label: 'Two actions (primary + secondary)',
    cards: [
      card({
        id: 'a2',
        title: 'Day 1 is ready',
        body: 'Pick up where you left off, or start fresh.',
        actions: [
          { label: 'Continue reading', onPress: noop, accessibilityLabel: 'Continue reading' },
          { label: 'Not tonight', onPress: noop, accessibilityLabel: 'Not tonight', tone: 'secondary' },
        ],
      }),
    ],
  },
  {
    label: 'Long action label',
    cards: [
      card({
        id: 'a3',
        title: 'Continue your series',
        actions: [{ label: 'Continue reading where you left off yesterday evening', onPress: noop, accessibilityLabel: 'Continue' }],
      }),
    ],
  },
  {
    label: 'Fixed 320px container — typical stack',
    width: 320,
    cards: [
      card({ id: 'n1', title: 'Check in with today’s reading', eyebrow: 'Companion note', body: 'Anything from “When the Path Is Quiet” worth revisiting?' }),
      card({ id: 'n2', kind: 'evening', priority: 400, title: 'Evening wind-down', body: 'Close the day.' }),
    ],
  },
  {
    label: 'Fixed 320px container — unbreakable string',
    width: 320,
    cards: [card({ id: 'n3', title: UNBREAKABLE, body: UNBREAKABLE })],
  },
  {
    label: 'Squeezed by a flex sibling (stack shares row with a 200px block)',
    squeeze: true,
    cards: [card({ id: 's1', title: 'Check in with today’s reading', body: 'Anything worth revisiting tonight?' })],
  },
  {
    label: 'Very wide container (700px)',
    width: 700,
    cards: [card({ id: 'wd1', title: 'Check in with today’s reading', eyebrow: 'Companion note', body: 'Anything from “When the Path Is Quiet” worth revisiting?' })],
  },
];

export default function BreakTodayCardStack() {
  const { colors } = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 4 }}>/break — TodayCardStack</Text>
      <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 24 }}>
        Real component, fixture props. Axes dropped: State (no loading/error/disabled props — loading arrives as a distinct card
        descriptor), Environment (dark is the default here; toggle theme in You → Preferences to view light).
      </Text>
      {scenarios.map((s) => (
        <View key={s.label} style={{ marginBottom: 36 }}>
          <Text style={{ color: colors.accent, fontSize: 13, marginBottom: 10 }}>{s.label}</Text>
          {s.squeeze ? (
            <View style={{ flexDirection: 'row' }}>
              <View style={{ width: 200, height: 80, backgroundColor: colors.inputBackground, borderRadius: 12, marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <TodayCardStack cards={s.cards} />
              </View>
            </View>
          ) : (
            <View style={s.width ? { width: s.width, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' } : undefined}>
              <TodayCardStack cards={s.cards} />
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}
