import { useState, useEffect } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ThemeCategory, DevotionalType } from '../constants/devotional-types';
import { logBugError } from './bug-logger';
import { logger } from './logger';
import { mmkvStorage } from './mmkv-storage';
import { compositeId, newId } from './sync-ids';
import type { NudgeType, NudgeImpression, NudgeState } from './nudges';
import { NUDGE_INITIAL_STATE } from './nudges';

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
  { id: 'slate', name: 'Slate', dark: '#8A9BAE', light: '#4D6175' },
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
  color: BibleHighlightColor;
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
  spiritualSeeking: string;
  readingDuration: 5 | 15 | 30;
  devotionalLength: 3 | 7 | 14 | 30;
  reminderTime: string;
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
  // Auth-related fields (synced from Clerk)
  authUserId?: string | null;
  authProvider?: 'apple' | 'google' | 'facebook' | null;
  authEmail?: string | null;
  authDisplayName?: string | null;
  signInPromptCount?: number;
  hasSeenSignInPrompt?: boolean;
  // New: Theme and type preferences for next devotional
  selectedTheme?: ThemeCategory;
  selectedType?: DevotionalType;
  selectedStudySubject?: string;
  // Profile picture (local file URI)
  profilePicture?: string | null;
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
  wordStudy?: { term: string; original: string; meaning: string };
  closingPrayer?: string;
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
  touchedAt: string;
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
  setDismissedMiddayCardDate: (date: string) => void;
  setDismissedEveningCardDate: (date: string) => void;

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

  // Bible Reader Actions
  addBibleHighlight: (highlight: Omit<BibleHighlight, 'id' | 'createdAt'>) => void;
  removeBibleHighlight: (id: string) => void;
  updateBibleHighlightNote: (id: string, note: string) => void;
  getBibleHighlightsForChapter: (bookId: number, chapter: number) => BibleHighlight[];
  recordBibleReading: (position: Omit<BibleReadingPosition, 'lastReadAt'>) => void;
  getLastBiblePosition: () => BibleReadingPosition | null;
  updateBibleReaderSettings: (updates: Partial<BibleReaderSettings>) => void;

  // Notebook
  notes: Note[];
  addNote: (note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateNote: (id: string, updates: Partial<Pick<Note, 'title' | 'content' | 'category' | 'tags' | 'isFavorite' | 'scriptureRefs' | 'folderId'>>) => void;
  deleteNote: (id: string) => void;
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

  // AI data consent (App Store Guideline 5.1.2(i))
  hasConsentedToAI: boolean;
  setHasConsentedToAI: (consented: boolean) => void;

  // Story deduplication
  addUsedStoryId: (devotionalId: string, storyId: string) => void;

  // Sync tracking
  userUpdatedAt?: string; // ISO timestamp for user profile sync

  // Helpers
  getCurrentDevotional: () => Devotional | undefined;
  reset: () => void;
}

const initialState = {
  user: null,
  devotionals: [],
  currentDevotionalId: null,
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
  // AI data consent
  hasConsentedToAI: false,
  // Notebook
  notes: [] as Note[],
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
};

