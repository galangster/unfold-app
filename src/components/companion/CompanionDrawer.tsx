/**
 * CompanionDrawer
 * Left-edge overlay drawer for companion conversation history.
 * Supports edge-swipe to open, swipe-back or scrim-tap to close.
 *
 * Exports:
 *   CompanionDrawer    — drawer + scrim component
 *   useDrawerGesture   — pan gesture hook for the parent screen
 *   DRAWER_WIDTH       — constant for parent layout use
 */

import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Dimensions,
  StyleSheet,
  Alert,
  ActionSheetIOS,
  LayoutAnimation,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  withSpring,
  interpolate,
  runOnJS,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';
import { PlusCircle } from 'phosphor-react-native';
import { useShallow } from 'zustand/react/shallow';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/lib/theme';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { alpha } from '@/components/ui';
import {
  useCompanionChatStore,
  type Conversation,
  deriveConversationTitleFromText,
  sentenceCaseTitle,
} from '@/lib/companion-chat-store';

// ── Constants ─────────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get('window').width;
export const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.80, 320);

const SPRING_CONFIG = { duration: 300, dampingRatio: 1 } as const; // Critically damped — no bounce
const EDGE_WIDTH = 36;
const ACTIVE_OFFSET_X = 5;
const FAIL_OFFSET_Y = 15;
const MIN_SWIPE_DISTANCE = 60;
const VELOCITY_THRESHOLD = 500;
const VELOCITY_PROJECTION = 0.05;

// Time thresholds for grouping
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

// ── Types ─────────────────────────────────────────────────────────────────

interface CompanionDrawerProps {
  translateX: SharedValue<number>;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onNewChat: () => void;
}

type ListItem =
  | { type: 'header'; label: string }
  | { type: 'conversation'; conversation: Conversation };

// ── Helpers ───────────────────────────────────────────────────────────────

function getConversationTitle(conv: Conversation): string {
  // Use AI-generated title if available (capped at 60 chars for safety).
  // sentenceCaseTitle de-slops machine Title Case from the backend title
  // endpoint and from legacy persisted titles.
  if (conv.title) {
    const display = sentenceCaseTitle(conv.title);
    return display.length > 60 ? display.slice(0, 57) + '…' : display;
  }
  // Fallback: first user message, truncated
  const firstUser = (conv.messages ?? []).find(m => m.role === 'user');
  if (firstUser) {
    const derived = deriveConversationTitleFromText(firstUser.content);
    if (derived) return derived;
  }
  return 'New chat';
}

function formatRelativeDate(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) {
    const h = Math.floor(diff / 3_600_000);
    return `${h}h ago`;
  }
  if (diff < ONE_DAY_MS) {
    const h = Math.floor(diff / 3_600_000);
    return `${h}h ago`;
  }
  if (diff < ONE_WEEK_MS) {
    const d = Math.floor(diff / ONE_DAY_MS);
    return `${d}d ago`;
  }
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function buildListItems(conversations: Conversation[]): ListItem[] {
  const now = Date.now();
  const sorted = [...conversations].sort((a, b) => b.lastMessageAt - a.lastMessageAt);

  const starred: Conversation[] = [];
  const today: Conversation[] = [];
  const thisWeek: Conversation[] = [];
  const earlier: Conversation[] = [];

  for (const conv of sorted) {
    if (conv.pinned) {
      starred.push(conv);
      continue;
    }
    const age = now - conv.createdAt;
    if (age < ONE_DAY_MS) today.push(conv);
    else if (age < ONE_WEEK_MS) thisWeek.push(conv);
    else earlier.push(conv);
  }

  const items: ListItem[] = [];

  if (starred.length > 0) {
    items.push({ type: 'header', label: 'Starred' });
    for (const conv of starred) items.push({ type: 'conversation', conversation: conv });
  }
  if (today.length > 0) {
    items.push({ type: 'header', label: 'Today' });
    for (const conv of today) items.push({ type: 'conversation', conversation: conv });
  }
  if (thisWeek.length > 0) {
    items.push({ type: 'header', label: 'This Week' });
    for (const conv of thisWeek) items.push({ type: 'conversation', conversation: conv });
  }
  if (earlier.length > 0) {
    items.push({ type: 'header', label: 'Earlier' });
    for (const conv of earlier) items.push({ type: 'conversation', conversation: conv });
  }

  return items;
}

// ── useDrawerGesture hook ─────────────────────────────────────────────────

