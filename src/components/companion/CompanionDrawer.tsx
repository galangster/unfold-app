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

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  useWindowDimensions,
  Platform,
  StyleSheet,
  LayoutAnimation,
  Keyboard,
} from 'react-native';
import { companionDrawerWidth } from '@/lib/adaptive-layout';
import * as Haptics from 'expo-haptics';
import { Sheet } from '@/components/ui/Sheet';
import Animated, {
  useAnimatedStyle,
  withSpring,
  interpolate,
  runOnJS,
  useSharedValue,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';
import { DotsThreeIcon, MagnifyingGlassIcon, PlusCircle, XIcon } from '@/components/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/lib/theme';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { alpha } from '@/components/ui';
import {
  useCompanionChatStore,
  type Conversation,
} from '@/lib/companion-chat-store';
import {
  buildListItems,
  conversationMatchesTitleQuery,
  formatRelativeDate,
  getFullConversationTitle,
  type DrawerListItem,
} from '@/lib/companion-drawer-model';

// ── Constants ─────────────────────────────────────────────────────────────

const TAB_BAR_CONTENT_HEIGHT = 56;
export const DRAWER_WIDTH = 320;

const SPRING_CONFIG = { duration: 300, dampingRatio: 1 } as const; // Critically damped — no bounce
const EDGE_WIDTH = 36;
const ACTIVE_OFFSET_X = 5;
const FAIL_OFFSET_Y = 15;
const MIN_SWIPE_DISTANCE = 60;
const VELOCITY_THRESHOLD = 500;
const VELOCITY_PROJECTION = 0.05;

// ── Types ─────────────────────────────────────────────────────────────────

interface CompanionDrawerProps {
  translateX: SharedValue<number>;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onNewChat: () => void;
  /** Called before switching to another conversation — lets the screen stop
   * an in-flight stream in the conversation being left (P0-5). */
  onWillSwitchConversation?: () => void;
}

type ListItem = DrawerListItem;

type ActionMode = 'actions' | 'rename' | 'delete';

// ── useDrawerGesture hook ─────────────────────────────────────────────────

export function useDrawerGesture(
  translateX: SharedValue<number>,
  isOpen: boolean,
  onOpen: () => void,
  onClose: () => void,
) {
  const { width: windowWidth } = useWindowDimensions();
  const drawerWidth = companionDrawerWidth(windowWidth);
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
      const newX = Math.max(-drawerWidth, Math.min(0, startX.value + e.translationX));
      translateX.value = newX;
    })
    .onEnd((e) => {
      if (!isEdgeSwipe.value) return;
      const distance = Math.abs(e.translationX);

      if (distance < MIN_SWIPE_DISTANCE) {
        translateX.value = withSpring(isOpen ? 0 : -drawerWidth, SPRING_CONFIG);
        return;
      }

      if (Math.abs(e.velocityX) > VELOCITY_THRESHOLD) {
        if (e.velocityX > 0) {
          translateX.value = withSpring(0, SPRING_CONFIG);
          runOnJS(onOpen)();
        } else {
          translateX.value = withSpring(-drawerWidth, SPRING_CONFIG);
          runOnJS(onClose)();
        }
        return;
      }

      const projected = translateX.value + VELOCITY_PROJECTION * e.velocityX;
      const threshold = -drawerWidth * 0.5;

      if (projected > threshold) {
        translateX.value = withSpring(0, SPRING_CONFIG);
        runOnJS(onOpen)();
      } else {
        translateX.value = withSpring(-drawerWidth, SPRING_CONFIG);
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
  const title = getFullConversationTitle(conversation);
  const dateLabel = formatRelativeDate(conversation.lastMessageAt);

  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onOpenActions(conversation);
  }, [conversation, onOpenActions]);

  return (
    <View
      style={[
        styles.conversationRow,
        isCurrent && {
          backgroundColor: alpha(colors.backgroundElevated, 0.5),
          borderRadius: Radius.sm,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onSelect(conversation)}
        onLongPress={handleLongPress}
        delayLongPress={400}
        style={styles.conversationMain}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${dateLabel}${isCurrent ? ', current conversation' : ''}`}
        accessibilityHint="Opens this conversation. Long press is optional; use the options button to star, rename, or delete."
      >
        <Text
          style={[styles.convTitle, { color: colors.text }]}
          numberOfLines={2}
        >
          {title}
        </Text>
        <Text style={[styles.convDate, { color: colors.textMuted }]}>{dateLabel}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onOpenActions(conversation)}
        style={styles.conversationOptions}
        accessibilityRole="button"
        accessibilityLabel={`Conversation options for ${title}`}
        accessibilityHint="Star, rename, or delete this conversation"
      >
        <DotsThreeIcon size={20} color={colors.textMuted} weight="bold" />
      </TouchableOpacity>
    </View>
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

  const title = getFullConversationTitle(conversation);
  const isPinned = conversation.pinned ?? false;
  const canSaveRename = renameDraft.trim().length > 0;
  const heading = mode === 'rename'
    ? 'Rename conversation'
    : mode === 'delete'
      ? 'Delete conversation'
      : 'Conversation options';

  return (
    <Sheet visible onClose={onClose} contentPadding={16} bottomPadding={12}>
        <View style={styles.actionHeaderRow}>
          <View style={styles.actionHeaderCopy}>
            <Text style={[styles.actionHeading, { color: colors.text }]}>{heading}</Text>
            <Text style={[styles.actionConversationTitle, { color: colors.textMuted }]} numberOfLines={2}>
              {title}
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.76}
            onPress={onClose}
            style={styles.headerClose}
            accessibilityRole="button"
            accessibilityLabel="Close options"
          >
            <Text style={[styles.headerCloseLabel, { color: colors.textMuted }]}>Close</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actionScrollContent}>
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
    </Sheet>
  );
}

// ── CompanionDrawer ───────────────────────────────────────────────────────

// Memoized: the companion screen re-renders on every streaming token flush —
// the drawer's props (shared value + stable callbacks + isOpen) only change
// when the drawer opens/closes.
export const CompanionDrawer = memo(function CompanionDrawer({
  translateX,
  isOpen,
  onOpen: _onOpen,
  onClose,
  onNewChat,
  onWillSwitchConversation,
}: CompanionDrawerProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const drawerWidth = companionDrawerWidth(windowWidth);
  const [keyboardInset, setKeyboardInset] = useState(() => Keyboard.metrics()?.height ?? 0);

  useEffect(() => {
    const event = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const show = Keyboard.addListener(event, ({ endCoordinates }) => {
      setKeyboardInset(Math.max(0, windowHeight - endCoordinates.screenY));
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardInset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [windowHeight]);

  const activeId = useCompanionChatStore((s) => s.activeConversationId);
  // A streaming token flush replaces the active conversation object (content
  // + updatedAt only) ~30×/sec; subscribing to the conversation array itself
  // would rebuild and re-sort the whole drawer list per flush. Subscribe to a
  // fingerprint of the fields the drawer actually displays instead, and only
  // re-read the store when that changes.
  const conversationsFingerprint = useCompanionChatStore((s) =>
    (s.conversations ?? [])
      .filter(c => (c.messages ?? []).length > 0)
      .map(c => `${c.id}:${c.pinned ? 1 : 0}:${c.createdAt}:${c.lastMessageAt}:${c.title ?? ''}`)
      .join('|')
  );
  const deleteConversation = useCompanionChatStore((s) => s.deleteConversation);
  const setActiveConversation = useCompanionChatStore((s) => s.setActiveConversation);
  const updateConversation = useCompanionChatStore((s) => s.updateConversation);

  const allWithMessages = useMemo(() => {
    void conversationsFingerprint; // recompute key — display fields only
    return (useCompanionChatStore.getState().conversations ?? []).filter(
      c => (c.messages ?? []).length > 0
    );
  }, [conversationsFingerprint]);

  const [searchQuery, setSearchQuery] = useState('');
  const [groupingNow, setGroupingNow] = useState(() => Date.now());
  const [actionConversation, setActionConversation] = useState<Conversation | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>('actions');
  const [renameDraft, setRenameDraft] = useState('');

  useEffect(() => {
    if (isOpen) setGroupingNow(Date.now());
    else {
      Keyboard.dismiss();
      setActionConversation(null);
      setActionMode('actions');
      setRenameDraft('');
    }
  }, [isOpen]);

  const visibleConversations = useMemo(
    () => allWithMessages.filter((conversation) => conversationMatchesTitleQuery(conversation, searchQuery)),
    [allWithMessages, searchQuery],
  );
  const listItems = useMemo(
    () => buildListItems(visibleConversations, groupingNow),
    [visibleConversations, groupingNow],
  );

  const activeActionConversation = useMemo(() => {
    if (!actionConversation) return null;
    return allWithMessages.find(c => c.id === actionConversation.id) ?? actionConversation;
  }, [actionConversation, allWithMessages]);

  const closeActionPanel = useCallback(() => {
    Keyboard.dismiss();
    setActionConversation(null);
    setActionMode('actions');
    setRenameDraft('');
  }, []);

  const handleCloseHistory = useCallback(() => {
    closeActionPanel();
    onClose();
  }, [closeActionPanel, onClose]);

  const handleDrawerNewChat = useCallback(() => {
    closeActionPanel();
    onNewChat();
  }, [closeActionPanel, onNewChat]);

  const openActionPanel = useCallback((conv: Conversation) => {
    setActionConversation(conv);
    setActionMode('actions');
    setRenameDraft(getFullConversationTitle(conv));
  }, []);

  const handleSelectConversation = useCallback(
    (conv: Conversation) => {
      Keyboard.dismiss();
      if (conv.id === activeId) {
        onClose();
      } else {
        onWillSwitchConversation?.();
        setActiveConversation(conv.id);
        onClose();
      }
      closeActionPanel();
    },
    [activeId, setActiveConversation, onClose, closeActionPanel, onWillSwitchConversation],
  );

  const handlePin = useCallback(
    (id: string) => {
      const conv = allWithMessages.find(c => c.id === id);
      const isPinned = conv?.pinned ?? false;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (!reducedMotion) {
        LayoutAnimation.configureNext({
          duration: 250,
          update: { type: LayoutAnimation.Types.easeOut },
          create: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
        });
      }
      updateConversation(id, { pinned: !isPinned });
    },
    [allWithMessages, updateConversation, reducedMotion],
  );

  const handleActionPin = useCallback(() => {
    if (!activeActionConversation) return;
    handlePin(activeActionConversation.id);
    closeActionPanel();
  }, [activeActionConversation, handlePin, closeActionPanel]);

  const handleStartRename = useCallback(() => {
    if (!activeActionConversation) return;
    setRenameDraft(getFullConversationTitle(activeActionConversation));
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
    if (!reducedMotion) {
      LayoutAnimation.configureNext({
        duration: 250,
        update: { type: LayoutAnimation.Types.easeOut },
        delete: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
      });
    }
    if (activeActionConversation.id === activeId) {
      onWillSwitchConversation?.();
    }
    deleteConversation(activeActionConversation.id);
    closeActionPanel();
  }, [activeActionConversation, activeId, deleteConversation, closeActionPanel, reducedMotion, onWillSwitchConversation]);

  // Scrim animated style — opacity only. pointerEvents controlled by isOpen prop.
  // IMPORTANT: Do NOT set pointerEvents in animated style — it conflicts with
  // the prop and can leave the scrim touch-active when the drawer is closed
  // (spring animation doesn't settle to exact target value).
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-drawerWidth, 0], [0, 0.5]),
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
            width: drawerWidth,
            backgroundColor: colors.background,
            paddingTop: insets.top,
            bottom: Math.max(keyboardInset, TAB_BAR_CONTENT_HEIGHT + insets.bottom),
          },
          drawerStyle,
        ]}
        pointerEvents={isOpen ? 'auto' : 'none'}
        accessibilityViewIsModal={isOpen}
        accessibilityElementsHidden={!isOpen}
        importantForAccessibility={isOpen ? 'yes' : 'no-hide-descendants'}
      >
        <View
          style={styles.historyContent}
          accessibilityElementsHidden={activeActionConversation != null}
          importantForAccessibility={activeActionConversation ? 'no-hide-descendants' : 'auto'}
        >
          <View style={styles.historyHeader}>
            <Text
              style={[styles.chatsHeading, { color: colors.text }]}
              accessibilityRole="header"
            >
              Chats
            </Text>
            <TouchableOpacity
              onPress={handleCloseHistory}
              activeOpacity={0.7}
              style={styles.headerClose}
              accessibilityRole="button"
              accessibilityLabel="Close history"
            >
              <Text style={[styles.headerCloseLabel, { color: colors.textMuted }]}>Close</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={handleDrawerNewChat}
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

          <View style={[styles.searchRow, { borderBottomColor: colors.border, backgroundColor: colors.inputBackground }]}>
            <MagnifyingGlassIcon size={16} color={colors.textMuted} weight="light" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search titles"
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.accent}
              cursorColor={colors.accent}
              style={[styles.searchInput, { color: colors.text }]}
              accessibilityLabel="Search conversation titles"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                style={styles.searchClear}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <XIcon size={16} color={colors.textMuted} weight="bold" />
              </TouchableOpacity>
            )}
          </View>

          {listItems.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {searchQuery.trim()
                  ? 'No conversations match that title'
                  : 'Your conversations will appear here'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={listItems}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="none"
            />
          )}
        </View>

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
});

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
  historyContent: {
    flex: 1,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['4'],
    paddingTop: Spacing['3'],
    paddingBottom: Spacing['1'],
  },
  chatsHeading: {
    flex: 1,
    fontFamily: FontFamily.display,
    fontSize: FontSize.xl,
    lineHeight: 26,
  },
  headerClose: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: Spacing['2'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCloseLabel: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.sm,
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
    flexDirection: 'row',
    alignItems: 'center',
  },
  conversationMain: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    justifyContent: 'center',
  },
  conversationOptions: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
    marginHorizontal: Spacing['3'],
    marginTop: Spacing['3'],
    marginBottom: Spacing['1'],
    paddingHorizontal: Spacing['3'],
    minHeight: 44,
    borderRadius: Radius.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
  },
  searchClear: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
  actionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing['2'],
  },
  actionHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  actionHeading: {
    fontFamily: FontFamily.display,
    fontSize: 18,
    lineHeight: 23,
  },
  actionScrollContent: {
    paddingBottom: Spacing['1'],
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
