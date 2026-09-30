import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { AdaptivePanes } from '@/lib/adaptive-layout';
import { useColors } from '@/lib/theme';

type FacingPanesProps = {
  /** Pane geometry from resolveAdaptivePanes. Null renders `first` alone. */
  panes: AdaptivePanes | null;
  first: ReactNode;
  second?: ReactNode;
  /** A 1pt rule in the gutter, like the spine between two pages. */
  divider?: boolean;
  style?: StyleProp<ViewStyle>;
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
 * carries the offsets. `first` keeps the same position in the tree in every
 * layout, so opening or closing the device never remounts it.
 */
export function FacingPanes({ panes, first, second, divider = true, style, testID }: FacingPanesProps) {
  const colors = useColors();
  const layout = panes && second != null ? paneStyles(panes) : null;

  return (
    <View testID={testID} style={[styles.fill, layout?.container, style]}>
      <View style={layout ? layout.first : styles.fill}>{first}</View>
      {layout ? (
        <>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.gutter, layout.gutter]}
          >
            {divider ? <View style={[layout.rule, { backgroundColor: colors.border }]} /> : null}
          </View>
          <View style={layout.second}>{second}</View>
        </>
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
