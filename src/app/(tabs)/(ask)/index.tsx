/**
 * CompanionScreen — the main "Ask" tab.
 * Pi-style single continuous conversation.
 * Phase 2: rich text with verse pills, blockquotes, scripture tap sheet.
 */
import React, { useCallback, useRef, useMemo, useState } from 'react';
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { FlatList, ListRenderItemInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretDownIcon, GearSixIcon } from 'phosphor-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Shadow } from '@/constants/shadows';
import { CompanionOrb } from '@/components/CompanionOrb';
import { useCompanionChat } from '@/lib/use-companion-chat';
import type { CompanionMessage } from '@/lib/companion-chat-store';
import { CompanionEmptyState } from '@/components/companion/CompanionEmptyState';
import { CompanionInput } from '@/components/companion/CompanionInput';
import { UserMessageBubble } from '@/components/companion/UserMessageBubble';
import { CompanionMessageContent } from '@/components/companion/CompanionMessageContent';
import { CompanionActions } from '@/components/companion/CompanionActions';
import { SuggestionChips } from '@/components/companion/SuggestionChips';
import { TypingIndicator } from '@/components/companion/TypingIndicator';
import { ScriptureTapSheet } from '@/components/ScriptureTapSheet';
import { alpha } from '@/components/ui';

// ── Message item ───────────────────────────────────────────────────────────

const MessageItem = React.memo(function MessageItem({
  item,
  index,
  messages,
  isStreaming,
  onVersePress,
}: {
  item: CompanionMessage;
  index: number;
  messages: CompanionMessage[];
  isStreaming: boolean;
  onVersePress: (reference: string) => void;
}) {
  // In inverted list, index 0 is the LAST message
  const nextMsg = index > 0 ? messages[index - 1] : null;
  const prevMsg = index < messages.length - 1 ? messages[index + 1] : null;

  const isFirstInGroup = !prevMsg || prevMsg.role !== item.role;
  const isLastMessage = index === 0;
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
  prev.index === next.index
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

  const {
    messages,
    isStreaming,
    suggestions,
    error,
    sendMessage,
    stopGeneration,
  } = useCompanionChat();

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
  const scrollButtonOpacity = useSharedValue(0);

  const scrollButtonStyle = useAnimatedStyle(() => ({
    opacity: scrollButtonOpacity.value,
  }));

  const handleScroll = useCallback(
    (event: any) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      const shouldShow = offsetY > 300;
      if (shouldShow !== showScrollButton) {
        setShowScrollButton(shouldShow);
        scrollButtonOpacity.value = withTiming(shouldShow ? 1 : 0, {
          duration: shouldShow ? 200 : 150,
          easing: Easing.out(Easing.cubic),
        });
      }
    },
    [showScrollButton, scrollButtonOpacity]
  );

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      sendMessage(text);
      setTimeout(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 100);
    },
    [sendMessage]
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

  // Show typing indicator when streaming and last message is companion with empty content
  const showTyping =
    isStreaming &&
    invertedMessages.length > 0 &&
    invertedMessages[0].role === 'companion' &&
    invertedMessages[0].content === '';

  // Show suggestion chips only when not streaming and there are suggestions
  const showSuggestions = !isStreaming && suggestions.length > 0 && messages.length > 0;

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<CompanionMessage>) => (
      <MessageItem
        item={item}
        index={index}
        messages={invertedMessages}
        isStreaming={isStreaming}
        onVersePress={handleVersePress}
      />
    ),
    [invertedMessages, isStreaming, handleVersePress]
  );

  const keyExtractor = useCallback((item: CompanionMessage) => item.id, []);

  const isEmpty = messages.length === 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? -tabBarHeight : 0}
    >
      {/* Header — companion orb */}
      <View
        style={{
          paddingTop: insets.top + 4,
          paddingBottom: 8,
          paddingHorizontal: 16,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CompanionOrb
          accentColor={colors.accent}
          size={32}
          isActive={isStreaming}
        />
      </View>

      {/* Messages or empty state */}
      <View style={{ flex: 1 }}>
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
                paddingBottom: 8,
                paddingTop: 8,
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
                  marginHorizontal: 16,
                  marginBottom: 8,
                  backgroundColor: alpha(colors.error, 0.10),
                  borderRadius: Radius.md,
                  padding: 12,
                }}
              >
                <Text
                  style={{
                    fontFamily: FontFamily.body,
                    fontSize: 14,
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
      </View>

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
    </KeyboardAvoidingView>
  );
}
