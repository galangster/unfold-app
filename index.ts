import "react-native-get-random-values";
import "react-native-reanimated";
import "./global.css";
// BGAppRefresh task must be defined in the global bundle before the router
// mounts — iOS can launch this JS without any React tree.
import "./src/lib/check-in-background-task";
import "expo-router/entry";

import { LogBox, Platform } from "react-native";

// Only use LogBox on native platforms
if (Platform.OS !== 'web') {
  LogBox.ignoreLogs(["Expo AV has been deprecated", "Disconnected from Metro"]);
}
