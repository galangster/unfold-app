/** Series lengths a reader can choose. Length 28 is the four-week chaptered length. */
export const DEVOTIONAL_LENGTHS = [3, 7, 14, 28, 30] as const;
export type DevotionalLength = (typeof DEVOTIONAL_LENGTHS)[number];

/** A series this long or shorter takes the shortest wait copy. */
export const WEEK_SERIES_DAYS = 7;
/** The four-week series: four weekly chapters of 7 days (Ruled 1). */
export const FOUR_WEEK_SERIES_DAYS = 28;
/** The one day-counted length the wait copy names. */
export const MONTH_SERIES_DAYS = 30;
