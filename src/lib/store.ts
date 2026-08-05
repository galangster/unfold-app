import { useState, useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeCategory, DevotionalType } from '../constants/devotional-types';
import { logBugError } from './bug-logger';
import { logger } from './logger';
import { applyUndoActionsWithSync } from './journal-undo';
import { mmkvStorage } from './mmkv-storage';
import { createDebouncedJSONStorage } from './debounced-persist-storage';
import { instrumentMigrate, instrumentPersistRead, logColdStartHydrationCost } from './store-hydration-metrics';
import { shouldFlushAutosaveOnAppState } from './autosave-controller';
import { migrateUnfoldStore } from './store-migrations';
import { normalizeDevotionalIdentity, normalizeGeneratedDayIdentity, normalizeGeneratedDaysIdentity } from './generation-reconciliation';
import { canonicalGeneratedDayId } from './devotional-canonical-days';
import {
  clampCurrentDayToSeriesBoundary,
  filterDaysWithinSeriesBoundary,
  getSeriesArcTotalDays,
  getServerOwnedSeriesTotalDays,
} from './devotional-series-boundary';
import { newId } from './sync-ids';
import type { NudgeType, NudgeImpression } from './nudges';
import { NUDGE_INITIAL_STATE } from './nudges';
import { applyStreakRead, getWeekStart, reconcileStreakState } from './streak-helpers';
import { repairRehydratedState } from './store-rehydrate-repair';
import type { WordStudy } from './word-study';
import {
  bibleHighlightSyncData,
  bibleReadingPositionSyncData,
  bookmarkSyncData,
  checkInSyncData,
  devotionalHighlightSyncData,
  enqueuePersonalDataSyncChange,
  journalEntrySyncData,
  methodUsageSyncData,
  noteFolderSyncData,
  noteSyncData,
  seriesPersonaSyncData,
  usedScriptureSyncData,
} from './personal-data-sync-records';

// Types
export type FontSize = 'small' | 'medium' | 'large';
export type ThemeMode = 'dark' | 'light' | 'system';

// Accent color themes (premium feature)
export type AccentThemeId = 'gold' | 'ocean' | 'rose' | 'forest' | 'lavender' | 'ember' | 'slate';

export interface AccentTheme {
  id: AccentThemeId;
  name: string;
  dark: string;
  light: string;
}

export const ACCENT_THEMES: AccentTheme[] = [
  { id: 'gold', name: 'Gold', dark: '#C8A55C', light: '#9A7B3C' },
  { id: 'ocean', name: 'Ocean', dark: '#5B9BD5', light: '#3A6FA0' },
  { id: 'rose', name: 'Rose', dark: '#D4828F', light: '#A8596A' },
  { id: 'forest', name: 'Forest', dark: '#6DAF7B', light: '#4A8A5A' },
  { id: 'lavender', name: 'Lavender', dark: '#9B8EC4', light: '#6A5C9E' },
  { id: 'ember', name: 'Ember', dark: '#D4895C', light: '#A86840' },
  { id: 'slate', name: 'Slate', dark: '#7796C5', light: '#395D93' },
];

// Reading font options (premium feature)
export type ReadingFontId = 'source-serif' | 'garamond' | 'lora' | 'crimson' | 'merriweather' | 'inter';

export interface ReadingFont {
  id: ReadingFontId;
  name: string;
  preview: string;
  regular: string;
  italic: string;
  medium: string;
  bold: string;
}

export const READING_FONTS: ReadingFont[] = [
  { id: 'source-serif', name: 'Source Serif', preview: 'Classic & warm', regular: 'SourceSerifPro_400Regular', italic: 'SourceSerifPro_400Regular_Italic', medium: 'SourceSerifPro_600SemiBold', bold: 'SourceSerifPro_700Bold' },
  { id: 'garamond', name: 'Garamond', preview: 'Elegant & timeless', regular: 'EBGaramond_400Regular', italic: 'EBGaramond_400Regular_Italic', medium: 'EBGaramond_600SemiBold', bold: 'EBGaramond_700Bold' },
  { id: 'lora', name: 'Lora', preview: 'Refined & modern', regular: 'Lora_400Regular', italic: 'Lora_400Regular_Italic', medium: 'Lora_600SemiBold', bold: 'Lora_700Bold' },
  { id: 'inter', name: 'Inter', preview: 'Clean & minimal', regular: 'Inter_400Regular', italic: 'Inter_400Regular_Italic', medium: 'Inter_600SemiBold', bold: 'Inter_700Bold' },
  { id: 'crimson', name: 'Crimson', preview: 'Literary & poetic', regular: 'CrimsonText_400Regular', italic: 'CrimsonText_400Regular_Italic', medium: 'CrimsonText_600SemiBold', bold: 'CrimsonText_700Bold' },
  { id: 'merriweather', name: 'Merriweather', preview: 'Strong & readable', regular: 'Merriweather_400Regular', italic: 'Merriweather_400Regular_Italic', medium: 'Merriweather_700Bold', bold: 'Merriweather_900Black' },
];

// Re-export for convenience
export type { ThemeCategory, DevotionalType };

export const FONT_SIZE_VALUES: Record<FontSize, { body: number; scripture: number; title: number }> = {
  small: { body: 15, scripture: 19, title: 28 },
  medium: { body: 17, scripture: 21, title: 32 },
  large: { body: 20, scripture: 24, title: 36 },
};

// Bible translation preferences
export type BibleTranslation = 'BSB' | 'KJV';

export const BIBLE_TRANSLATIONS: { value: BibleTranslation; label: string; description: string }[] = [
  { value: 'BSB', label: 'BSB', description: 'Berean Standard Bible - modern, clear, and free' },
  { value: 'KJV', label: 'KJV', description: 'King James Version - classic and traditional' },
];

// Writing style preferences
export type WritingTone = 'warm' | 'direct' | 'poetic';
export type ContentDepth = 'simple' | 'balanced' | 'theological';
export type FaithBackground = 'new' | 'growing' | 'mature';
export type LifeStage = 'student' | 'building' | 'midlife' | 'reflective';

export type RelationshipWithGod = 'close' | 'ups-and-downs' | 'distant' | 'starting';
export type BibleFrequency = 'daily' | 'few-times-week' | 'weekly' | 'couple-times-month' | 'rarely' | 'never';

export interface WritingStylePreferences {
  tone: WritingTone;
  depth: ContentDepth;
  faithBackground: FaithBackground;
  lifeStage?: LifeStage;
}

// ---- Bible Reader Types ----
export type BibleHighlightColor = 'yellow' | 'green' | 'blue' | 'purple' | 'red';

export interface BibleHighlight {
  id: string;
  bookId: number;
  bookName: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  text: string;
  // null = note-only entry (no visual highlight, just a marker)
  color: BibleHighlightColor | null;
  note?: string;
  translation: string;
  createdAt: string;
  updatedAt?: string; // ISO timestamp
}

export interface BibleReadingPosition {
  bookId: number;
  bookName: string;
  chapter: number;
  translation: string;
  lastReadAt: string;
  id?: string; // Added for sync — composite from bookId:translation
  updatedAt?: string; // ISO timestamp
}

export interface BibleReaderSettings {
  fontSize: number;
  lineHeightMultiplier: number;
  showVerseNumbers: boolean;
  paragraphMode: boolean;
  translation: 'BSB' | 'KJV';
}

export interface UserProfile {
  name: string;
  aboutMe: string;
  personaTraits: string[];
  currentSituation: string;
  emotionalState: string;
  faithImpact: string;
  spiritualSeeking: string;
  readingDuration: 5 | 15 | 30;
  devotionalLength: 3 | 7 | 14 | 30;
  reminderTime: string;
  dailyReminderEnabled: boolean;
  hasCompletedOnboarding: boolean;
  hasCompletedStyleOnboarding: boolean;
  isPremium: boolean;
  fontSize: FontSize;
  writingStyle: WritingStylePreferences;
  bibleTranslation: BibleTranslation;
  themeMode: ThemeMode;
  accentTheme: AccentThemeId;
  readingFont: ReadingFontId;
  preferredVoice: string;
  // New: Theme and type preferences for next devotional
  selectedTheme?: ThemeCategory;
  selectedType?: DevotionalType;
  selectedStudySubject?: string;
  // Profile picture (local file URI)
  profilePicture?: string | null;
  // Onboarding redesign fields
  relationshipWithGod?: RelationshipWithGod;
  bibleFrequency?: BibleFrequency;
  growthGoals?: string[];
  obstacles?: string[];
  companionName?: string;
}

export interface Quote {
  text: string;
  author: string;
}

export interface CrossReference {
  reference: string;
  text: string;
}

export interface DevotionalDay {
  dayNumber: number;
  title: string;
  scriptureReference: string;
  scriptureText: string;
  bodyText: string;
  quotableLine: string;
  isRead: boolean;
  readAt?: string;
  isRevealed?: boolean;
  // Enhanced content fields
  quotes?: Quote[];
  crossReferences?: CrossReference[];
  reflectionQuestions?: string[];
  contextNote?: string;
  /** Backend prose or the legacy structured mobile shape. */
  wordStudy?: WordStudy;
  closingPrayer?: string;
  /** One concrete same-day act of obedience (named time window, observable). */
  act?: string;
  /** 6-12 word recall line for the afternoon; also used by the midday check-in notification. */
  carryLine?: string;
  // Phase 2: Midday check-in question + chips (generated with devotional)
  checkInQuestion?: string;
  checkInChips?: string[];
  // Phase 5: Evening scripture reference for wind-down
  eveningScriptureRef?: string;
  // Study method used for this day
  studyMethod?: string;
  // Progressive generation metadata
  generatedAt?: string;
  contextSignals?: string[];
  // Deferred generation metadata
  storyId?: string;
  seriesReflectionSummary?: string;
  closureArchetype?: string;
  // Sync fields
  devotionalId?: string; // Canonical parent devotional id for generated-day reconciliation/sync
  id?: string; // Added for sync — composite from devotionalId:dayNumber
  updatedAt?: string; // ISO timestamp
}

