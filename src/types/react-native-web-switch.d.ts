// Type augmentation for react-native-web's Switch.
// On web, `thumbColor` only styles the thumb while the switch is OFF; the ON
// thumb takes `activeThumbColor` (web-only prop, defaults to Material teal
// #009688). RN's own SwitchProps doesn't declare it, so declare it here so a
// `<Switch>` can pass it without a cast. Native ignores the unknown prop.

import 'react-native';

declare module 'react-native' {
  interface SwitchProps {
    /**
     * react-native-web only: thumb color while the switch is on. RN-web
     * falls back to teal #009688 when this is omitted.
     */
    activeThumbColor?: ColorValue | undefined;
  }
}
