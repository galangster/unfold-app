import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ThemeCategory, DevotionalType } from '../constants/devotional-types';
import { logBugError } from './bug-logger';

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
  { id: 'lavender', name: 'Lavender', dark: '#9B8EC4', light: '#7568A6' },
  { id: 'ember', name: 'Ember', dark: '#D4895C', light: '#A86840' },
  { id: 'slate', name: 'Slate', dark: '#8A9BAE', light: '#5E7185' },
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
  small: { body: 15, scripture: 15, title: 28 },
  medium: { body: 17, scripture: 17, title: 32 },
  large: { body: 20, scripture: 19, title: 36 },
};

// Bible translation preferences
export type BibleTranslation = 'NIV' | 'ESV' | 'KJV' | 'NLT';

export const BIBLE_TRANSLATIONS: { value: BibleTranslation; label: string; description: string }[] = [
  { value: 'NIV', label: 'NIV', description: 'New International Version - balanced and readable' },
  { value: 'ESV', label: 'ESV', description: 'English Standard Version - literal and precise' },
  { value: 'KJV', label: 'KJV', description: 'King James Version - classic and traditional' },
  { value: 'NLT', label: 'NLT', description: 'New Living Translation - easy to understand' },
];

// Writing style preferences
export type WritingTone = 'warm' | 'direct' | 'poetic';
export type ContentDepth = 'simple' | 'balanced' | 'theological';
export type FaithBackground = 'new' | 'growing' | 'mature';

export interface WritingStylePreferences {
  tone: WritingTone;
  depth: ContentDepth;
  faithBackground: FaithBackground;
}

export interface UserProfile {
  name: string;
  aboutMe: string;
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
  // New: Theme and type preferences for next devotional
  selectedTheme?: ThemeCategory;
  selectedType?: DevotionalType;
  selectedStudySubject?: string;
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
  // Enhanced content fields
  quotes?: Quote[];
  crossReferences?: CrossReference[];
  reflectionQuestions?: string[];
  contextNote?: string;
  wordStudy?: { term: string; original: string; meaning: string };
  closingPrayer?: string;
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
  // New: Theme and type categorization
  themeCategory?: ThemeCategory;
  devotionalType?: DevotionalType;
  // For book/character studies, track the specific subject
  studySubject?: string; // e.g., "Philippians", "David", "Beatitudes"
}

export interface JournalEntry {
  id: string;
  devotionalId: string;
  dayNumber: number;
  content: string;
  createdAt: string;
  updatedAt: string;
}

// Scripture tracking for variety
export interface UsedScripture {
  reference: string; // e.g., "John 3:16-17"
  book: string; // e.g., "John"
  usedAt: string; // ISO timestamp
  devotionalId: string;
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
  savedAt: string;
}

