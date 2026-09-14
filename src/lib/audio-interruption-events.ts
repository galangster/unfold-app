import { addAudioInterruptionListener } from 'expo-audio';
import { handleAudioInterruption } from './audio-session-registry';

/** Subscribe before reveal events. Native begin invalidates configuring and loading owners too. */
export function initializeAudioInterruptionHandling(): () => void {
  const subscription = addAudioInterruptionListener(handleAudioInterruption);
  return () => subscription.remove();
}
