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
import {
  CrownIcon,
  List,
  NotePencil,
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
  onVersePress,
  onRetry,
}: {
  item: CompanionMessage;
  isFirstInGroup: boolean;
  isLastMessage: boolean;
  isStreaming: boolean;
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
  prev.isFirstInGroup === next.isFirstInGroup &&
  prev.isLastMessage === next.isLastMessage &&
  prev.onRetry === next.onRetry
);

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
  const [dailyRemaining, setDailyRemaining] = useState(() => getCompanionDailyUsage().remaining);

  const {
    messages,
    isStreaming,
    suggestions,
    error,
    sendMessage,
    stopGeneration,
    startNewConversation,
  } = useCompanionChat();

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
    [sendMessage, isPremium]
  );

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
            onRetry = () => handleSend(userText);
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
          onVersePress={handleVersePress}
          onRetry={onRetry}
        />
      );
    },
    [isStreaming, handleVersePress, handleSend]
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
            startNewConversation();
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
          List state: FlatList's keyboardShouldPersistTaps="handled" dismisses keyboard
          on unhandled taps; wrapping the list in a Pressable breaks the scroll
          responder after keyboard dismissal and swallows FAB taps. */}
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

      {/* Error banner */}
      {!isEmpty && error && (
        <View
          style={{
            marginHorizontal: Spacing['4'],
            marginBottom: Spacing['2'],
            backgroundColor: alpha(colors.error, 0.10),
            borderRadius: Radius.md,
            padding: Spacing['3'],
          }}
        >
          <Text
            style={{
              fontFamily: FontFamily.body,
              fontSize: FontSize.sm,
              color: colors.error,
              textAlign: 'center',
            }}
          >
            {error}
          </Text>
        </View>
      )}

      {/* Daily limit indicator for free users */}
      {!isPremium && dailyRemaining <= FREE_COMPANION_DAILY_LIMIT && (
        <TouchableOpacity
          activeOpacity={0.7}
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
      <ScriptureTapSheet
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
        onNewChat={startNewConversation}
      />

      {/* Premium upsell sheet for companion daily limit */}
      <PremiumFeatureSheet
        visible={showPremiumSheet}
        onClose={() => setShowPremiumSheet(false)}
        feature="companion"
      />

      {/* Removed: floating FAB approach failed due to FlatList gesture conflicts */}
    </KeyboardAvoidingView>
  );
}