export interface Devotional {
  id: string;
  title: string;
  totalDays: number;
  currentDay: number;
  days: DevotionalDay[];
  createdAt: string;
  userContext: {
    name: string;
    aboutMe: string;
    currentSituation: string;
    emotionalState: string;
    faithImpact?: string;
  };
  // Theme and type categorization
  themeCategory?: ThemeCategory;
  devotionalType?: DevotionalType;
  studySubject?: string;
  // Progressive generation fields
  seriesArc?: SeriesArc;
  progressiveMemory?: ProgressiveMemory;
  generationMode: 'batch' | 'progressive';
  // Story deduplication
  usedStoryIds?: string[];
  // Calendar-based day progression anchor
  seriesStartDate?: string; // ISO timestamp — set when day 1 is generated
  // Sync fields
  updatedAt?: string; // ISO timestamp
}

export type JournalMode = 'freewrite' | 'soap' | 'guided';

export interface SoapResponses {
  scripture: string;
  observation: string;
  application: string;
  prayer: string;
}

export interface PrayerRequest {
  id: string;
  text: string;
  isAnswered: boolean;
  answeredAt?: string;
  createdAt: string;
}

export interface JournalEntry {
  id: string;
  devotionalId: string;
  dayNumber: number;
  content: string;
  createdAt: string;
  updatedAt: string;
  journalMode?: JournalMode;
  soapResponses?: SoapResponses;
  prayerRequests?: PrayerRequest[];
  // Phase 4: Per-question responses for Go Deeper
  questionResponses?: { question: string; response: string }[];
  // Persisted "Go Deeper" prompt questions so they don't regenerate on revisit
  deeperQuestions?: string[];
}

// Phase 2: Midday Check-In
export type MoodLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type CheckInTimeOfDay = 'morning' | 'midday' | 'evening' | 'companion';

export interface CheckIn {
  id: string;
  devotionalId: string;
  dayNumber: number;
  mood: MoodLevel; // 1=Struggling, 2=Low, 3=Okay, 4=Good, 5=Grateful
  moodLabel: string;
  chipAnswer?: string;
  freeText?: string;
  createdAt: string;
  timeOfDay: CheckInTimeOfDay;
  updatedAt?: string; // ISO timestamp
}

// Scripture tracking for variety
export interface UsedScripture {
  reference: string; // e.g., "John 3:16-17"
  book: string; // e.g., "John"
  usedAt: string; // ISO timestamp
  devotionalId: string;
  id?: string; // Added for sync — composite from reference:devotionalId
  updatedAt?: string; // ISO timestamp
}

// Bookmarks for saved passages (premium feature)
export interface Bookmark {
  id: string;
  devotionalId: string;
  devotionalTitle: string;
  dayNumber: number;
  dayTitle: string;
  scriptureReference: string;
  scriptureText: string;
  quotedText?: string;
  savedAt: string;
  updatedAt?: string; // ISO timestamp
}

// Highlight colors for categorization
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'purple' | 'red';

// Highlights for saved quotes from devotional text
export interface Highlight {
  id: string;
  devotionalId: string;
  devotionalTitle: string;
  dayNumber: number;
  dayTitle: string;
  highlightedText: string;
  serializedRange?: string; // Rangy serialization for precise restoration
  color?: HighlightColor; // Color coding for categorization
  contextBefore?: string;
  contextAfter?: string;
  createdAt: string;
  updatedAt?: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// Progressive Generation Types
// ---------------------------------------------------------------------------

/** Lightweight per-day hint generated as part of the series arc */
export interface SeriesArcDay {
  dayNumber: number;
  themeHint: string;
  scriptureRegion: string;
  narrativeRole: 'foundation' | 'deepening' | 'tension' | 'turning' | 'resolution';
  /** Bible study method ID assigned by arc generator (e.g., 'word_study', 'lectio_divina') */
  studyMethod?: string;
}

/** High-level series plan generated at onboarding (not the content itself) */
export interface SeriesArc {
  totalDaysPlanned: number;
  overarchingTheme: string;
  narrativeShape: string;
  dayHints: SeriesArcDay[];
  isOpenEnded: boolean;
  createdAt: string;
  lastExtendedAt?: string;
  /** Server-derived root diagnosis (never displayed; synced wholesale). */
  rootThesis?: string;
  thesisRationale?: string;
  thesisRevisedAt?: string;
}

/** Full context snapshot for a recently completed day (Layer 1) */
export interface MemoryLayerFull {
  dayNumber: number;
  devotionalTitle: string;
  scriptureReference: string;
  journalContent?: string;
  soapResponses?: SoapResponses;
  questionResponses?: { question: string; response: string }[];
  prayerRequests?: PrayerRequest[];
  checkInMood?: MoodLevel;
  checkInMoodLabel?: string;
  checkInChipAnswer?: string;
  readAt?: string;
  readingDurationMs?: number;
  completionStatus?: import('./completion-status').CompletionStatus;
}

/** Compressed summary of a range of days (Layer 2) */
export interface MemoryLayerSummary {
  dayRange: string;
  startDay: number;
  endDay: number;
  summary: string;
  dominantMoods: string[];
  keyPrayerThemes: string[];
  spiritualMovement: string;
  createdAt: string;
}

/** Narrative of the entire journey so far (Layer 3) */
export interface MemoryLayerNarrative {
  narrative: string;
  totalDaysCovered: number;
  lastUpdatedAt: string;
  version: number;
}

/** Three-layer memory system for progressive generation */
export interface ProgressiveMemory {
  fullDays: MemoryLayerFull[];
  summaries: MemoryLayerSummary[];
  narrative: MemoryLayerNarrative | null;
}

// ---------------------------------------------------------------------------

// Cross-series persona tracking for content freshness
export interface SeriesPersonaRecord {
  devotionalId: string;
  primaryTrait: string;
  secondaryTrait: string;
  templateSeed: number;
  createdAt: string;
  id?: string; // Added for sync — composite from devotionalId
  updatedAt?: string; // ISO timestamp
}

// Cross-series method usage tracking
export interface MethodUsageRecord {
  methodId: string;
  devotionalId: string;
  dayNumber: number;
  usedAt: string;
  id?: string; // Added for sync — composite from methodId:devotionalId:dayNumber
  updatedAt?: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// Notebook Types
// ---------------------------------------------------------------------------

export interface ScriptureRef {
  reference: string;       // "John 3:16" (display string)
  bookId: number;          // For navigation
  chapter: number;
  verse?: number;
  verseEnd?: number;
}

export type NoteCategory = 'sermon' | 'quiet-time' | 'study' | 'prayer' | 'general';

export interface Note {
  id: string;                    // UUID
  title: string;                 // User-set or auto-generated from first line
  content: string;               // Plain text content
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
  category: NoteCategory;        // Default: 'general'
  tags: string[];                // Free-form tags
  isFavorite: boolean;           // Star/pin
  scriptureRefs: ScriptureRef[]; // Linked verses
  devotionalId?: string;         // If linked to a devotional
  dayNumber?: number;            // If linked to a devotional day
  bibleBookId?: number;          // If created from Bible reader
  bibleChapter?: number;         // If created from Bible reader
  folderId?: string;             // If organized into a folder
}

export interface NoteFolder {
  id: string;
  name: string;
  color?: string;
  parentId?: string;            // If nested inside another folder
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------

export type GenerationSessionStatus = 'idle' | 'running' | 'error' | 'complete';

export interface GenerationSession {
  status: GenerationSessionStatus;
  devotionalId: string | null;
  totalDays: number;
  generatedDayNumbers: number[];
  title?: string;
  error?: string;
  startedAt?: string;
  updatedAt?: string;
}

export type ResumeRoute = 'reading' | 'journal';

export interface ResumeContext {
  route: ResumeRoute;
  devotionalId: string;
  dayNumber: number;
  devotionalTitle?: string;
  dayTitle?: string;
  /** Only set by reveal.tsx to trigger auto-navigate in index.tsx. Do NOT set from reading/journal screens. */
  touchedAt?: string;
}

interface UnfoldState {
  // User profile
  user: UserProfile | null;
  setUser: (user: UserProfile) => void;
  updateUser: (updates: Partial<UserProfile>) => void;

  // Devotionals
  devotionals: Devotional[];
  currentDevotionalId: string | null;
  addDevotional: (devotional: Devotional) => void;
  removeDevotional: (devotionalId: string) => void;
  updateDevotionalDays: (devotionalId: string, days: DevotionalDay[], title?: string) => void;
  setCurrentDevotional: (id: string) => void;
  archiveCurrentDevotional: () => void;
  hasEverCreatedDevotional: boolean;
  isReturningUser: () => boolean;
  markDayAsRead: (devotionalId: string, dayNumber: number) => void;
  markDayAsRevealed: (devotionalId: string, dayNumber: number) => void;
  advanceDay: (devotionalId: string) => void;

