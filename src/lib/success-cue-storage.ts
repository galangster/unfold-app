export const SOUND_EFFECTS_ENABLED_KEY = "sound-effects-enabled";
export const SUCCESS_CUE_LEDGER_KEY = "success-cue-ledger";

let cancelPlayback: () => void = () => {};

export function registerSuccessCueCancellation(cancel: () => void): () => void {
  cancelPlayback = cancel;
  return () => {
    if (cancelPlayback === cancel) cancelPlayback = () => {};
  };
}

export function cancelSuccessCuePlayback(): void {
  cancelPlayback();
}
