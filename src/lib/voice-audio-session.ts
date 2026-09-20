import { acquireAudioSession, retryAudioAfterInterruption, type AudioSessionLease } from './audio-session-registry';

export type { AudioSessionLease } from './audio-session-registry';

export function acquireVoiceRecordingSession(onInvalidated?: () => void): AudioSessionLease | null {
  retryAudioAfterInterruption();
  return acquireAudioSession({
    owner: 'voice-recording',
    onInvalidated,
    mode: {
      allowsRecording: true,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    },
  });
}

export function acquireVoiceReviewSession(onInvalidated?: () => void): AudioSessionLease | null {
  retryAudioAfterInterruption();
  return acquireAudioSession({
    owner: 'voice-review',
    onInvalidated,
    mode: {
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    },
  });
}

export function acquireSpeechRecognitionSession(onInvalidated?: () => void): AudioSessionLease | null {
  retryAudioAfterInterruption();
  return acquireAudioSession({ owner: 'speech-recognition', onInvalidated });
}