export const useUnfoldStore = create<UnfoldState>()(
  persist(
    (set, get) => ({
      ...initialState,

      // User actions
      setUser: (user) => set({ user }),
      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
          userUpdatedAt: new Date().toISOString(),
        })),

      // Devotional actions
      addDevotional: (devotional) =>
        set((state) => {
          // Prevent duplicate entries with the same ID
          if (state.devotionals.some((d) => d.id === devotional.id)) {
            return { currentDevotionalId: devotional.id };
          }
          return {
            devotionals: [{ ...devotional, updatedAt: new Date().toISOString() }, ...state.devotionals],
            currentDevotionalId: devotional.id,
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

              // Merge incoming days with existing days by dayNumber.
              // Preserve read status/readAt from existing entries so late generation updates
              // never reset a day the user already completed.
              const existingByDay = new Map(d.days.map((day) => [day.dayNumber, day]));
              const incomingByDay = new Map(days.map((day) => [day.dayNumber, day]));
              const mergedByDay = new Map<number, DevotionalDay>();

              for (const [dayNumber, existingDay] of existingByDay.entries()) {
                const incomingDay = incomingByDay.get(dayNumber);
                if (!incomingDay) {
                  mergedByDay.set(dayNumber, existingDay);
                  continue;
                }

                mergedByDay.set(dayNumber, {
                  ...incomingDay,
                  isRead: existingDay.isRead || incomingDay.isRead,
                  readAt: existingDay.isRead ? existingDay.readAt : incomingDay.readAt,
                  updatedAt: now,
                });
              }

              for (const [dayNumber, incomingDay] of incomingByDay.entries()) {
                if (!mergedByDay.has(dayNumber)) {
                  mergedByDay.set(dayNumber, { ...incomingDay, updatedAt: now });
                }
              }

              const mergedDays = [...mergedByDay.values()].sort((a, b) => a.dayNumber - b.dayNumber);

              return {
                ...d,
                days: mergedDays,
                // Only increase totalDays, never shrink it - partial batches shouldn't lower the target
                totalDays: Math.max(d.totalDays, mergedDays.length),
                ...(title ? { title } : {}),
                updatedAt: now,
              };
            }),
          };
        }),

      setCurrentDevotional: (id) => set({ currentDevotionalId: id }),
      archiveCurrentDevotional: () => set({ currentDevotionalId: null }),
      isReturningUser: () => get().devotionals.length > 0,

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
                        ? { ...day, isRead: true, readAt: now, updatedAt: now }
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
            // Use the user's devotionalLength as fallback if totalDays was corrupted
            const userLength = state.user?.devotionalLength ?? d.totalDays;
            const effectiveTotal = Math.max(d.totalDays, userLength);
            return d.currentDay < effectiveTotal
              ? { ...d, currentDay: d.currentDay + 1, updatedAt: new Date().toISOString() }
              : d;
          }),
        })),

      // Journal actions
      addJournalEntry: (entry) =>
        set((state) => ({
          journalEntries: [
            ...state.journalEntries,
            {
              ...entry,
              id: `journal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        })),

      updateJournalEntry: (id, content) =>
        set((state) => ({
          journalEntries: state.journalEntries.map((e) =>
            e.id === id
              ? { ...e, content, updatedAt: new Date().toISOString() }
              : e
          ),
        })),

      updateJournalMode: (id, mode) =>
        set((state) => ({
          journalEntries: state.journalEntries.map((e) =>
            e.id === id
              ? { ...e, journalMode: mode, updatedAt: new Date().toISOString() }
              : e
          ),
        })),

      updateSoapResponse: (id, field, value) =>
        set((state) => ({
          journalEntries: state.journalEntries.map((e) => {
            if (e.id !== id) return e;
            const soap = e.soapResponses ?? { scripture: '', observation: '', application: '', prayer: '' };
            return {
              ...e,
              soapResponses: { ...soap, [field]: value },
              updatedAt: new Date().toISOString(),
            };
          }),
        })),

      addPrayerRequest: (entryId, text) =>
        set((state) => ({
          journalEntries: state.journalEntries.map((e) => {
            if (e.id !== entryId) return e;
            const prayers = e.prayerRequests ?? [];
            return {
              ...e,
              prayerRequests: [
                ...prayers,
                {
                  id: `prayer-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                  text,
                  isAnswered: false,
                  createdAt: new Date().toISOString(),
                },
              ],
              updatedAt: new Date().toISOString(),
            };
          }),
        })),

      togglePrayerAnswered: (entryId, prayerId) =>
        set((state) => ({
          journalEntries: state.journalEntries.map((e) => {
            if (e.id !== entryId) return e;
            return {
              ...e,
              prayerRequests: (e.prayerRequests ?? []).map((p) =>
                p.id === prayerId
                  ? { ...p, isAnswered: !p.isAnswered, answeredAt: !p.isAnswered ? new Date().toISOString() : undefined }
                  : p
              ),
              updatedAt: new Date().toISOString(),
            };
          }),
        })),

      updateQuestionResponse: (entryId, question, response) =>
        set((state) => ({
          journalEntries: state.journalEntries.map((e) => {
            if (e.id !== entryId) return e;
            const existing = e.questionResponses ?? [];
            const idx = existing.findIndex((qr) => qr.question === question);
            let updated: { question: string; response: string }[];
            if (idx >= 0) {
              updated = existing.map((qr, i) => (i === idx ? { question, response } : qr));
            } else {
              updated = [...existing, { question, response }];
            }
            return { ...e, questionResponses: updated, updatedAt: new Date().toISOString() };
          }),
        })),

      setDeeperQuestions: (entryId, questions) =>
        set((state) => ({
          journalEntries: state.journalEntries.map((e) =>
            e.id === entryId
              ? { ...e, deeperQuestions: questions, updatedAt: new Date().toISOString() }
              : e
          ),
        })),

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
          const timestamped = scriptures.map((s) => ({ ...s, updatedAt: now }));
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
          return {
            bookmarks: [
              { ...bookmark, id: `bm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, savedAt: now, updatedAt: now },
              ...state.bookmarks,
            ],
          };
        }),

      removeBookmark: (id) =>
        set((state) => ({
          bookmarks: state.bookmarks.filter((b) => b.id !== id),
        })),

      isBookmarked: (devotionalId, dayNumber) => {
        const state = get();
        return state.bookmarks.some(
          (b) => b.devotionalId === devotionalId && b.dayNumber === dayNumber
        );
      },

      // Highlight actions
      addHighlight: (highlight) =>
        set((state) => {
          const now = new Date().toISOString();
          return {
            highlights: [
              { ...highlight, id: `hl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, createdAt: now, updatedAt: now },
              ...state.highlights,
            ],
          };
        }),

      removeHighlight: (id) =>
        set((state) => ({
          highlights: state.highlights.filter((h) => h.id !== id),
        })),

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
          const now = new Date();
          const today = now.toDateString();
          const lastRead = state.streakLastReadDate ? new Date(state.streakLastReadDate).toDateString() : null;

          // Already read today, no change
          if (lastRead === today) {
            return state;
          }

          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const wasYesterday = lastRead === yesterday.toDateString();

          // Check if we need to reset grace days (new week)
          const currentWeekStart = getWeekStart(new Date());
          const storedWeekStart = state.streakWeekStart;
          const isNewWeek = !storedWeekStart || storedWeekStart !== currentWeekStart.toISOString();

          let newStreak = state.streakCurrent;
          let newGraceDays = isNewWeek ? 0 : state.streakGraceDaysUsedThisWeek;
          let newFreezes = state.streakFreezes;
          let missedWeekendDays = 0;

          if (wasYesterday || !lastRead) {
            // Continue streak
            newStreak = state.streakCurrent + 1;
          } else {
            // Calculate days missed
            const daysMissed = Math.floor(
              (new Date(today).getTime() - new Date(lastRead!).getTime()) / (1000 * 60 * 60 * 24)
            );

            // Count weekend days missed (if amnesty enabled)
            if (state.streakWeekendAmnesty) {
              for (let i = 1; i < daysMissed; i++) {
                const missedDate = new Date();
                missedDate.setDate(missedDate.getDate() - i);
                if (missedDate.getDay() === 0 || missedDate.getDay() === 6) {
                  missedWeekendDays++;
                }
              }
            }

            const effectiveMissed = daysMissed - missedWeekendDays;

            // Use freeze if available for first missed day (premium only)
            if (effectiveMissed >= 1 && state.streakFreezes > 0 && state.user?.isPremium) {
              newFreezes--;
              newStreak = state.streakCurrent + 1;
            } else if (effectiveMissed === 1) {
              // Just missed yesterday but no freeze - continue
              newStreak = state.streakCurrent + 1;
            } else if (effectiveMissed > 1 && newGraceDays < 1) {
              // Use grace day for extra missed day
              newGraceDays++;
              newStreak = state.streakCurrent + 1;
            } else {
              // Streak broken
              newStreak = 1;
              newGraceDays = 0;
            }
          }

          // Check if earned a freeze (perfect week = 7 days, streak divisible by 7)
          if (newStreak > 0 && newStreak % 7 === 0) {
            // Check if we already earned for this week
            const lastEarnedStreak = Math.floor((state.streakLongest || 0) / 7) * 7;
            if (newStreak > lastEarnedStreak) {
              const maxFreezes = state.user?.isPremium ? 99 : 0;
              newFreezes = Math.min(newFreezes + 1, maxFreezes);
            }
          }

          return {
            streakLastReadDate: now.toISOString(),
            streakCurrent: newStreak,
            streakLongest: Math.max(state.streakLongest, newStreak),
            streakGraceDaysUsedThisWeek: newGraceDays,
            streakWeekStart: currentWeekStart.toISOString(),
            streakFreezes: newFreezes,
          };
        }),
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
          const MAX_HISTORY = 10;
          const updated = [{ ...record, updatedAt: new Date().toISOString() }, ...state.seriesPersonaHistory].slice(0, MAX_HISTORY);
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
          return {
            methodUsageHistory: [
              { methodId, devotionalId, dayNumber, usedAt: now, updatedAt: now },
              ...state.methodUsageHistory,
            ].slice(0, MAX_HISTORY),
          };
        }),

      // Check-ins (Phase 2)
      addCheckIn: (checkIn) =>
        set((state) => {
          const now = new Date().toISOString();
          return {
            checkIns: [
              { ...checkIn, id: newId(), createdAt: now, updatedAt: now },
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

      // AI data consent
      setHasConsentedToAI: (consented) => set({ hasConsentedToAI: consented }),

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
          return {
            devotionals: state.devotionals.map((d) => {
              if (d.id !== devotionalId) return d;
              // Don't duplicate if day already exists
              if (d.days.some((existing) => existing.dayNumber === day.dayNumber)) return d;
              const updatedDays = [...d.days, { ...day, updatedAt: now }].sort((a, b) => a.dayNumber - b.dayNumber);
              return { ...d, days: updatedDays, updatedAt: now };
            }),
          };
        }),

      // Bible Reader actions
      addBibleHighlight: (highlight) =>
        set((state) => {
          const now = new Date().toISOString();
          return {
            bibleHighlights: [
              ...state.bibleHighlights,
              {
                ...highlight,
                id: `bh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                createdAt: now,
                updatedAt: now,
              },
            ],
          };
        }),

      removeBibleHighlight: (id) =>
        set((state) => ({
          bibleHighlights: state.bibleHighlights.filter((h) => h.id !== id),
        })),

      updateBibleHighlightNote: (id, note) =>
        set((state) => ({
          bibleHighlights: state.bibleHighlights.map((h) =>
            h.id === id ? { ...h, note, updatedAt: new Date().toISOString() } : h,
          ),
        })),

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
            lastReadAt: now,
            updatedAt: now,
          };
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

      // Notebook actions
      addNote: (note) => {
        const id = `note_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const now = new Date().toISOString();
        set((state) => ({
          notes: [
            { ...note, id, createdAt: now, updatedAt: now },
            ...state.notes,
          ],
        }));
        return id;
      },

      updateNote: (id, updates) =>
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id
              ? { ...n, ...updates, updatedAt: new Date().toISOString() }
              : n,
          ),
        })),

      deleteNote: (id) =>
        set((state) => ({
          notes: state.notes.filter((n) => n.id !== id),
        })),

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
          return {
            folders: [
              ...state.folders,
              {
                id,
                name,
                color,
                parentId,
                sortOrder: siblings.length,
                createdAt: now,
                updatedAt: now,
              },
            ],
          };
        });
        return id;
      },

      updateFolder: (id, updates) =>
        set((state) => ({
          folders: state.folders.map((f) =>
            f.id === id
              ? { ...f, ...updates, updatedAt: new Date().toISOString() }
              : f,
          ),
        })),

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
          return {
            folders: state.folders.filter((f) => !idsToDelete.has(f.id)),
            notes: deleteNotes
              ? state.notes.filter((n) => !n.folderId || !idsToDelete.has(n.folderId))
              : state.notes.map((n) =>
                  n.folderId && idsToDelete.has(n.folderId)
                    ? { ...n, folderId: undefined, updatedAt: now }
                    : n,
                ),
          };
        }),

      moveNoteToFolder: (noteId, folderId) =>
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === noteId
              ? { ...n, folderId: folderId ?? undefined, updatedAt: new Date().toISOString() }
              : n,
          ),
        })),

      reorderFolders: (orderedIds) => {
        set((state) => ({
          folders: orderedIds
            .map((id, index) => {
              const folder = state.folders.find((f) => f.id === id);
              if (!folder) return null;
              return { ...folder, sortOrder: index };
            })
            .filter(Boolean) as NoteFolder[],
        }));
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
      storage: createJSONStorage(() => mmkvStorage),
      version: 32, // v32: Add isRevealed to DevotionalDay, remove lastRevealShownDate
      // Validate and migrate persisted state
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Partial<UnfoldState>;

        // Migration from version 1 to 2: Add review prompt fields
        if (version < 2) {
          try {
            (state as any).reviewPromptLastDate = (state as any).reviewPromptLastDate ?? null;
            (state as any).reviewPromptCount = (state as any).reviewPromptCount ?? 0;
            (state as any).hasReviewed = (state as any).hasReviewed ?? false;
            (state as any).reviewPromptDaysAtLast = (state as any).reviewPromptDaysAtLast ?? 0;
            (state as any).streakLastReadDate = (state as any).streakLastReadDate ?? null;
            (state as any).streakCurrent = (state as any).streakCurrent ?? 0;
            (state as any).streakLongest = (state as any).streakLongest ?? 0;
            (state as any).streakGraceDaysUsedThisWeek = (state as any).streakGraceDaysUsedThisWeek ?? 0;
            (state as any).streakWeekStart = (state as any).streakWeekStart ?? null;
          } catch (err) {
            console.error('[store] Migration v1→2 failed:', err);
          }
        }

        // Migration from version 2 to 3: Add streak tracking fields
        if (version < 3) {
          try {
            (state as any).streakLastReadDate = (state as any).streakLastReadDate ?? null;
            (state as any).streakCurrent = (state as any).streakCurrent ?? 0;
            (state as any).streakLongest = (state as any).streakLongest ?? 0;
            (state as any).streakGraceDaysUsedThisWeek = (state as any).streakGraceDaysUsedThisWeek ?? 0;
            (state as any).streakWeekStart = (state as any).streakWeekStart ?? null;
          } catch (err) {
            console.error('[store] Migration v2→3 failed:', err);
          }
        }

        // Migration from version 3 to 4: Add streak freeze and weekend amnesty
        if (version < 4) {
          try {
            (state as any).streakWeekendAmnesty = (state as any).streakWeekendAmnesty ?? true;
            (state as any).streakFreezes = (state as any).streakFreezes ?? 0;
          } catch (err) {
            console.error('[store] Migration v3→4 failed:', err);
          }
        }

        // Migration from version 4 to 5: Add preferredVoice default to user
        if (version < 5) {
          try {
            if (state.user && typeof state.user === 'object' && !state.user.preferredVoice) {
              state.user.preferredVoice = 'arman';
            }
          } catch (err) {
            console.error('[store] Migration v4→5 failed:', err);
          }
        }

        // Migration from version 5 to 6: Add seriesPersonaHistory
        if (version < 6) {
          try {
            (state as any).seriesPersonaHistory = (state as any).seriesPersonaHistory ?? [];
          } catch (err) {
            console.error('[store] Migration v5→6 failed:', err);
          }
        }

        // Migration from version 6 to 7: Add hasSeenHomeTooltips
        if (version < 7) {
          try {
            (state as any).hasSeenHomeTooltips = (state as any).hasSeenHomeTooltips ?? false;
          } catch (err) {
            console.error('[store] Migration v6→7 failed:', err);
          }
        }

        // Migration from version 7 to 8: Add hasSeenFeatureOnboarding
        if (version < 8) {
          try {
            (state as any).hasSeenFeatureOnboarding = (state as any).hasSeenFeatureOnboarding ?? false;
          } catch (err) {
            console.error('[store] Migration v7→8 failed:', err);
          }
        }

        // Migration from version 8 to 9: Add checkIns array
        if (version < 9) {
          try {
            (state as any).checkIns = (state as any).checkIns ?? [];
          } catch (err) {
            console.error('[store] Migration v8→9 failed:', err);
          }
        }

        if (version < 10) {
          try {
            (state as any).hasSeenDay1Review = (state as any).hasSeenDay1Review ?? false;
          } catch (err) {
            console.error('[store] Migration v9→10 failed:', err);
          }
        }

        // Migration from version 11 to 12: Add companion orb state
        if (version < 12) {
          try {
            (state as any).hasSeenCompanionIntro = (state as any).hasSeenCompanionIntro ?? false;
            (state as any).lastCompanionCheckInDate = (state as any).lastCompanionCheckInDate ?? null;
          } catch (err) {
            console.error('[store] Migration v10→12 failed:', err);
          }
        }

        if (version < 13) {
          try {
            (state as any).dismissedMiddayCardDate = (state as any).dismissedMiddayCardDate ?? null;
            (state as any).dismissedEveningCardDate = (state as any).dismissedEveningCardDate ?? null;
          } catch (err) {
            console.error('[store] Migration v12→13 failed:', err);
          }
        }

        // Migration from version 13 to 14: Add premium nudge system
        if (version < 14) {
          try {
            (state as any).nudgeImpressions = (state as any).nudgeImpressions ?? [];
            (state as any).nudgeShownThisSession = (state as any).nudgeShownThisSession ?? false;
            (state as any).nudgeDismissals = (state as any).nudgeDismissals ?? [];
            (state as any).streakJustReset = (state as any).streakJustReset ?? false;
            (state as any).justCompletedSeriesTitle = (state as any).justCompletedSeriesTitle ?? null;
            (state as any).hasUsedAudio = (state as any).hasUsedAudio ?? false;
          } catch (err) {
            console.error('[store] Migration v13→14 failed:', err);
          }
        }

        // Migration from version 14 to 15: Add companion name and recent check-ins
        if (version < 15) {
          try {
            (state as any).companionName = (state as any).companionName ?? null;
            (state as any).recentCompanionCheckIns = (state as any).recentCompanionCheckIns ?? [];
          } catch (err) {
            console.error('[store] Migration v14→15 failed:', err);
          }
        }

        // Migration from version 15 to 16: Add progressive generation
        if (version < 16) {
          try {
            const devos = (state as any).devotionals ?? [];
            for (const d of devos) {
              if (!d) continue; // Skip null/undefined entries
              if (!d.generationMode) d.generationMode = 'batch';
              if (!Array.isArray(d.days)) d.days = [];
            }
            (state as any).devotionals = devos;
            (state as any).progressiveGeneration = (state as any).progressiveGeneration ?? {
              devotionalId: null,
              currentDayGeneration: null,
              isArcGenerated: false,
            };
          } catch (err) {
            console.error('[store] Migration v15→16 failed:', err);
          }
        }

        // Migration from version 16 to 17: Add Bible Reader state
        if (version < 17) {
          try {
            (state as any).bibleHighlights = (state as any).bibleHighlights ?? [];
            (state as any).bibleReadingHistory = (state as any).bibleReadingHistory ?? [];
            (state as any).bibleReaderSettings = (state as any).bibleReaderSettings ?? {
              fontSize: 20,
              lineHeightMultiplier: 1.8,
              showVerseNumbers: true,
              paragraphMode: false,
              translation: 'BSB',
            };
          } catch (err) {
            console.error('[store] Migration v16→17 failed:', err);
          }
        }

        // Migration from version 17 to 18: Improve Bible Reader defaults
        if (version < 18) {
          try {
            const settings = (state as any).bibleReaderSettings ?? {};
            (state as any).bibleReaderSettings = {
              ...settings,
              fontSize: 20,
              lineHeightMultiplier: 1.8,
            };
          } catch (err) {
            console.error('[store] Migration v17→18 failed:', err);
          }
        }

        // Migration from version 18 to 19: Add AI data consent flag
        if (version < 19) {
          try {
            (state as any).hasConsentedToAI = (state as any).hasConsentedToAI ?? false;
          } catch (err) {
            console.error('[store] Migration v18→19 failed:', err);
          }
        }

        // Migration from version 19 to 20: Add notebook notes
        if (version < 20) {
          try {
            (state as any).notes = (state as any).notes ?? [];
          } catch (err) {
            console.error('[store] Migration v19→20 failed:', err);
          }
        }

        // Migration from version 20 to 21: Add notebook folders
        if (version < 21) {
          try {
            (state as any).folders = (state as any).folders ?? [];
          } catch (err) {
            console.error('[store] Migration v20→21 failed:', err);
          }
        }

        // Migration from version 21 to 22: Add parentId to folders (subfolder support)
        if (version < 22) {
          try {
            // Existing folders get parentId: undefined (top-level) — no data change needed
          } catch (err) {
            console.error('[store] Migration v21→22 failed:', err);
          }
        }

        // Migration from version 22 to 23: Add check-in notification toggles
        if (version < 23) {
          try {
            (state as any).middayCheckInEnabled = (state as any).middayCheckInEnabled ?? true;
            (state as any).eveningWindDownEnabled = (state as any).eveningWindDownEnabled ?? true;
          } catch (err) {
            console.error('[store] Migration v22→23 failed:', err);
          }
        }

        if (version < 24) {
          // Clear legacy anonymous/guest auth providers — sign-in is now required
          try {
            const user = (state as any).user;
            if (user?.authProvider === 'anonymous' || user?.authProvider === 'guest') {
              user.authProvider = null;
            }
          } catch (err) {
            console.error('[store] Migration v23→24 failed:', err);
          }
        }

        // Migration from version 24 to 25: Map Cartesia voice UUIDs to Smallest.ai voice IDs
        if (version < 25) {
          try {
            const voiceMap: Record<string, string> = {
              '694f9389-aac1-45b6-b726-9d9369183238': 'arman',   // Katie → Arman
              '03496517-369a-4db1-8236-3d3ae459ddf7': 'jasmine', // Elena → Jasmine
              '1463a4e1-56a1-4b41-b257-728d56e93605': 'arman',   // Marcus → Arman
              '3246e36c-ac8c-418d-83cd-4eaad5a3b887': 'arman',   // David → Arman
              '15a9cd88-84b0-4a8b-95f2-5d583b54c72e': 'jasmine', // Grace → Jasmine
              'emily': 'arman',
              'george': 'arman',
              'jasper': 'arman',
              'ariana': 'jasmine',
              'james': 'arman',
            };
            if (state.user && typeof state.user === 'object') {
              const oldVoice = state.user.preferredVoice;
              if (oldVoice && voiceMap[oldVoice]) {
                state.user.preferredVoice = voiceMap[oldVoice];
              } else if (!oldVoice || !['arman', 'jasmine'].includes(oldVoice)) {
                state.user.preferredVoice = 'arman';
              }
              // Flag for cache cleanup — picked up by tts-service on first use
              (state as any)._needsTtsCacheCleanup = true;
            }
          } catch (err) {
            console.error('[store] Migration v24→25 failed:', err);
          }
        }

        // Migration from version 25 to 26: Add custom check-in times
        if (version < 26) {
          try {
            (state as any).middayCheckInTime = (state as any).middayCheckInTime ?? '12:30';
            (state as any).eveningWindDownTime = (state as any).eveningWindDownTime ?? '20:30';
            (state as any).middayCheckInByDay = (state as any).middayCheckInByDay ?? null;
            (state as any).eveningWindDownByDay = (state as any).eveningWindDownByDay ?? null;
          } catch (err) {
            console.error('[store] Migration v25→26 failed:', err);
          }
        }

        // Migration from version 26 to 27: Add deferred generation fields
        if (version < 27) {
          try {
            (state as any).lastGenerationCutoffDate = (state as any).lastGenerationCutoffDate ?? '';
          } catch (err) {
            console.error('[store] Migration v26→27 failed:', err);
          }
        }

        // Migration from version 27 to 28: Add evening generation tracking
        if (version < 28) {
          try {
            (state as any).lastEveningGenerationDate = (state as any).lastEveningGenerationDate ?? '';
          } catch (err) {
            console.error('[store] Migration v27→28 failed:', err);
          }
        }

        // Migration from version 28 to 29: Add updatedAt + id for cloud sync
        if (version < 29) {
          try {
            const now = new Date().toISOString();

            // Backfill devotionals
            const devos = (state as any).devotionals ?? [];
            for (const d of devos) {
              if (!d) continue;
              if (!d.updatedAt) d.updatedAt = d.createdAt || now;
              // Backfill days
              if (Array.isArray(d.days)) {
                for (const day of d.days) {
                  if (!day) continue;
                  if (!day.id) day.id = compositeId(d.id, day.dayNumber);
                  if (!day.updatedAt) day.updatedAt = day.readAt || day.generatedAt || d.createdAt || now;
                }
              }
            }

            // Backfill bookmarks
            const bookmarks = (state as any).bookmarks ?? [];
            for (const b of bookmarks) {
              if (!b) continue;
              if (!b.updatedAt) b.updatedAt = b.savedAt || now;
            }

            // Backfill highlights
            const highlights = (state as any).highlights ?? [];
            for (const h of highlights) {
              if (!h) continue;
              if (!h.updatedAt) h.updatedAt = h.createdAt || now;
            }

            // Backfill bible highlights
            const bibleHighlights = (state as any).bibleHighlights ?? [];
            for (const bh of bibleHighlights) {
              if (!bh) continue;
              if (!bh.updatedAt) bh.updatedAt = bh.createdAt || now;
            }

            // Backfill bible reading positions
            const bibleReadingHistory = (state as any).bibleReadingHistory ?? [];
            for (const pos of bibleReadingHistory) {
              if (!pos) continue;
              if (!pos.id) pos.id = compositeId(pos.bookId, pos.translation || 'BSB');
              if (!pos.updatedAt) pos.updatedAt = pos.lastReadAt || now;
            }

            // Backfill check-ins — convert `checkin_${Date.now()}` IDs to proper UUIDs
            // (backend uses uuid('id').primaryKey() so non-UUID IDs will fail on INSERT)
            const checkIns = (state as any).checkIns ?? [];
            for (const ci of checkIns) {
              if (!ci) continue;
              if (!ci.id || !ci.id.match(/^[0-9a-f]{8}-/)) {
                // Generate deterministic UUID from composite key
                ci.id = compositeId(ci.devotionalId || 'unknown', ci.dayNumber ?? 0, ci.timeOfDay || 'morning');
              }
              if (!ci.updatedAt) ci.updatedAt = ci.createdAt || now;
            }

            // Backfill used scriptures
            const usedScriptures = (state as any).usedScriptures ?? [];
            for (const us of usedScriptures) {
              if (!us) continue;
              if (!us.id) us.id = compositeId(us.reference, us.devotionalId);
              if (!us.updatedAt) us.updatedAt = us.usedAt || now;
            }

            // Backfill series persona history
            const personaHistory = (state as any).seriesPersonaHistory ?? [];
            for (const sp of personaHistory) {
              if (!sp) continue;
              if (!sp.id) sp.id = compositeId('persona', sp.devotionalId);
              if (!sp.updatedAt) sp.updatedAt = sp.createdAt || now;
            }

            // Backfill method usage history
            const methodHistory = (state as any).methodUsageHistory ?? [];
            for (const mu of methodHistory) {
              if (!mu) continue;
              if (!mu.id) mu.id = compositeId(mu.methodId, mu.devotionalId, mu.dayNumber);
              if (!mu.updatedAt) mu.updatedAt = mu.usedAt || now;
            }

            // Notes and folders already have updatedAt — no backfill needed
            // Journal entries already have updatedAt — no backfill needed

            // Add userUpdatedAt for user profile sync
            (state as any).userUpdatedAt = now;

            logger.log('[store] Migration v28→29: Backfilled updatedAt + id for sync');
          } catch (err) {
            console.error('[store] Migration v28→29 failed:', err);
          }
        }

        // Migration from version 29 to 30: Remove client-side generation state,
        // add server-side job tracking fields
        if (version < 30) {
          try {
            // Strip removed client-side generation fields
            delete (state as any).progressiveGeneration;
            delete (state as any).lastGenerationCutoffDate;
            delete (state as any).lastEveningGenerationDate;

            // Add new server-side tracking fields
            (state as any).pendingJobId = (state as any).pendingJobId ?? null;
            (state as any).lastRevealShownDate = (state as any).lastRevealShownDate ?? null;

            logger.log('[store] Migration v29→30: Removed client-side generation state');
          } catch (err) {
            console.error('[store] Migration v29→30 failed:', err);
          }
        }

        // Migration from version 30 to 31: Migrate WEB bible translation to BSB
        if (version < 31) {
          try {
            const user = (state as any).user;
            if (user && user.bibleTranslation === 'WEB') {
              user.bibleTranslation = 'BSB';
            }
            logger.log('[store] Migration v30→31: Migrated WEB bible translation to BSB');
          } catch (err) {
            console.error('[store] Migration v30→31 failed:', err);
          }
        }

        // Migration from version 31 to 32: Add isRevealed to DevotionalDay, remove lastRevealShownDate
        if (version < 32) {
          try {
            for (const d of (state as any).devotionals ?? []) {
              for (const day of d.days ?? []) {
                if (day.isRead || day.dayNumber === 1) {
                  day.isRevealed = true;
                }
              }
            }
            delete (state as any).lastRevealShownDate;
            logger.log('[store] Migration v31→32: Added isRevealed, removed lastRevealShownDate');
          } catch (err) {
            console.error('[store] Migration v31→32 failed:', err);
          }
        }

        return state as UnfoldState;
      },
      // Validate state on rehydration
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            logger.error('[store] Rehydration error:', error);
            // Log to bug tracking
            void logBugError('store-rehydration', error, {
              timestamp: new Date().toISOString(),
            });
          }

          if (state) {
            // Validate required fields exist
            const isValid =
              Array.isArray(state.devotionals) &&
              Array.isArray(state.journalEntries) &&
              Array.isArray(state.bookmarks) &&
              Array.isArray(state.highlights) &&
              Array.isArray(state.usedScriptures) &&
              state.generationSession != null &&
              typeof state.generationSession === 'object';

            if (!isValid) {
              logger.warn('[store] Invalid state detected, resetting to initial state');
              void logBugError('store-validation', new Error('Invalid persisted state'), {
                stateKeys: Object.keys(state),
              });
              // Reset to initial state on validation failure (graceful degradation)
              state.devotionals = initialState.devotionals;
              state.journalEntries = initialState.journalEntries;
              state.bookmarks = initialState.bookmarks;
              state.highlights = initialState.highlights;
              state.usedScriptures = initialState.usedScriptures;
              state.generationSession = initialState.generationSession;
              state.resumeContext = initialState.resumeContext;
              state.currentDevotionalId = initialState.currentDevotionalId;
              state.checkIns = initialState.checkIns;
              // Preserve user if it seems valid
              if (!state.user || typeof state.user !== 'object') {
                state.user = initialState.user;
              }
            }

            // Reset session-scoped state on app launch (not persisted across sessions)
            state.nudgeShownThisSession = false;
            state.streakJustReset = false;
          }
        };
      },
    }
  )
);

// Hydration tracking — components can check if persisted state has been loaded
export const useHasHydrated = () => {
  const [hasHydrated, setHasHydrated] = useState(useUnfoldStore.persist.hasHydrated());

  useEffect(() => {
    const unsub = useUnfoldStore.persist.onFinishHydration(() => setHasHydrated(true));
    return () => unsub();
  }, []);

  return hasHydrated;
};

// Helper function to get the start of the current week (Sunday)
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const diff = d.getDate() - day;
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
