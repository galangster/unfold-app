export function isVoiceCheckInsEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ENABLE_VOICE_CHECK_INS === '1';
}
