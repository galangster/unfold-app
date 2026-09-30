import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import type { AdaptivePanes } from '@/lib/adaptive-layout';
import { useTheme } from '@/lib/theme';

type FacingPanesProps = {
  /** Pane geometry from resolveAdaptivePanes. Null means an unpaired window. */
  panes: AdaptivePanes | null;
  first?: ReactNode;
  second?: ReactNode;
  /**
   * What an unpaired window does with `second`: leave it out (the default), or
   * keep it mounted after `first` so opening or closing never remounts it.
   */
  unpaired?: 'hide' | 'stack';
  /** A 1pt rule in the gutter, like the spine between two pages. */
  divider?: boolean;
  testID?: string;
};

type PaneStyles = {
  container: ViewStyle;
  first: ViewStyle;
  gutter: ViewStyle;
  rule: ViewStyle;
  second: ViewStyle;
};

function paneStyles(panes: AdaptivePanes): PaneStyles {
  if (panes.axis === 'row') {
    return {
      container: { flexDirection: 'row', paddingLeft: panes.lead },
      first: { width: panes.first },
      gutter: { width: panes.gutter },
      rule: styles.verticalRule,
      second: { width: panes.second },
    };
  }
  return {
    container: { flexDirection: 'column', paddingTop: panes.lead },
    first: { height: panes.first },
    gutter: { height: panes.gutter },
    rule: styles.horizontalRule,
    second: { height: panes.second },
  };
}

/**
 * Two facing panes that meet on the window midline, where a folding display
 * bends. Place it flush with the safe-area edges; the pane geometry already
 * carries the offsets. Each pane keeps its place in the tree in every layout,
 * so opening or closing the device never remounts it.
 */
export function FacingPanes({ panes, first, second, unpaired = 'hide', divider = true, testID }: FacingPanesProps) {
  const { colors } = useTheme();
  const layout = panes && second != null ? paneStyles(panes) : null;
  const showSecond = second != null && (layout !== null || unpaired === 'stack');
  // A first pane with no size, such as one folded away above the keyboard,
  // leaves VoiceOver, and the spine goes with it.
  const firstFolded = layout !== null && panes?.first === 0;

  return (
    <View testID={testID} style={[styles.fill, layout?.container]}>
      {first != null ? (
        <View
          key="first"
          accessibilityElementsHidden={firstFolded}
          importantForAccessibility={firstFolded ? 'no-hide-descendants' : 'auto'}
          style={layout ? layout.first : styles.fill}
        >
          {first}
        </View>
      ) : null}
      {layout ? (
        <View
          key="gutter"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.gutter, layout.gutter]}
        >
          {divider && !firstFolded ? <View style={[layout.rule, { backgroundColor: colors.border }]} /> : null}
        </View>
      ) : null}
      {showSecond ? (
        <View key="second" style={layout ? layout.second : styles.fill}>{second}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  gutter: { alignItems: 'center', justifyContent: 'center' },
  verticalRule: { width: StyleSheet.hairlineWidth, height: '100%' },
  horizontalRule: { height: StyleSheet.hairlineWidth, width: '100%' },
});
