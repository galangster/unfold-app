import { Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { WidgetBase } from 'expo-widgets';

type UnfoldTodayProps = {
  count: number;
};

const UnfoldTodayWidget = (props: WidgetBase<UnfoldTodayProps>) => {
  return (
    <VStack>
      <Text modifiers={[font({ weight: 'bold', size: 16 }), foregroundStyle('#000000')]}>
        Hello from Unfold Widget! Count: {props.count}
      </Text>
    </VStack>
  );
};

export default UnfoldTodayWidget;
