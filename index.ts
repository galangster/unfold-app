import "react-native-get-random-values";
import "react-native-reanimated";
import "./global.css";
import "expo-router/entry";

import { LogBox, Platform } from "react-native";

// Only use LogBox on native platforms
if (Platform.OS !== 'web') {
  LogBox.ignoreLogs(["Expo AV has been deprecated", "Disconnected from Metro"]);
}