export function useDrawerGesture(
  translateX: SharedValue<number>,
  isOpen: boolean,
  onOpen: () => void,
  onClose: () => void,
) {
  const startX = useSharedValue(0);
  const isEdgeSwipe = useSharedValue(false);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-ACTIVE_OFFSET_X, ACTIVE_OFFSET_X])
    .failOffsetY([-FAIL_OFFSET_Y, FAIL_OFFSET_Y])
    .onStart((e) => {
      startX.value = translateX.value;
      // When closed, only activate for touches within EDGE_WIDTH of left edge
      // When open, activate from anywhere
      isEdgeSwipe.value = isOpen || e.absoluteX <= EDGE_WIDTH;
    })
    .onUpdate((e) => {
      if (!isEdgeSwipe.value) return;
      const newX = Math.max(-DRAWER_WIDTH, Math.min(0, startX.value + e.translationX));
      translateX.value = newX;
    })
    .onEnd((e) => {
      if (!isEdgeSwipe.value) return;
      const distance = Math.abs(e.translationX);

      if (distance < MIN_SWIPE_DISTANCE) {
        translateX.value = withSpring(isOpen ? 0 : -DRAWER_WIDTH, SPRING_CONFIG);
        return;
      }

      if (Math.abs(e.velocityX) > VELOCITY_THRESHOLD) {
        if (e.velocityX > 0) {
          translateX.value = withSpring(0, SPRING_CONFIG);
          runOnJS(onOpen)();
        } else {
          translateX.value = withSpring(-DRAWER_WIDTH, SPRING_CONFIG);
          runOnJS(onClose)();
        }
        return;
      }

      const projected = translateX.value + VELOCITY_PROJECTION * e.velocityX;
      const threshold = -DRAWER_WIDTH * 0.5;

      if (projected > threshold) {
        translateX.value = withSpring(0, SPRING_CONFIG);
        runOnJS(onOpen)();
      } else {
        translateX.value = withSpring(-DRAWER_WIDTH, SPRING_CONFIG);
        runOnJS(onClose)();
      }
    });

  return panGesture;
}

// ── ConversationRow ───────────────────────────────────────────────────────

interface ConversationRowProps {
  conversation: Conversation;
  isCurrent: boolean;
  onSelect: (conv: Conversation) => void;
  onDelete: (id: string) => void;
  onRename: (id: string) => void;
  onPin: (id: string) => void;
}

