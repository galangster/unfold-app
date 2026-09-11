import { Text, View } from 'react-native';
import { describeSeriesPath, type SeriesPathNode } from '@/lib/series-path';

export function SeriesPath({
  nodes,
  variant,
}: {
  nodes: SeriesPathNode[];
  variant: 'compact' | 'reveal';
}) {
  // DG-1: visual treatment pending 07-design-final.md
  return (
    <View
      testID="series-path"
      accessibilityRole="text"
      accessibilityLabel={describeSeriesPath(nodes)}
    >
      <Text>{describeSeriesPath(nodes)}</Text>
      <Text>{variant}</Text>
    </View>
  );
}
