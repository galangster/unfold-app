/** The successor ships music access. An explicit build flag can disable it. */
export function resolveAmbientAudioEnabled(ambientFlag: string | undefined): boolean {
  return ambientFlag !== '0';
}

export function isAmbientAudioEnabled(): boolean {
  return resolveAmbientAudioEnabled(process.env.EXPO_PUBLIC_ENABLE_AMBIENT_AUDIO);
}
