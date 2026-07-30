/**
 * CompanionScreen — the main "Ask" tab.
 * Pi-style single continuous conversation.
 * Phase 2: rich text with verse pills, blockquotes, scripture tap sheet.
 */
import React, { useCallback, useRef, useMemo, useState } from 'react';
import {
  FlatList,
  ListRenderItemInfo,
  View,
  Text,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
// react-native-gesture-handler not needed — scroll banner uses normal TouchableOpacity
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import {
  CrownIcon,
  List,
  NotePencil,
  XIcon,
} from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import {
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { CompanionOrb } from '@/components/CompanionOrb';
import { COMPANION_MESSAGE_MAX_CHARS, useCompanionChat } from '@/lib/use-companion-chat';
import type { CompanionMessage } from '@/lib/companion-chat-store';
import {
  CompanionDrawer,
  DRAWER_WIDTH,
} from '@/components/companion/CompanionDrawer';
import { CompanionEmptyState } from '@/components/companion/CompanionEmptyState';
import { CompanionInput } from '@/components/companion/CompanionInput';
import { UserMessageBubble } from '@/components/companion/UserMessageBubble';
import { CompanionMessageContent } from '@/components/companion/CompanionMessageContent';
import { CompanionActions } from '@/components/companion/CompanionActions';
import { SuggestionChips } from '@/components/companion/SuggestionChips';
import { TypingIndicator } from '@/components/companion/TypingIndicator';
import { ScriptureTapSheet } from '@/components/ScriptureTapSheet';
import { PremiumFeatureSheet } from '@/components/PremiumFeatureSheet';
import { alpha } from '@/components/ui';
import { Spacing } from '@/constants/spacing';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import {
  canSendCompanionMessage,
  incrementCompanionDailyCount,
  getCompanionDailyUsage,
  FREE_COMPANION_DAILY_LIMIT,
} from '@/lib/premium-gating';
import { computeCompanionStatusSlotHeight } from '@/lib/companion-status-slot';

// ── Message item ───────────────────────────────────────────────────────────

const MessageItem = React.memo(function MessageItem({
  item,
  isFirstInGroup,
  isLastMessage,
  isStreaming,
  isSearching,
  onVersePress,
  onRetry,
}: {
  item: CompanionMessage;
  isFirstInGroup: boolean;
  isLastMessage: boolean;
  isStreaming: boolean;
  isSearching?: boolean;
  onVersePress: (reference: string) => void;
  onRetry?: () => void;
}) {
  const gapStyle = isFirstInGroup ? { marginTop: 16 } : { marginTop: 6 };

  if (item.role === 'user') {
    return (
      <View style={gapStyle}>
        <UserMessageBubble message={item} />
      </View>
    );
  }

  // Companion message
  const isThisStreaming = isStreaming && item.status === 'streaming';
  const showActions = item.status === 'complete' && isLastMessage;

  // Skip rendering empty streaming messages — TypingIndicator handles that state
  if (isThisStreaming && !item.content) return null;

  return (
    <View style={gapStyle}>
      <CompanionMessageContent
        message={item}
        showIcon={isFirstInGroup}
        isStreaming={isThisStreaming}
        isSearching={isThisStreaming && isSearching}
        onVersePress={onVersePress}
        onRetry={onRetry}
      />
      {showActions && (
        <CompanionActions
          messageId={item.id}
          content={item.content}
          feedback={item.feedback ?? null}
          visible
        />
      )}
    </View>
  );
}, (prev, next) =>
  prev.item.id === next.item.id &&
  prev.item.content === next.item.content &&
  prev.item.status === next.item.status &&
  prev.item.feedback === next.item.feedback &&
  prev.isStreaming === next.isStreaming &&
  prev.isSearching === next.isSearching &&
  prev.isFirstInGroup === next.isFirstInGroup &&
  prev.isLastMessage === next.isLastMessage &&
  prev.onRetry === next.onRetry
);

// Memoized mounts: the screen re-renders on every streaming token flush —
// these subtrees' props are stable between stream boundaries (5a).
const MemoScriptureTapSheet = React.memo(ScriptureTapSheet);
const MemoPremiumFeatureSheet = React.memo(PremiumFeatureSheet);

// Height of the custom absolutely-positioned tab bar (content + padding)
const TAB_BAR_CONTENT_HEIGHT = 56;

// ── Screen ─────────────────────────────────────────────────────────────────

export default function CompanionScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const listRef = useRef<any>(null);

  // Full tab bar height including safe area (home indicator)
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  // WR-17: fixed-height band between list and input that hosts the typing
  // indicator OR the suggestion chips, so neither mounting nor unmounting
  // ever shifts the conversation vertically.
  const statusSlotHeight = computeCompanionStatusSlotHeight(fontScale);

  // Premium gating
  const premiumPolicy = usePremiumAccessPolicy();
  const isPremium = premiumPolicy === 'granted';
  const [showPremiumSheet, setShowPremiumSheet] = useState(false);
  const handlePremiumSheetClose = useCallback(() => setShowPremiumSheet(false), []);
  const [dailyRemaining, setDailyRemaining] = useState(() => getCompanionDailyUsage().remaining);

  const {
    messages,
    isStreaming,
    isSearching,
    suggestions,
    error,
    sendMessage,
    stopGeneration,
    startNewConversation,
  } = useCompanionChat();

  // P1: dismissible error banner. Dismissal is per-error-message; a new
  // stream clears it so the next failure surfaces again.
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const visibleError = error && error !== dismissedError ? error : null;
  React.useEffect(() => {
    if (isStreaming) setDismissedError(null);
  }, [isStreaming]);

  // P1: the free-quota counter resets at midnight and can be spent from other
  // surfaces — re-read it whenever the screen regains focus.
  useFocusEffect(
    useCallback(() => {
      setDailyRemaining(getCompanionDailyUsage().remaining);
    }, [])
  );

  // P0-5: leaving the current conversation (new chat or drawer switch) stops
  // its in-flight stream — a reply to a conversation the user abandoned
  // shouldn't keep billing tokens in the background.
  const handleNewChat = useCallback(() => {
    stopGeneration();
    startNewConversation();
  }, [stopGeneration, startNewConversation]);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerTranslateX = useSharedValue(-DRAWER_WIDTH);

  const handleDrawerOpen = useCallback(() => {
    setDrawerOpen(true);
    drawerTranslateX.value = withSpring(0, { duration: 300, dampingRatio: 1 });
  }, [drawerTranslateX]);

  const handleDrawerClose = useCallback(() => {
    setDrawerOpen(false);
    drawerTranslateX.value = withSpring(-DRAWER_WIDTH, { duration: 300, dampingRatio: 1 });
  }, [drawerTranslateX]);

  // Gesture-based drawer open deferred — hamburger button + scrim tap for now

  // Scripture tap sheet state
  const [verseSheetRef, setVerseSheetRef] = useState<string | null>(null);

  const handleVersePress = useCallback((reference: string) => {
    setVerseSheetRef(reference);
  }, []);

  const handleVerseClose = useCallback(() => {
    setVerseSheetRef(null);
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length > COMPANION_MESSAGE_MAX_CHARS) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return false;
      }

      // Concurrent send would 'noop' inside sendMessage — return false so the
      // input keeps the user's text instead of clearing it into the void.
      if (isStreaming) {
        return false;
      }

      // Pre-send guard runs synchronously. Companion sends are governed by
      // the free daily quota (paywall on exhaustion), NOT the creation gate —
      // that gate paywalls every non-premium user, which contradicted the
      // visible "N of 5 free messages" promise. Creation actions (devotional
      // generation) keep the creation gate.
      if (!isPremium && !canSendCompanionMessage()) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setShowPremiumSheet(true);
        return false;
      }

      // Charge quota ONLY on a successful response (NET-2):
      // a free message is consumed iff a companion response was received.
      // The isStreaming guard in sendMessage prevents concurrent over-spend.
      void (async () => {
        const outcome = await sendMessage(trimmed);
        if (!isPremium && outcome === 'sent') {
          incrementCompanionDailyCount();
          setDailyRemaining(getCompanionDailyUsage().remaining);
        }
      })();

      setTimeout(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 100);

      return true;
    },
    [sendMessage, isPremium, isStreaming]
  );

  // Retry handlers must be identity-stable per (message, text) or the
  // MessageItem memo comparator re-renders every error row on each list pass.
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;
  const retryHandlersRef = useRef(new Map<string, () => void>());

  const handleChipSelect = useCallback(
    (text: string) => {
      handleSend(text);
    },
    [handleSend]
  );

  // Reversed messages for inverted list (newest first)
  const invertedMessages = useMemo(
    () => [...messages].reverse(),
    [messages]
  );

  // Stable ref so renderItem doesn't depend on invertedMessages identity
  const invertedMessagesRef = useRef(invertedMessages);
  invertedMessagesRef.current = invertedMessages;

  // Show typing indicator when streaming and last message is companion with empty content
  const showTyping =
    isStreaming &&
    invertedMessages.length > 0 &&
    invertedMessages[0].role === 'companion' &&
    invertedMessages[0].content === '';

  // Show suggestion chips only when not streaming and there are suggestions
  const showSuggestions = !isStreaming && suggestions.length > 0 && messages.length > 0;

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<CompanionMessage>) => {
      const msgs = invertedMessagesRef.current;
      const prevMsg = index < msgs.length - 1 ? msgs[index + 1] : null;
      const isFirstInGroup = !prevMsg || prevMsg.role !== item.role;
      const isLastMessage = index === 0;

      // NET-13: for error companion messages, find the most recent preceding user
      // message (higher inverted index = older) and wire a retry handler.
      // Retry fires handleSend which only charges quota if the response succeeds.
      let onRetry: (() => void) | undefined;
      if (item.role === 'companion' && item.status === 'error') {
        for (let i = index + 1; i < msgs.length; i++) {
          if (msgs[i].role === 'user') {
            const userText = msgs[i].content;
            const retryKey = `${item.id}::${userText}`;
            onRetry = retryHandlersRef.current.get(retryKey);
            if (!onRetry) {
              onRetry = () => handleSendRef.current(userText);
              retryHandlersRef.current.set(retryKey, onRetry);
            }
            break;
          }
        }
      }

      return (
        <MessageItem
          item={item}
          isFirstInGroup={isFirstInGroup}
          isLastMessage={isLastMessage}
          isStreaming={isStreaming}
          // Scope to the newest row so a searching flip doesn't invalidate
          // the memo of every message in the list.
          isSearching={isSearching && isLastMessage}
          onVersePress={handleVersePress}
          onRetry={onRetry}
        />
      );
    },
    [isStreaming, isSearching, handleVersePress]
  );

  const keyExtractor = useCallback((item: CompanionMessage) => item.id, []);

  const isEmpty = messages.length === 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? -tabBarHeight : 0}
    >
      {/* Header — drawer / orb + name / new chat */}
      <View
        style={{
          paddingTop: insets.top + 4,
          paddingBottom: 8,
          paddingHorizontal: Spacing['4'],
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Left: drawer toggle */}
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            handleDrawerOpen();
          }}
          hitSlop={8}
          activeOpacity={0.7}
          accessibilityLabel="Open conversation history"
          accessibilityRole="button"
          style={{ width: 40 }}
        >
          <List size={24} color={colors.textMuted} weight="light" />
        </TouchableOpacity>

        {/* Center: orb + name */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <CompanionOrb
            accentColor={colors.accent}
            size={32}
            isActive={isStreaming}
          />
          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: FontSize.base,
              color: colors.text,
            }}
          >
            Companion
          </Text>
        </View>

        {/* Right: new chat — fixed width to balance center */}
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            handleNewChat();
          }}
          hitSlop={8}
          activeOpacity={0.7}
          accessibilityLabel="New conversation"
          accessibilityRole="button"
          style={{ width: 40, alignItems: 'flex-end' }}
        >
          <NotePencil size={22} color={colors.textMuted} weight="light" />
        </TouchableOpacity>
      </View>

      {/* Messages or empty state.
          Empty state: Pressable wrapper dismisses keyboard on tap.
          List state: FlatList uses keyboardShouldPersistTaps="always" +
          keyboardDismissMode="on-drag"; wrapping the list in a Pressable
          breaks the scroll responder after keyboard dismissal and swallows
          taps inside messages. */}
      {isEmpty ? (
        <Pressable onPress={Keyboard.dismiss} style={{ flex: 1 }}>
          <CompanionEmptyState onSelectStarter={handleSend} />
        </Pressable>
      ) : (
        <View style={{ flex: 1 }}>
          <FlatList
            ref={listRef}
            data={invertedMessages}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            inverted
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="always"
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={11}
            removeClippedSubviews
            contentContainerStyle={{
              paddingBottom: Spacing['2'],
              paddingTop: Spacing['2'],
            }}
          />

        </View>
      )}

      {/* Status slot — reserved band above the input hosting the typing
          indicator or the suggestion chips (WR-17). Kept outside the FlatList
          so horizontal chip drags don't interact with the list's pan gesture
          recognizer (keyboardDismissMode="interactive" conflict). The height
          never changes while a conversation is open, so the message list
          doesn't lurch when either child appears or disappears. */}
      {!isEmpty && (
        <View style={{ height: statusSlotHeight, justifyContent: 'center' }}>
          {showTyping ? (
            <View style={{ paddingHorizontal: Spacing['4'] }}>
              <TypingIndicator />
            </View>
          ) : showSuggestions ? (
            <SuggestionChips
              suggestions={suggestions}
              onSelect={handleChipSelect}
              visible
            />
          ) : null}
        </View>
      )}

      {/* Error banner — announced as an alert, dismissible (P1) */}
      {!isEmpty && visibleError && (
        <View
          accessibilityRole="alert"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginHorizontal: Spacing['4'],
            marginBottom: Spacing['2'],
            backgroundColor: alpha(colors.error, 0.10),
            borderRadius: Radius.md,
            padding: Spacing['3'],
            gap: Spacing['2'],
          }}
        >
          <Text
            style={{
              flex: 1,
              fontFamily: FontFamily.body,
              fontSize: FontSize.sm,
              color: colors.error,
              textAlign: 'center',
            }}
          >
            {visibleError}
          </Text>
          <TouchableOpacity
            onPress={() => setDismissedError(visibleError)}
            hitSlop={8}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Dismiss error"
          >
            <XIcon size={16} color={colors.error} weight="bold" />
          </TouchableOpacity>
        </View>
      )}

      {/* Daily limit indicator for free users — shown once quota is spent */}
      {!isPremium && dailyRemaining < FREE_COMPANION_DAILY_LIMIT && (
        <TouchableOpacity
          activeOpacity={0.7}
          accessibilityRole="button"
          onPress={() => {
            if (dailyRemaining === 0) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              setShowPremiumSheet(true);
            }
          }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 6,
            paddingHorizontal: Spacing['4'],
            gap: 6,
            backgroundColor: dailyRemaining === 0 ? alpha(colors.accent, 0.12) : 'transparent',
          }}
          accessibilityLabel={
            dailyRemaining === 0
              ? 'Daily message limit reached. Tap to upgrade.'
              : `${dailyRemaining} of ${FREE_COMPANION_DAILY_LIMIT} free messages remaining today`
          }
        >
          {dailyRemaining === 0 ? (
            <>
              <CrownIcon size={13} color={colors.accent} weight="fill" />
              <Text
                style={{
                  fontFamily: FontFamily.uiMedium,
                  fontSize: 12,
                  color: colors.accent,
                }}
              >
                Daily limit reached. Upgrade for unlimited.
              </Text>
            </>
          ) : (
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 11,
                color: colors.textSubtle,
              }}
            >
              {dailyRemaining} of {FREE_COMPANION_DAILY_LIMIT} free messages left today
            </Text>
          )}
        </TouchableOpacity>
      )}

      {/* Input bar */}
      <CompanionInput
        onSend={handleSend}
        onStop={stopGeneration}
        isStreaming={isStreaming}
      />

      {/* Bottom spacer: clears the absolutely-positioned custom tab bar.
          keyboardVerticalOffset negates this when the keyboard opens,
          so the input sits flush at the keyboard top. */}
      <View style={{ height: tabBarHeight }} />

      {/* Scripture tap sheet */}
      <MemoScriptureTapSheet
        visible={verseSheetRef !== null}
        onClose={handleVerseClose}
        reference={verseSheetRef ?? ''}
      />

      {/* Companion Drawer */}
      <CompanionDrawer
        translateX={drawerTranslateX}
        isOpen={drawerOpen}
        onOpen={handleDrawerOpen}
        onClose={handleDrawerClose}
        onNewChat={handleNewChat}
        onWillSwitchConversation={stopGeneration}
      />

      {/* Premium upsell sheet for companion daily limit */}
      <MemoPremiumFeatureSheet
        visible={showPremiumSheet}
        onClose={handlePremiumSheetClose}
        feature="companion"
      />

      {/* Removed: floating FAB approach failed due to FlatList gesture conflicts */}
    </KeyboardAvoidingView>
  );
}