  // Journal entries
  journalEntries: JournalEntry[];
  addJournalEntry: (entry: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateJournalEntry: (id: string, content: string) => void;
  updateJournalMode: (id: string, mode: JournalMode) => void;
  updateSoapResponse: (id: string, field: keyof SoapResponses, value: string) => void;
  addPrayerRequest: (entryId: string, text: string) => void;
  togglePrayerAnswered: (entryId: string, prayerId: string) => void;
  updateQuestionResponse: (entryId: string, question: string, response: string) => void;
  setDeeperQuestions: (entryId: string, questions: string[]) => void;
  getJournalEntry: (devotionalId: string, dayNumber: number) => JournalEntry | undefined;

  // Scripture tracking for variety
  usedScriptures: UsedScripture[];
  addUsedScriptures: (scriptures: UsedScripture[]) => void;
  getRecentScriptures: (limit?: number) => UsedScripture[];

  // Highlights (saved quotes from devotional text)
  highlights: Highlight[];
  addHighlight: (highlight: Omit<Highlight, 'id' | 'createdAt'>) => void;
  removeHighlight: (id: string) => void;
  getRandomHighlight: () => Highlight | null;

  // Bookmarks
  bookmarks: Bookmark[];
  addBookmark: (bookmark: Omit<Bookmark, 'id' | 'savedAt'>) => void;
  removeBookmark: (id: string) => void;
  isBookmarked: (devotionalId: string, dayNumber: number) => boolean;

  // Generation session (persisted for crash/restart recovery)
  generationSession: GenerationSession;
  startGenerationSession: (payload: { devotionalId: string; totalDays: number }) => void;
  updateGenerationSessionProgress: (payload: { dayNumber?: number; dayNumbers?: number[]; title?: string }) => void;
  completeGenerationSession: (payload?: { title?: string }) => void;
  failGenerationSession: (errorMessage: string) => void;
  clearGenerationSession: () => void;

  // Resume context (persisted for quick re-entry)
  resumeContext: ResumeContext | null;
  setResumeContext: (context: ResumeContext) => void;
  clearResumeContext: () => void;

  // Review prompt tracking
  reviewPromptLastDate: string | null;
  reviewPromptCount: number;
  hasReviewed: boolean;
  hasSeenDay1Review: boolean;
  reviewPromptDaysAtLast: number;
  recordReviewPrompt: (daysCompleted: number) => void;
  markAsReviewed: () => void;
  setHasSeenDay1Review: () => void;

  // Streak tracking
  streakLastReadDate: string | null;
  streakCurrent: number;
  streakLongest: number;
  streakGraceDaysUsedThisWeek: number;
  streakWeekStart: string | null; // ISO date of current week start (Sunday)
  streakWeekendAmnesty: boolean;
  streakFreezes: number;
  recordStreakRead: () => void;
  reconcileStreakState: () => void;
  resetStreakGraceDays: () => void;
  toggleWeekendAmnesty: () => void;

  // Cross-series persona tracking
  seriesPersonaHistory: SeriesPersonaRecord[];
  addSeriesPersonaRecord: (record: SeriesPersonaRecord) => void;

  // Cross-series method usage tracking
  methodUsageHistory: MethodUsageRecord[];
  recordMethodUsage: (methodId: string, devotionalId: string, dayNumber: number) => void;

  // Check-ins (Phase 2)
  checkIns: CheckIn[];
  addCheckIn: (checkIn: Omit<CheckIn, 'id' | 'createdAt'>) => void;
  getCheckIn: (devotionalId: string, dayNumber: number, timeOfDay: CheckInTimeOfDay) => CheckIn | undefined;
  getRecentCheckIns: (count: number) => CheckIn[];

  // Companion orb state
  hasSeenCompanionIntro: boolean;
  setHasSeenCompanionIntro: (seen: boolean) => void;
  lastCompanionCheckInDate: string | null;
  setLastCompanionCheckInDate: (date: string) => void;
  companionName: string | null;
  setCompanionName: (name: string | null) => void;
  recentCompanionCheckIns: { mood: string; moodLabel: string; date: string; chipAnswer?: string }[];
  addRecentCompanionCheckIn: (checkIn: { mood: string; moodLabel: string; chipAnswer?: string }) => void;

  // Home onboarding tooltips
  hasSeenHomeTooltips: boolean;
  setHasSeenHomeTooltips: (seen: boolean) => void;

  // Feature onboarding carousel (shown once after first devotional generated)
  hasSeenFeatureOnboarding: boolean;
  setHasSeenFeatureOnboarding: (seen: boolean) => void;

  // Card dismiss tracking (date strings — reset daily)
  dismissedMiddayCardDate: string | null;
  dismissedEveningCardDate: string | null;
  dismissedBridgeCardDate: string | null;
  dismissedRememberThisCardDate: string | null;
  setDismissedMiddayCardDate: (date: string) => void;
  setDismissedEveningCardDate: (date: string) => void;
  setDismissedBridgeCardDate: (date: string) => void;
  setDismissedRememberThisCardDate: (date: string) => void;

  // Premium nudge system
  nudgeImpressions: NudgeImpression[];
  nudgeShownThisSession: boolean;
  nudgeDismissals: { type: NudgeType; dismissedAt: string }[];
  recordNudgeImpression: (type: NudgeType) => void;
  recordNudgeDismissal: (type: NudgeType) => void;
  resetNudgeSession: () => void;
  /** Flag set when streak transitions from >0 to 0 */
  streakJustReset: boolean;
  clearStreakJustReset: () => void;
  /** Title of a series the user just completed (set from reading screen) */
  justCompletedSeriesTitle: string | null;
  clearJustCompletedSeriesTitle: () => void;
  /** Whether user has ever played audio */
  hasUsedAudio: boolean;
  setHasUsedAudio: () => void;

  // Server-side generation tracking
  pendingJobId: string | null;
  setPendingJobId: (id: string | null) => void;

  // Series arc management
  setSeriesArc: (devotionalId: string, arc: SeriesArc) => void;
  extendSeriesArc: (devotionalId: string, newDayHints: SeriesArcDay[], additionalDays: number) => void;

  // Progressive memory management
  pushFullDayMemory: (devotionalId: string, dayMemory: MemoryLayerFull) => void;
  addMemorySummary: (devotionalId: string, summary: MemoryLayerSummary) => void;
  setNarrativeMemory: (devotionalId: string, narrative: MemoryLayerNarrative) => void;

  // Single-day addition (appends to devotional.days)
  addGeneratedDay: (devotionalId: string, day: DevotionalDay) => void;

  // Bible Reader
  bibleHighlights: BibleHighlight[];
  bibleReadingHistory: BibleReadingPosition[];
  bibleReaderSettings: BibleReaderSettings;
  readerBrightness: number | null;

  // Bible Reader Actions
  addBibleHighlight: (highlight: Omit<BibleHighlight, 'id' | 'createdAt'>) => void;
  removeBibleHighlight: (id: string) => void;
  updateBibleHighlightNote: (id: string, note: string) => void;
  getBibleHighlightsForChapter: (bookId: number, chapter: number) => BibleHighlight[];
  recordBibleReading: (position: Omit<BibleReadingPosition, 'lastReadAt'>) => void;
  getLastBiblePosition: () => BibleReadingPosition | null;
  updateBibleReaderSettings: (updates: Partial<BibleReaderSettings>) => void;
  setReaderBrightness: (value: number | null) => void;

  // Notebook
  notes: Note[];
  /** Recently Deleted retention (WR-15): soft-kept locally for 30 days. */
  deletedNotes: { note: Note; deletedAt: string }[];
  addNote: (note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateNote: (
    id: string,
    updates: Partial<Pick<Note, 'title' | 'content' | 'category' | 'tags' | 'isFavorite' | 'scriptureRefs' | 'folderId'>>,
    resurrectOnMissing?: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>,
  ) => void;
  deleteNote: (id: string) => void;
  restoreNote: (id: string) => void;
  getNotesForScripture: (bookId: number, chapter: number) => Note[];
  getNotesForDevotional: (devotionalId: string, dayNumber?: number) => Note[];

  // Folders
  folders: NoteFolder[];
  addFolder: (name: string, color?: string, parentId?: string) => string;
  updateFolder: (id: string, updates: Partial<Pick<NoteFolder, 'name' | 'color' | 'sortOrder' | 'parentId'>>) => void;
  getSubfolders: (parentId: string | undefined) => NoteFolder[];
  getDescendantFolderIds: (folderId: string) => string[];
  getFolderBreadcrumbs: (folderId: string) => NoteFolder[];
  deleteFolder: (id: string, deleteNotes?: boolean) => void;
  moveNoteToFolder: (noteId: string, folderId: string | null) => void;
  reorderFolders: (orderedIds: string[]) => void;

  // Check-in notification scheduling toggles
  middayCheckInEnabled: boolean;
  eveningWindDownEnabled: boolean;
  setMiddayCheckInEnabled: (enabled: boolean) => void;
  setEveningWindDownEnabled: (enabled: boolean) => void;

  // Custom check-in times (HH:mm format, e.g. "12:30")
  // Default time used when customByDay is false or a day has no override
  middayCheckInTime: string;
  eveningWindDownTime: string;
  // Per-day overrides: { Mon: "13:00", Sat: null (skip) } — null = skip that day
  middayCheckInByDay: Record<string, string | null> | null;
  eveningWindDownByDay: Record<string, string | null> | null;
  setMiddayCheckInTime: (time: string) => void;
  setEveningWindDownTime: (time: string) => void;
  setMiddayCheckInByDay: (schedule: Record<string, string | null> | null) => void;
  setEveningWindDownByDay: (schedule: Record<string, string | null> | null) => void;

  // Completion tracking (local device YYYY-MM-DD of the last completed check-in).
  //
  // Current design: these fields track completion but do NOT drive scheduling.
  // We always DAILY-schedule regardless of today's completion — the DAILY
  // trigger recurs tomorrow on its own. This accepts the "scenario A" false
  // positive (a user who completes the check-in before today's fire time
  // still receives today's reminder once) in exchange for preserving
  // recurrence. Imperative "cancel and reschedule for tomorrow" was the old
  // approach and silently downgraded DAILY triggers into one-shot DATE
  // triggers — see ~/vault/gotchas/expo-reschedule-helpers-silent-one-shot-downgrade.md
  //
  // If we ever want a "skip today only" mode that truly suppresses today's
  // notification after completion, wire these fields into the fingerprint in
  // useCheckInNotifications and have the hook re-schedule with a filtered
  // trigger. Right now the hook deliberately excludes them from its
  // fingerprint to avoid spurious re-runs on every completion.
  lastMiddayCompletedDate: string | null;
  lastEveningCompletedDate: string | null;
  markMiddayCheckInCompleted: () => void;
  markEveningWindDownCompleted: () => void;

  // Story deduplication
  addUsedStoryId: (devotionalId: string, storyId: string) => void;

  // Sync tracking
  userUpdatedAt?: string; // ISO timestamp for user profile sync

  // Helpers
  getCurrentDevotional: () => Devotional | undefined;
  reset: () => void;
}

const initialState = {
  user: null as UserProfile | null,
  devotionals: [],
  currentDevotionalId: null,
  hasEverCreatedDevotional: false,
  journalEntries: [],
  usedScriptures: [] as UsedScripture[],
  highlights: [] as Highlight[],
  bookmarks: [] as Bookmark[],
  generationSession: {
    status: 'idle' as GenerationSessionStatus,
    devotionalId: null,
    totalDays: 0,
    generatedDayNumbers: [],
  },
  resumeContext: null as ResumeContext | null,
  reviewPromptLastDate: null as string | null,
  reviewPromptCount: 0,
  hasReviewed: false,
  hasSeenDay1Review: false,
  reviewPromptDaysAtLast: 0,
  streakLastReadDate: null as string | null,
  streakCurrent: 0,
  streakLongest: 0,
  streakGraceDaysUsedThisWeek: 0,
  streakWeekStart: null as string | null,
  streakWeekendAmnesty: true,
  streakFreezes: 0,
  seriesPersonaHistory: [] as SeriesPersonaRecord[],
  methodUsageHistory: [] as MethodUsageRecord[],
  checkIns: [] as CheckIn[],
  hasSeenCompanionIntro: false,
  lastCompanionCheckInDate: null as string | null,
  companionName: null as string | null,
  recentCompanionCheckIns: [] as { mood: string; moodLabel: string; date: string; chipAnswer?: string }[],
  hasSeenHomeTooltips: false,
  hasSeenFeatureOnboarding: false,
  dismissedMiddayCardDate: null as string | null,
  dismissedEveningCardDate: null as string | null,
  dismissedBridgeCardDate: null as string | null,
  dismissedRememberThisCardDate: null as string | null,
  // Server-side generation tracking
  pendingJobId: null as string | null,
  // Premium nudge system
  ...NUDGE_INITIAL_STATE,
  streakJustReset: false,
  justCompletedSeriesTitle: null as string | null,
  hasUsedAudio: false,
  // Check-in notification toggles & custom times
  middayCheckInEnabled: true,
  eveningWindDownEnabled: true,
  middayCheckInTime: '12:30',
  eveningWindDownTime: '20:30',
  middayCheckInByDay: null,
  eveningWindDownByDay: null,
  lastMiddayCompletedDate: null as string | null,
  lastEveningCompletedDate: null as string | null,
  // Notebook
  notes: [] as Note[],
  deletedNotes: [] as { note: Note; deletedAt: string }[],
  folders: [] as NoteFolder[],
  // Bible Reader
  bibleHighlights: [] as BibleHighlight[],
  bibleReadingHistory: [] as BibleReadingPosition[],
  bibleReaderSettings: {
    fontSize: 20,
    lineHeightMultiplier: 1.8,
    showVerseNumbers: true,
    paragraphMode: false,
    translation: 'BSB' as const,
  } as BibleReaderSettings,
  readerBrightness: null as number | null,
};

// WR-23: session-scoped flags are reset on every launch (see
// onRehydrateStorage) — no reason to serialize them on every write.
type PersistedUnfoldState = Omit<UnfoldState, 'nudgeShownThisSession' | 'streakJustReset'>;

// WR-23: coalesces persist writes so a burst of store updates (autosave
// while typing) serializes the full state once per window instead of on
// every set(). Flushed when the app backgrounds (listener below).
// The `instrumentPersistRead` wrapper is DEV-only measurement (payload size +
// read/parse/migrate cost on cold start) and is the identity function in
// production — persistence structure is unchanged.
const unfoldPersistStorage = createDebouncedJSONStorage<PersistedUnfoldState>(
  instrumentPersistRead(mmkvStorage),
);

export const useUnfoldStore = create<UnfoldState>()(
  persist(
    (set, get) => ({
      ...initialState,

      // User actions
      setUser: (user) => set({ user, userUpdatedAt: new Date().toISOString() }),
      updateUser: (updates) => {
        const current = get().user;
        if (!current) return;
        // Skip update if all values are already identical (prevents infinite re-render loops)
        const hasChange = Object.entries(updates).some(
          ([key, val]) => current[key as keyof typeof current] !== val
        );
        if (!hasChange) return;
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
          userUpdatedAt: new Date().toISOString(),
        }));
      },

      // Devotional actions
      addDevotional: (devotional) =>
        set((state) => {
          // Prevent duplicate entries with the same ID
          if (state.devotionals.some((d) => d.id === devotional.id)) {
            return { currentDevotionalId: devotional.id, hasEverCreatedDevotional: true };
          }

          const normalizedDevotional = normalizeDevotionalIdentity(devotional);
          return {
            devotionals: [{ ...normalizedDevotional, updatedAt: new Date().toISOString() }, ...state.devotionals],
            currentDevotionalId: devotional.id,
            hasEverCreatedDevotional: true,
          };
        }),

      removeDevotional: (devotionalId) =>
        set((state) => ({
          devotionals: state.devotionals.filter((d) => d.id !== devotionalId),
          currentDevotionalId:
            state.currentDevotionalId === devotionalId ? null : state.currentDevotionalId,
          // Clean up all associated data
          journalEntries: state.journalEntries.filter((j) => j.devotionalId !== devotionalId),
          checkIns: state.checkIns.filter((c) => c.devotionalId !== devotionalId),
          highlights: state.highlights.filter((h) => h.devotionalId !== devotionalId),
          bookmarks: state.bookmarks.filter((b) => b.devotionalId !== devotionalId),
        })),

      updateDevotionalDays: (devotionalId, days, title) =>
        set((state) => {
          const now = new Date().toISOString();
          return {
            devotionals: state.devotionals.map((d) => {
              if (d.id !== devotionalId) return d;

              const normalizedIncomingDays = normalizeGeneratedDaysIdentity(devotionalId, days);
              const seriesArcTotalDays = getSeriesArcTotalDays(d);
              const incomingDaysWithinBoundary = seriesArcTotalDays > 0
                ? filterDaysWithinSeriesBoundary(normalizedIncomingDays, d)
                : normalizedIncomingDays;

              // Merge incoming days with existing days by dayNumber.
              // Preserve read status/readAt from existing entries so late generation updates
              // never reset a day the user already completed.
              const existingDaysWithinBoundary = seriesArcTotalDays > 0
                ? filterDaysWithinSeriesBoundary(d.days, d)
                : d.days;
              const existingByDay = new Map(existingDaysWithinBoundary.map((day) => [day.dayNumber, day]));
              const incomingByDay = new Map(incomingDaysWithinBoundary.map((day) => [day.dayNumber, day]));
              const mergedByDay = new Map<number, DevotionalDay>();

              for (const [dayNumber, existingDay] of existingByDay.entries()) {
                const incomingDay = incomingByDay.get(dayNumber);
                if (!incomingDay) {
                  mergedByDay.set(dayNumber, existingDay);
                  continue;
                }

                mergedByDay.set(dayNumber, {
                  ...incomingDay,
                  id: incomingDay.id ?? existingDay.id ?? canonicalGeneratedDayId(devotionalId, dayNumber),
                  devotionalId,
                  isRead: existingDay.isRead || incomingDay.isRead,
                  readAt: existingDay.isRead ? existingDay.readAt : incomingDay.readAt,
                  isRevealed: (existingDay.isRevealed ?? false) || (incomingDay.isRevealed ?? false),
                  updatedAt: now,
                });
              }

              for (const [dayNumber, incomingDay] of incomingByDay.entries()) {
                if (!mergedByDay.has(dayNumber)) {
                  mergedByDay.set(dayNumber, {
                    ...incomingDay,
                    id: incomingDay.id ?? canonicalGeneratedDayId(devotionalId, dayNumber),
                    devotionalId,
                    updatedAt: now,
                  });
                }
              }

              const mergedDays = [...mergedByDay.values()].sort((a, b) => a.dayNumber - b.dayNumber);
              const nextTotalDays = seriesArcTotalDays > 0
                ? seriesArcTotalDays
                : Math.max(d.totalDays, mergedDays.length);

              return {
                ...d,
                days: mergedDays,
                // Server-owned progressive arcs define the hard series length.
                totalDays: nextTotalDays,
                currentDay: clampCurrentDayToSeriesBoundary(d.currentDay, {
                  totalDays: nextTotalDays,
                  seriesArc: d.seriesArc,
                }),
                ...(title ? { title } : {}),
                updatedAt: now,
              };
            }),
          };
        }),

      setCurrentDevotional: (id) => set({ currentDevotionalId: id }),
      archiveCurrentDevotional: () => set({ currentDevotionalId: null }),
      isReturningUser: () => get().hasEverCreatedDevotional || get().devotionals.length > 0,

      markDayAsRead: (devotionalId, dayNumber) =>
        set((state) => {
          const now = new Date().toISOString();
          return {
            devotionals: state.devotionals.map((d) =>
              d.id === devotionalId
                ? {
                    ...d,
                    updatedAt: now,
                    days: d.days.map((day) =>
                      day.dayNumber === dayNumber
                        ? { ...day, isRead: true, readAt: now, isRevealed: true, updatedAt: now }
                        : day
                    ),
                  }
                : d
            ),
          };
        }),

      markDayAsRevealed: (devotionalId, dayNumber) =>
        set((state) => {
          const now = new Date().toISOString();
          return {
            devotionals: state.devotionals.map((d) =>
              d.id === devotionalId
                ? {
                    ...d,
                    updatedAt: now,
                    days: d.days.map((day) =>
                      day.dayNumber === dayNumber
                        ? { ...day, isRevealed: true, updatedAt: now }
                        : day
                    ),
                  }
                : d
            ),
          };
        }),

      advanceDay: (devotionalId) =>
        set((state) => ({
          devotionals: state.devotionals.map((d) => {
            if (d.id !== devotionalId) return d;
            const effectiveTotal = getServerOwnedSeriesTotalDays(d);
            return effectiveTotal > 0 && d.currentDay < effectiveTotal
              ? { ...d, currentDay: d.currentDay + 1, updatedAt: new Date().toISOString() }
              : d;
          }),
        })),

      // Journal actions
      addJournalEntry: (entry) =>
        set((state) => {
          const now = new Date().toISOString();
          const newEntry: JournalEntry = {
            ...entry,
            id: `journal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            createdAt: now,
            updatedAt: now,
          };
          enqueuePersonalDataSyncChange('journal_entries', newEntry.id, journalEntrySyncData(newEntry), now);
          return { journalEntries: [...state.journalEntries, newEntry] };
        }),

      updateJournalEntry: (id, content) =>
        set((state) => {
          const now = new Date().toISOString();
          let changed: JournalEntry | null = null;
          const journalEntries = state.journalEntries.map((e) => {
            if (e.id !== id) return e;
            changed = { ...e, content, updatedAt: now };
            return changed;
          });
          const changedEntry = changed as JournalEntry | null;
          if (changedEntry) enqueuePersonalDataSyncChange('journal_entries', changedEntry.id, journalEntrySyncData(changedEntry), now);
          return { journalEntries };
        }),

      updateJournalMode: (id, mode) =>
        set((state) => {
          const now = new Date().toISOString();
          let changed: JournalEntry | null = null;
          const journalEntries = state.journalEntries.map((e) => {
            if (e.id !== id) return e;
            changed = { ...e, journalMode: mode, updatedAt: now };
            return changed;
          });
          const changedEntry = changed as JournalEntry | null;
          if (changedEntry) enqueuePersonalDataSyncChange('journal_entries', changedEntry.id, journalEntrySyncData(changedEntry), now);
          return { journalEntries };
        }),

      updateSoapResponse: (id, field, value) =>
        set((state) => {
          const now = new Date().toISOString();
          let changed: JournalEntry | null = null;
          const journalEntries = state.journalEntries.map((e) => {
            if (e.id !== id) return e;
            const soap = e.soapResponses ?? { scripture: '', observation: '', application: '', prayer: '' };
            changed = {
              ...e,
              soapResponses: { ...soap, [field]: value },
              updatedAt: now,
            };
            return changed;
          });
          const changedEntry = changed as JournalEntry | null;
          if (changedEntry) enqueuePersonalDataSyncChange('journal_entries', changedEntry.id, journalEntrySyncData(changedEntry), now);
          return { journalEntries };
        }),

      addPrayerRequest: (entryId, text) =>
        set((state) => {
          const now = new Date().toISOString();
          let changed: JournalEntry | null = null;
          const journalEntries = state.journalEntries.map((e) => {
            if (e.id !== entryId) return e;
            const prayers = e.prayerRequests ?? [];
            changed = {
              ...e,
              prayerRequests: [
                ...prayers,
                {
                  id: `prayer-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                  text,
                  isAnswered: false,
                  createdAt: now,
                },
              ],
              updatedAt: now,
            };
            return changed;
          });
          const changedEntry = changed as JournalEntry | null;
          if (changedEntry) enqueuePersonalDataSyncChange('journal_entries', changedEntry.id, journalEntrySyncData(changedEntry), now);
          return { journalEntries };
        }),

