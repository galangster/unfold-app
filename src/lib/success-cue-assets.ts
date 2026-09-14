export type SuccessCueEventType =
  | "first-devotional-revealed"
  | "new-series-revealed"
  | "new-day-revealed"
  | "day-completed";

export const SUCCESS_CUE_SOURCES: Record<SuccessCueEventType, number> = {
  "first-devotional-revealed": require("../../assets/audio/success-cues/first-devotional.wav"),
  "new-series-revealed": require("../../assets/audio/success-cues/new-series.wav"),
  "new-day-revealed": require("../../assets/audio/success-cues/new-day.wav"),
  "day-completed": require("../../assets/audio/success-cues/day-complete.wav"),
};
