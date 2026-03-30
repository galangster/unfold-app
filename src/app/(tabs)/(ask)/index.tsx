/**
 * CompanionScreen — the main "Ask" tab.
 * Pi-style single continuous conversation.
 * Phase 2: rich text with verse pills, blockquotes, scripture tap sheet.
 */
import React, { useCallback, useRef, useMemo, useState } from 'react';
import {
  View,
  Text,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { FlatList, ListRenderItemInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CaretDownIcon,
  PlusCircleIcon,
  ClockCounterClockwiseIcon,
  CrownIcon,
} from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Shadow } from '@/constants/shadows';
import { CompanionOrb } from '@/components/CompanionOrb';
import { useCompanionChat } from '@/lib/use-companion-chat';
import type { CompanionMessage, Conversation } from '@/lib/companion-chat-store';
import { ConversationHistorySheet } from '@/components/companion/ConversationHistorySheet';
import { ArchivedConversationView } from '@/components/companion/ArchivedConversationView';
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
import { useUnfoldStore } from '@/lib/store';
import {
  canSendCompanionMessage,
  incrementCompanionDailyCount,
  getCompanionDailyUsage,
  FREE_COMPANION_DAILY_LIMIT,
} from '@/lib/premium-gating';

// ── Message item ───────────────────────────────────────────────────────────

const MessageItem = React.memo(function MessageItem({
  item,
  isFirstInGroup,
  isLastMessage,
  isStreaming,
  onVersePress,
}: {
  item: CompanionMessage;
  isFirstInGroup: boolean;
  isLastMessage: boolean;
  isStreaming: boolean;
  onVersePress: (reference: string) => void;
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
  prev.isLastMessage === next.isLastMessage
);

// Height of the custom absolutely-positioned tab bar (content + padding)
const TAB_BAR_CONTENT_HEIGHT = 56;

// ── Screen ─────────────────────────────────────────────────────────────────

export default function CompanionScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const listRef = useRef<any>(null);

  // Full tab bar height including safe area (home indicator)
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  // Premium gating
  const isPremium = useUnfoldStore((s) => s.user?.isPremium ?? false);
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

  // Conversation history state
  const [showHistory, setShowHistory] = useState(false);
  const [viewingArchived, setViewingArchived] = useState<Conversation | null>(null);

  // Scripture tap sheet state
  const [verseSheetRef, setVerseSheetRef] = useState<string | null>(null);

  const handleVersePress = useCallback((reference: string) => {
    setVerseSheetRef(reference);
  }, []);

  const handleVerseClose = useCallback(() => {
    setVerseSheetRef(null);
  }, []);

  // Scroll-to-bottom visibility
  const [showScrollButton, setShowScrollButton] = useState(false);
  const showScrollButtonRef = useRef(false);
  const scrollButtonOpacity = useSharedValue(0);

  const scrollButtonStyle = useAnimatedStyle(() => ({
    opacity: scrollButtonOpacity.value,
  }));

  const handleScroll = useCallback(
    (event: any) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      const shouldShow = offsetY > 300;
      if (shouldShow !== showScrollButtonRef.current) {
        showScrollButtonRef.current = shouldShow;
        setShowScrollButton(shouldShow);
        scrollButtonOpacity.value = withTiming(shouldShow ? 1 : 0, {
          duration: shouldShow ? 200 : 150,
          easing: Easing.out(Easing.cubic),
        });
      }
    },
    [scrollButtonOpacity]
  );

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      // Free user daily limit check
      if (!isPremium && !canSendCompanionMessage()) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setShowPremiumSheet(true);
        return;
      }

      sendMessage(text);

      // Track daily usage for free users
      if (!isPremium) {
        incrementCompanionDailyCount();
        setDailyRemaining(getCompanionDailyUsage().remaining);
      }

      setTimeout(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 100);
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
      return (
        <MessageItem
          item={item}
          isFirstInGroup={isFirstInGroup}
          isLastMessage={isLastMessage}
          isStreaming={isStreaming}
          onVersePress={handleVersePress}
        />
      );
    },
    [isStreaming, handleVersePress]
  );

  const keyExtractor = useCallback((item: CompanionMessage) => item.id, []);

  const isEmpty = messages.length === 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? -tabBarHeight : 0}
    >
      {/* Header — new conversation / orb / history */}
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
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            startNewConversation();
          }}
          hitSlop={8}
          activeOpacity={0.7}
          accessibilityLabel="New conversation"
          accessibilityRole="button"
        >
          <PlusCircleIcon size={24} color={colors.textMuted} weight="light" />
        </TouchableOpacity>

        <CompanionOrb
          accentColor={colors.accent}
          size={32}
          isActive={isStreaming}
        />

        <TouchableOpacity
          onPress={() => setShowHistory(true)}
          hitSlop={8}
          activeOpacity={0.7}
          accessibilityLabel="Conversation history"
          accessibilityRole="button"
        >
          <ClockCounterClockwiseIcon size={24} color={colors.textMuted} weight="light" />
        </TouchableOpacity>
      </View>

      {/* Messages or empty state — tap to dismiss keyboard */}
      <TouchableOpacity activeOpacity={1} onPress={Keyboard.dismiss} style={{ flex: 1 }}>
        {isEmpty ? (
          <CompanionEmptyState onSelectStarter={handleSend} />
        ) : (
          <>
            <FlatList
              ref={listRef}
              data={invertedMessages}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              inverted
              onScroll={handleScroll}
              scrollEventThrottle={16}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              initialNumToRender={15}
              maxToRenderPerBatch={10}
              windowSize={11}
              removeClippedSubviews
              contentContainerStyle={{
                paddingBottom: Spacing['2'],
                paddingTop: Spacing['2'],
              }}
              ListHeaderComponent={
                <>
                  {/* Typing indicator */}
                  {showTyping && (
                    <View style={{ paddingVertical: 8 }}>
                      <TypingIndicator />
                    </View>
                  )}
                  {/* Suggestion chips */}
                  {showSuggestions && (
                    <SuggestionChips
                      suggestions={suggestions}
                      onSelect={handleChipSelect}
                      visible
                    />
                  )}
                </>
              }
            />

            {/* Error banner */}
            {error && (
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

            {/* Scroll-to-bottom FAB */}
            {showScrollButton && (
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    bottom: 16,
                    right: 16,
                  },
                  scrollButtonStyle,
                ]}
              >
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={scrollToBottom}
                  accessibilityLabel="Scroll to bottom"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: colors.backgroundElevated,
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    ...Shadow.sm,
                  }}
                >
                  <CaretDownIcon size={18} color={colors.textMuted} weight="bold" />
                </TouchableOpacity>
              </Animated.View>
            )}
          </>
        )}
      </TouchableOpacity>

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

      {/* Conversation History Sheet */}
      <ConversationHistorySheet
        visible={showHistory}
        onClose={() => setShowHistory(false)}
        onSelectConversation={(conv) => {
          setShowHistory(false);
          setViewingArchived(conv);
        }}
      />

      {/* Archived Conversation Viewer — full screen overlay */}
      {viewingArchived && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.background,
            zIndex: 100,
          }}
        >
          <ArchivedConversationView
            conversation={viewingArchived}
            onClose={() => setViewingArchived(null)}
          />
        </View>
      )}

      {/* Premium upsell sheet for companion daily limit */}
      <PremiumFeatureSheet
        visible={showPremiumSheet}
        onClose={() => setShowPremiumSheet(false)}
        feature="companion"
      />
    </KeyboardAvoidingView>
  );
}