      togglePrayerAnswered: (entryId, prayerId) =>
        set((state) => {
          const now = new Date().toISOString();
          let changed: JournalEntry | null = null;
          const journalEntries = state.journalEntries.map((e) => {
            if (e.id !== entryId) return e;
            changed = {
              ...e,
              prayerRequests: (e.prayerRequests ?? []).map((p) =>
                p.id === prayerId
                  ? { ...p, isAnswered: !p.isAnswered, answeredAt: !p.isAnswered ? now : undefined }
                  : p
              ),
              updatedAt: now,
            };
            return changed;
          });
          const changedEntry = changed as JournalEntry | null;
          if (changedEntry) enqueuePersonalDataSyncChange('journal_entries', changedEntry.id, journalEntrySyncData(changedEntry), now);
          return { journalEntries };
        }),

      updateQuestionResponse: (entryId, question, response) =>
        set((state) => {
          const now = new Date().toISOString();
          let changed: JournalEntry | null = null;
          const journalEntries = state.journalEntries.map((e) => {
            if (e.id !== entryId) return e;
            const existing = e.questionResponses ?? [];
            const idx = existing.findIndex((qr) => qr.question === question);
            let updated: { question: string; response: string }[];
            if (idx >= 0) {
              updated = existing.map((qr, i) => (i === idx ? { question, response } : qr));
            } else {
              updated = [...existing, { question, response }];
            }
            changed = { ...e, questionResponses: updated, updatedAt: now };
            return changed;
          });
          const changedEntry = changed as JournalEntry | null;
          if (changedEntry) enqueuePersonalDataSyncChange('journal_entries', changedEntry.id, journalEntrySyncData(changedEntry), now);
          return { journalEntries };
        }),

