/**
 * ConversationHistorySheet
 * Bottom sheet that displays past companion conversations grouped by time.
 * Conversations are grouped into "This Week" / "Last Week" / "Earlier".
 * Swipe-to-delete via ReanimatedSwipeable with confirmation alert.
 */

import React, { useMemo, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SharedValue } from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';
import { TrashIcon } from 'phosphor-react-native';
import { useTheme } from '@/lib/theme';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Sheet } from '@/components/ui/Sheet';
import {
  useCompanionChatStore,
  type Conversation,
} from '@/lib/companion-chat-store';
import { alpha } from '@/components/ui';

// ── Types ─────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelectConversation: (conversation: Conversation) => void;
}

interface GroupedSection {
  title: string;
  data: Conversation[];
}

type FlatItem =
  | { type: 'header'; title: string }
  | { type: 'conversation'; conversation: Conversation };

// ── Helpers ───────────────────────────────────────────────────────────────

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

function groupConversations(conversations: Conversation[]): GroupedSection[] {
  const now = Date.now();
  const oneWeekAgo = now - ONE_WEEK_MS;
  const twoWeeksAgo = now - TWO_WEEKS_MS;

  const thisWeek: Conversation[] = [];
  const lastWeek: Conversation[] = [];
  const earlier: Conversation[] = [];

  for (const conv of conversations) {
    if (conv.lastMessageAt > oneWeekAgo) thisWeek.push(conv);
    else if (conv.lastMessageAt > twoWeeksAgo) lastWeek.push(conv);
    else earlier.push(conv);
  }

  const sections: GroupedSection[] = [];
  if (thisWeek.length > 0) sections.push({ title: 'This Week', data: thisWeek });
  if (lastWeek.length > 0) sections.push({ title: 'Last Week', data: lastWeek });
  if (earlier.length > 0) sections.push({ title: 'Earlier', data: earlier });
  return sections;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// ── Component ─────────────────────────────────────────────────────────────

export function ConversationHistorySheet({
  visible,
  onClose,
  onSelectConversation,
}: Props) {
  const { colors } = useTheme();
  // Show ALL conversations with messages, including the active one.
  // The active conversation gets a "Current" label so users always see their history.
  const activeId = useCompanionChatStore((s) => s.activeConversationId);
  const allWithMessages = useCompanionChatStore(
    useShallow((s) => s.conversations.filter(c => c.messages.length > 0))
  );
  const deleteConversation = useCompanionChatStore((s) => s.deleteConversation);

  const archivedConversations = useMemo(
    () => [...allWithMessages].sort((a, b) => b.lastMessageAt - a.lastMessageAt),
    [allWithMessages],
  );

  const sections = useMemo(
    () => groupConversations(archivedConversations),
    [archivedConversations],
  );

  const flatData = useMemo(() => {
    const items: FlatItem[] = [];
    for (const section of sections) {
      items.push({ type: 'header', title: section.title });
      for (const conv of section.data) {
        items.push({ type: 'conversation', conversation: conv });
      }
    }
    return items;
  }, [sections]);

  const handleDelete = useCallback(
    (id: string) => {
      Alert.alert(
        'Delete Conversation',
        'This conversation will be permanently removed.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => deleteConversation(id),
          },
        ],
      );
    },
    [deleteConversation],
  );

  const keyExtractor = useCallback(
    (item: FlatItem) =>
      item.type === 'header' ? `h-${item.title}` : `c-${item.conversation.id}`,
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: FlatItem }) => {
      if (item.type === 'header') {
        return (
          <Text
            style={[
              styles.sectionHeader,
              { color: colors.textMuted },
            ]}
          >
            {item.title}
          </Text>
        );
      }

      const conv = item.conversation;
      const msgCount = conv.messages.length;
      const isCurrent = conv.id === activeId;
      const summary = isCurrent
        ? 'Current conversation'
        : (conv.summary || 'Conversation');

      const row = (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => isCurrent ? onClose() : onSelectConversation(conv)}
          style={[
            styles.conversationRow,
            {
              marginHorizontal: Spacing['4'],
              backgroundColor: alpha(colors.backgroundElevated, 0.6),
              borderLeftWidth: isCurrent ? 2 : 0,
              borderLeftColor: isCurrent ? colors.accent : 'transparent',
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${summary}, ${formatDate(conv.lastMessageAt)}, ${msgCount} message${msgCount !== 1 ? 's' : ''}`}
        >
          <Text
            style={[styles.summary, { color: isCurrent ? colors.accent : colors.text }]}
            numberOfLines={1}
          >
            {summary}
          </Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {formatDate(conv.lastMessageAt)} · {msgCount} message
            {msgCount !== 1 ? 's' : ''}
          </Text>
        </TouchableOpacity>
      );

      // Don't allow swipe-to-delete on the current conversation
      if (isCurrent) return row;

      return (
        <ReanimatedSwipeable
          overshootRight={false}
          renderRightActions={(
            _progress: SharedValue<number>,
            _translation: SharedValue<number>,
          ) => (
            <TouchableOpacity
              onPress={() => handleDelete(conv.id)}
              activeOpacity={0.7}
              style={styles.deleteAction}
              accessibilityRole="button"
              accessibilityLabel="Delete conversation"
            >
              <TrashIcon size={20} color="#fff" weight="light" />
            </TouchableOpacity>
          )}
        >
          {row}
        </ReanimatedSwipeable>
      );
    },
    [colors, handleDelete, onSelectConversation],
  );

  return (
    <Sheet visible={visible} onClose={onClose} bottomPadding={40}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>
            Conversations
          </Text>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close conversation history"
          >
            <Text style={[styles.doneButton, { color: colors.accent }]}>
              Done
            </Text>
          </TouchableOpacity>
        </View>

        {archivedConversations.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              Your conversation history will appear here
            </Text>
          </View>
        ) : (
          <FlatList
            data={flatData}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
          />
        )}
      </View>
    </Sheet>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    minHeight: 280,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['3'],
  },
  title: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.lg,
  },
  doneButton: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
  },
  sectionHeader: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: Spacing['4'],
    paddingTop: Spacing['4'],
    paddingBottom: Spacing['2'],
  },
  conversationRow: {
    marginBottom: Spacing['2'],
    padding: Spacing['3'],
    borderRadius: Radius.md,
  },
  summary: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    marginBottom: 2,
  },
  meta: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
  },
  deleteAction: {
    backgroundColor: '#E53E3E',
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    marginBottom: Spacing['2'],
    borderRadius: Radius.md,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['8'],
  },
  emptyText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    textAlign: 'center',
  },
});