// Highlights for saved quotes from devotional text
export interface Highlight {
  id: string;
  devotionalId: string;
  devotionalTitle: string;
  dayNumber: number;
  dayTitle: string;
  highlightedText: string;
  serializedRange?: string; // Rangy serialization for precise restoration
  contextBefore?: string;
  contextAfter?: string;
  createdAt: string;
}

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
  updateDevotionalDays: (devotionalId: string, days: DevotionalDay[], title?: string) => void;
  setCurrentDevotional: (id: string) => void;
  markDayAsRead: (devotionalId: string, dayNumber: number) => void;
  advanceDay: (devotionalId: string) => void;

  // Journal entries
  journalEntries: JournalEntry[];
  addJournalEntry: (entry: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateJournalEntry: (id: string, content: string) => void;
  getJournalEntry: (devotionalId: string, dayNumber: number) => JournalEntry | undefined;

  // Scripture tracking for variety
  usedScriptures: UsedScripture[];
  addUsedScriptures: (scriptures: UsedScripture[]) => void;
  getRecentScriptures: (limit?: number) => UsedScripture[];

  // Highlights (saved quotes from devotional text)
  highlights: Highlight[];
  addHighlight: (highlight: Omit<Highlight, 'id' | 'createdAt'>) => void;
  removeHighlight: (id: string) => void;

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
  reviewPromptDaysAtLast: number;
  recordReviewPrompt: (daysCompleted: number) => void;
  markAsReviewed: () => void;

  // Streak tracking
  streakLastReadDate: string | null;
  streakCurrent: number;
  streakLongest: number;
  streakGraceDaysUsedThisWeek: number;
  streakWeekStart: string | null; // ISO date of current week start (Sunday)
  recordStreakRead: () => void;
  resetStreakGraceDays: () => void;

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
  reviewPromptDaysAtLast: 0,
  streakLastReadDate: null as string | null,
  streakCurrent: 0,
  streakLongest: 0,
  streakGraceDaysUsedThisWeek: 0,
  streakWeekStart: null as string | null,
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
        })),

      // Devotional actions
      addDevotional: (devotional) =>
        set((state) => ({
          devotionals: [devotional, ...state.devotionals],
          currentDevotionalId: devotional.id,
        })),

      updateDevotionalDays: (devotionalId, days, title) =>
        set((state) => ({
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
              });
            }

            for (const [dayNumber, incomingDay] of incomingByDay.entries()) {
              if (!mergedByDay.has(dayNumber)) {
                mergedByDay.set(dayNumber, incomingDay);
              }
            }

            const mergedDays = [...mergedByDay.values()].sort((a, b) => a.dayNumber - b.dayNumber);

            return {
              ...d,
              days: mergedDays,
              // Only increase totalDays, never shrink it — partial batches shouldn't lower the target
              totalDays: Math.max(d.totalDays, mergedDays.length),
              ...(title ? { title } : {}),
            };
          }),
        })),

      setCurrentDevotional: (id) => set({ currentDevotionalId: id }),

      markDayAsRead: (devotionalId, dayNumber) =>
        set((state) => ({
          devotionals: state.devotionals.map((d) =>
            d.id === devotionalId
              ? {
                  ...d,
                  days: d.days.map((day) =>
                    day.dayNumber === dayNumber
                      ? { ...day, isRead: true, readAt: new Date().toISOString() }
                      : day
                  ),
                }
              : d
          ),
        })),

      advanceDay: (devotionalId) =>
        set((state) => ({
          devotionals: state.devotionals.map((d) => {
            if (d.id !== devotionalId) return d;
            // Use the user's devotionalLength as fallback if totalDays was corrupted
            const userLength = state.user?.devotionalLength ?? d.totalDays;
            const effectiveTotal = Math.max(d.totalDays, userLength);
            return d.currentDay < effectiveTotal
              ? { ...d, currentDay: d.currentDay + 1 }
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

      getJournalEntry: (devotionalId, dayNumber) => {
        const state = get();
        return state.journalEntries.find(
          (e) => e.devotionalId === devotionalId && e.dayNumber === dayNumber
        );
      },

      // Scripture tracking actions
      addUsedScriptures: (scriptures) =>
        set((state) => {
          const combined = [...state.usedScriptures, ...scriptures];
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
        set((state) => ({
          bookmarks: [
            { ...bookmark, id: `bm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, savedAt: new Date().toISOString() },
            ...state.bookmarks,
          ],
        })),

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
        set((state) => ({
          highlights: [
            { ...highlight, id: `hl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, createdAt: new Date().toISOString() },
            ...state.highlights,
          ],
        })),

      removeHighlight: (id) =>
        set((state) => ({
          highlights: state.highlights.filter((h) => h.id !== id),
        })),

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

      // Streak actions
      recordStreakRead: () =>
        set((state) => {
          const today = new Date().toDateString();
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

          if (wasYesterday || !lastRead) {
            // Continue streak
            newStreak = state.streakCurrent + 1;
          } else {
            // Check if we can use a grace day (Sabbath rest concept - 1 per week)
            const daysMissed = Math.floor(
              (new Date(today).getTime() - new Date(lastRead).getTime()) / (1000 * 60 * 60 * 24)
            );
            
            if (daysMissed === 2 && newGraceDays < 1) {
              // Use grace day, keep streak alive
              newGraceDays += 1;
              newStreak = state.streakCurrent + 1;
            } else {
              // Streak broken, start over
              newStreak = 1;
              newGraceDays = 0;
            }
          }

          return {
            streakLastReadDate: new Date().toISOString(),
            streakCurrent: newStreak,
            streakLongest: Math.max(state.streakLongest, newStreak),
            streakGraceDaysUsedThisWeek: newGraceDays,
            streakWeekStart: currentWeekStart.toISOString(),
          };
        }),
      resetStreakGraceDays: () =>
        set({
          streakGraceDaysUsedThisWeek: 0,
          streakWeekStart: getWeekStart(new Date()).toISOString(),
        }),

      // Helpers
      getCurrentDevotional: () => {
        const state = get();
        return state.devotionals.find((d) => d.id === state.currentDevotionalId);
      },

      reset: () => set(initialState),
    }),
    {
      name: 'unfold-storage',
      storage: createJSONStorage(() => AsyncStorage),
      version: 3, // Increment when state structure changes
      // Validate and migrate persisted state
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Partial<UnfoldState>;
        
        // Migration from version 1 to 2: Add review prompt fields
        if (version < 2) {
          return {
            ...state,
            reviewPromptLastDate: null,
            reviewPromptCount: 0,
            hasReviewed: false,
            reviewPromptDaysAtLast: 0,
            streakLastReadDate: null,
            streakCurrent: 0,
            streakLongest: 0,
            streakGraceDaysUsedThisWeek: 0,
            streakWeekStart: null,
          } as UnfoldState;
        }
        
        // Migration from version 2 to 3: Add streak tracking fields
        if (version < 3) {
          return {
            ...state,
            streakLastReadDate: null,
            streakCurrent: 0,
            streakLongest: 0,
            streakGraceDaysUsedThisWeek: 0,
            streakWeekStart: null,
          } as UnfoldState;
        }
        
        return state as UnfoldState;
      },
      // Validate state on rehydration
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            console.error('[store] Rehydration error:', error);
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
              Array.isArray(state.usedScriptures) &&
              state.generationSession != null &&
              typeof state.generationSession === 'object';
            
            if (!isValid) {
              console.warn('[store] Invalid state detected, resetting to initial state');
              void logBugError('store-validation', new Error('Invalid persisted state'), {
                stateKeys: Object.keys(state),
              });
              // Reset to initial state on validation failure (graceful degradation)
              state.devotionals = initialState.devotionals;
              state.journalEntries = initialState.journalEntries;
              state.bookmarks = initialState.bookmarks;
              state.usedScriptures = initialState.usedScriptures;
              state.generationSession = initialState.generationSession;
              state.resumeContext = initialState.resumeContext;
              state.currentDevotionalId = initialState.currentDevotionalId;
              // Preserve user if it seems valid
              if (!state.user || typeof state.user !== 'object') {
                state.user = initialState.user;
              }
            }
          }
        };
      },
    }
  )
);

// Helper function to get the start of the current week (Sunday)
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const diff = d.getDate() - day;
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