      setDeeperQuestions: (entryId, questions) =>
        set((state) => {
          const now = new Date().toISOString();
          let changed: JournalEntry | null = null;
          const journalEntries = state.journalEntries.map((e) => {
            if (e.id !== entryId) return e;
            changed = { ...e, deeperQuestions: questions, updatedAt: now };
            return changed;
          });
          const changedEntry = changed as JournalEntry | null;
          if (changedEntry) enqueuePersonalDataSyncChange('journal_entries', changedEntry.id, journalEntrySyncData(changedEntry), now);
          return { journalEntries };
        }),

      getJournalEntry: (devotionalId, dayNumber) => {
        const state = get();
        return state.journalEntries.find(
          (e) => e.devotionalId === devotionalId && e.dayNumber === dayNumber
        );
      },

      // Scripture tracking actions
      addUsedScriptures: (scriptures) =>
        set((state) => {
          const now = new Date().toISOString();
          const timestamped = scriptures.map((s) => ({
            ...s,
            id: s.id ?? `us_${s.devotionalId}_${s.reference}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
            updatedAt: now,
          }));
          timestamped.forEach((scripture) => {
            if (scripture.id) enqueuePersonalDataSyncChange('used_scriptures', scripture.id, usedScriptureSyncData(scripture), now);
          });
          const combined = [...state.usedScriptures, ...timestamped];
          // Cap at 200 most recent scriptures to prevent unbounded growth
          const MAX_SCRIPTURES = 200;
          if (combined.length > MAX_SCRIPTURES) {
            // Sort by date and keep only the most recent
            const sorted = combined.sort(
              (a, b) => new Date(b.usedAt).getTime() - new Date(a.usedAt).getTime()
            );
            return { usedScriptures: sorted.slice(0, MAX_SCRIPTURES) };
          }
          return { usedScriptures: combined };
        }),

      getRecentScriptures: (limit = 100) => {
        const state = get();
        // Return most recent scriptures, sorted by date
        return [...state.usedScriptures]
          .sort((a, b) => new Date(b.usedAt).getTime() - new Date(a.usedAt).getTime())
          .slice(0, limit);
      },

      // Bookmark actions
      addBookmark: (bookmark) =>
        set((state) => {
          const now = new Date().toISOString();
          const newBookmark: Bookmark = { ...bookmark, id: `bm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, savedAt: now, updatedAt: now };
          enqueuePersonalDataSyncChange('bookmarks', newBookmark.id, bookmarkSyncData(newBookmark), now);
          return {
            bookmarks: [
              newBookmark,
              ...state.bookmarks,
            ],
          };
        }),

      removeBookmark: (id) =>
        set((state) => {
          const existing = state.bookmarks.find((b) => b.id === id);
          if (existing) enqueuePersonalDataSyncChange('bookmarks', id, bookmarkSyncData(existing), new Date().toISOString(), true);
          return { bookmarks: state.bookmarks.filter((b) => b.id !== id) };
        }),

      isBookmarked: (devotionalId, dayNumber) => {
        const state = get();
        return state.bookmarks.some(
          (b) => b.devotionalId === devotionalId && b.dayNumber === dayNumber
        );
      },

      // Highlight actions
      addHighlight: (highlight) => {
        set((state) => {
          // Dedupe: if a highlight with the same devotional+day+serializedRange
          // (or legacy text+color on the same day) already exists, don't add
          // a duplicate. Prevents store bloat when the user re-highlights the
          // same text or when a sync retry replays a creation event.
          const posKey = (serialized?: string): string | null => {
            if (!serialized) return null;
            const parts = serialized.split('$');
            if (parts.length < 4) return null;
            return `${parts[0]}-${parts[1]}-${parts[3]}`;
          };
          const newPosKey = posKey(highlight.serializedRange);
          const existing = state.highlights.find((h) => {
            if (h.devotionalId !== highlight.devotionalId) return false;
            if (h.dayNumber !== highlight.dayNumber) return false;
            if (highlight.serializedRange && h.serializedRange === highlight.serializedRange) return true;
            if (newPosKey && posKey(h.serializedRange) === newPosKey) return true;
            if (!highlight.serializedRange && h.highlightedText === highlight.highlightedText && h.color === highlight.color) return true;
            return false;
          });
          if (existing) {
            // Already have this exact highlight — no-op
            return state;
          }
          const now = new Date().toISOString();
          const newHighlight = { ...highlight, id: `hl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, createdAt: now, updatedAt: now };
          enqueuePersonalDataSyncChange('highlights', newHighlight.id, devotionalHighlightSyncData(newHighlight), now);
          return {
            highlights: [newHighlight, ...state.highlights],
          };
        });
      },

      removeHighlight: (id) =>
        set((state) => {
          const existing = state.highlights.find((h) => h.id === id);
          if (existing) enqueuePersonalDataSyncChange('highlights', id, devotionalHighlightSyncData(existing), new Date().toISOString(), true);
          return { highlights: state.highlights.filter((h) => h.id !== id) };
        }),

      getRandomHighlight: () => {
        const highlights = get().highlights;
        if (highlights.length === 0) return null;
        const today = new Date().toISOString().split('T')[0];
        const seed = today.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const index = seed % highlights.length;
        return highlights[index];
      },

      // Generation session actions
      startGenerationSession: ({ devotionalId, totalDays }) =>
        set(() => ({
          generationSession: {
            status: 'running',
            devotionalId,
            totalDays,
            generatedDayNumbers: [],
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            error: undefined,
          },
        })),

      updateGenerationSessionProgress: ({ dayNumber, dayNumbers, title }) =>
        set((state) => {
          const existing = state.generationSession;
          const mergedDays = Array.from(
            new Set([
              ...existing.generatedDayNumbers,
              ...(typeof dayNumber === 'number' ? [dayNumber] : []),
              ...(dayNumbers ?? []),
            ])
          ).sort((a, b) => a - b);

          return {
            generationSession: {
              ...existing,
              status: 'running',
              generatedDayNumbers: mergedDays,
              ...(title ? { title } : {}),
              updatedAt: new Date().toISOString(),
              error: undefined,
            },
          };
        }),

      completeGenerationSession: (payload) =>
        set((state) => ({
          generationSession: {
            ...state.generationSession,
            status: 'complete',
            ...(payload?.title ? { title: payload.title } : {}),
            updatedAt: new Date().toISOString(),
            error: undefined,
          },
        })),

      failGenerationSession: (errorMessage) =>
        set((state) => ({
          generationSession: {
            ...state.generationSession,
            status: 'error',
            error: errorMessage,
            updatedAt: new Date().toISOString(),
          },
        })),

      clearGenerationSession: () =>
        set(() => ({
          generationSession: {
            status: 'idle',
            devotionalId: null,
            totalDays: 0,
            generatedDayNumbers: [],
          },
        })),

      // Resume context actions
      setResumeContext: (context) => set({ resumeContext: context }),
      clearResumeContext: () => set({ resumeContext: null }),

      // Review prompt actions
      recordReviewPrompt: (daysCompleted) =>
        set((state) => ({
          reviewPromptLastDate: new Date().toISOString(),
          reviewPromptCount: state.reviewPromptCount + 1,
          reviewPromptDaysAtLast: daysCompleted,
        })),
      markAsReviewed: () => set({ hasReviewed: true }),
      setHasSeenDay1Review: () => set({ hasSeenDay1Review: true }),

      // Streak actions
      recordStreakRead: () =>
        set((state) => {
          const result = applyStreakRead(
            {
              streakCurrent: state.streakCurrent,
              streakLastReadDate: state.streakLastReadDate,
              streakGraceDaysUsedThisWeek: state.streakGraceDaysUsedThisWeek,
              streakWeekStart: state.streakWeekStart,
              streakWeekendAmnesty: state.streakWeekendAmnesty,
              streakFreezes: state.streakFreezes,
              isPremium: Boolean(state.user?.isPremium),
              streakLongest: state.streakLongest,
            },
            new Date()
          );
          // null = already read today — no change.
          return result ?? state;
        }),
      reconcileStreakState: () =>
        set((state) =>
          reconcileStreakState({
            streakCurrent: state.streakCurrent,
            streakLastReadDate: state.streakLastReadDate,
            streakGraceDaysUsedThisWeek: state.streakGraceDaysUsedThisWeek,
            streakWeekStart: state.streakWeekStart,
            streakWeekendAmnesty: state.streakWeekendAmnesty,
            streakFreezes: state.streakFreezes,
            isPremium: Boolean(state.user?.isPremium),
            streakJustReset: state.streakJustReset,
          })
        ),
      resetStreakGraceDays: () =>
        set({
          streakGraceDaysUsedThisWeek: 0,
          streakWeekStart: getWeekStart(new Date()).toISOString(),
        }),
      toggleWeekendAmnesty: () =>
        set((state) => ({
          streakWeekendAmnesty: !state.streakWeekendAmnesty,
        })),

      // Cross-series persona tracking
      addSeriesPersonaRecord: (record) =>
        set((state) => {
          const now = new Date().toISOString();
          const MAX_HISTORY = 10;
          const updatedRecord = { ...record, id: record.id ?? `persona_${record.devotionalId}`, updatedAt: now };
          enqueuePersonalDataSyncChange('series_persona_history', updatedRecord.id, seriesPersonaSyncData(updatedRecord), now);
          const updated = [updatedRecord, ...state.seriesPersonaHistory].slice(0, MAX_HISTORY);
          return { seriesPersonaHistory: updated };
        }),

      // Cross-series method usage tracking
      methodUsageHistory: [],
      recordMethodUsage: (methodId, devotionalId, dayNumber) =>
        set((state) => {
          // Avoid duplicate entries for the same day
          const exists = state.methodUsageHistory.some(
            (r) => r.devotionalId === devotionalId && r.dayNumber === dayNumber,
          );
          if (exists) return state;
          const now = new Date().toISOString();
          const MAX_HISTORY = 200;
          const newRecord = { methodId, devotionalId, dayNumber, usedAt: now, id: `method_${methodId}_${devotionalId}_${dayNumber}`, updatedAt: now };
          enqueuePersonalDataSyncChange('method_usage_history', newRecord.id, methodUsageSyncData(newRecord), now);
          return {
            methodUsageHistory: [
              newRecord,
              ...state.methodUsageHistory,
            ].slice(0, MAX_HISTORY),
          };
        }),

      // Check-ins (Phase 2)
      addCheckIn: (checkIn) =>
        set((state) => {
          const now = new Date().toISOString();
          const newCheckIn: CheckIn = { ...checkIn, id: newId(), createdAt: now, updatedAt: now };
          enqueuePersonalDataSyncChange('check_ins', newCheckIn.id, checkInSyncData(newCheckIn), now);
          return {
            checkIns: [
              newCheckIn,
              ...state.checkIns,
            ].slice(0, 200), // Cap at 200 entries
          };
        }),
      getCheckIn: (devotionalId, dayNumber, timeOfDay) => {
        return get().checkIns.find(
          (c) => c.devotionalId === devotionalId && c.dayNumber === dayNumber && c.timeOfDay === timeOfDay
        );
      },
      getRecentCheckIns: (count) => {
        return get().checkIns.slice(0, count);
      },

      // Companion orb state
      setHasSeenCompanionIntro: (seen) => set({ hasSeenCompanionIntro: seen }),
      setLastCompanionCheckInDate: (date) => set({ lastCompanionCheckInDate: date }),
      setCompanionName: (name) => set({ companionName: name }),
      addRecentCompanionCheckIn: (checkIn) =>
        set((state) => ({
          recentCompanionCheckIns: [
            { ...checkIn, date: new Date().toISOString() },
            ...state.recentCompanionCheckIns,
          ].slice(0, 7),
        })),

      // Home onboarding tooltips
      setHasSeenHomeTooltips: (seen) => set({ hasSeenHomeTooltips: seen }),

      // Feature onboarding carousel
      setHasSeenFeatureOnboarding: (seen) => set({ hasSeenFeatureOnboarding: seen }),

      // Card dismiss tracking
      setDismissedMiddayCardDate: (date) => set({ dismissedMiddayCardDate: date }),
      setDismissedEveningCardDate: (date) => set({ dismissedEveningCardDate: date }),
      setDismissedBridgeCardDate: (date) => set({ dismissedBridgeCardDate: date }),
      setDismissedRememberThisCardDate: (date) => set({ dismissedRememberThisCardDate: date }),

      // Premium nudge system
      recordNudgeImpression: (type) =>
        set((state) => ({
          nudgeImpressions: [
            ...state.nudgeImpressions,
            { type, shownAt: new Date().toISOString() },
          ].slice(-50), // Cap at 50 entries to prevent unbounded growth
          nudgeShownThisSession: true,
        })),
      recordNudgeDismissal: (type) =>
        set((state) => ({
          nudgeDismissals: [
            ...state.nudgeDismissals,
            { type, dismissedAt: new Date().toISOString() },
          ].slice(-20),
        })),
      resetNudgeSession: () => set({ nudgeShownThisSession: false }),
      clearStreakJustReset: () => set({ streakJustReset: false }),
      clearJustCompletedSeriesTitle: () => set({ justCompletedSeriesTitle: null }),
      setHasUsedAudio: () => set({ hasUsedAudio: true }),

      // Check-in notification toggles & custom times
      setMiddayCheckInEnabled: (enabled) => set({ middayCheckInEnabled: enabled }),
      setEveningWindDownEnabled: (enabled) => set({ eveningWindDownEnabled: enabled }),
      setMiddayCheckInTime: (time) => set({ middayCheckInTime: time }),
      setEveningWindDownTime: (time) => set({ eveningWindDownTime: time }),
      setMiddayCheckInByDay: (schedule) => set({ middayCheckInByDay: schedule }),
      setEveningWindDownByDay: (schedule) => set({ eveningWindDownByDay: schedule }),

      // Check-in completion tracking. Persisted for future skip-today support,
      // NOT currently read by scheduling. See the field declaration above for
      // the design rationale. Use `en-CA` locale to get YYYY-MM-DD format in
      // the device's local timezone (NOT UTC — notifications are scheduled
      // against local calendar, so the completion date must also be local).
      markMiddayCheckInCompleted: () =>
        set({ lastMiddayCompletedDate: new Date().toLocaleDateString('en-CA') }),
      markEveningWindDownCompleted: () =>
        set({ lastEveningCompletedDate: new Date().toLocaleDateString('en-CA') }),

      // Deferred generation
      addUsedStoryId: (devotionalId, storyId) => set((state) => {
        const devo = state.devotionals.find((d) => d.id === devotionalId);
        if (devo) {
          devo.usedStoryIds = [...(devo.usedStoryIds ?? []), storyId];
        }
        return { devotionals: [...state.devotionals] };
      }),

      // Server-side generation tracking
      setPendingJobId: (id) => set({ pendingJobId: id }),

      // Series arc management
      setSeriesArc: (devotionalId, arc) =>
        set((state) => ({
          devotionals: state.devotionals.map((d) =>
            d.id === devotionalId ? { ...d, seriesArc: arc, title: arc.overarchingTheme ? d.title : d.title, updatedAt: new Date().toISOString() } : d
          ),
        })),

      extendSeriesArc: (devotionalId, newDayHints, _additionalDays) =>
        set((state) => ({
          devotionals: state.devotionals.map((d) => {
            if (d.id !== devotionalId || !d.seriesArc) return d;
            // Use actual hint count, not the requested count — LLM may return fewer/more
            const actualAdded = newDayHints.length;
            const now = new Date().toISOString();
            return {
              ...d,
              totalDays: d.totalDays + actualAdded,
              updatedAt: now,
              seriesArc: {
                ...d.seriesArc,
                totalDaysPlanned: d.seriesArc.totalDaysPlanned + actualAdded,
                dayHints: [...d.seriesArc.dayHints, ...newDayHints],
                isOpenEnded: true,
                lastExtendedAt: now,
              },
            };
          }),
        })),

      // Progressive memory management
      pushFullDayMemory: (devotionalId, dayMemory) =>
        set((state) => ({
          devotionals: state.devotionals.map((d) => {
            if (d.id !== devotionalId) return d;
            const memory = d.progressiveMemory ?? { fullDays: [], summaries: [], narrative: null };
            // FIFO: keep only last 3 full-day records
            const updatedFull = [dayMemory, ...memory.fullDays].slice(0, 3);
            return { ...d, progressiveMemory: { ...memory, fullDays: updatedFull } };
          }),
        })),

      addMemorySummary: (devotionalId, summary) =>
        set((state) => ({
          devotionals: state.devotionals.map((d) => {
            if (d.id !== devotionalId) return d;
            const memory = d.progressiveMemory ?? { fullDays: [], summaries: [], narrative: null };
            // Cap at 10 summaries (~30 days of coverage)
            const updatedSummaries = [summary, ...memory.summaries].slice(0, 10);
            return { ...d, progressiveMemory: { ...memory, summaries: updatedSummaries } };
          }),
        })),

      setNarrativeMemory: (devotionalId, narrative) =>
        set((state) => ({
          devotionals: state.devotionals.map((d) => {
            if (d.id !== devotionalId) return d;
            const memory = d.progressiveMemory ?? { fullDays: [], summaries: [], narrative: null };
            return { ...d, progressiveMemory: { ...memory, narrative } };
          }),
        })),

      // Single-day addition for progressive generation
      addGeneratedDay: (devotionalId, day) =>
        set((state) => {
          const now = new Date().toISOString();
          const normalizedDay = normalizeGeneratedDayIdentity(devotionalId, day, day.dayNumber);
          return {
            devotionals: state.devotionals.map((d) => {
              if (d.id !== devotionalId) return d;
              const seriesTotalDays = getServerOwnedSeriesTotalDays(d);
              if (seriesTotalDays > 0 && normalizedDay.dayNumber > seriesTotalDays) return d;
              // Don't duplicate if day already exists
              if (d.days.some((existing) => existing.dayNumber === normalizedDay.dayNumber)) return d;
              const updatedDays = [...d.days, { ...normalizedDay, updatedAt: now }].sort((a, b) => a.dayNumber - b.dayNumber);
              return { ...d, days: updatedDays, updatedAt: now };
            }),
          };
        }),

      // Bible Reader actions
      addBibleHighlight: (highlight) =>
        set((state) => {
          const now = new Date().toISOString();
          const newHighlight: BibleHighlight = {
            ...highlight,
            id: `bh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            createdAt: now,
            updatedAt: now,
          };
          enqueuePersonalDataSyncChange('bible_highlights', newHighlight.id, bibleHighlightSyncData(newHighlight), now);
          return {
            bibleHighlights: [
              ...state.bibleHighlights,
              newHighlight,
            ],
          };
        }),

      removeBibleHighlight: (id) =>
        set((state) => {
          const existing = state.bibleHighlights.find((h) => h.id === id);
          if (existing) enqueuePersonalDataSyncChange('bible_highlights', id, bibleHighlightSyncData(existing), new Date().toISOString(), true);
          return { bibleHighlights: state.bibleHighlights.filter((h) => h.id !== id) };
        }),

      updateBibleHighlightNote: (id, note) =>
        set((state) => {
          const now = new Date().toISOString();
          let changed: BibleHighlight | null = null;
          const bibleHighlights = state.bibleHighlights.map((h) => {
            if (h.id !== id) return h;
            changed = { ...h, note, updatedAt: now };
            return changed;
          });
          const changedHighlight = changed as BibleHighlight | null;
          if (changedHighlight) enqueuePersonalDataSyncChange('bible_highlights', changedHighlight.id, bibleHighlightSyncData(changedHighlight), now);
          return { bibleHighlights };
        }),

      getBibleHighlightsForChapter: (bookId, chapter) => {
        return get().bibleHighlights.filter(
          (h) => h.bookId === bookId && h.chapter === chapter,
        );
      },

      recordBibleReading: (position) =>
        set((state) => {
          const now = new Date().toISOString();
          const newEntry: BibleReadingPosition = {
            ...position,
            id: position.id ?? `brp_${position.bookId}_${position.chapter}_${position.translation}`,
            lastReadAt: now,
            updatedAt: now,
          };
          if (newEntry.id) enqueuePersonalDataSyncChange('bible_reading_positions', newEntry.id, bibleReadingPositionSyncData(newEntry), now);
          // Keep last 100 entries, most recent first
          const history = [
            newEntry,
            ...state.bibleReadingHistory.filter(
              (h) => !(h.bookId === position.bookId && h.chapter === position.chapter),
            ),
          ].slice(0, 100);
          return { bibleReadingHistory: history };
        }),

      getLastBiblePosition: () => {
        const history = get().bibleReadingHistory;
        return history.length > 0 ? history[0] : null;
      },

      updateBibleReaderSettings: (updates) =>
        set((state) => ({
          bibleReaderSettings: { ...state.bibleReaderSettings, ...updates },
        })),

      setReaderBrightness: (value) => set({ readerBrightness: value }),

      // Notebook actions
      addNote: (note) => {
        const id = `note_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const now = new Date().toISOString();
        const newNote: Note = { ...note, id, createdAt: now, updatedAt: now };
        enqueuePersonalDataSyncChange('notes', id, noteSyncData(newNote), now);
        set((state) => ({
          notes: [
            newNote,
            ...state.notes,
          ],
        }));
        return id;
      },

      updateNote: (id, updates, resurrectOnMissing) =>
        set((state) => {
          const now = new Date().toISOString();
          let changed: Note | null = null;
          const notes = state.notes.map((n) => {
            if (n.id !== id) return n;
            changed = { ...n, ...updates, updatedAt: now };
            return changed;
          });
          const changedNote = changed as Note | null;
          if (changedNote) enqueuePersonalDataSyncChange('notes', id, noteSyncData(changedNote), now);
          if (!changedNote && resurrectOnMissing) {
            const resurrectedNote: Note = { ...resurrectOnMissing, id, createdAt: now, updatedAt: now };
            enqueuePersonalDataSyncChange('notes', id, noteSyncData(resurrectedNote), now);
            return { notes: [resurrectedNote, ...notes] };
          }
          return { notes };
        }),

      deleteNote: (id) =>
        set((state) => {
          const existing = state.notes.find((n) => n.id === id);
          const now = new Date().toISOString();
          if (existing) enqueuePersonalDataSyncChange('notes', id, noteSyncData(existing), now, true);
          return {
            notes: state.notes.filter((n) => n.id !== id),
            // WR-15: keep the note recoverable locally for 30 days.
            deletedNotes: existing
              ? [{ note: existing, deletedAt: now }, ...state.deletedNotes]
              : state.deletedNotes,
          };
        }),

      restoreNote: (id) =>
        set((state) => {
          const entry = state.deletedNotes.find((d) => d.note.id === id);
          if (!entry) return state;
          // Reuse the WR-04 restore path: puts the note back AND re-enqueues a
          // non-deleted sync change so the restore wins LWW server-side.
          const restored = applyUndoActionsWithSync(
            { notes: state.notes, folders: state.folders },
            [{ type: 'note', note: entry.note }],
            new Date().toISOString(),
          );
          return {
            notes: restored.notes,
            folders: restored.folders,
            deletedNotes: state.deletedNotes.filter((d) => d.note.id !== id),
          };
        }),

      getNotesForScripture: (bookId, chapter) => {
        return get().notes.filter(
          (n) =>
            (n.bibleBookId === bookId && n.bibleChapter === chapter) ||
            n.scriptureRefs.some((ref) => ref.bookId === bookId && ref.chapter === chapter),
        );
      },

      getNotesForDevotional: (devotionalId, dayNumber) => {
        return get().notes.filter(
          (n) =>
            n.devotionalId === devotionalId &&
            (dayNumber === undefined || n.dayNumber === dayNumber),
        );
      },

      // Folder actions
      addFolder: (name, color, parentId) => {
        const id = `folder_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const now = new Date().toISOString();
        set((state) => {
          const siblings = state.folders.filter((f) => (f.parentId ?? undefined) === parentId);
          const newFolder: NoteFolder = {
            id,
            name,
            color,
            parentId,
            sortOrder: siblings.length,
            createdAt: now,
            updatedAt: now,
          };
          enqueuePersonalDataSyncChange('note_folders', id, noteFolderSyncData(newFolder), now);
          return {
            folders: [
              ...state.folders,
              newFolder,
            ],
          };
        });
        return id;
      },

      updateFolder: (id, updates) =>
        set((state) => {
          const now = new Date().toISOString();
          let changed: NoteFolder | null = null;
          const folders = state.folders.map((f) => {
            if (f.id !== id) return f;
            changed = { ...f, ...updates, updatedAt: now };
            return changed;
          });
          const changedFolder = changed as NoteFolder | null;
          if (changedFolder) enqueuePersonalDataSyncChange('note_folders', id, noteFolderSyncData(changedFolder), now);
          return { folders };
        }),

      deleteFolder: (id, deleteNotes = false) =>
        set((state) => {
          // Collect this folder + all descendant folder IDs
          const idsToDelete = new Set<string>([id]);
          let changed = true;
          while (changed) {
            changed = false;
            for (const f of state.folders) {
              if (f.parentId && idsToDelete.has(f.parentId) && !idsToDelete.has(f.id)) {
                idsToDelete.add(f.id);
                changed = true;
              }
            }
          }
          const now = new Date().toISOString();
          state.folders
            .filter((f) => idsToDelete.has(f.id))
            .forEach((folder) => enqueuePersonalDataSyncChange('note_folders', folder.id, noteFolderSyncData(folder), now, true));

          const notes = deleteNotes
            ? state.notes.filter((n) => {
                const shouldDelete = !!n.folderId && idsToDelete.has(n.folderId);
                if (shouldDelete) enqueuePersonalDataSyncChange('notes', n.id, noteSyncData(n), now, true);
                return !shouldDelete;
              })
            : state.notes.map((n) => {
                if (!n.folderId || !idsToDelete.has(n.folderId)) return n;
                const updatedNote = { ...n, folderId: undefined, updatedAt: now };
                enqueuePersonalDataSyncChange('notes', updatedNote.id, noteSyncData(updatedNote), now);
                return updatedNote;
              });

          return {
            folders: state.folders.filter((f) => !idsToDelete.has(f.id)),
            notes,
          };
        }),

      moveNoteToFolder: (noteId, folderId) =>
        set((state) => {
          const now = new Date().toISOString();
          let changed: Note | null = null;
          const notes = state.notes.map((n) => {
            if (n.id !== noteId) return n;
            changed = { ...n, folderId: folderId ?? undefined, updatedAt: now };
            return changed;
          });
          const changedNote = changed as Note | null;
          if (changedNote) enqueuePersonalDataSyncChange('notes', noteId, noteSyncData(changedNote), now);
          return { notes };
        }),

      reorderFolders: (orderedIds) => {
        set((state) => {
          const now = new Date().toISOString();
          const folders = state.folders.map((folder) => {
            const sortOrder = orderedIds.indexOf(folder.id);
            if (sortOrder === -1) return folder;
            const updatedFolder = { ...folder, sortOrder, updatedAt: now };
            enqueuePersonalDataSyncChange('note_folders', updatedFolder.id, noteFolderSyncData(updatedFolder), now);
            return updatedFolder;
          });
          return { folders };
        });
      },

      getSubfolders: (parentId) => {
        return get().folders
          .filter((f) => (f.parentId ?? undefined) === parentId)
          .sort((a, b) => a.sortOrder - b.sortOrder);
      },

      getDescendantFolderIds: (folderId) => {
        const all = get().folders;
        const ids: string[] = [];
        const queue = [folderId];
        while (queue.length > 0) {
          const current = queue.shift()!;
          for (const f of all) {
            if (f.parentId === current) {
              ids.push(f.id);
              queue.push(f.id);
            }
          }
        }
        return ids;
      },

      getFolderBreadcrumbs: (folderId) => {
        const all = get().folders;
        const crumbs: NoteFolder[] = [];
        let current = all.find((f) => f.id === folderId);
        while (current) {
          crumbs.unshift(current);
          current = current.parentId ? all.find((f) => f.id === current!.parentId) : undefined;
        }
        return crumbs;
      },

      // Helpers
      getCurrentDevotional: () => {
        const state = get();
        return state.devotionals.find((d) => d.id === state.currentDevotionalId);
      },

      reset: () => set(initialState),
    }),
    {
      name: 'unfold-storage',
      storage: unfoldPersistStorage,
      version: 40, // v40: repair missing seriesStartDate (calendar anchor)
      // WR-23: drop session-scoped flags from the persisted blob.
      partialize: (state): PersistedUnfoldState => {
        const { nudgeShownThisSession, streakJustReset, ...persisted } = state;
        return persisted;
      },
      // Validate and migrate persisted state. Migrations work on the loose
      // legacy shape (Record<string, any>); the repaired result is merged
      // into the typed state on rehydrate.
      migrate: instrumentMigrate(
        migrateUnfoldStore as (persistedState: unknown, version: number) => PersistedUnfoldState,
      ),

      // Validate state on rehydration
      onRehydrateStorage: () => {
        return (state, error) => {
          // DEV-only: one-shot report of what reading + parsing + migrating the
          // persisted blob cost on this cold start. No-op in production.
          logColdStartHydrationCost();

          if (error) {
            logger.error('[store] Rehydration error:', error);
            // Log to bug tracking
            void logBugError('store-rehydration', error, {
              timestamp: new Date().toISOString(),
            });
          }

          if (state) {
            const { repairedKeys } = repairRehydratedState(state, initialState);
            if (repairedKeys.length > 0) {
              logger.warn('[store] Repaired invalid persisted slices:', repairedKeys.join(', '));
              void logBugError('store-validation', new Error('Invalid persisted state (repaired per-slice)'), {
                repairedKeys,
                stateKeys: Object.keys(state),
              });
            }

            // Reset session-scoped state on app launch (not persisted across sessions)
            state.nudgeShownThisSession = false;
            state.streakJustReset = false;

            // WR-15: purge Recently Deleted entries older than 30 days.
            if (Array.isArray(state.deletedNotes) && state.deletedNotes.length > 0) {
              const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
              const kept = state.deletedNotes.filter(
                (d) => new Date(d.deletedAt).getTime() > cutoff,
              );
              if (kept.length !== state.deletedNotes.length) {
                state.deletedNotes = kept;
              }
            }

            // One-time cleanup: remove duplicate highlights introduced by an
            // earlier bug where deserialize was broken and users re-created
            // the same highlight multiple times. Dedupe by
            // devotional+day+position (start-end-className), keeping the
            // earliest entry.
            if (Array.isArray(state.highlights) && state.highlights.length > 0) {
              const posKey = (serialized?: string): string | null => {
                if (!serialized) return null;
                const parts = serialized.split('$');
                if (parts.length < 4) return null;
                return `${parts[0]}-${parts[1]}-${parts[3]}`;
              };
              const seen = new Set<string>();
              const deduped: typeof state.highlights = [];
              // Iterate oldest-first so the earliest created entry wins
              const sortedOldestFirst = [...state.highlights].sort((a, b) => {
                const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return at - bt;
              });
              for (const h of sortedOldestFirst) {
                const pk = posKey(h.serializedRange);
                const key = pk
                  ? `${h.devotionalId}|${h.dayNumber}|${pk}`
                  : `${h.devotionalId}|${h.dayNumber}|${h.highlightedText}|${h.color}`;
                if (seen.has(key)) continue;
                seen.add(key);
                deduped.push(h);
              }
              if (deduped.length !== state.highlights.length) {
                logger.log(`[store] Deduped highlights: ${state.highlights.length} → ${deduped.length}`);
                // Restore original (newest-first) order after dedupe
                state.highlights = deduped.sort((a, b) => {
                  const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                  const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                  return bt - at;
                });
              }
            }
          }
        };
      },
    }
  )
);

// WR-23: a coalesced persist write can be pending for up to its debounce
// window — land it before iOS suspends the app. Covers the app switcher on
// the way to a force-kill; only a hard crash can lose the window.
AppState.addEventListener('change', (status) => {
  if (shouldFlushAutosaveOnAppState(status)) {
    unfoldPersistStorage.flushPendingWrites();
  }
});

/** Test/maintenance hook: force any pending coalesced persist write to disk. */
export const flushUnfoldStorePersist = () => unfoldPersistStorage.flushPendingWrites();

// Hydration tracking — components can check if persisted state has been loaded
export const useHasHydrated = () => {
  const [hasHydrated, setHasHydrated] = useState(useUnfoldStore.persist.hasHydrated());

  useEffect(() => {
    const unsub = useUnfoldStore.persist.onFinishHydration(() => setHasHydrated(true));
    return () => unsub();
  }, []);

  return hasHydrated;
};

