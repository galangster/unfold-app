// Throwaway /break harness — renders the real CompanionMessageContent under
// every scenario production can hand it. Not committed; delete on request.
import { ScrollView, Text, View } from 'react-native';
import { CompanionMessageContent } from '@/components/companion/CompanionMessageContent';
import type { CompanionMessage } from '@/lib/companion-chat-store';
import { useTheme } from '@/lib/theme';

const noop = () => {};

function msg(partial: Partial<CompanionMessage> & { id: string; content: string }): CompanionMessage {
  return {
    role: 'companion',
    timestamp: Date.now(),
    status: 'complete',
    ...partial,
  } as CompanionMessage;
}

const RICH =
  "That tension you're describing is so real. **Psalm 46:10** says *\"Be still, and know that I am God.\"* Stillness isn't passivity — it's attention.\n\nA few things that might help:\n\n- Start with two quiet minutes before you open anything\n- Re-read yesterday's highlight\n- Name the worry out loud once, then set it down\n\nWould you like to look at how Elijah handled this in **1 Kings 19:11-12**?";
const UNBREAKABLE = 'Donaudampfschiffahrtselektrizitaetenhauptbetriebswerkbauunterbeamtengesellschaft';

const scenarios: {
  label: string;
  width?: number;
  message: CompanionMessage;
  isStreaming?: boolean;
  isSearching?: boolean;
  showIcon?: boolean;
  onRetry?: () => void;
}[] = [
  { label: 'Typical — rich text, verse refs, bold/italic, bullet list', message: msg({ id: 'a', content: RICH, suggestions: ['Show me 1 Kings 19', 'How do I practice stillness?'] }) },
  { label: 'Empty content, complete status', message: msg({ id: 'b', content: '' }) },
  { label: 'One word', message: msg({ id: 'c', content: 'Amen.' }) },
  {
    label: 'Streaming — mid-paragraph tail',
    isStreaming: true,
    message: msg({ id: 'd', status: 'streaming', content: 'Grace is not something you earn by holding it all together. It meets you exactly whe' }),
  },
  { label: 'Streaming — zero tokens yet (typing indicator)', isStreaming: true, message: msg({ id: 'e', status: 'streaming', content: '' }) },
  { label: 'Searching state ("Looking something up…")', isStreaming: true, isSearching: true, message: msg({ id: 'f', status: 'streaming', content: '' }) },
  { label: 'Error with retry handler', onRetry: noop, message: msg({ id: 'g', status: 'error', content: '' }) },
  { label: 'Error, no retry handler', message: msg({ id: 'h', status: 'error', content: 'Partial answer before the connection dropped' }) },
  { label: 'Unbreakable 78-char string', message: msg({ id: 'i', content: `The word ${UNBREAKABLE} has no break points at all.` }) },
  { label: 'Emoji-heavy', message: msg({ id: 'j', content: '🙏 Praying with you tonight ✨🕊️ — Psalm 4:8 🌙' }) },
  { label: 'RTL (Arabic)', message: msg({ id: 'k', content: 'كن ساكنًا واعلم أني أنا الله. هذه دعوة إلى الثقة العميقة.' }) },
  {
    label: 'Deep-link card + long preview title',
    message: msg({
      id: 'l',
      content: 'You wrote about this on Day 2 — worth revisiting:',
      deepLinks: [
        {
          devotionalId: 'seeded-qa-devotional',
          dayNumber: 2,
          type: 'journal',
          preview: { title: 'Strength for the Middle of the Longest Week of the Year', scripture: 'Isaiah 40:31', date: '2026-08-30' },
        },
      ],
    }),
  },
  {
    label: 'Ten suggestion chips (overflow behavior)',
    message: msg({ id: 'm', content: 'A few directions we could take:', suggestions: Array.from({ length: 10 }, (_, i) => `Suggestion chip number ${i + 1}`) }),
  },
  { label: '320px container — rich message', width: 320, message: msg({ id: 'n', content: RICH }) },
  { label: '320px container — unbreakable string', width: 320, message: msg({ id: 'o', content: UNBREAKABLE }) },
];

export default function BreakCompanionMessage() {
  const { colors } = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 4 }}>/break — CompanionMessageContent</Text>
      <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 24 }}>
        Real component, fixture messages. Axes dropped: Quantity (a single message renders once; the thread list is the screen's
        concern), Environment (toggle theme in You → Preferences for light mode).
      </Text>
      {scenarios.map((s) => (
        <View key={s.label} style={{ marginBottom: 36 }}>
          <Text style={{ color: colors.accent, fontSize: 13, marginBottom: 10 }}>{s.label}</Text>
          <View style={s.width ? { width: s.width, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', padding: 4 } : undefined}>
            <CompanionMessageContent
              message={s.message}
              showIcon={s.showIcon ?? true}
              isStreaming={s.isStreaming ?? false}
              isSearching={s.isSearching}
              onVersePress={noop}
              onRetry={s.onRetry}
            />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
