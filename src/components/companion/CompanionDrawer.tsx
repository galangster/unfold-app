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

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Dimensions,
  StyleSheet,
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

type ActionMode = 'actions' | 'rename' | 'delete';

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
  onOpenActions: (conv: Conversation) => void;
}

function ConversationRow({ conversation, isCurrent, onSelect, onOpenActions }: ConversationRowProps) {
  const { colors } = useTheme();
  const title = getConversationTitle(conversation);
  const dateLabel = formatRelativeDate(conversation.lastMessageAt);

  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onOpenActions(conversation);
  }, [conversation, onOpenActions]);

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
      accessibilityHint="Long press for conversation actions"
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

interface ConversationActionPanelProps {
  conversation: Conversation | null;
  mode: ActionMode;
  renameDraft: string;
  onRenameDraftChange: (value: string) => void;
  onClose: () => void;
  onPin: () => void;
  onStartRename: () => void;
  onConfirmRename: () => void;
  onStartDelete: () => void;
  onConfirmDelete: () => void;
}

function ConversationActionPanel({
  conversation,
  mode,
  renameDraft,
  onRenameDraftChange,
  onClose,
  onPin,
  onStartRename,
  onConfirmRename,
  onStartDelete,
  onConfirmDelete,
}: ConversationActionPanelProps) {
  const { colors } = useTheme();

  if (!conversation) return null;

  const title = getConversationTitle(conversation);
  const isPinned = conversation.pinned ?? false;
  const canSaveRename = renameDraft.trim().length > 0;
  const heading = mode === 'rename'
    ? 'Rename conversation'
    : mode === 'delete'
      ? 'Delete conversation'
      : 'Conversation options';

  return (
    <View style={styles.actionOverlay} pointerEvents="auto">
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        activeOpacity={1}
        accessible={false}
      />

      <View
        style={[
          styles.actionPanel,
          {
            backgroundColor: colors.backgroundElevated,
            borderColor: colors.border,
          },
        ]}
        accessibilityViewIsModal
      >
        <Text style={[styles.actionEyebrow, { color: colors.accent }]}>Companion</Text>
        <Text style={[styles.actionHeading, { color: colors.text }]}>{heading}</Text>
        <Text style={[styles.actionConversationTitle, { color: colors.textMuted }]} numberOfLines={2}>
          {title}
        </Text>

        {mode === 'actions' && (
          <View style={styles.actionButtonGroup}>
            <TouchableOpacity
              activeOpacity={0.76}
              onPress={onPin}
              style={[styles.actionButton, { borderColor: colors.border, backgroundColor: alpha(colors.accent, 0.08) }]}
              accessibilityRole="button"
              accessibilityLabel={isPinned ? 'Unstar conversation' : 'Star conversation'}
            >
              <Text style={[styles.actionButtonLabel, { color: colors.text }]}>
                {isPinned ? 'Unstar' : 'Star'}
              </Text>
              <Text style={[styles.actionButtonMeta, { color: colors.textMuted }]}>
                {isPinned ? 'Move this chat out of Starred' : 'Keep this chat easy to find'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.76}
              onPress={onStartRename}
              style={[styles.actionButton, { borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel="Rename conversation"
            >
              <Text style={[styles.actionButtonLabel, { color: colors.text }]}>Rename</Text>
              <Text style={[styles.actionButtonMeta, { color: colors.textMuted }]}>Give this thread a clearer title</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.76}
              onPress={onStartDelete}
              style={[styles.actionButton, { borderColor: alpha(colors.error, 0.35), backgroundColor: alpha(colors.error, 0.08) }]}
              accessibilityRole="button"
              accessibilityLabel="Delete conversation"
            >
              <Text style={[styles.actionButtonLabel, { color: colors.error }]}>Delete</Text>
              <Text style={[styles.actionButtonMeta, { color: colors.textMuted }]}>Remove this conversation permanently</Text>
            </TouchableOpacity>
          </View>
        )}

        {mode === 'rename' && (
          <View style={styles.actionButtonGroup}>
            <TextInput
              value={renameDraft}
              onChangeText={onRenameDraftChange}
              autoFocus
              selectTextOnFocus
              placeholder="Conversation title"
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.accent}
              cursorColor={colors.accent}
              style={[
                styles.renameInput,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.inputBackground,
                },
              ]}
              accessibilityLabel="Conversation title"
            />
            <View style={styles.actionFooterRow}>
              <TouchableOpacity
                activeOpacity={0.76}
                onPress={onClose}
                style={[styles.secondaryAction, { borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel="Cancel rename"
              >
                <Text style={[styles.secondaryActionText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={canSaveRename ? 0.76 : 1}
                onPress={canSaveRename ? onConfirmRename : undefined}
                disabled={!canSaveRename}
                style={[
                  styles.primaryAction,
                  { backgroundColor: canSaveRename ? colors.accent : alpha(colors.textMuted, 0.25) },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Save conversation title"
                accessibilityState={{ disabled: !canSaveRename }}
              >
                <Text style={[styles.primaryActionText, { color: colors.background }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {mode === 'delete' && (
          <View style={styles.actionButtonGroup}>
            <Text style={[styles.deleteCopy, { color: colors.textMuted }]}>This permanently removes the conversation from your history.</Text>
            <View style={styles.actionFooterRow}>
              <TouchableOpacity
                activeOpacity={0.76}
                onPress={onClose}
                style={[styles.secondaryAction, { borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel="Cancel delete"
              >
                <Text style={[styles.secondaryActionText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.76}
                onPress={onConfirmDelete}
                style={[styles.primaryAction, { backgroundColor: colors.error }]}
                accessibilityRole="button"
                accessibilityLabel="Permanently delete conversation"
              >
                <Text style={[styles.primaryActionText, { color: colors.background }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
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
  const [actionConversation, setActionConversation] = useState<Conversation | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>('actions');
  const [renameDraft, setRenameDraft] = useState('');

  const activeActionConversation = useMemo(() => {
    if (!actionConversation) return null;
    return allWithMessages.find(c => c.id === actionConversation.id) ?? actionConversation;
  }, [actionConversation, allWithMessages]);

  const closeActionPanel = useCallback(() => {
    setActionConversation(null);
    setActionMode('actions');
    setRenameDraft('');
  }, []);

  const openActionPanel = useCallback((conv: Conversation) => {
    setActionConversation(conv);
    setActionMode('actions');
    setRenameDraft(getConversationTitle(conv));
  }, []);

  const handleSelectConversation = useCallback(
    (conv: Conversation) => {
      if (conv.id === activeId) {
        onClose();
      } else {
        setActiveConversation(conv.id);
        onClose();
      }
      closeActionPanel();
    },
    [activeId, setActiveConversation, onClose, closeActionPanel],
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

  const handleActionPin = useCallback(() => {
    if (!activeActionConversation) return;
    handlePin(activeActionConversation.id);
    closeActionPanel();
  }, [activeActionConversation, handlePin, closeActionPanel]);

  const handleStartRename = useCallback(() => {
    if (!activeActionConversation) return;
    setRenameDraft(getConversationTitle(activeActionConversation));
    setActionMode('rename');
  }, [activeActionConversation]);

  const handleConfirmRename = useCallback(() => {
    if (!activeActionConversation) return;
    const title = renameDraft.trim();
    if (!title) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateConversation(activeActionConversation.id, { title });
    closeActionPanel();
  }, [activeActionConversation, renameDraft, updateConversation, closeActionPanel]);

  const handleStartDelete = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setActionMode('delete');
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!activeActionConversation) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    LayoutAnimation.configureNext({
      duration: 250,
      update: { type: LayoutAnimation.Types.easeOut },
      delete: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
    });
    deleteConversation(activeActionConversation.id);
    closeActionPanel();
  }, [activeActionConversation, deleteConversation, closeActionPanel]);

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
          onOpenActions={openActionPanel}
        />
      );
    },
    [colors, activeId, handleSelectConversation, openActionPanel],
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

        <ConversationActionPanel
          conversation={activeActionConversation}
          mode={actionMode}
          renameDraft={renameDraft}
          onRenameDraftChange={setRenameDraft}
          onClose={closeActionPanel}
          onPin={handleActionPin}
          onStartRename={handleStartRename}
          onConfirmRename={handleConfirmRename}
          onStartDelete={handleStartDelete}
          onConfirmDelete={handleConfirmDelete}
        />
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
  actionOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    zIndex: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  actionPanel: {
    marginHorizontal: Spacing['3'],
    marginBottom: Spacing['3'],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.xl,
    padding: Spacing['4'],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 18,
  },
  actionEyebrow: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 11,
    lineHeight: 14,
    marginBottom: Spacing['1'],
  },
  actionHeading: {
    fontFamily: FontFamily.display,
    fontSize: FontSize.xl,
    lineHeight: 25,
  },
  actionConversationTitle: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginTop: Spacing['1'],
  },
  actionButtonGroup: {
    gap: Spacing['2'],
    marginTop: Spacing['4'],
  },
  actionButton: {
    minHeight: 58,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['2.5'],
    justifyContent: 'center',
  },
  actionButtonLabel: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.sm,
    lineHeight: 18,
  },
  actionButtonMeta: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    lineHeight: 18,
    marginTop: 2,
  },
  renameInput: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['2.5'],
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
  },
  actionFooterRow: {
    flexDirection: 'row',
    gap: Spacing['2'],
  },
  secondaryAction: {
    flex: 1,
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryAction: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.sm,
  },
  primaryActionText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.sm,
  },
  deleteCopy: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    lineHeight: 21,
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
