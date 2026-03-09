import { useEffect, useState } from 'react';
import { Text, View, TouchableWithoutFeedback } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { XIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';

interface CompanionTooltipProps {
  message: string;
  accentColor: string;
  textColor: string;
  onTap: () => void;
  onDismiss: () => void;
  /** Auto-dismiss after this many ms (default 5000) */
  autoDismissMs?: number;
}

export function CompanionTooltip({
  message,
  accentColor,
  textColor,
  onTap,
  onDismiss,
  autoDismissMs = 5000,
}: CompanionTooltipProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, autoDismissMs);
    return () => clearTimeout(timer);
  }, [autoDismissMs, onDismiss]);

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(500)}
      exiting={FadeOut.duration(250)}
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: 95,
        right: 80,
        width: 220,
        zIndex: 999,
      }}
    >
      <TouchableWithoutFeedback
        onPress={() => {
          setVisible(false);
          onTap();
        }}
      >
        <View
          style={{
            backgroundColor: accentColor + '18',
            borderWidth: 1,
            borderColor: accentColor + '30',
            borderRadius: 14,
            paddingVertical: 10,
            paddingLeft: 14,
            paddingRight: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Text
            style={{
              fontFamily: FontFamily.body,
              fontSize: 13,
              color: textColor,
              lineHeight: 18,
              flex: 1,
            }}
            numberOfLines={2}
          >
            {message}
          </Text>

          <TouchableWithoutFeedback
            onPress={() => {
              setVisible(false);
              onDismiss();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <XIcon size={12} color={textColor} weight="light" style={{ opacity: 0.5 }} />
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>

      {/* Triangle pointer toward the orb (points right) */}
      <View
        style={{
          position: 'absolute',
          right: -6,
          top: 14,
          width: 0,
          height: 0,
          borderTopWidth: 6,
          borderBottomWidth: 6,
          borderLeftWidth: 6,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          borderLeftColor: accentColor + '30',
        }}
      />
    </Animated.View>
  );
}
