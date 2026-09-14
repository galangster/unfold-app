/** Coordinates ambience without loading a player when the feature is disabled. */
interface AmbientLifecycle {
  interrupt: (reason: string) => void;
  stop: () => void | Promise<void>;
  finish?: () => void | Promise<void>;
}

let lifecycle: AmbientLifecycle | null = null;
let voiceInputActive = false;
const voiceListeners = new Set<(active: boolean) => void>();
let readingContext: string | null = null;

export function registerAmbientLifecycle(next: AmbientLifecycle): () => void {
  lifecycle = next;
  return () => {
    if (lifecycle === next) lifecycle = null;
  };
}

export function canStartAmbientPlayback(): boolean {
  return !voiceInputActive;
}

export function isAmbientVoiceActive(): boolean {
  return voiceInputActive;
}

export function subscribeAmbientVoiceActivity(listener: (active: boolean) => void): () => void {
  voiceListeners.add(listener);
  return () => voiceListeners.delete(listener);
}

function publishVoiceActivity(): void {
  for (const listener of voiceListeners) listener(voiceInputActive);
}

export function beginAmbientVoiceInterruption(): void {
  voiceInputActive = true;
  publishVoiceActivity();
  lifecycle?.interrupt('Paused for voice input');
}

export function endAmbientVoiceInterruption(): void {
  voiceInputActive = false;
  publishVoiceActivity();
}

export function notifyNarrationPlayback(): void {
  lifecycle?.interrupt('Paused for narration');
}

export function endAmbientReflection(): Promise<void> {
  return Promise.resolve(lifecycle?.finish ? lifecycle.finish() : lifecycle?.stop());
}

export function setAmbientReadingContext(
  devotionalId: string | null | undefined,
  day: number,
): void {
  if (!devotionalId) return;
  const next = `${devotionalId}:${day}`;
  if (readingContext !== null && readingContext !== next) lifecycle?.stop();
  readingContext = next;
}

export type MusicAnnouncementGateInput = {
  isTodayHome: boolean;
  hasUsed: boolean;
  soundOff: boolean;
  timerIdle: boolean;
  alreadySeen: boolean;
  narrationActive: boolean;
  voiceActive: boolean;
  keyboardVisible: boolean;
  appActive: boolean;
};

export function canAnnounceMusic(input: MusicAnnouncementGateInput): boolean {
  return (
    input.isTodayHome
    && !input.hasUsed
    && input.soundOff
    && input.timerIdle
    && !input.alreadySeen
    && !input.narrationActive
    && !input.voiceActive
    && !input.keyboardVisible
    && input.appActive
  );
}

export function isTodayHomeRoute(pathname: string, segments: readonly string[]): boolean {
  if (!segments.includes('(today)') || segments.includes('(ask)')) return false;
  return pathname === '/';
}
