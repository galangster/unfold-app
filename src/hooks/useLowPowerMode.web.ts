// Web has no low-power-mode signal; report "not in low power" without
// touching expo-battery (its web module lacks the listener and throws).
export function useLowPowerMode(): boolean {
  return false;
}
