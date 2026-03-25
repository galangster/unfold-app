/**
 * ArchivedConversationView — read-only viewer for past conversations.
 * Full-screen overlay with back button, inverted message list, and
 * "This conversation has ended" footer. No input bar.
 *
 * Reuses UserMessageBubble + CompanionMessageContent from the main
 * companion screen for visual consistency.
 */
import React, { useMemo, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeftIcon } from 'phosphor-react-native';
import { useTheme } from '@/lib/theme';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import type { Conversation, CompanionMessage } from '@/lib/companion-chat-store';
import { UserMessageBubble } from './UserMessageBubble';
import { CompanionMessageContent } from './CompanionMessageContent';

interface Props {
  conversation: Conversation;
  onClose: () => void;
}

function formatDateFull(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// ── Message item (memoized for FlatList perf) ──────────────────────────────

const ArchivedMessageItem = React.memo(function ArchivedMessageItem({
  item,
  index,
  messages,
}: {
  item: CompanionMessage;
  index: number;
  messages: CompanionMessage[];
}) {
  // In inverted list, index 0 is the LAST message (newest).
  // prevMsg = the message that appeared before this one chronologically.
  const prevMsg = index < messages.length - 1 ? messages[index + 1] : null;
  const isFirstInGroup = !prevMsg || prevMsg.role !== item.role;
  const gapStyle = isFirstInGroup ? styles.gapLarge : styles.gapSmall;

  if (item.role === 'user') {
    return (
      <View style={gapStyle}>
        <UserMessageBubble message={item} />
      </View>
    );
  }

  return (
    <View style={gapStyle}>
      <CompanionMessageContent
        message={item}
        showIcon={isFirstInGroup}
        isStreaming={false}
      />
    </View>
  );
}, (prev, next) =>
  prev.item.id === next.item.id &&
  prev.item.content === next.item.content &&
  prev.index === next.index
);

// ── Main component ─────────────────────────────────────────────────────────

export function ArchivedConversationView({ conversation, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const invertedMessages = useMemo(
    () => [...conversation.messages].reverse(),
    [conversation.messages]
  );

  const keyExtractor = useCallback((item: CompanionMessage) => item.id, []);

  const renderItem = useCallback(
    ({ item, index }: { item: CompanionMessage; index: number }) => (
      <ArchivedMessageItem
        item={item}
        index={index}
        messages={invertedMessages}
      />
    ),
    [invertedMessages]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 4,
          },
        ]}
      >
        <TouchableOpacity
          onPress={onClose}
          hitSlop={8}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeftIcon size={22} color={colors.text} weight="light" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text
            style={[
              styles.summaryText,
              { color: colors.text },
            ]}
            numberOfLines={1}
          >
            {conversation.summary || 'Conversation'}
          </Text>
          <Text
            style={[
              styles.dateText,
              { color: colors.textMuted },
            ]}
          >
            {formatDateFull(conversation.createdAt)}
          </Text>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        data={invertedMessages}
        inverted
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={11}
        removeClippedSubviews
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.footerContainer}>
            <Text
              style={[
                styles.footerText,
                { color: colors.textMuted },
              ]}
            >
              This conversation has ended
            </Text>
          </View>
        }
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingBottom: 8,
    paddingHorizontal: Spacing['4'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
  },
  headerText: {
    flex: 1,
  },
  summaryText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.base,
  },
  dateText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
  },
  listContent: {
    paddingVertical: Spacing['2'],
  },
  footerContainer: {
    paddingVertical: Spacing['4'],
    alignItems: 'center',
  },
  footerText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    fontStyle: 'italic',
  },
  gapLarge: {
    marginTop: 16,
  },
  gapSmall: {
    marginTop: 6,
  },
});