function ConversationRow({ conversation, isCurrent, onSelect, onDelete, onRename, onPin }: ConversationRowProps) {
  const { colors } = useTheme();
  const title = getConversationTitle(conversation);
  const dateLabel = formatRelativeDate(conversation.lastMessageAt);

  const isPinned = conversation.pinned ?? false;

  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [isPinned ? 'Unstar' : 'Star', 'Rename', 'Delete', 'Cancel'],
        destructiveButtonIndex: 2,
        cancelButtonIndex: 3,
        title: title,
      },
      (buttonIndex) => {
        if (buttonIndex === 0) onPin(conversation.id);
        if (buttonIndex === 1) onRename(conversation.id);
        if (buttonIndex === 2) onDelete(conversation.id);
      },
    );
  }, [conversation.id, title, isPinned, onPin, onRename, onDelete]);

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onSelect(conversation)}
      onLongPress={handleLongPress}
      delayLongPress={400}
      style={[
        styles.conversationRow,
        isCurrent && {
          backgroundColor: alpha(colors.backgroundElevated, 0.5),
          borderRadius: Radius.sm,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${dateLabel}${isCurrent ? ', current conversation' : ''}`}
    >
      <Text
        style={[styles.convTitle, { color: colors.text }]}
        numberOfLines={1}
      >
        {title}
      </Text>
      <Text style={[styles.convDate, { color: colors.textMuted }]}>{dateLabel}</Text>
    </TouchableOpacity>
  );
}

// ── CompanionDrawer ───────────────────────────────────────────────────────

export function CompanionDrawer({
  translateX,
  isOpen,
  onOpen: _onOpen,
  onClose,
  onNewChat,
}: CompanionDrawerProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const activeId = useCompanionChatStore((s) => s.activeConversationId);
  const allWithMessages = useCompanionChatStore(
    useShallow((s) => (s.conversations ?? []).filter(c => (c.messages ?? []).length > 0))
  );
  const deleteConversation = useCompanionChatStore((s) => s.deleteConversation);
  const setActiveConversation = useCompanionChatStore((s) => s.setActiveConversation);
  const updateConversation = useCompanionChatStore((s) => s.updateConversation);

  const listItems = useMemo(() => buildListItems(allWithMessages), [allWithMessages]);

  const handleSelectConversation = useCallback(
    (conv: Conversation) => {
      if (conv.id === activeId) {
        onClose();
      } else {
        setActiveConversation(conv.id);
        onClose();
      }
    },
    [activeId, setActiveConversation, onClose],
  );

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
            onPress: () => {
              LayoutAnimation.configureNext({
                duration: 250,
                update: { type: LayoutAnimation.Types.easeOut },
                delete: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
              });
              deleteConversation(id);
            },
          },
        ],
      );
    },
    [deleteConversation],
  );

  const handleRename = useCallback(
    (id: string) => {
      const conv = allWithMessages.find(c => c.id === id);
      const currentTitle = conv ? getConversationTitle(conv) : '';
      Alert.prompt(
        'Rename Conversation',
        undefined,
        (newTitle) => {
          if (newTitle?.trim()) {
            updateConversation(id, { title: newTitle.trim() });
          }
        },
        'plain-text',
        currentTitle,
      );
    },
    [allWithMessages, updateConversation],
  );

  const handlePin = useCallback(
    (id: string) => {
      const conv = allWithMessages.find(c => c.id === id);
      const isPinned = conv?.pinned ?? false;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      LayoutAnimation.configureNext({
        duration: 250,
        update: { type: LayoutAnimation.Types.easeOut },
        create: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
      });
      updateConversation(id, { pinned: !isPinned });
    },
    [allWithMessages, updateConversation],
  );

  // Scrim animated style — opacity only. pointerEvents controlled by isOpen prop.
  // IMPORTANT: Do NOT set pointerEvents in animated style — it conflicts with
  // the prop and can leave the scrim touch-active when the drawer is closed
  // (spring animation doesn't settle to exact target value).
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-DRAWER_WIDTH, 0], [0, 0.5]),
  }));

  // Drawer animated style — slides in from left
  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === 'header') {
        return (
          <Text
            style={[styles.sectionHeader, { color: colors.textMuted }]}
          >
            {item.label}
          </Text>
        );
      }

      return (
        <ConversationRow
          conversation={item.conversation}
          isCurrent={item.conversation.id === activeId}
          onSelect={handleSelectConversation}
          onDelete={handleDelete}
          onRename={handleRename}
          onPin={handlePin}
        />
      );
    },
    [colors, activeId, handleSelectConversation, handleDelete, handleRename, handlePin],
  );

  const keyExtractor = useCallback(
    (item: ListItem) =>
      item.type === 'header' ? `h-${item.label}` : `c-${item.conversation.id}`,
    [],
  );

  return (
    <>
      {/* Scrim */}
      <Animated.View
        style={[styles.scrim, scrimStyle]}
        pointerEvents={isOpen ? 'auto' : 'none'}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          activeOpacity={1}
          accessible={false}
        />
      </Animated.View>

      {/* Drawer panel */}
      <Animated.View
        style={[
          styles.drawer,
          {
            width: DRAWER_WIDTH,
            backgroundColor: colors.background,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
          drawerStyle,
        ]}
        pointerEvents={isOpen ? 'auto' : 'none'}
        accessibilityViewIsModal={isOpen}
        accessibilityElementsHidden={!isOpen}
        importantForAccessibility={isOpen ? 'yes' : 'no-hide-descendants'}
      >
        {/* New Chat button */}
        <TouchableOpacity
          onPress={onNewChat}
          activeOpacity={0.7}
          style={[styles.newChatButton, { borderBottomColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel="Start new conversation"
        >
          <PlusCircle size={20} color={colors.accent} weight="light" />
          <Text style={[styles.newChatLabel, { color: colors.accent }]}>
            New Chat
          </Text>
        </TouchableOpacity>

        {/* Conversation list */}
        {listItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              Your conversations will appear here
            </Text>
          </View>
        ) : (
          <FlatList
            data={listItems}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </Animated.View>
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000',
    zIndex: 10,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    zIndex: 11,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 12,
  },
  newChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['4'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  newChatLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.base,
  },
  listContent: {
    paddingBottom: Spacing['4'],
  },
  sectionHeader: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.xs,
    letterSpacing: 0.1,
    paddingHorizontal: Spacing['4'],
    paddingTop: Spacing['4'],
    paddingBottom: Spacing['2'],
  },
  conversationRow: {
    marginHorizontal: Spacing['3'],
    marginBottom: Spacing['1'],
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['3'],
    borderRadius: Radius.md,
  },
  convTitle: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    marginBottom: 2,
  },
  convDate: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
  },
  deleteAction: {
    backgroundColor: '#E53E3E',
    justifyContent: 'center',
    alignItems: 'center',
    width: 64,
    marginBottom: Spacing['1'],
    marginRight: Spacing['3'],
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
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
});
