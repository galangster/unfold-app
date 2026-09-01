// Native platforms use expo-battery's real hook. Web resolves to
// useLowPowerMode.web.ts instead: expo-battery's web module has no
// low-power-mode listener, so calling this hook there crashes the tree.
export { useLowPowerMode } from 'expo-battery';
